import { BadRequestException, Body, Controller, Headers, Post, Req, Res, UnauthorizedException } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"
import type { Request, Response } from "express"
import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "@/common/database/database.client"
import { customer_sessions } from "@repo/db/schema"

import { ChatQueryInputSchema, type ChatAnswer } from "@repo/contracts"

import { RbacService } from "@/common/rbac/rbac.service"
import { v1 } from "@/config/api-versions.config"
import { env } from "@/config/env.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { RagGatewayService, toORPCError } from "../corpus/rag-gateway.service"
import { ChatHistoryService } from "./chat-history.service"
import { CustomerChatService } from "./customer-chat.service"

@Controller()
export class ChatController {
    constructor(
        private readonly ragGatewayService: RagGatewayService,
        private readonly rbacService: RbacService,
        private readonly chatHistoryService: ChatHistoryService,
        private readonly customerChatService: CustomerChatService
    ) {}

    @StrictThrottle()
    @RequirePermissions("chat.query.submit")
    @Implement(v1.chat.query.submit)
    async submitQuery(
        @Session() session: UserSession,
        @Req() request: Request & { id?: string | number }
    ) {
        return implement(v1.chat.query.submit).handler(async ({ input }) => {
            const access = await this.rbacService.getUserAccess(session.user.id)
            const correlationId = String(request.id ?? crypto.randomUUID())

            const answer = await this.ragGatewayService
                .submitChatQuery({
                    query: input.query,
                    k: input.k,
                    conversationId: input.conversationId,
                    filters: input.filters,
                    userId: session.user.id,
                    permissions: access.permissions,
                    requestId: correlationId,
                    traceId: correlationId,
                })
                .catch(toORPCError)
            return answer as ChatAnswer
        })
    }

    @RequirePermissions("chat.history.read")
    @Implement(v1.chat.history.list)
    async listHistory(@Session() session: UserSession) {
        return implement(v1.chat.history.list).handler(async () => {
            return this.chatHistoryService.listConversations(session.user.id)
        })
    }

    @RequirePermissions("chat.history.read")
    @Implement(v1.chat.history.get)
    async getHistory(@Session() session: UserSession) {
        return implement(v1.chat.history.get).handler(async ({ input }) => {
            return this.chatHistoryService.getConversation(session.user.id, input.id)
        })
    }

    @Post("v1/customer/session")
    @StrictThrottle()
    async createCustomerSession(
        @Body() body?: { channelCode?: string; language?: string }
    ) {
        return this.customerChatService.createSession(
            body?.channelCode ?? "web",
            body?.language ?? "en"
        )
    }

    @Post("v1/customer/chat/stream")
    @StrictThrottle()
    async streamCustomerQuery(
        @Body() body: unknown,
        @Headers("x-customer-session") sessionToken: string,
        @Req() request: Request & { id?: string | number },
        @Res() response: Response
    ) {
        if (!sessionToken) {
            throw new UnauthorizedException("Missing customer session token")
        }

        const tokenHash = createHash("sha256").update(sessionToken).digest("hex")
        const [customerSession] = await db
            .select()
            .from(customer_sessions)
            .where(eq(customer_sessions.tokenHash, tokenHash))
            .limit(1)

        if (!customerSession) {
            throw new UnauthorizedException("Invalid or expired customer session")
        }

        await db
            .update(customer_sessions)
            .set({ lastSeenAt: new Date() })
            .where(eq(customer_sessions.id, customerSession.id))

        const parsed = ChatQueryInputSchema.safeParse(body)
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid chat query")
        }

        const maskedQuery = this.customerChatService.maskPii(parsed.data.query)
        const sanitizedInput = { ...parsed.data, query: maskedQuery }

        const correlationId = String(request.id ?? crypto.randomUUID())
        const token = this.ragGatewayService.mintServiceToken({
            sub: `customer-${customerSession.id}`,
            permissions: ["corpus.read", "chat.query.submit"],
            requestId: correlationId,
            traceId: correlationId,
        })

        const abort = new AbortController()
        response.on("close", () => abort.abort())

        let upstream: globalThis.Response
        try {
            upstream = await fetch(`${env.RAG_SERVICE_URL}/internal/chat/stream`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${token}`,
                    "content-type": "application/json",
                    "x-request-id": correlationId,
                },
                body: JSON.stringify(sanitizedInput),
                signal: abort.signal,
            })
        } catch {
            response.status(502).json({ message: "RAG service is unreachable" })
            return
        }

        if (!upstream.ok || upstream.body === null) {
            response
                .status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502)
                .json({ message: "RAG chat stream failed" })
            return
        }

        response.status(200)
        response.setHeader("content-type", "text/event-stream")
        response.setHeader("cache-control", "no-cache")
        response.setHeader("connection", "keep-alive")
        response.setHeader("x-accel-buffering", "no")
        response.flushHeaders()

        try {
            for await (const chunk of upstream.body) {
                response.write(chunk)
            }
        } catch {
            if (!abort.signal.aborted) {
                response.write(
                    `event: final\ndata: ${JSON.stringify({
                        answer:
                            "I couldn't generate an answer right now because the language model is unavailable. Please try again in a moment.",
                        citations: [],
                        degraded: true,
                        isIDontKnow: false,
                    })}\n\n`
                )
            }
        } finally {
            response.end()
        }
    }

    @Post("v1/chat/stream")
    @StrictThrottle()
    @RequirePermissions("chat.query.submit")
    async streamQuery(
        @Body() body: unknown,
        @Session() session: UserSession,
        @Req() request: Request & { id?: string | number },
        @Res() response: Response
    ) {
        const parsed = ChatQueryInputSchema.safeParse(body)
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid chat query")
        }

        const access = await this.rbacService.getUserAccess(session.user.id)
        const correlationId = String(request.id ?? crypto.randomUUID())
        const token = this.ragGatewayService.mintServiceToken({
            sub: session.user.id,
            permissions: access.permissions,
            requestId: correlationId,
            traceId: correlationId,
        })

        const abort = new AbortController()
        response.on("close", () => abort.abort())

        let upstream: globalThis.Response
        try {
            upstream = await fetch(`${env.RAG_SERVICE_URL}/internal/chat/stream`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${token}`,
                    "content-type": "application/json",
                    "x-request-id": correlationId,
                },
                body: JSON.stringify(parsed.data),
                signal: abort.signal,
            })
        } catch {
            response.status(502).json({ message: "RAG service is unreachable" })
            return
        }
        if (!upstream.ok || upstream.body === null) {
            response
                .status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502)
                .json({ message: "RAG chat stream failed" })
            return
        }

        response.status(200)
        response.setHeader("content-type", "text/event-stream")
        response.setHeader("cache-control", "no-cache")
        response.setHeader("connection", "keep-alive")
        response.setHeader("x-accel-buffering", "no")
        response.flushHeaders()

        try {
            for await (const chunk of upstream.body) {
                response.write(chunk)
            }
        } catch {
            if (!abort.signal.aborted) {
                response.write(
                    `event: final\ndata: ${JSON.stringify({
                        answer:
                            "I couldn't generate an answer right now because the language model is unavailable. Please try again in a moment.",
                        citations: [],
                        degraded: true,
                        isIDontKnow: false,
                    })}\n\n`
                )
            }
        } finally {
            response.end()
        }
    }
}
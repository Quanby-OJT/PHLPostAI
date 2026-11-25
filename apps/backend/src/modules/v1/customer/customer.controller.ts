import {
	BadRequestException,
	Body,
	ConflictException,
	Controller,
	Get,
	Headers,
	NotFoundException,
	Post,
	Req,
	Res,
	UnauthorizedException,
	UseGuards,
} from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { AllowAnonymous } from "@thallesp/nestjs-better-auth"
import type { Request, Response } from "express"

import { CustomerChatRequestSchema, type CustomerAnswer } from "@repo/contracts"

import { v1 } from "@/config/api-versions.config"
import { env } from "@/config/env.config"
import { RagGatewayService, toORPCError } from "@/modules/v1/corpus/rag-gateway.service"
import { SessionThrottle } from "@/shared/decorators/session-throttle.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { ChannelAdapterRegistry } from "../channels/channel-adapter"
import { AllowedOriginGuard } from "./allowed-origin.guard"
import { ChannelsService, WEB_WIDGET_CHANNEL } from "./channels.service"
import { ConversationService } from "./conversation.service"
import {
	CustomerChatService,
	type InquiryClassification,
	type RagAnswerEnvelope,
} from "./customer-chat.service"
import { ragLanguageFields } from "./customer-language"
import { CustomerSessionService, type CustomerSessionRow } from "./customer-session.service"
import { formatSseFrame, readSseFrames } from "./sse-frames"

/** Permissions the public turn's service JWT carries into the RAG service. */
const CUSTOMER_SERVICE_PERMISSIONS = ["chat.query.submit", "corpus.read"] as const

type RequestWithId = Request & { id?: string | number }

/**
 * Public customer chat (CNV-1, Flow A).
 *
 * The ONLY anonymous write surface in v1. `@AllowAnonymous` (the library
 * decorator — the guards read its `PUBLIC` metadata) takes these routes out of
 * the staff session chain; authentication is instead the Customer Session
 * token in `x-customer-session`, and a missing, unknown, or idle-expired token
 * is a 401 (AC5). There is deliberately no permission key: a customer has no
 * role, so RbacGuard stays inert here (it fails closed only for decorated
 * routes).
 *
 * Rate limiting beyond the shared strict throttle is CHN-1's job.
 */
@Controller()
export class CustomerController {
	constructor(
		private readonly customerSessionService: CustomerSessionService,
		private readonly conversationService: ConversationService,
		private readonly customerChatService: CustomerChatService,
		private readonly ragGatewayService: RagGatewayService,
		private readonly channelAdapters: ChannelAdapterRegistry,
		private readonly channelsService: ChannelsService
	) {}

	@AllowAnonymous()
	@UseGuards(AllowedOriginGuard)
	@Implement(v1.customer.channelStatus)
	async channelStatus() {
		return implement(v1.customer.channelStatus).handler(async () => ({
			enabled: true,
			welcomeText: await this.channelsService.getWelcomeText(WEB_WIDGET_CHANNEL),
		}))
	}

	@AllowAnonymous()
	@StrictThrottle()
	@SessionThrottle()
	@UseGuards(AllowedOriginGuard)
	@Implement(v1.customer.session.start)
	async startSession() {
		return implement(v1.customer.session.start).handler(async ({ input }) => {
			const { sessionToken, row } = await this.customerSessionService.start({
				channelCode: input.channelCode,
				language: input.language,
			})
			return {
				sessionToken,
				channelCode: row.channelCode as typeof input.channelCode,
				language: row.language as typeof input.language,
				idleExpiresAt: this.customerSessionService.idleExpiresAt(row.lastSeenAt).toISOString(),
				welcomeText: await this.channelsService.getWelcomeText(WEB_WIDGET_CHANNEL),
			}
		})
	}

	@AllowAnonymous()
	@StrictThrottle()
	@SessionThrottle()
	@UseGuards(AllowedOriginGuard)
@Implement(v1.customer.conversation.end)
async endConversation(@Headers("x-customer-session") sessionToken: string | undefined) {
  return implement(v1.customer.conversation.end).handler(async ({ input }) => {
    const session = await this.requireSession(sessionToken, toORPCError)
    return this.conversationService.endCustomerConversation({
      conversationId: input.conversationId,
      customerSessionId: session.id,
    })
  })
}

@AllowAnonymous()
@StrictThrottle()
@SessionThrottle()
@UseGuards(AllowedOriginGuard)
@Implement(v1.customer.session.setLanguage)
async setLanguage(@Headers("x-customer-session") sessionToken: string | undefined) {
  return implement(v1.customer.session.setLanguage).handler(async ({ input }) => {
    const session = await this.requireSession(sessionToken, toORPCError)
    await this.customerSessionService.setLanguage(session.id, input.language)
    return { language: input.language }
  })
}
		

	@AllowAnonymous()
	@StrictThrottle()
	@SessionThrottle()
	@UseGuards(AllowedOriginGuard)
	@Implement(v1.customer.chat.send)
	async sendMessage(
		@Headers("x-customer-session") sessionToken: string | undefined,
		@Req() request: RequestWithId
	) {
		return implement(v1.customer.chat.send).handler(async ({ input }) => {
			const session = await this.requireSession(sessionToken, toORPCError)
			const adapter = this.channelAdapters.get(
				session.channelCode === "web" ? "web-widget" : session.channelCode
			)
			const message = adapter.receive(input)
			const conversation = await this.resolveConversation(
				session,
				message.conversationId,
				toORPCError
			)
			const correlationId = String(request.id ?? crypto.randomUUID())

			let classification: InquiryClassification
			try {
				classification = await this.classify(session, conversation.id, message.text, correlationId)
			} catch (error) {
				const refusal = await this.refuseIfScreened(error, session, conversation.id, correlationId)
				if (refusal) return refusal
				return toORPCError(error)
			}

			if (classification.route === "tracking") {
				try {
					return adapter.send(
						await this.answerTracking(conversation.id, classification, correlationId)
					)
				} catch (error) {
					await this.conversationService.recordUnansweredInquiry({
						conversationId: conversation.id,
						category: classification.category,
					})
					return toORPCError(error)
				}
			}

			if (classification.route === "rates") {
				try {
					return adapter.send(
						await this.answerRates(session, conversation.id, classification, correlationId)
					)
				} catch (error) {
					await this.conversationService.recordUnansweredInquiry({
						conversationId: conversation.id,
						category: classification.category,
					})
					return toORPCError(error)
				}
			}

			let envelope: RagAnswerEnvelope
			try {
				envelope = (await this.ragGatewayService.submitChatQuery({
					query: message.text,
					userId: this.principalFor(session),
					permissions: CUSTOMER_SERVICE_PERMISSIONS,
					requestId: correlationId,
					traceId: correlationId,
					actorType: "customer",
					// The public path's rows belong to ConversationService.
					persist: false,
					...ragLanguageFields(classification),
				})) as RagAnswerEnvelope
			} catch (error) {
				const refusal = await this.refuseIfScreened(error, session, conversation.id, correlationId)
				if (refusal) return refusal
				await this.conversationService.recordUnansweredInquiry({
					conversationId: conversation.id,
					category: classification.category,
				})
				return toORPCError(error)
			}

			const turn = await this.customerChatService.completeTurn({
				conversationId: conversation.id,
				envelope,
				classification,
			})
			return adapter.send({ ...turn, conversationId: conversation.id } satisfies CustomerAnswer)
		})
	}

	/**
	 * SSE mode (AC1 asks for a streamed answer). A plain Nest route because
	 * oRPC is JSON-only, same as the staff stream.
	 *
	 * `token` frames are forwarded verbatim as they arrive; the RAG service's
	 * `final` frame is withheld and replaced with the public envelope, because
	 * only this layer knows the conversation id, the stored message id, and the
	 * article titles. The turn is persisted before that frame is written, so a
	 * customer never sees an answer that was not recorded.
	 */
	@Post("v1/customer/chat/stream")
	@AllowAnonymous()
	@StrictThrottle()
	@SessionThrottle()
	@UseGuards(AllowedOriginGuard)
	async streamMessage(
		@Body() body: unknown,
		@Headers("x-customer-session") sessionToken: string | undefined,
		@Req() request: RequestWithId,
		@Res() response: Response
	) {
		const session = await this.requireSession(sessionToken)
		const parsed = CustomerChatRequestSchema.safeParse(body)
		if (!parsed.success) {
			throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid question")
		}
		const adapter = this.channelAdapters.get(
			session.channelCode === "web" ? "web-widget" : session.channelCode
		)
		const message = adapter.receive(parsed.data)
		const conversation = await this.resolveConversation(session, message.conversationId)
		const correlationId = String(request.id ?? crypto.randomUUID())

		// CNV-2: screen and classify first; the category decides the route.
		let classification: InquiryClassification
		try {
			classification = await this.classify(session, conversation.id, message.text, correlationId)
		} catch (error) {
			const refusal = await this.refuseIfScreened(error, session, conversation.id, correlationId)
			if (refusal) {
				response.status(200).json(refusal)
			} else {
				response.status(502).json({ message: "The assistant is unavailable. Please try again." })
			}
			return
		}

		// Tool turns (tracking, rates) are answered by their tool, not streamed.
		if (classification.route === "tracking" || classification.route === "rates") {
			try {
				const turn =
					classification.route === "tracking"
						? await this.answerTracking(conversation.id, classification, correlationId)
						: await this.answerRates(session, conversation.id, classification, correlationId)
				response.status(200).json(adapter.send(turn))
			} catch {
				await this.conversationService.recordUnansweredInquiry({
					conversationId: conversation.id,
					category: classification.category,
				})
				response.status(502).json({ message: "The assistant is unavailable. Please try again." })
			}
			return
		}

		const token = this.ragGatewayService.mintServiceToken({
			sub: this.principalFor(session),
			permissions: CUSTOMER_SERVICE_PERMISSIONS,
			requestId: correlationId,
			traceId: correlationId,
			actorType: "customer",
		})

		// Abort the upstream call (and the provider's own stream) when the
		// browser goes away, so a closed tab stops costing tokens.
		const abort = new AbortController()
		response.on("close", () => abort.abort())

		let upstream: globalThis.Response
		try {
			upstream = await fetch(`${env.RAG_SERVICE_URL}/internal/chat/stream`, {
				method: "POST",
				headers: {
					"authorization": `Bearer ${token}`,
					"content-type": "application/json",
					"x-request-id": correlationId,
				},
				body: JSON.stringify({
					query: message.text,
					persist: false,
					...ragLanguageFields(classification),
				}),
				signal: abort.signal,
			})
		} catch {
			await this.conversationService.recordUnansweredInquiry({
				conversationId: conversation.id,
				category: classification.category,
			})
			response.status(502).json({ message: "The assistant is unavailable. Please try again." })
			return
		}

		// Screening refuses before the stream opens (SC-1), so a refusal is a
		// clean JSON turn rather than a broken stream.
		if (upstream.status === 400) {
			const reason = await this.readUpstreamDetail(upstream)
			const refusal = await this.customerChatService.recordRefusal({
				conversationId: conversation.id,
				customerSessionId: session.id,
				channelCode: conversation.channelCode ?? session.channelCode,
				reason,
				traceId: correlationId,
			})
			response.status(200).json({
				...refusal,
				conversationId: conversation.id,
			})
			return
		}

		if (!upstream.ok || upstream.body === null) {
			await this.conversationService.recordUnansweredInquiry({
				conversationId: conversation.id,
				category: classification.category,
			})
			response.status(502).json({ message: "The assistant is unavailable. Please try again." })
			return
		}

		response.status(200)
		response.setHeader("content-type", "text/event-stream")
		response.setHeader("cache-control", "no-cache")
		response.setHeader("connection", "keep-alive")
		// Disable proxy buffering (Nginx) so tokens flush as they arrive.
		response.setHeader("x-accel-buffering", "no")
		response.flushHeaders()

		let envelope: RagAnswerEnvelope | null = null
		let turnRecorded = false
		try {
			for await (const frame of readSseFrames(upstream.body)) {
				if (frame.event === "final") {
					envelope = frame.data ? (JSON.parse(frame.data) as RagAnswerEnvelope) : {}
					continue
				}
				response.write(`${frame.raw}\n\n`)
			}

			if (envelope === null) throw new Error("RAG stream ended without a final frame")

			const turn = await this.customerChatService.completeTurn({
				conversationId: conversation.id,
				envelope,
				classification,
			})
			turnRecorded = true
			response.write(
				formatSseFrame(
					"final",
					adapter.send({ ...turn, conversationId: conversation.id } satisfies CustomerAnswer)
				)
			)
		} catch {
			// The upstream died or the turn could not be stored. Say so plainly
			// rather than leaving the page hanging on a half-written answer.
			if (!turnRecorded)
				await this.conversationService.recordUnansweredInquiry({
					conversationId: conversation.id,
					category: classification.category,
				})
			if (!abort.signal.aborted) {
				response.write(
					formatSseFrame("final", {
						answer: "I couldn't finish that answer. Please ask again in a moment.",
						conversationId: conversation.id,
						messageId: null,
						sources: [],
						citations: [],
						answerKind: "uncertain",
						isIDontKnow: false,
						degraded: true,
					})
				)
			}
		} finally {
			response.end()
		}
	}

	/** CNV-2: screen and classify the question (Flow A steps 3 to 5). */
	private classify(
		session: CustomerSessionRow,
		conversationId: string,
		query: string,
		correlationId: string
	): Promise<InquiryClassification> {
		return this.customerChatService.classify({
			query,
			principal: this.principalFor(session),
			permissions: CUSTOMER_SERVICE_PERMISSIONS,
			correlationId,
			sessionLanguage: session.language,
			conversationId,
		})
	}

	/** KB-2: answer from the rate table through the lookup tool. Already screened. */
	private async answerRates(
		session: CustomerSessionRow,
		conversationId: string,
		classification: InquiryClassification,
		correlationId: string
	): Promise<CustomerAnswer> {
		const turn = await this.customerChatService.answerRates({
			conversationId,
			classification,
			principal: this.principalFor(session),
			permissions: CUSTOMER_SERVICE_PERMISSIONS,
			correlationId,
		})
		return { ...turn, conversationId }
	}

	/** TRK-1: answer from the tracking connector. The question is already screened. */
	private async answerTracking(
		conversationId: string,
		classification: InquiryClassification,
		correlationId: string
	): Promise<CustomerAnswer> {
		const turn = await this.customerChatService.answerTracking({
			conversationId,
			classification,
			correlationId,
		})
		return { ...turn, conversationId }
	}

	/** The audit principal for a customer turn — a session, never a person. */
	private principalFor(session: CustomerSessionRow): string {
		return `customer-session:${session.id}`
	}

	/**
	 * AC5: no token, an unknown token, or one that has gone idle is a 401. The
	 * message does not distinguish the three, so the endpoint cannot be used to
	 * test whether a token exists.
	 */
	private async requireSession(
		sessionToken: string | undefined,
		mapError?: (error: unknown) => never
	): Promise<CustomerSessionRow> {
		const session = sessionToken ? await this.customerSessionService.resolve(sessionToken) : null
		if (session) return session

		const error = new UnauthorizedException("Invalid or expired customer session")
		if (mapError) mapError(error)
		throw error
	}

	/** Continue this session's own conversation, or open a new one. */
	private async resolveConversation(
		session: CustomerSessionRow,
		conversationId: string | undefined,
		mapError?: (error: unknown) => never
	) {
		if (conversationId === undefined) {
			return this.conversationService.startCustomerConversation({
				customerSessionId: session.id,
				channelCode: session.channelCode,
				language: session.language,
			})
		}

		const existing = await this.conversationService.findOwnedByCustomerSession(
			conversationId,
			session.id
		)
		if (existing) {
			if (existing.status !== "ai_active") {
				const error = new ConflictException(
					"A human agent has been requested for this conversation"
				)
				if (mapError) mapError(error)
				throw error
			}
			return existing
		}

		const error = new NotFoundException("Conversation not found")
		if (mapError) mapError(error)
		throw error
	}

	/** Turn a screening 400 from the gateway into a recorded refusal (AC4). */
	private async refuseIfScreened(
		error: unknown,
		session: CustomerSessionRow,
		conversationId: string,
		traceId: string
	) {
		const status =
			error && typeof error === "object" && "getStatus" in error
				? (error as { getStatus: () => number }).getStatus()
				: null
		if (status !== 400) return null

		const refusal = await this.customerChatService.recordRefusal({
			conversationId,
			customerSessionId: session.id,
			channelCode: session.channelCode,
			reason: error instanceof Error ? error.message : "screened",
			traceId,
		})
		return { ...refusal, conversationId } satisfies CustomerAnswer
	}

	/** Best-effort reason from an upstream error body; never shown to the customer. */
	private async readUpstreamDetail(upstream: globalThis.Response): Promise<string> {
		try {
			const payload = (await upstream.json()) as { detail?: unknown; message?: unknown }
			const detail = payload.detail ?? payload.message
			return typeof detail === "string" ? detail : "screened"
		} catch {
			return "screened"
		}
	}
}

import {
	BadRequestException,
	Body,
	ConflictException,
	Controller,
	Get,
	Headers,
	NotFoundException,
	Param,
	Post,
	Query,
	Req,
	Res,
	UnauthorizedException,
	UseGuards,
} from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { AllowAnonymous } from "@thallesp/nestjs-better-auth"
import type { Request, Response } from "express"
import { z } from "zod"

import { CustomerChatRequestSchema, type CustomerAnswer } from "@repo/contracts"

import { ConversationLiveService } from "@/common/conversation-live/conversation-live.service"
import { v1 } from "@/config/api-versions.config"
import { env } from "@/config/env.config"
import { AssistantSettingsService } from "@/modules/v1/assistant/assistant-settings.service"
import { RagGatewayService, toORPCError } from "@/modules/v1/corpus/rag-gateway.service"
import { EscalationService } from "@/modules/v1/escalations/escalation.service"
import { SessionThrottle } from "@/shared/decorators/session-throttle.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { ChannelAdapterRegistry } from "../channels/channel-adapter"
import { matchesEscalationRule } from "../escalations/escalation-rules"
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
import { ScamAssessmentService } from "./scam-assessment.service"
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
		private readonly assistantSettingsService: AssistantSettingsService,
		private readonly escalationService: EscalationService,
		private readonly ragGatewayService: RagGatewayService,
		private readonly conversationLiveService: ConversationLiveService,
		private readonly channelAdapters: ChannelAdapterRegistry,
		private readonly channelsService: ChannelsService,
		private readonly scamAssessmentService: ScamAssessmentService
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
		const startedAt = performance.now()
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
			if (
				conversation.status === "escalation_requested" ||
				conversation.status === "agent_active"
			) {
				try {
					return await this.sendAgentMessage(
						session,
						conversation.id,
						message.text,
						correlationId,
						input.intent
					)
				} catch (error) {
					return toORPCError(error)
				}
			}
			const escalationSettings = await this.assistantSettingsService.getEscalationSettings()
			if (matchesEscalationRule(message.text, undefined, escalationSettings)) {
				return adapter.send(
					await this.routeToAgent(
						session,
						conversation.id,
						message.text,
						correlationId,
						"An escalation rule matched"
					)
				)
			}

			let classification: InquiryClassification
			try {
				classification = await this.classify(
					session,
					conversation.id,
					{ query: message.text, intent: input.intent },
					correlationId
				)
			} catch (error) {
				const refusal = await this.refuseIfScreened(
					error,
					session,
					conversation.id,
					correlationId,
					startedAt
				)
				if (refusal) return refusal
				return toORPCError(error)
			}
if (matchesEscalationRule(message.text, classification.category, escalationSettings)) {
				return adapter.send(
					await this.routeToAgent(
						session,
						conversation.id,
						message.text,
						correlationId,
						"An escalation rule matched",
						classification.category
					)
				)
			}
			const settings = await this.assistantSettingsService.get()

			if (classification.route !== "retrieval") {
				try {
					return adapter.send(
						await this.answerTool(
							session,
							conversation.id,
							message.text,
							classification,
							correlationId,
							startedAt
						)
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
			let confidenceThreshold: number
			try {
				const settings = await this.assistantSettingsService.get()
				confidenceThreshold = settings.confidenceThreshold
				envelope = (await this.ragGatewayService.submitChatQuery({
					query: message.text,
					userId: this.principalFor(session),
					permissions: CUSTOMER_SERVICE_PERMISSIONS,
					requestId: correlationId,
					traceId: correlationId,
					actorType: "customer",
					// The public path's rows belong to ConversationService.
					persist: false,
					...(classification.eligible && { maxOutputTokens: settings.maxOutputTokens }),
					...ragLanguageFields(classification),
				})) as RagAnswerEnvelope
			} catch (error) {
				const refusal = await this.refuseIfScreened(
					error,
					session,
					conversation.id,
					correlationId,
					startedAt
				)
				if (refusal) return refusal
				await this.conversationService.recordUnansweredInquiry({
					conversationId: conversation.id,
					category: classification.category,
				})
				return toORPCError(error)
			}

			if (
				(envelope.isIDontKnow === true ||
					typeof envelope.confidence !== "number" ||
					envelope.confidence < settings.confidenceThreshold) &&
				(await this.shouldEscalateRepeatedLowConfidence(
					conversation.id,
					typeof envelope.confidence === "number" ? envelope.confidence : null,
					escalationSettings.rules.repeatedLowConfidenceCount,
					settings.confidenceThreshold,
					envelope.isIDontKnow === true
				))
			) {
				return adapter.send(
					await this.routeToAgent(
						session,
						conversation.id,
						message.text,
						correlationId,
						"Repeated low-confidence answers",
						classification.category
					)
				)
			}
			const turn = await this.customerChatService.completeTurn({
				conversationId: conversation.id,
				envelope,
				classification,
				confidenceThreshold,
				requestStartedAt: startedAt,
			})
			return adapter.send({ ...turn, conversationId: conversation.id } satisfies CustomerAnswer)
		})
	}

	/**
	 * SSE mode (AC1 asks for a streamed answer). A plain Nest route because
	 * oRPC is JSON-only, same as the staff stream.
	 *
	 * Hold draft tokens until the final confidence is known. Persist the selected
	 * reply, then send its text and a final envelope with the conversation ID,
	 * stored message ID, and article titles.
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
		const startedAt = performance.now()
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
		if (conversation.status === "escalation_requested" || conversation.status === "agent_active") {
			const result = await this.sendAgentMessage(
				session,
				conversation.id,
				message.text,
				correlationId,
				parsed.data.intent
			)
			response.status(200).json(result)
			return
		}
		const escalationSettings = await this.assistantSettingsService.getEscalationSettings()
		if (matchesEscalationRule(message.text, undefined, escalationSettings)) {
			const result = await this.routeToAgent(
				session,
				conversation.id,
				message.text,
				correlationId,
				"An escalation rule matched"
			)
			response.status(200).json(result)
			return
		}

		// CNV-2: screen and classify first; the category decides the route.
		let classification: InquiryClassification
		try {
			classification = await this.classify(
				session,
				conversation.id,
				{ query: message.text, intent: parsed.data.intent },
				correlationId
			)
		} catch (error) {
			const refusal = await this.refuseIfScreened(
				error,
				session,
				conversation.id,
				correlationId,
				startedAt
			)
			if (refusal) {
				response.status(200).json(refusal)
			} else {
				response.status(502).json({ message: "The assistant is unavailable. Please try again." })
			}
			return
		}
if (matchesEscalationRule(message.text, classification.category, escalationSettings)) {
			const result = await this.routeToAgent(
				session,
				conversation.id,
				message.text,
				correlationId,
				"An escalation rule matched",
				classification.category
			)
			response.status(200).json(result)
			return
		}
		const assistantSettings = await this.assistantSettingsService.get()

		// Tool results arrive as one completed turn after persistence.
		if (classification.route !== "retrieval") {
			try {
				const turn = await this.answerTool(
					session,
					conversation.id,
					message.text,
					classification,
					correlationId,
					startedAt
				)
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
		let confidenceThreshold: number
		try {
			const assistantSettings = await this.assistantSettingsService.get()
			confidenceThreshold = assistantSettings.confidenceThreshold
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
					...(classification.eligible && {
						maxOutputTokens: assistantSettings.maxOutputTokens,
					}),
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
				requestStartedAt: startedAt,
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
				// Hold draft deltas until confidence is known. A below-threshold
				// answer must never leak before its safe uncertainty response.
				if (frame.event !== "token") response.write(`${frame.raw}\n\n`)
			}

			if (envelope === null) throw new Error("RAG stream ended without a final frame")
			if (
				(envelope.isIDontKnow === true ||
					typeof envelope.confidence !== "number" ||
					envelope.confidence < assistantSettings.confidenceThreshold) &&
				(await this.shouldEscalateRepeatedLowConfidence(
					conversation.id,
					typeof envelope.confidence === "number" ? envelope.confidence : null,
					escalationSettings.rules.repeatedLowConfidenceCount,
					assistantSettings.confidenceThreshold,
					envelope.isIDontKnow === true
				))
			) {
				const handoff = await this.routeToAgent(
					session,
					conversation.id,
					message.text,
					correlationId,
					"Repeated low-confidence answers",
					classification.category
				)
				response.write(formatSseFrame("final", handoff))
				turnRecorded = true
				return
			}

			const turn = await this.customerChatService.completeTurn({
				conversationId: conversation.id,
				envelope,
				classification,
				confidenceThreshold,
				requestStartedAt: startedAt,
			})
			turnRecorded = true
			response.write(formatSseFrame("token", { delta: turn.answer }))
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

	@Get("v1/customer/conversations/:id/events")
	@AllowAnonymous()
	@SessionThrottle()
	@UseGuards(AllowedOriginGuard)
	async customerEvents(
		@Param("id") id: string,
		@Query("after") after: string | undefined,
		@Headers("x-customer-session") sessionToken: string | undefined,
		@Res() response: Response
	) {
		if (!z.string().uuid().safeParse(id).success)
			throw new BadRequestException("Invalid conversation id")
		const session = sessionToken ? await this.customerSessionService.resolve(sessionToken) : null
		if (!session) throw new UnauthorizedException("Invalid or expired customer session")
		const conversation = await this.conversationService.findOwnedByCustomerSession(id, session.id)
		if (!conversation) throw new NotFoundException("Conversation not found")
		if (
			conversation.status !== "escalation_requested" &&
			conversation.status !== "agent_active" &&
			conversation.status !== "resolved_by_agent" &&
			conversation.status !== "contact_captured"
		) {
			throw new ConflictException("This conversation is not waiting for an agent")
		}
		const afterIndex = after === undefined ? -1 : Number(after)
		await this.conversationLiveService.stream(id, response, {
			afterTurnIndex: Number.isSafeInteger(afterIndex) && afterIndex >= -1 ? afterIndex : -1,
			agentsOnly: true,
		})
	}

	private async screenForAgent(query: string, session: CustomerSessionRow, correlationId: string) {
		const screened = await this.ragGatewayService.screenQuery({
			query,
			userId: this.principalFor(session),
			permissions: CUSTOMER_SERVICE_PERMISSIONS,
			requestId: correlationId,
			traceId: correlationId,
			actorType: "customer",
		})
		return screened.screenedQuery
	}

	private async routeToAgent(
		session: CustomerSessionRow,
		conversationId: string,
		query: string,
		correlationId: string,
		reason: string,
		category?: string
	) {
		const maskedQuery = await this.screenForAgent(query, session, correlationId)
		const escalation = await this.escalationService.request({
			conversationId,
			customerSessionId: session.id,
			reason,
			category,
		})
		const message = await this.conversationService.recordCustomerMessage({
			conversationId,
			customerSessionId: session.id,
			maskedQuery,
			inquiryCategory: category,
		})
		await this.conversationLiveService.publish(conversationId)
		return {
			agentMode: true as const,
			conversationId,
			messageId: message.id,
			status: escalation.status,
		}
	}

	private async shouldEscalateRepeatedLowConfidence(
		conversationId: string,
		confidence: number | null | undefined,
		requiredCount: number,
		threshold: number,
		isIDontKnow: boolean
	): Promise<boolean> {
		const currentIsLow =
			isIDontKnow || confidence === null || confidence === undefined || confidence < threshold
		if (!currentIsLow) return false
		const recentLow = await this.conversationService.countRecentLowConfidenceTurns(
			conversationId,
			threshold
		)
		return recentLow + 1 >= requiredCount
	}

	/** CNV-2: screen and classify the question (Flow A steps 3 to 5). */
	private classify(
		session: CustomerSessionRow,
		conversationId: string,
		input: { query: string; intent?: "scam" },
		correlationId: string
	): Promise<InquiryClassification> {
		return this.customerChatService.classify({
			...input,
			principal: this.principalFor(session),
			permissions: CUSTOMER_SERVICE_PERMISSIONS,
			correlationId,
			sessionLanguage: session.language,
			conversationId,
		})
	}

	private async answerTool(
		session: CustomerSessionRow,
		conversationId: string,
		query: string,
		classification: InquiryClassification,
		correlationId: string,
		requestStartedAt: number
	): Promise<CustomerAnswer> {
		const context = {
			conversationId,
			classification,
			principal: this.principalFor(session),
			permissions: CUSTOMER_SERVICE_PERMISSIONS,
			correlationId,
		}
		if (classification.route === "scam") {
			return this.scamAssessmentService.answer({
				...context,
				query,
				sessionLanguage: session.language,
				requestStartedAt,
			})
		}
		const turn =
			classification.route === "tracking"
				? await this.customerChatService.answerTracking({
						conversationId,
						classification,
						correlationId,
						requestStartedAt,
						explanationLanguage: session.language,
						confidenceThreshold: (await this.assistantSettingsService.get()).confidenceThreshold,
					})
				: await this.customerChatService.answerRates(context)
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
			if (
				existing.status !== "ai_active" &&
				existing.status !== "escalation_requested" &&
				existing.status !== "agent_active"
			) {
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

	private async sendAgentMessage(
		session: CustomerSessionRow,
		conversationId: string,
		query: string,
		correlationId: string,
		intent?: "scam"
	) {
		if (intent === "scam") {
			throw new ConflictException("Start a new chat to check a suspicious message.")
		}
		const screened = await this.ragGatewayService.screenQuery({
			query,
			userId: this.principalFor(session),
			permissions: CUSTOMER_SERVICE_PERMISSIONS,
			requestId: correlationId,
			traceId: correlationId,
			actorType: "customer",
		})
		const saved = await this.conversationService.recordCustomerMessage({
			conversationId,
			customerSessionId: session.id,
			maskedQuery: screened.screenedQuery,
		})
		await this.conversationLiveService.publish(conversationId)
		return { agentMode: true as const, conversationId, messageId: saved.id }
	}

	/** Turn a screening 400 from the gateway into a recorded refusal (AC4). */
	private async refuseIfScreened(
		error: unknown,
		session: CustomerSessionRow,
		conversationId: string,
		traceId: string,
		requestStartedAt?: number
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
			requestStartedAt,
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

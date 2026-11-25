import { Injectable, Logger } from "@nestjs/common"

import type {
	CustomerAnswer,
	CustomerAnswerKind,
	CustomerAnswerSource,
	CustomerLanguage,
} from "@repo/contracts"

import { AuditService } from "@/common/audit/audit.service"
import { AssistantService } from "@/modules/v1/assistant/assistant.service"
import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"
import { RateLookupService } from "@/modules/v1/rates/rate-lookup.service"
import { RATE_FOLLOW_UP_PREFIX } from "@/modules/v1/rates/rates.replies"
import { KnowledgeRepository } from "@/modules/v1/knowledge/knowledge.repository"
import { TrackingRepository } from "@/modules/v1/tracking/tracking.repository"
import { TrackingService } from "@/modules/v1/tracking/tracking.service"

import { ConversationService } from "./conversation.service"
import { I_DONT_KNOW_REPLIES, replyLanguageFor, withLanguageNotice } from "./customer-language"
import { routeForCategory, type InquiryRoute } from "./inquiry-routing"

/**
 * What the assistant says when screening refuses a question (AC4). Fixed text:
 * a refusal must not improvise, and must not hint at what the screen matched.
 */
export const CUSTOMER_REFUSAL_ANSWER =
	"I can't help with that request. Ask me about PHLPost services and I'll answer from our published information."

/** Domain inquiry categories (DOMAIN-MODEL §1). */
export const INQUIRY_CATEGORY_CODES = [
	"tracking",
	"rates",
	"postal-id",
	"service-info",
	"scam",
	"complaint",
	"other",
] as const

/** Keyword fallback for when the classifier model is unavailable (CNV-2). */
export function classifyInquiryCategory(query: string): (typeof INQUIRY_CATEGORY_CODES)[number] {
	const value = query.toLowerCase()
	if (/\b(complaint|complain|unhappy|bad service|delayed package|lost package)\b/.test(value))
		return "complaint"
	if (/\b(scam|fraud|phishing|suspicious)\b/.test(value)) return "scam"
	if (/\bpostal[ -]?id\b/.test(value)) return "postal-id"
	if (/\b(rate|rates|price|cost|postage)\b/.test(value)) return "rates"
	if (/\b(track|tracking|parcel|package|mail item)\b/.test(value)) return "tracking"
	if (/\b(service|office|branch|hours|deliver|delivery|send|post)\b/.test(value)) {
		return "service-info"
	}
	return "other"
}

/**
 * A stored turn, as the customer is shown it. `conversationId` is added by the
 * caller, which is the layer that resolved the conversation.
 */
export type CustomerTurn = Omit<CustomerAnswer, "conversationId">

/** Flow A step 4: the screened question, its Inquiry Category, language and route. */
export interface InquiryClassification {
	screenedQuery: string
	category: string
	eligible?: boolean
	language: string | null
	/** CNV-4: the language the reply is written in. */
	replyLanguage: CustomerLanguage
	route: InquiryRoute
	/** KB-2: the earlier rates question this message completes, if any. */
	context?: string
}

/** The RAG service's `final` SSE frame / JSON answer, as far as CNV-1 needs it. */
export interface RagAnswerEnvelope {
	answer?: unknown
	citations?: unknown
	isIDontKnow?: unknown
	model?: unknown
	tokenUsage?: unknown
	retrievedChunks?: unknown
	usedChunks?: unknown
	confidence?: unknown
	retrievalScore?: unknown
	groundednessResult?: unknown
	outputTokens?: unknown
	traceId?: unknown
	/**
	 * The screened (sanitized + PII-masked) question, as produced by the RAG
	 * service's SC-1 screen. This is the ONLY form CNV-1 stores (AC3).
	 */
	screenedQuery?: unknown
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null
}

/**
 * One public chat turn (CNV-1, Flow A steps 3, 5, 6, 8).
 *
 * Screening, retrieval over approved chunks, grounded generation and refusal
 * all stay in the RAG service — this service does not re-implement any of it.
 * What it adds is the part the RAG service cannot know about: the customer
 * session's conversation, the masked turn written through
 * `ConversationService`, and the article TITLES behind the citations.
 */
@Injectable()
export class CustomerChatService {
	private readonly logger = new Logger(CustomerChatService.name)

	constructor(
		private readonly conversationService: ConversationService,
		private readonly knowledgeRepository: KnowledgeRepository,
		private readonly auditService: AuditService,
		private readonly ragGatewayService: RagGatewayService,
		private readonly trackingService: TrackingService,
		private readonly trackingRepository: TrackingRepository,
		private readonly assistantService: AssistantService,
		private readonly rateLookupService: RateLookupService
	) {}

	/**
	 * CNV-2 (Flow A steps 3 to 5): screen and classify in one RAG call, over the
	 * active categories, then pick the route from the category. A screening
	 * block surfaces as the gateway's 400. When the model is unavailable the
	 * keyword fallback and TRK-1's tracking check stand in.
	 */
	async classify(input: {
		query: string
		principal: string
		permissions: readonly string[]
		correlationId: string
		sessionLanguage: string
		conversationId?: string
	}): Promise<InquiryClassification> {
		const categories = await this.assistantService.listActiveCategories()
		const result = await this.ragGatewayService.classifyInquiry({
			query: input.query,
			categories,
			userId: input.principal,
			permissions: input.permissions,
			requestId: input.correlationId,
			traceId: input.correlationId,
			actorType: "customer",
		})
		const active = new Set(categories.map(category => category.code))
		const category = result.fallbackUsed
			? this.fallbackCategory(result.screenedQuery, active)
			: active.has(result.category)
				? result.category
				: "other"
		const replyLanguage = replyLanguageFor(result.language, input.sessionLanguage)
		const followUp = input.conversationId
			? await this.rateFollowUp(input.conversationId, category, active)
			: null
		if (followUp) {
			const eligible = categories.find(item => item.code === "rates")?.isEligible ?? false
			return {
				screenedQuery: result.screenedQuery,
				category: "rates",
				eligible,
				language: result.language,
				replyLanguage,
				route: "rates",
				context: followUp,
			}
		}
		const eligible = categories.find(item => item.code === category)?.isEligible ?? false
		return {
			screenedQuery: result.screenedQuery,
			category,
			eligible,
			language: result.language,
			replyLanguage,
			route: routeForCategory(category),
		}
	}

	/**
	 * KB-2 AC2: after the assistant asked for a missing rate detail, a short
	 * reply ("2 kg", "to Cebu") completes that question instead of starting a
	 * new topic. Returns the earlier (masked) question to combine with it.
	 */
	private async rateFollowUp(
		conversationId: string,
		category: string,
		active: ReadonlySet<string>
	): Promise<string | null> {
		if (!active.has("rates") || (category !== "rates" && category !== "other")) return null
		const last = await this.conversationService.lastExchange(conversationId)
		if (!last.assistant?.content.startsWith(RATE_FOLLOW_UP_PREFIX) || !last.customer) return null
		return last.customer.content
	}

	/**
	 * KB-2 (PRD D4): a rates turn. The price comes only from the approved rate
	 * table through the lookup tool; the model never quotes one.
	 */
	async answerRates(input: {
		conversationId: string
		classification: InquiryClassification
		principal: string
		permissions: readonly string[]
		correlationId: string
		confidenceThreshold?: number
	}): Promise<CustomerTurn> {
		const { classification } = input
		const question = classification.context
			? `${classification.context}\n${classification.screenedQuery}`
			: classification.screenedQuery
		const result = await this.rateLookupService.answer(question, {
			principal: input.principal,
			permissions: input.permissions,
			correlationId: input.correlationId,
		})
		const confidence = result.outcome === "no_rate" ? 0 : 1
		const belowThreshold = confidence < (input.confidenceThreshold ?? 0.7)
		const reply = withLanguageNotice(
			belowThreshold ? this.lowConfidenceReply(classification, []) : result.reply,
			classification.language,
			classification.replyLanguage
		)

		const { assistantMessageId } = await this.conversationService.recordTurn({
			conversationId: input.conversationId,
			maskedQuery: classification.screenedQuery,
			inquiryCategory: classification.category,
			language: classification.language ?? undefined,
			answer: reply,
			answerKind: belowThreshold ? "uncertain" : "tool",
			confidence,
			traceId: input.correlationId,
			category: "rates",
		})

		return {
			answer: reply,
			messageId: assistantMessageId,
			sources: [],
			citations: [],
			answerKind: belowThreshold ? "uncertain" : "tool",
			isIDontKnow: belowThreshold,
		}
	}

	private fallbackCategory(screenedQuery: string, active: ReadonlySet<string>): string {
		if (active.has("tracking") && this.trackingService.isTrackingQuestion(screenedQuery)) {
			return "tracking"
		}
		const category = classifyInquiryCategory(screenedQuery)
		return active.has(category) ? category : "other"
	}

	/**
	 * TRK-1 (Flow B): a tracking turn, already screened and classified. Answered
	 * from the connector without the model, and stored with its lookup row in
	 * one transaction.
	 */
	async answerTracking(input: {
		conversationId: string
		classification: InquiryClassification
		correlationId: string
		confidenceThreshold?: number
	}): Promise<CustomerTurn> {
		const { classification } = input
		const result = await this.trackingService.answer(
			classification.screenedQuery,
			classification.replyLanguage
		)
		const { storedQuery, lookup } = result
		const confidence = result.lookup?.outcome === "unavailable" ? 0 : 1
		const belowThreshold = confidence < (input.confidenceThreshold ?? 0.7)
		const reply = withLanguageNotice(
			belowThreshold ? this.lowConfidenceReply(classification, []) : result.reply,
			classification.language,
			classification.replyLanguage
		)

		const { assistantMessageId } = await this.conversationService.recordTurn({
			conversationId: input.conversationId,
			maskedQuery: storedQuery,
			inquiryCategory: classification.category,
			language: classification.language ?? undefined,
			answer: reply,
			answerKind: belowThreshold ? "uncertain" : "tool",
			confidence,
			category: "tracking",
			additionalEventKinds: lookup ? ["tracking_lookup"] : [],
			traceId: input.correlationId,
			onRecorded: lookup
				? (tx, ids) =>
						this.trackingRepository.insertLookup(tx, {
							...lookup,
							messageId: ids.assistantMessageId,
						})
				: undefined,
		})

		return {
			answer: reply,
			messageId: assistantMessageId,
			sources: [],
			citations: [],
			answerKind: belowThreshold ? "uncertain" : "tool",
			isIDontKnow: belowThreshold,
		}
	}

	/** `uncertain` for the grounded "I don't know" (AC2), else `answer`. */
	answerKindFor(envelope: RagAnswerEnvelope): CustomerAnswerKind {
		return envelope.isIDontKnow === true ? "uncertain" : "answer"
	}

	/**
	 * Resolve the citations' documents to the approved articles they came from
	 * (AC1), deduplicated and in first-cited order.
	 */
	async resolveSources(citations: unknown): Promise<CustomerAnswerSource[]> {
		if (!Array.isArray(citations)) return []

		const documentIds: string[] = []
		for (const citation of citations) {
			const documentId =
				citation && typeof citation === "object"
					? asString((citation as { documentId?: unknown }).documentId)
					: null
			if (documentId && !documentIds.includes(documentId)) documentIds.push(documentId)
		}

		const resolved = await this.knowledgeRepository.resolveArticleSources(documentIds)
		const sources: CustomerAnswerSource[] = []
		for (const documentId of documentIds) {
			const source = resolved.get(documentId)
			if (source && !sources.some(existing => existing.articleId === source.articleId)) {
				sources.push(source)
			}
		}
		return sources
	}

	/**
	 * Persist a completed turn and return what the customer is shown.
	 *
	 * The stored question is `envelope.screenedQuery` — the RAG service's
	 * masked form. If that field is ever missing (our two services out of step)
	 * the turn is stored WITHOUT the question rather than with the raw text:
	 * losing a question is recoverable, storing unmasked personal data is not.
	 */
	async completeTurn(input: {
		conversationId: string
		envelope: RagAnswerEnvelope
		answerKind?: CustomerAnswerKind
		answerOverride?: string
		classification?: Pick<InquiryClassification, "category" | "language" | "replyLanguage">
		confidenceThreshold?: number
	}): Promise<CustomerTurn> {
		const { conversationId, envelope, classification } = input
		let answerKind = input.answerKind ?? this.answerKindFor(envelope)
		// The RAG service owns the citation shape (ChatCitationSchema); it crosses
		// the internal boundary unvalidated, as it does on the staff path.
		const citations = (
			answerKind === "refusal" || !Array.isArray(envelope.citations) ? [] : envelope.citations
		) as CustomerAnswer["citations"]
		const sources = answerKind === "refusal" ? [] : await this.resolveSources(citations)
		const confidence =
			typeof envelope.confidence === "number" && Number.isFinite(envelope.confidence)
				? Math.max(0, Math.min(1, envelope.confidence))
				: null
		const chunks = Array.isArray(envelope.retrievedChunks) ? envelope.retrievedChunks : []
		const retrievalScore =
			typeof envelope.retrievalScore === "number" && Number.isFinite(envelope.retrievalScore)
				? Math.max(0, Math.min(1, envelope.retrievalScore))
				: Math.max(
						0,
						...chunks.map(chunk => {
							const score =
								chunk && typeof chunk === "object"
									? (chunk as { similarity?: unknown }).similarity
									: undefined
							return typeof score === "number" && Number.isFinite(score) ? score : 0
						})
					)
		const groundednessResult =
			envelope.groundednessResult && typeof envelope.groundednessResult === "object"
				? (envelope.groundednessResult as Record<string, unknown>)
				: {
						grounded: citations.length > 0 && envelope.isIDontKnow !== true,
						regenerated: false,
						outcome: "citation-validation",
					}
		const threshold = input.confidenceThreshold ?? 0.7
		const belowThreshold =
			input.answerOverride === undefined &&
			answerKind !== "refusal" &&
			answerKind !== "tool" &&
			(confidence === null || confidence < threshold)
		if (belowThreshold) answerKind = "uncertain"
		const answer = input.answerOverride
			?? (belowThreshold
				? withLanguageNotice(
						this.lowConfidenceReply(classification, sources.map(source => source.title)),
						classification?.language ?? null,
						classification?.replyLanguage ?? "en"
					)
				: this.localizedAnswer(envelope, answerKind, classification))

		const maskedQuery = asString(envelope.screenedQuery)
		if (maskedQuery === null) {
			this.logger.warn(
				"RAG answer carried no screenedQuery; storing the turn without the question so no unmasked text is persisted"
			)
		}

		const { assistantMessageId } = await this.conversationService.recordTurn({
			conversationId,
			maskedQuery: maskedQuery ?? "",
			inquiryCategory: input.classification?.category ?? classifyInquiryCategory(maskedQuery ?? ""),
			language: input.classification?.language ?? undefined,
			answer,
			answerKind,
			confidence,
			retrievalScore,
			groundednessResult,
			outputTokens:
				typeof envelope.outputTokens === "number" && Number.isFinite(envelope.outputTokens)
					? Math.max(0, Math.trunc(envelope.outputTokens))
					: typeof envelope.tokenUsage === "object" && envelope.tokenUsage !== null &&
						  typeof (envelope.tokenUsage as { completionTokens?: unknown }).completionTokens === "number"
						? Math.max(0, Math.trunc((envelope.tokenUsage as { completionTokens: number }).completionTokens))
						: null,
			citations,
			retrievedChunks: envelope.retrievedChunks ?? null,
			usedChunks: envelope.usedChunks ?? null,
			tokenUsage: envelope.tokenUsage ?? null,
			traceId: asString(envelope.traceId),
			modelUsed: asString(envelope.model),
		})

		return {
			answer,
			messageId: assistantMessageId,
			sources,
			citations,
			answerKind,
			isIDontKnow: belowThreshold || envelope.isIDontKnow === true,
		}
	}

	private lowConfidenceReply(
		classification: Pick<InquiryClassification, "replyLanguage"> | undefined,
		sourceTitles: string[]
	): string {
		const language = classification?.replyLanguage ?? "en"
		const titles = [...new Set(sourceTitles)].slice(0, 3)
		const found: Record<typeof language, (items: string[]) => string> = {
			en: items => items.length ? `I found information in: ${items.join(", ")}.` : "I could not find enough reliable information.",
			fil: items => items.length ? `May nakita akong impormasyon sa: ${items.join(", ")}.` : "Wala akong sapat na mapagkakatiwalaang impormasyon.",
			ceb: items => items.length ? `Nakakita ko og impormasyon sa: ${items.join(", ")}.` : "Wala koy igo nga kasaligan nga impormasyon.",
			ilo: items => items.length ? `Nakitaak ti impormasion iti: ${items.join(", ")}.` : "Awan ti umdas a mapagtalkan nga impormasion.",
		}
		const offer: Record<typeof language, string> = {
			en: "I'm not sure enough to answer. You can ask to speak with a person below.",
			fil: "Hindi ako sapat na sigurado para sumagot. Maaari kang humiling na makipag-usap sa isang tao sa ibaba.",
			ceb: "Dili ko igo kasaligon aron motubag. Mahimo kang mohangyo nga makigsulti sa usa ka tawo sa ubos.",
			ilo: "Saanak a sigurado a sumungbat. Mabalinmo nga kiddawen ti panagsarita iti maysa a tao iti baba.",
		}
		return `${offer[language]} ${found[language](titles)}`
	}

	/** CNV-4: "I don't know" in the reply language, plus the supported-languages notice. */
	private localizedAnswer(
		envelope: RagAnswerEnvelope,
		answerKind: CustomerAnswerKind,
		classification?: Pick<InquiryClassification, "language" | "replyLanguage">
	): string {
		const answer =
			answerKind === "uncertain" && envelope.isIDontKnow === true && classification
				? I_DONT_KNOW_REPLIES[classification.replyLanguage]
				: (asString(envelope.answer) ?? "")
		return withLanguageNotice(
			answer,
			classification?.language ?? null,
			classification?.replyLanguage ?? "en"
		)
	}

	/**
	 * Record a screening refusal against the conversation (AC4). The RAG
	 * service has already audited the detection itself (`chat.query.blocked`);
	 * this entry is what ties the attempt to the customer session and the
	 * conversation, which is what makes it reviewable later (ADM-3/ADM-4).
	 */
	async recordRefusal(input: {
		conversationId: string
		customerSessionId: string
		channelCode: string
		reason: string
		traceId: string
	}): Promise<CustomerTurn> {
		await this.auditService.writeAudit({
			actorId: `customer-session:${input.customerSessionId}`,
			actorType: "system",
			action: "chat.query.refused",
			resourceType: "conversation",
			resourceId: input.conversationId,
			before: null,
			after: {
				reason: input.reason,
				channelCode: input.channelCode,
				traceId: input.traceId,
			},
		})

		// The screened question is deliberately not stored for a refusal: the
		// RAG service returns only the reason, and the attempt itself is in the
		// audit entry above.
		return this.completeTurn({
			conversationId: input.conversationId,
			envelope: { screenedQuery: "", traceId: input.traceId },
			answerKind: "refusal",
			answerOverride: CUSTOMER_REFUSAL_ANSWER,
		})
	}
}

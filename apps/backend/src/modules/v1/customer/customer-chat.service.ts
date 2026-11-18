import { Injectable, Logger } from "@nestjs/common"

import type { CustomerAnswer, CustomerAnswerKind, CustomerAnswerSource } from "@repo/contracts"

import { AuditService } from "@/common/audit/audit.service"
import { KnowledgeRepository } from "@/modules/v1/knowledge/knowledge.repository"

import { ConversationService } from "./conversation.service"

/**
 * What the assistant says when screening refuses a question (AC4). Fixed text:
 * a refusal must not improvise, and must not hint at what the screen matched.
 */
export const CUSTOMER_REFUSAL_ANSWER =
	"I can't help with that request. Ask me about PHLPost services and I'll answer from our published information."

/**
 * A stored turn, as the customer is shown it. `conversationId` is added by the
 * caller, which is the layer that resolved the conversation.
 */
export type CustomerTurn = Omit<CustomerAnswer, "conversationId">

/** The RAG service's `final` SSE frame / JSON answer, as far as CNV-1 needs it. */
export interface RagAnswerEnvelope {
	answer?: unknown
	citations?: unknown
	isIDontKnow?: unknown
	model?: unknown
	tokenUsage?: unknown
	retrievedChunks?: unknown
	usedChunks?: unknown
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
		private readonly auditService: AuditService
	) {}

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
	}): Promise<CustomerTurn> {
		const { conversationId, envelope } = input
		const answerKind = input.answerKind ?? this.answerKindFor(envelope)
		const answer = input.answerOverride ?? asString(envelope.answer) ?? ""
		// The RAG service owns the citation shape (ChatCitationSchema); it crosses
		// the internal boundary unvalidated, as it does on the staff path.
		const citations = (
			answerKind === "refusal" || !Array.isArray(envelope.citations) ? [] : envelope.citations
		) as CustomerAnswer["citations"]
		const sources = answerKind === "refusal" ? [] : await this.resolveSources(citations)

		const maskedQuery = asString(envelope.screenedQuery)
		if (maskedQuery === null) {
			this.logger.warn(
				"RAG answer carried no screenedQuery; storing the turn without the question so no unmasked text is persisted"
			)
		}

		const { assistantMessageId } = await this.conversationService.recordTurn({
			conversationId,
			maskedQuery: maskedQuery ?? "",
			answer,
			answerKind,
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
			isIDontKnow: envelope.isIDontKnow === true,
		}
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

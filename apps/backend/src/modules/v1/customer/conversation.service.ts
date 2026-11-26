import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { createHash } from "node:crypto"
import { and, desc, eq, sql } from "drizzle-orm"

import type { CustomerAnswerKind } from "@repo/contracts"
import {
	conversations,
	customerSessions,
	escalations,
	inquiryCategories,
	messages,
} from "@repo/db/schema"

import { db, type DbTransaction } from "@/common/database/database.client"
import { EventService } from "@/modules/v1/analytics/event.service"

export type ConversationRow = typeof conversations.$inferSelect
export type MessageRow = typeof messages.$inferSelect

export interface RecordTurnInput {
	conversationId: string
	/** The SCREENED question — masked by the RAG service before it got here. */
	maskedQuery: string
	inquiryCategory?: string
	/** The detected language (CNV-2); the session's language when absent. */
	language?: string
	answer: string
	answerKind: CustomerAnswerKind
	confidence?: number | null
	retrievalScore?: number | null
	groundednessResult?: Record<string, unknown> | null
	outputTokens?: number | null
	citations?: unknown
	retrievedChunks?: unknown
	usedChunks?: unknown
	tokenUsage?: unknown
	traceId?: string | null
	modelUsed?: string | null
	category?: string
	responseTimeMs?: number
	requestStartedAt?: number
	additionalEventKinds?: ("tracking_lookup" | "scam_assessed")[]
	/** Runs inside the turn's transaction, e.g. to store the tracking lookup for the reply. */
	onRecorded?: (
		tx: DbTransaction,
		ids: { customerMessageId: string; assistantMessageId: string }
	) => Promise<void>
}

/**
 * The ONLY writer of `conversations.status` and of `messages` (CNV-1
 * technical notes; DOMAIN-MODEL §6 ownership table). Every other epic reads
 * these tables or goes through this service — escalation (ESC-*), analytics
 * (ANL-*), and the admin transcript view (ADM-3) all depend on that being
 * true, because a second writer would make the §5.1 state machine
 * unenforceable.
 *
 * `messages` is INSERT-only: a turn is corrected by appending, never by
 * editing history.
 */
@Injectable()
export class ConversationService {
	constructor(private readonly eventService: EventService) {}

	/** The human claim transition, called inside EscalationService's row-lock transaction. */
	async activateAgent(tx: DbTransaction, conversationId: string): Promise<void> {
		await tx
			.update(conversations)
			.set({ status: "agent_active" })
			.where(eq(conversations.id, conversationId))
	}

	/** Return an attended chat to the queue without changing its transcript. */
	async returnToEscalationQueue(tx: DbTransaction, conversationId: string): Promise<void> {
		await tx
			.update(conversations)
			.set({ status: "escalation_requested" })
			.where(eq(conversations.id, conversationId))
	}

	/** Append a customer-visible handoff notice to the same immutable transcript. */
	async postTransferNotice(
		tx: DbTransaction,
		conversationId: string,
		content: string
	): Promise<void> {
		const [conversation] = await tx
			.select({ id: conversations.id })
			.from(conversations)
			.where(eq(conversations.id, conversationId))
			.for("update")
		if (!conversation) throw new NotFoundException("Conversation not found")
		const [indexRow] = await tx
			.select({ nextTurn: sql<number>`coalesce(max(${messages.turnIndex}), -1) + 1` })
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
		const [message] = await tx
			.insert(messages)
			.values({
				conversationId,
				role: "assistant",
				sender: "system",
				content,
				turnIndex: indexRow?.nextTurn ?? 0,
			})
			.returning({ id: messages.id })
		if (!message) throw new Error("Failed to record transfer notice")
	}

	/** Close a live agent conversation while preserving ConversationService ownership. */
	async resolveByAgent(tx: DbTransaction, conversationId: string): Promise<void> {
		await tx
			.update(conversations)
			.set({ status: "resolved_by_agent" })
			.where(eq(conversations.id, conversationId))
	}

	/** Complete the offline path while preserving ConversationService as the sole status writer. */
	async markContactCaptured(
		tx: DbTransaction,
		conversationId: string,
		options: { missed: boolean }
	): Promise<void> {
		const [context] = await tx
			.select({ channelCode: conversations.channelCode, language: customerSessions.language })
			.from(conversations)
			.innerJoin(customerSessions, eq(customerSessions.id, conversations.customerSessionId))
			.where(eq(conversations.id, conversationId))
			.limit(1)
		if (!context?.channelCode || !context.language) {
			throw new Error("Could not resolve the conversation event context")
		}
		await tx
			.update(conversations)
			.set({ status: "contact_captured" })
			.where(eq(conversations.id, conversationId))
		if (options.missed) {
			await this.eventService.record(
				{
					conversationId,
					kind: "escalation_missed",
					category: "other",
					language: context.language,
					channelCode: context.channelCode,
				},
				tx
			)
		}
	}

	/** Store a screened customer message while an escalation is queued or claimed. */
	async recordCustomerMessage(input: {
		conversationId: string
		customerSessionId: string
		maskedQuery: string
		inquiryCategory?: string
	}): Promise<{ id: string; turnIndex: number }> {
		return db.transaction(async tx => {
			const [conversation] = await tx
				.select({ status: conversations.status })
				.from(conversations)
				.where(
					and(
						eq(conversations.id, input.conversationId),
						eq(conversations.customerSessionId, input.customerSessionId)
					)
				)
				.for("update")
			if (!conversation) throw new NotFoundException("Conversation not found")
			if (
				conversation.status !== "escalation_requested" &&
				conversation.status !== "agent_active" &&
				conversation.status !== "contact_captured"
			) {
				throw new ConflictException("This conversation is not waiting for an agent")
			}
			const [indexRow] = await tx
				.select({ nextTurn: sql<number>`coalesce(max(${messages.turnIndex}), -1) + 1` })
				.from(messages)
				.where(eq(messages.conversationId, input.conversationId))
			const turnIndex = indexRow?.nextTurn ?? 0
			const [message] = await tx
				.insert(messages)
				.values({
					conversationId: input.conversationId,
					role: "user",
					sender: "customer",
					content: input.maskedQuery,
					inquiryCategory: input.inquiryCategory,
					turnIndex,
				})
				.returning({ id: messages.id })
			if (!message) throw new Error("Failed to record customer message")
			return { id: message.id, turnIndex }
		})
	}

	/** Count consecutive recent AI turns whose confidence was below the saved threshold. */
	async countRecentLowConfidenceTurns(conversationId: string, threshold: number): Promise<number> {
		const rows = await db
			.select({ confidence: messages.confidence, answerKind: messages.answerKind })
			.from(messages)
			.where(
				and(
					eq(messages.conversationId, conversationId),
					eq(messages.role, "assistant"),
					sql`${messages.sender} is distinct from 'agent'`
				)
			)
			.orderBy(desc(messages.turnIndex))
			.limit(10)
		let count = 0
		for (const row of rows) {
			const low =
				row.answerKind === "uncertain" ||
				((row.answerKind === "answer" || row.answerKind === "tool" || row.answerKind === null) &&
					(row.confidence === null || row.confidence < threshold))
			if (!low) break
			count += 1
		}
		return count
	}

	/** Append an agent reply. Caller holds the conversation lock and verifies assignment. */
	async postAgentMessage(
		tx: DbTransaction,
		input: { conversationId: string; agentId: string; content: string }
	): Promise<{ id: string; sender: "agent"; content: string; turnIndex: number; createdAt: Date }> {
		const [conversation] = await tx
			.select({ status: conversations.status })
			.from(conversations)
			.where(eq(conversations.id, input.conversationId))
			.for("update")
		if (!conversation) throw new NotFoundException("Conversation not found")
		if (conversation.status !== "agent_active") {
			throw new ConflictException("This conversation is not active with an agent")
		}
		const [indexRow] = await tx
			.select({ nextTurn: sql<number>`coalesce(max(${messages.turnIndex}), -1) + 1` })
			.from(messages)
			.where(eq(messages.conversationId, input.conversationId))
		const turnIndex = indexRow?.nextTurn ?? 0
		const [message] = await tx
			.insert(messages)
			.values({
				conversationId: input.conversationId,
				role: "assistant",
				sender: "agent",
				agentId: input.agentId,
				content: input.content,
				turnIndex,
			})
			.returning({ id: messages.id, createdAt: messages.createdAt })
		if (!message) throw new Error("Failed to record agent reply")
		return {
			id: message.id,
			sender: "agent",
			content: input.content,
			turnIndex,
			createdAt: message.createdAt,
		}
	}

	/**
	 * Transition a customer conversation when an escalation is created. This
	 * method is intentionally called inside EscalationService's transaction so
	 * both writes commit together while ConversationService remains the sole
	 * writer of conversation status.
	 */
	async markEscalationRequested(
		tx: DbTransaction,
		conversationId: string,
		categoryOverride?: string
	): Promise<void> {
		const [eventContext] = await tx
			.select({
				channelCode: conversations.channelCode,
				language: customerSessions.language,
			})
			.from(conversations)
			.innerJoin(customerSessions, eq(conversations.customerSessionId, customerSessions.id))
			.where(eq(conversations.id, conversationId))
			.limit(1)
		const [latestCustomerMessage] = await tx
			.select({ category: messages.inquiryCategory })
			.from(messages)
			.where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")))
			.orderBy(desc(messages.turnIndex))
			.limit(1)
		if (!eventContext?.channelCode || !eventContext.language) {
			throw new Error("Could not resolve the conversation event context")
		}
		await tx
			.update(conversations)
			.set({ status: "escalation_requested" })
			.where(eq(conversations.id, conversationId))
		await this.eventService.record(
			{
				conversationId,
				kind: "escalated",
				category: categoryOverride ?? latestCustomerMessage?.category ?? "other",
				language: eventContext.language,
				channelCode: eventContext.channelCode,
			},
			tx
		)
	}

	/**
	 * Open a conversation for a customer session, in `ai_active` (§5.1 entry
	 * state). CNV-1 never leaves that state; ESC-1 drives the rest.
	 */
	async startCustomerConversation(input: {
		customerSessionId: string
		channelCode: string
		language: string
	}): Promise<ConversationRow> {
		return db.transaction(async tx => {
			const [row] = await tx
				.insert(conversations)
				.values({
					userId: null,
					customerSessionId: input.customerSessionId,
					channelCode: input.channelCode,
					status: "ai_active",
				})
				.returning()
			if (!row) throw new Error("Failed to open conversation")
			await this.eventService.record(
				{
					conversationId: row.id,
					kind: "conversation_started",
					category: "other",
					language: input.language,
					channelCode: input.channelCode,
				},
				tx
			)
			await this.eventService.record(
				{
					conversationId: row.id,
					kind: "conversation_context",
					category: "other",
					language: input.language,
					channelCode: input.channelCode,
					payload: {
						// Stable pseudonymous key for duplicate detection; it is not an auth credential.
						sessionFingerprint: createHash("md5").update(input.customerSessionId).digest("hex"),
						testSession: input.channelCode === "test",
					},
				},
				tx
			)
			return row
		})
	}

	/**
	 * End a customer conversation. A final grounded/tool answer to an eligible
	 * inquiry is resolved by AI; uncertain, blocked, and unanswered chats close
	 * as abandoned and remain unresolved in the KPI denominator when a response
	 * was given. ConversationService remains the only status writer.
	 */
	async endCustomerConversation(input: {
		conversationId: string
		customerSessionId: string
	}): Promise<{ resolvedByAi: boolean }> {
		return db.transaction(async tx => {
			const [conversation] = await tx
				.select({
					status: conversations.status,
					channelCode: conversations.channelCode,
					language: customerSessions.language,
				})
				.from(conversations)
				.innerJoin(customerSessions, eq(conversations.customerSessionId, customerSessions.id))
				.where(
					and(
						eq(conversations.id, input.conversationId),
						eq(conversations.customerSessionId, input.customerSessionId)
					)
				)
				.for("update")
				.limit(1)
			if (!conversation) throw new NotFoundException("Conversation not found")
			if (conversation.status === "resolved_by_ai") return { resolvedByAi: true }
			if (conversation.status !== "ai_active") return { resolvedByAi: false }

			const [lastEligibleInquiry] = await tx
				.select({ turnIndex: messages.turnIndex, category: messages.inquiryCategory })
				.from(messages)
				.where(
					and(
						eq(messages.conversationId, input.conversationId),
						eq(messages.role, "user"),
						eq(messages.isEligible, true)
					)
				)
				.orderBy(desc(messages.turnIndex))
				.limit(1)
			const [lastCustomerTurn] = await tx
				.select({ turnIndex: messages.turnIndex, category: messages.inquiryCategory })
				.from(messages)
				.where(and(eq(messages.conversationId, input.conversationId), eq(messages.role, "user")))
				.orderBy(desc(messages.turnIndex))
				.limit(1)
			const [answer] =
				lastEligibleInquiry && lastEligibleInquiry.turnIndex === lastCustomerTurn?.turnIndex
					? await tx
							.select({ answerKind: messages.answerKind })
							.from(messages)
							.where(
								and(
									eq(messages.conversationId, input.conversationId),
									eq(messages.role, "assistant"),
									eq(messages.turnIndex, lastEligibleInquiry.turnIndex + 1)
								)
							)
							.limit(1)
					: []
			const [escalation] = await tx
				.select({ id: escalations.id })
				.from(escalations)
				.where(eq(escalations.conversationId, input.conversationId))
				.limit(1)
			if (escalation) return { resolvedByAi: false }
			const resolvedByAi = answer?.answerKind === "answer" || answer?.answerKind === "tool"
			const status = resolvedByAi ? "resolved_by_ai" : "abandoned"
			await tx
				.update(conversations)
				.set({ status })
				.where(eq(conversations.id, input.conversationId))
			await this.eventService.record(
				{
					conversationId: input.conversationId,
					kind: "conversation_closed",
					category: lastCustomerTurn?.category ?? lastEligibleInquiry?.category ?? "other",
					language: conversation.language,
					channelCode: conversation.channelCode ?? "web",
					payload: {
						outcome: resolvedByAi ? "resolved_by_ai" : "unresolved",
						lastEligibleTurn: lastEligibleInquiry?.turnIndex ?? null,
					},
				},
				tx
			)
			return { resolvedByAi }
		})
	}

	/** Record a failed classified inquiry without storing its text. */
	async recordUnansweredInquiry(input: {
		conversationId: string
		category: string
	}): Promise<void> {
		const [context] = await db
			.select({
				channelCode: conversations.channelCode,
				language: customerSessions.language,
			})
			.from(conversations)
			.innerJoin(customerSessions, eq(conversations.customerSessionId, customerSessions.id))
			.where(eq(conversations.id, input.conversationId))
			.limit(1)
		if (!context?.channelCode || !context.language) return
		const [category] = await db
			.select({
				code: inquiryCategories.code,
				isEligible: inquiryCategories.isEligible,
				isActive: inquiryCategories.isActive,
			})
			.from(inquiryCategories)
			.where(eq(inquiryCategories.code, input.category))
			.limit(1)
		const [turn] = await db
			.select({ nextTurn: sql<number>`coalesce(max(${messages.turnIndex}), -1) + 1` })
			.from(messages)
			.where(eq(messages.conversationId, input.conversationId))
		await this.eventService.record({
			conversationId: input.conversationId,
			kind: "message_received",
			category: category?.isActive ? category.code : "other",
			language: context.language,
			channelCode: context.channelCode,
			payload: {
				eligible: category?.isActive ? category.isEligible : false,
				failed: true,
				turnIndex: turn?.nextTurn ?? 0,
			},
		})
	}

	/**
	 * Fetch a conversation that belongs to THIS customer session. A session may
	 * only append to its own conversation: passing someone else's id returns
	 * null and the caller answers 404, so conversation ids are not a way to
	 * read another customer's chat.
	 */
	async findOwnedByCustomerSession(
		conversationId: string,
		customerSessionId: string
	): Promise<ConversationRow | null> {
		const [row] = await db
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.id, conversationId),
					eq(conversations.customerSessionId, customerSessionId)
				)
			)
			.limit(1)
		return row ?? null
	}

	/**
	 * The latest customer message and assistant reply of a conversation (KB-2
	 * reads it to complete a rates question the assistant asked a detail for).
	 * Both texts are the stored, already masked forms.
	 */
	async lastExchange(conversationId: string): Promise<{
		customer: { content: string; inquiryCategory: string | null } | null
		assistant: { content: string; answerKind: string | null } | null
	}> {
		const rows = await db
			.select({
				sender: messages.sender,
				content: messages.content,
				inquiryCategory: messages.inquiryCategory,
				answerKind: messages.answerKind,
			})
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(desc(messages.turnIndex))
			.limit(2)
		const assistant = rows.find(row => row.sender === "assistant")
		const customer = rows.find(row => row.sender === "customer")
		return {
			customer: customer
				? { content: customer.content, inquiryCategory: customer.inquiryCategory ?? null }
				: null,
			assistant: assistant
				? { content: assistant.content, answerKind: assistant.answerKind ?? null }
				: null,
		}
	}

	/**
	 * Append one customer turn and the assistant's reply in ONE transaction, so
	 * a half-written turn is never visible (same contract as the template's
	 * Python `persist_turn`).
	 *
	 * `maskedQuery` must already be the screened form: this service stores what
	 * it is handed, and CNV-1 AC3 depends on the caller handing it the masked
	 * text the RAG service produced, never the raw input.
	 */
	async recordTurn(
		input: RecordTurnInput
	): Promise<{ customerMessageId: string; assistantMessageId: string }> {
		return db.transaction(async tx => {
			// Serialize turn persistence with an escalation request. The request
			// path locks this same row before switching status, so either the turn
			// commits first or the handoff commits first; no late AI answer can be
			// appended after the customer has been queued for an agent.
			const [conversation] = await tx
				.select({ status: conversations.status })
				.from(conversations)
				.where(eq(conversations.id, input.conversationId))
				.for("update")
			if (!conversation) throw new NotFoundException("Conversation not found")
			if (conversation.status !== "ai_active") {
				throw new ConflictException("A human agent has been requested for this conversation")
			}
			const [turnRow] = await tx
				.select({
					nextTurn: sql<number>`coalesce(max(${messages.turnIndex}), -1) + 1`,
				})
				.from(messages)
				.where(eq(messages.conversationId, input.conversationId))
			// An aggregate always returns one row; coalesce handles the empty
			// conversation, so this fallback is belt-and-braces for the types.
			const nextTurn = turnRow?.nextTurn ?? 0

			// CNV-2: the category and its eligibility AT THIS MOMENT are stored on
			// the message, so a later eligibility change leaves earlier rows alone.
			const requestedCategory = (input.inquiryCategory ?? "other").trim().toLowerCase() || "other"
			const [categoryRow] = await tx
				.select({
					code: inquiryCategories.code,
					isEligible: inquiryCategories.isEligible,
					isActive: inquiryCategories.isActive,
				})
				.from(inquiryCategories)
				.where(eq(inquiryCategories.code, requestedCategory))
				.limit(1)
			const resolvedCategory = categoryRow?.isActive ? categoryRow.code : "other"
			const eligibleSnapshot = categoryRow?.isActive ? categoryRow.isEligible : false
			const [eventContext] = await tx
				.select({ channelCode: conversations.channelCode, language: customerSessions.language })
				.from(conversations)
				.innerJoin(customerSessions, eq(conversations.customerSessionId, customerSessions.id))
				.where(eq(conversations.id, input.conversationId))
				.limit(1)
			const resolvedLanguage = input.language ?? eventContext?.language ?? "en"

			const [customerRow] = await tx
				.insert(messages)
				.values({
					conversationId: input.conversationId,
					// `role` is the template's column (read by the staff history
					// endpoints); `sender` is the DOMAIN-MODEL name. Both are written so
					// neither reader needs to know which path created the row.
					role: "user",
					sender: "customer",
					inquiryCategory: resolvedCategory,
					isEligible: eligibleSnapshot,
					language: resolvedLanguage,
					content: input.maskedQuery,
					traceId: input.traceId ?? null,
					turnIndex: nextTurn,
				})
				.returning({ id: messages.id })

			const [assistantRow] = await tx
				.insert(messages)
				.values({
					conversationId: input.conversationId,
					role: "assistant",
					sender: "assistant",
					answerKind: input.answerKind,
					confidence: input.confidence ?? null,
					retrievalScore: input.retrievalScore ?? null,
					groundednessResult: input.groundednessResult ?? null,
					outputTokens: input.outputTokens ?? null,
					content: input.answer,
					citations: input.citations ?? null,
					retrievedChunks: input.retrievedChunks ?? null,
					usedChunks: input.usedChunks ?? null,
					tokenUsage: input.tokenUsage ?? null,
					traceId: input.traceId ?? null,
					modelUsed: input.modelUsed ?? null,
					turnIndex: nextTurn + 1,
				})
				.returning({ id: messages.id })

			if (!customerRow || !assistantRow) throw new Error("Failed to record turn")
			const ids = { customerMessageId: customerRow.id, assistantMessageId: assistantRow.id }
			const channelCode = eventContext?.channelCode
			const language = resolvedLanguage
			if (!channelCode || !language)
				throw new Error("Could not resolve the conversation event context")
			const category = input.category ?? resolvedCategory
			const responseTimeMs =
				input.requestStartedAt === undefined
					? input.responseTimeMs
					: performance.now() - input.requestStartedAt
			await this.eventService.record(
				{
					conversationId: input.conversationId,
					kind: "message_received",
					category: resolvedCategory,
					language,
					channelCode,
					payload: { eligible: eligibleSnapshot, failed: false, turnIndex: nextTurn },
				},
				tx
			)
			await this.eventService.record(
				{
					conversationId: input.conversationId,
					kind: "answer_sent",
					category,
					language,
					channelCode,
					payload: {
						answerKind: input.answerKind,
						eligible: eligibleSnapshot,
						turnIndex: nextTurn,
						...(responseTimeMs === undefined
							? {}
							: { response_time_ms: Math.max(0, Math.round(responseTimeMs)) }),
					},
				},
				tx
			)
			await this.eventService.record(
				{
					conversationId: input.conversationId,
					kind: "answer_classified",
					category: resolvedCategory,
					language,
					channelCode,
					payload: {
						answerKind: input.answerKind,
						eligible: eligibleSnapshot,
						turnIndex: nextTurn,
					},
				},
				tx
			)
			for (const kind of input.additionalEventKinds ?? []) {
				await this.eventService.record(
					{
						conversationId: input.conversationId,
						kind,
						category,
						language,
						channelCode,
					},
					tx
				)
			}
			if (input.onRecorded) await input.onRecorded(tx, ids)
			return ids
		})
	}

	/** Move a conversation along the §5.1 state machine. */
	async setStatus(
		conversationId: string,
		status: (typeof conversations.$inferInsert)["status"]
	): Promise<void> {
		await db.update(conversations).set({ status }).where(eq(conversations.id, conversationId))
	}
}

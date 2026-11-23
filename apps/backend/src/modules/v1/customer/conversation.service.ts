import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { and, desc, eq, sql } from "drizzle-orm"

import type { CustomerAnswerKind } from "@repo/contracts"
import { conversations, customerSessions, messages } from "@repo/db/schema"

import { db, type DbTransaction } from "@/common/database/database.client"
import { EventService } from "@/modules/v1/analytics/event.service"

export type ConversationRow = typeof conversations.$inferSelect
export type MessageRow = typeof messages.$inferSelect

export interface RecordTurnInput {
	conversationId: string
	/** The SCREENED question — masked by the RAG service before it got here. */
	maskedQuery: string
	inquiryCategory?: string
	answer: string
	answerKind: CustomerAnswerKind
	confidence?: number | null
	citations?: unknown
	retrievedChunks?: unknown
	usedChunks?: unknown
	tokenUsage?: unknown
	traceId?: string | null
	modelUsed?: string | null
	category?: string
	additionalEventKinds?: "tracking_lookup"[]
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

	/** Close a live agent conversation while preserving ConversationService ownership. */
	async resolveByAgent(tx: DbTransaction, conversationId: string): Promise<void> {
		await tx
			.update(conversations)
			.set({ status: "resolved_by_agent" })
			.where(eq(conversations.id, conversationId))
	}

	/** Store a screened customer message while an escalation is queued or claimed. */
	async recordCustomerMessage(input: {
		conversationId: string
		customerSessionId: string
		maskedQuery: string
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
				conversation.status !== "agent_active"
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
					turnIndex,
				})
				.returning({ id: messages.id })
			if (!message) throw new Error("Failed to record customer message")
			return { id: message.id, turnIndex }
		})
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
	async markEscalationRequested(tx: DbTransaction, conversationId: string): Promise<void> {
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
				category: latestCustomerMessage?.category ?? "other",
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
			return row
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

			const [customerRow] = await tx
				.insert(messages)
				.values({
					conversationId: input.conversationId,
					// `role` is the template's column (read by the staff history
					// endpoints); `sender` is the DOMAIN-MODEL name. Both are written so
					// neither reader needs to know which path created the row.
					role: "user",
					sender: "customer",
					inquiryCategory: input.inquiryCategory ?? "other",
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
			const [eventContext] = await tx
				.select({
					channelCode: conversations.channelCode,
					language: customerSessions.language,
				})
				.from(conversations)
				.innerJoin(customerSessions, eq(conversations.customerSessionId, customerSessions.id))
				.where(eq(conversations.id, input.conversationId))
				.limit(1)
			const channelCode = eventContext?.channelCode
			const language = eventContext?.language
			if (!channelCode || !language)
				throw new Error("Could not resolve the conversation event context")
			const category = input.category ?? input.inquiryCategory ?? "other"
			await this.eventService.record(
				{
					conversationId: input.conversationId,
					kind: "answer_sent",
					category,
					language,
					channelCode,
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

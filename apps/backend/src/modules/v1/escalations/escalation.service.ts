import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { and, asc, desc, eq, sql } from "drizzle-orm"

import { conversations, customerSessions, escalations, messages } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { db } from "@/common/database/database.client"
import { ConversationService } from "@/modules/v1/customer/conversation.service"

@Injectable()
export class EscalationService {
	constructor(
		private readonly conversationService: ConversationService,
		private readonly auditService: AuditService
	) {}

	/** Creates the queued escalation and conversation transition atomically. */
	async request(input: { conversationId: string; customerSessionId: string; reason: string }) {
		return db.transaction(async tx => {
			const [conversation] = await tx
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.id, input.conversationId),
						eq(conversations.customerSessionId, input.customerSessionId)
					)
				)
				.for("update")

			if (!conversation) throw new NotFoundException("Conversation not found")
			if (conversation.status !== "ai_active") {
				throw new ConflictException("This conversation cannot be escalated in its current state")
			}

			const [existing] = await tx
				.select({ id: escalations.id })
				.from(escalations)
				.where(eq(escalations.conversationId, input.conversationId))
				.limit(1)
			if (existing) throw new ConflictException("This conversation already has an escalation")

			const [row] = await tx
				.insert(escalations)
				.values({ conversationId: conversation.id, reason: input.reason, status: "queued" })
				.returning({ id: escalations.id, createdAt: escalations.createdAt })
			if (!row) throw new Error("Failed to create escalation")
			await this.conversationService.markEscalationRequested(tx, conversation.id)
			return { id: row.id, status: "queued" as const, createdAt: row.createdAt }
		})
	}

	/** Queue view. Sort by the original request time, oldest first. */
	async listQueued() {
		const rows = await db
			.select({
				id: escalations.id,
				conversationId: escalations.conversationId,
				reason: escalations.reason,
				createdAt: escalations.createdAt,
				language: customerSessions.language,
			})
			.from(escalations)
			.innerJoin(conversations, eq(conversations.id, escalations.conversationId))
			.leftJoin(customerSessions, eq(customerSessions.id, conversations.customerSessionId))
			.where(eq(escalations.status, "queued"))
			.orderBy(asc(escalations.createdAt))
			.limit(200)

		const userMessages = rows.length
			? await db
					.select({
						conversationId: messages.conversationId,
						inquiryCategory: messages.inquiryCategory,
					})
					.from(messages)
					.where(
						sql`${messages.conversationId} in (${sql.join(
							rows.map(row => sql`${row.conversationId}`),
							sql`, `
						)}) and ${messages.role} = 'user'`
					)
					.orderBy(desc(messages.turnIndex))
			: []
		const categoryByConversation = new Map<string, string>()
		for (const message of userMessages) {
			if (!categoryByConversation.has(message.conversationId)) {
				categoryByConversation.set(message.conversationId, message.inquiryCategory ?? "other")
			}
		}

		const now = Date.now()
		return rows.map(row => ({
			...row,
			category: categoryByConversation.get(row.conversationId) ?? "other",
			waitingSeconds: Math.max(0, Math.floor((now - row.createdAt.getTime()) / 1000)),
		}))
	}

	/** Full read-only thread, with masked stored text and answer evidence. */
	async getQueued(id: string, actorId: string) {
		const [row] = await db
			.select({
				id: escalations.id,
				conversationId: escalations.conversationId,
				reason: escalations.reason,
				createdAt: escalations.createdAt,
				language: customerSessions.language,
				conversationCreatedAt: conversations.createdAt,
				status: escalations.status,
			})
			.from(escalations)
			.innerJoin(conversations, eq(conversations.id, escalations.conversationId))
			.leftJoin(customerSessions, eq(customerSessions.id, conversations.customerSessionId))
			.where(and(eq(escalations.id, id), eq(escalations.status, "queued")))
			.limit(1)
		if (!row) throw new NotFoundException("Queued escalation not found")

		const rows = await db
			.select({
				id: messages.id,
				sender: messages.sender,
				role: messages.role,
				content: messages.content,
				citations: messages.citations,
				confidence: messages.confidence,
				retrievalScore: messages.retrievalScore,
				groundednessResult: messages.groundednessResult,
				outputTokens: messages.outputTokens,
				inquiryCategory: messages.inquiryCategory,
				turnIndex: messages.turnIndex,
				createdAt: messages.createdAt,
			})
			.from(messages)
			.where(eq(messages.conversationId, row.conversationId))
			.orderBy(asc(messages.turnIndex))

		const category =
			[...rows].reverse().find(message => message.role === "user")?.inquiryCategory ?? "other"
		await this.auditService.writeAudit({
			actorId,
			actorType: "user",
			action: "escalations.conversation.viewed",
			resourceType: "escalation",
			resourceId: row.id,
			before: null,
			after: { conversationId: row.conversationId },
		})

		return {
			id: row.id,
			conversationId: row.conversationId,
			reason: row.reason,
			category,
			language: row.language ?? "unknown",
			createdAt: row.createdAt,
			waitingSeconds: Math.max(0, Math.floor((Date.now() - row.createdAt.getTime()) / 1000)),
			conversationCreatedAt: row.conversationCreatedAt,
			messages: rows.map(message => ({
				id: message.id,
				sender: message.sender ?? message.role,
				content: message.content,
				citations: message.citations ?? [],
				confidence: message.role === "assistant" ? message.confidence : null,
				retrievalScore: message.role === "assistant" ? message.retrievalScore : null,
				groundednessResult:
					message.role === "assistant" ? message.groundednessResult : null,
				outputTokens: message.role === "assistant" ? message.outputTokens : null,
				createdAt: message.createdAt,
			})),
		}
	}
}

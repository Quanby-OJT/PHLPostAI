import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { and, asc, desc, eq, sql } from "drizzle-orm"

import { conversations, customerSessions, escalations, messages } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { ConversationLiveService } from "@/common/conversation-live/conversation-live.service"
import { db, type DbTransaction } from "@/common/database/database.client"
import { ConversationService } from "@/modules/v1/customer/conversation.service"

@Injectable()
export class EscalationService {
	constructor(
		private readonly conversationService: ConversationService,
		private readonly auditService: AuditService,
		private readonly conversationLiveService: ConversationLiveService
	) {}

	async claim(id: string, agentId: string) {
		const result = await db.transaction(async tx => {
			const [row] = await tx.select().from(escalations).where(eq(escalations.id, id)).for("update")
			if (!row) throw new NotFoundException("Escalation not found")
			if (row.status !== "queued")
				throw new ConflictException("This escalation has already been claimed")
			const [conversation] = await tx
				.select({ status: conversations.status })
				.from(conversations)
				.where(eq(conversations.id, row.conversationId))
				.for("update")
			if (!conversation || conversation.status !== "escalation_requested") {
				throw new ConflictException("This conversation is no longer waiting for an agent")
			}
			const now = new Date()
			await tx
				.update(escalations)
				.set({ status: "claimed", assignedAgentId: agentId, claimedAt: now, updatedAt: now })
				.where(eq(escalations.id, id))
			await this.conversationService.activateAgent(tx, row.conversationId)
			await this.auditService.writeAudit(
				{
					actorId: agentId,
					actorType: "user",
					action: "escalations.claimed",
					resourceType: "escalation",
					resourceId: id,
					before: { status: "queued" },
					after: { status: "claimed", assignedAgentId: agentId },
				},
				tx
			)
			return {
				id,
				conversationId: row.conversationId,
				status: "claimed" as const,
				assignedAgentId: agentId,
			}
		})
		await this.conversationLiveService.publish(result.conversationId)
		return result
	}

	async reply(id: string, agentId: string, content: string) {
		const result = await db.transaction(async tx => {
			const [row] = await tx.select().from(escalations).where(eq(escalations.id, id)).for("update")
			if (!row) throw new NotFoundException("Escalation not found")
			if (row.status !== "claimed" || row.assignedAgentId !== agentId) {
				throw new ConflictException("This escalation is not assigned to you")
			}
			const message = await this.conversationService.postAgentMessage(tx, {
				conversationId: row.conversationId,
				agentId,
				content,
			})
			await this.auditService.writeAudit(
				{
					actorId: agentId,
					actorType: "user",
					action: "escalations.agent_replied",
					resourceType: "escalation",
					resourceId: id,
					after: { messageId: message.id },
				},
				tx
			)
			return { message, conversationId: row.conversationId }
		})
		await this.conversationLiveService.publish(result.conversationId)
		return result.message
	}

	async resolve(id: string, agentId: string, outcomeNote: string) {
		const result = await db.transaction(async tx => {
			const [row] = await tx.select().from(escalations).where(eq(escalations.id, id)).for("update")
			if (!row) throw new NotFoundException("Escalation not found")
			if (row.status !== "claimed" || row.assignedAgentId !== agentId) {
				throw new ConflictException("This escalation is not assigned to you")
			}
			const now = new Date()
			await tx
				.update(escalations)
				.set({ status: "resolved", outcomeNote, resolvedAt: now, updatedAt: now })
				.where(eq(escalations.id, id))
			await this.conversationService.resolveByAgent(tx, row.conversationId)
			await this.auditService.writeAudit(
				{
					actorId: agentId,
					actorType: "user",
					action: "escalations.resolved",
					resourceType: "escalation",
					resourceId: id,
					before: { status: "claimed" },
					after: { status: "resolved", outcomeNote },
				},
				tx
			)
			return { id, conversationId: row.conversationId, status: "resolved" as const, outcomeNote }
		})
		await this.conversationLiveService.publish(result.conversationId)
		return result
	}

	/** Creates the queued escalation and conversation transition atomically. */
	async request(
		input: { conversationId: string; customerSessionId: string; reason: string },
		transaction?: DbTransaction
	) {
		const create = async (tx: DbTransaction) => {
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
		}
		return transaction ? create(transaction) : db.transaction(create)
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
				assignedAgentId: escalations.assignedAgentId,
				outcomeNote: escalations.outcomeNote,
			})
			.from(escalations)
			.innerJoin(conversations, eq(conversations.id, escalations.conversationId))
			.leftJoin(customerSessions, eq(customerSessions.id, conversations.customerSessionId))
			.where(eq(escalations.id, id))
			.limit(1)
		if (!row) throw new NotFoundException("Escalation not found")

		const rows = await db
			.select({
				id: messages.id,
				sender: messages.sender,
				agentId: messages.agentId,
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
			status: row.status,
			assignedAgentId: row.assignedAgentId,
			outcomeNote: row.outcomeNote,
			waitingSeconds: Math.max(0, Math.floor((Date.now() - row.createdAt.getTime()) / 1000)),
			conversationCreatedAt: row.conversationCreatedAt,
			messages: rows.map(message => ({
				id: message.id,
				sender: message.sender ?? message.role,
				agentId: message.agentId,
				content: message.content,
				citations: message.citations ?? [],
				confidence: message.role === "assistant" ? message.confidence : null,
				retrievalScore: message.role === "assistant" ? message.retrievalScore : null,
				groundednessResult: message.role === "assistant" ? message.groundednessResult : null,
				outputTokens: message.role === "assistant" ? message.outputTokens : null,
				createdAt: message.createdAt,
				turnIndex: message.turnIndex,
			})),
		}
	}
}

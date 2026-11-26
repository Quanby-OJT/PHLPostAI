import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { and, asc, desc, eq, lt, sql } from "drizzle-orm"

import { conversations, customerSessions, escalations, messages } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { ConversationLiveService } from "@/common/conversation-live/conversation-live.service"
import { db, type DbTransaction } from "@/common/database/database.client"
import { AssistantSettingsService } from "@/modules/v1/assistant/assistant-settings.service"
import { ConversationService } from "@/modules/v1/customer/conversation.service"

import { decryptEscalationContact, encryptEscalationContact } from "./contact-crypto"
import { isWithinBusinessHours } from "./escalation-rules"

@Injectable()
export class EscalationService {
	private readonly logger = new Logger(EscalationService.name)

	constructor(
		private readonly conversationService: ConversationService,
		private readonly auditService: AuditService,
		private readonly conversationLiveService: ConversationLiveService,
		private readonly settingsService: AssistantSettingsService
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

	/** Uses the caller's transaction when supplied. Its owner publishes after commit. */
	async request(
		input: { conversationId: string; customerSessionId: string; reason: string; category?: string },
		transaction?: DbTransaction
	) {
		const settings = await this.settingsService.getEscalationSettings(transaction)
		const offline = !isWithinBusinessHours(new Date(), settings.businessHours)
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
				.values({
					conversationId: conversation.id,
					reason: input.reason,
					status: offline ? "contact_captured" : "queued",
				})
				.returning({ id: escalations.id, createdAt: escalations.createdAt })
			if (!row) throw new Error("Failed to create escalation")
			await this.conversationService.markEscalationRequested(tx, conversation.id, input.category)
			if (offline) {
				await this.conversationService.markContactCaptured(tx, conversation.id, { missed: false })
			}
			await this.auditService.writeAudit(
				{
					actorId: `customer-session:${input.customerSessionId}`,
					actorType: "system",
					action: "escalations.requested",
					resourceType: "escalation",
					resourceId: row.id,
					before: null,
					after: { conversationId: input.conversationId, reason: input.reason, offline },
				},
				tx
			)
			return {
				id: row.id,
				status: offline ? ("contact_captured" as const) : ("queued" as const),
				createdAt: row.createdAt,
			}
		}
		if (transaction) return create(transaction)

		const result = await db.transaction(create)
		if (offline) await this.conversationLiveService.publish(input.conversationId)
		return result
	}

	/** Encrypt the optional contact; only the customer session owning this conversation can set it. */
	async captureCustomerContact(input: {
		conversationId: string
		customerSessionId: string
		contact?: string
	}) {
		const contact = input.contact?.trim() || null
		const ciphertext = contact ? encryptEscalationContact(contact) : null
		return db.transaction(async tx => {
			const [row] = await tx
				.select({ id: escalations.id })
				.from(escalations)
				.innerJoin(conversations, eq(conversations.id, escalations.conversationId))
				.where(
					and(
						eq(escalations.conversationId, input.conversationId),
						eq(conversations.customerSessionId, input.customerSessionId),
						eq(escalations.status, "contact_captured"),
						eq(conversations.status, "contact_captured")
					)
				)
				.for("update")
			if (!row) throw new NotFoundException("Offline escalation not found")
			await tx.update(escalations).set({ contact: ciphertext }).where(eq(escalations.id, row.id))
			await this.auditService.writeAudit(
				{
					actorId: `customer-session:${input.customerSessionId}`,
					actorType: "system",
					action: "escalations.contact.updated",
					resourceType: "escalation",
					resourceId: row.id,
					after: { contactProvided: contact !== null },
				},
				tx
			)
			return { status: "contact_captured" as const, contactProvided: contact !== null }
		})
	}

	/** This endpoint is only exposed behind escalations.conversations.handle. */
	async getCustomerContact(id: string, actorId: string) {
		const [row] = await db
			.select({ contact: escalations.contact })
			.from(escalations)
			.where(eq(escalations.id, id))
			.limit(1)
		if (!row) throw new NotFoundException("Escalation not found")
		await this.auditService.writeAudit({
			actorId,
			actorType: "user",
			action: "escalations.contact.viewed",
			resourceType: "escalation",
			resourceId: id,
		})
		return { contact: row.contact ? decryptEscalationContact(row.contact) : null }
	}

	/** Move unclaimed requests to the offline path after the configured wait limit. */
	@Cron("*/10 * * * * *", { name: "escalation-wait-limit" })
	async markMissedEscalations(): Promise<number> {
		try {
			const { businessHours } = await this.settingsService.getEscalationSettings()
			const cutoff = new Date(Date.now() - businessHours.waitLimitSeconds * 1000)
			const waiting = await db
				.select({ id: escalations.id, conversationId: escalations.conversationId })
				.from(escalations)
				.where(and(eq(escalations.status, "queued"), lt(escalations.createdAt, cutoff)))
				.limit(200)
			let missed = 0
			for (const item of waiting) {
				const changed = await db.transaction(async tx => {
					const [row] = await tx
						.select({ id: escalations.id, createdAt: escalations.createdAt })
						.from(escalations)
						.where(and(eq(escalations.id, item.id), eq(escalations.status, "queued")))
						.for("update")
					if (!row || row.createdAt > cutoff) return false
					await tx
						.update(escalations)
						.set({ status: "contact_captured", updatedAt: new Date() })
						.where(eq(escalations.id, row.id))
					await this.conversationService.markContactCaptured(tx, item.conversationId, {
						missed: true,
					})
					await this.auditService.writeAudit(
						{
							actorId: "system",
							actorType: "system",
							action: "escalations.missed",
							resourceType: "escalation",
							resourceId: item.id,
							before: { status: "queued" },
							after: { status: "contact_captured" },
						},
						tx
					)
					return true
				})
				if (changed) {
					missed += 1
					await this.conversationLiveService.publish(item.conversationId)
				}
			}
			return missed
		} catch (error) {
			this.logger.error(
				"Failed to process escalation wait limits",
				error instanceof Error ? error.stack : undefined
			)
			return 0
		}
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

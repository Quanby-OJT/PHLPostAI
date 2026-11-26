import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { and, asc, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm"

import {
	agentPresence,
	conversations,
	customerSessions,
	escalations,
	escalationTransfers,
	messages,
	users,
} from "@repo/db/schema"

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

	async getAgentPresence(agentId: string) {
		const settings = await this.settingsService.getEscalationSettings()
		await db
			.insert(agentPresence)
			.values({
				agentId,
				available: false,
				maxOpenChats: settings.routing.maxOpenChatsPerAgent,
			})
			.onConflictDoNothing()
		const [row] = await db
			.select()
			.from(agentPresence)
			.where(eq(agentPresence.agentId, agentId))
			.limit(1)
		return row
	}

	async setAgentAvailability(agentId: string, available: boolean) {
		const settings = await this.settingsService.getEscalationSettings()
		return db.transaction(async tx => {
			await tx
				.insert(agentPresence)
				.values({
					agentId,
					available: false,
					maxOpenChats: settings.routing.maxOpenChatsPerAgent,
				})
				.onConflictDoNothing()
			const [before] = await tx
				.select()
				.from(agentPresence)
				.where(eq(agentPresence.agentId, agentId))
				.for("update")
			const now = new Date()
			if (before) {
				await tx
					.update(agentPresence)
					.set({ available, lastSeenAt: now, updatedAt: now })
					.where(eq(agentPresence.agentId, agentId))
			} else {
				await tx.insert(agentPresence).values({
					agentId,
					available,
					maxOpenChats: settings.routing.maxOpenChatsPerAgent,
					lastSeenAt: now,
					updatedAt: now,
				})
			}
			await this.auditService.writeAudit(
				{
					actorId: agentId,
					actorType: "user",
					action: "escalations.presence.updated",
					resourceType: "agent_presence",
					resourceId: agentId,
					before: before ? { available: before.available } : null,
					after: { available },
				},
				tx
			)
			return {
				agentId,
				available,
				maxOpenChats: before?.maxOpenChats ?? settings.routing.maxOpenChatsPerAgent,
			}
		})
	}

	async heartbeat(agentId: string): Promise<void> {
		await db
			.update(agentPresence)
			.set({ lastSeenAt: new Date() })
			.where(and(eq(agentPresence.agentId, agentId), eq(agentPresence.available, true)))
	}

	async listAvailableAgents() {
		const settings = await this.settingsService.getEscalationSettings()
		const staleBefore = new Date(Date.now() - settings.businessHours.waitLimitSeconds * 1000)
		const rows = await db
			.select({
				agentId: agentPresence.agentId,
				name: users.name,
				maxOpenChats: agentPresence.maxOpenChats,
				lastSeenAt: agentPresence.lastSeenAt,
				openChats: sql<number>`count(${escalations.id})::int`,
			})
			.from(agentPresence)
			.innerJoin(users, eq(users.id, agentPresence.agentId))
			.leftJoin(
				escalations,
				and(
					eq(escalations.assignedAgentId, agentPresence.agentId),
					eq(escalations.status, "claimed")
				)
			)
			.where(and(eq(agentPresence.available, true), gt(agentPresence.lastSeenAt, staleBefore)))
			.groupBy(
				agentPresence.agentId,
				users.name,
				agentPresence.maxOpenChats,
				agentPresence.lastSeenAt
			)
			.orderBy(asc(sql`count(${escalations.id})`), asc(agentPresence.agentId))
		return rows
			.filter(
				row => row.openChats < Math.min(row.maxOpenChats, settings.routing.maxOpenChatsPerAgent)
			)
			.map(({ lastSeenAt: _lastSeenAt, ...row }) => ({
				...row,
				maxOpenChats: Math.min(row.maxOpenChats, settings.routing.maxOpenChatsPerAgent),
			}))
	}

	async listAgentCapacities() {
		const rows = await db
			.select({
				agentId: agentPresence.agentId,
				name: users.name,
				available: agentPresence.available,
				maxOpenChats: agentPresence.maxOpenChats,
				openChats: sql<number>`count(${escalations.id})::int`,
			})
			.from(agentPresence)
			.innerJoin(users, eq(users.id, agentPresence.agentId))
			.leftJoin(
				escalations,
				and(
					eq(escalations.assignedAgentId, agentPresence.agentId),
					eq(escalations.status, "claimed")
				)
			)
			.groupBy(
				agentPresence.agentId,
				users.name,
				agentPresence.available,
				agentPresence.maxOpenChats
			)
			.orderBy(asc(users.name))
		return rows
	}

	async listMyOpen(agentId: string) {
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
			.where(and(eq(escalations.status, "claimed"), eq(escalations.assignedAgentId, agentId)))
			.orderBy(asc(escalations.claimedAt))
		return rows.map(row => ({ ...row, category: "other", waitingSeconds: 0 }))
	}

	async setAgentChatLimit(agentId: string, maxOpenChats: number, actorId: string) {
		return db.transaction(async tx => {
			const [before] = await tx
				.select()
				.from(agentPresence)
				.where(eq(agentPresence.agentId, agentId))
				.for("update")
			if (!before) throw new NotFoundException("Agent presence not found")
			await tx
				.update(agentPresence)
				.set({ maxOpenChats, updatedAt: new Date() })
				.where(eq(agentPresence.agentId, agentId))
			await this.auditService.writeAudit(
				{
					actorId,
					actorType: "user",
					action: "escalations.presence.limit_updated",
					resourceType: "agent_presence",
					resourceId: agentId,
					before: { maxOpenChats: before.maxOpenChats },
					after: { maxOpenChats },
				},
				tx
			)
			return { agentId, maxOpenChats }
		})
	}

	private async assertAgentHasCapacity(
		tx: DbTransaction,
		agentId: string,
		limit: number,
		waitLimitSeconds: number
	) {
		const [presence] = await tx
			.select()
			.from(agentPresence)
			.where(eq(agentPresence.agentId, agentId))
			.for("update")
		if (!presence || !presence.available) {
			throw new ConflictException("Set yourself available before accepting a chat")
		}
		if (presence.lastSeenAt.getTime() < Date.now() - waitLimitSeconds * 1000) {
			throw new ConflictException("Your availability expired; refresh your agent inbox")
		}
		const [load] = await tx
			.select({ openChats: sql<number>`count(*)::int` })
			.from(escalations)
			.where(and(eq(escalations.status, "claimed"), eq(escalations.assignedAgentId, agentId)))
		if ((load?.openChats ?? 0) >= Math.min(presence.maxOpenChats, limit)) {
			throw new ConflictException("You have reached your maximum number of open chats")
		}
		return presence
	}

	private async assignLeastBusy(
		tx: DbTransaction,
		escalationId: string,
		conversationId: string,
		limit: number,
		waitLimitSeconds: number
	): Promise<string | null> {
		const staleBefore = new Date(Date.now() - waitLimitSeconds * 1000)
		const candidates = await tx
			.select({
				agentId: agentPresence.agentId,
				maxOpenChats: agentPresence.maxOpenChats,
				openChats: sql<number>`count(${escalations.id})::int`,
			})
			.from(agentPresence)
			.leftJoin(
				escalations,
				and(
					eq(escalations.assignedAgentId, agentPresence.agentId),
					eq(escalations.status, "claimed")
				)
			)
			.where(and(eq(agentPresence.available, true), gt(agentPresence.lastSeenAt, staleBefore)))
			.groupBy(agentPresence.agentId, agentPresence.maxOpenChats)
			.orderBy(asc(sql`count(${escalations.id})`), asc(agentPresence.agentId))

		for (const candidate of candidates) {
			if (candidate.openChats >= Math.min(candidate.maxOpenChats, limit)) continue
			try {
				await this.assertAgentHasCapacity(tx, candidate.agentId, limit, waitLimitSeconds)
			} catch (error) {
				if (error instanceof ConflictException) continue
				throw error
			}
			const now = new Date()
			await tx
				.update(escalations)
				.set({
					status: "claimed",
					assignedAgentId: candidate.agentId,
					claimedAt: now,
					updatedAt: now,
				})
				.where(eq(escalations.id, escalationId))
			await this.conversationService.activateAgent(tx, conversationId)
			await tx.insert(escalationTransfers).values({
				escalationId,
				fromAgentId: null,
				toAgentId: candidate.agentId,
				note: "Automatically assigned to the least-busy available agent.",
			})
			return candidate.agentId
		}
		return null
	}

	async claim(id: string, agentId: string) {
		const settings = await this.settingsService.getEscalationSettings()
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
			await this.assertAgentHasCapacity(
				tx,
				agentId,
				settings.routing.maxOpenChatsPerAgent,
				settings.businessHours.waitLimitSeconds
			)
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

	async transfer(id: string, fromAgentId: string, toAgentId: string | null, note: string) {
		const settings = await this.settingsService.getEscalationSettings()
		const result = await db.transaction(async tx => {
			const [row] = await tx.select().from(escalations).where(eq(escalations.id, id)).for("update")
			if (!row) throw new NotFoundException("Escalation not found")
			if (row.status !== "claimed" || row.assignedAgentId !== fromAgentId) {
				throw new ConflictException("This escalation is not assigned to you")
			}
			if (toAgentId === fromAgentId) {
				throw new ConflictException(
					"Choose another available agent or return this chat to the queue"
				)
			}
			if (toAgentId) {
				await this.assertAgentHasCapacity(
					tx,
					toAgentId,
					settings.routing.maxOpenChatsPerAgent,
					settings.businessHours.waitLimitSeconds
				)
			}
			const now = new Date()
			await tx
				.update(escalations)
				.set({
					status: toAgentId ? "claimed" : "queued",
					assignedAgentId: toAgentId,
					claimedAt: toAgentId ? now : null,
					updatedAt: now,
				})
				.where(eq(escalations.id, id))
			if (!toAgentId) await this.conversationService.returnToEscalationQueue(tx, row.conversationId)
			await this.conversationService.postTransferNotice(
				tx,
				row.conversationId,
				toAgentId
					? "A colleague is taking over your chat and can see the conversation history."
					: "Your chat has returned to the agent queue. You will not need to repeat the information you have shared."
			)
			await tx.insert(escalationTransfers).values({
				escalationId: id,
				fromAgentId,
				toAgentId,
				note: note.trim(),
			})
			await this.auditService.writeAudit(
				{
					actorId: fromAgentId,
					actorType: "user",
					action: "escalations.transferred",
					resourceType: "escalation",
					resourceId: id,
					before: { status: "claimed", assignedAgentId: fromAgentId },
					after: { status: toAgentId ? "claimed" : "queued", assignedAgentId: toAgentId, note },
				},
				tx
			)
			return {
				id,
				conversationId: row.conversationId,
				status: toAgentId ? "claimed" : "queued",
				assignedAgentId: toAgentId,
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
			const assignedAgentId =
				!offline && settings.routing.mode === "least_busy"
					? await this.assignLeastBusy(
							tx,
							row.id,
							conversation.id,
							settings.routing.maxOpenChatsPerAgent,
							settings.businessHours.waitLimitSeconds
						)
					: null
			await this.auditService.writeAudit(
				{
					actorId: `customer-session:${input.customerSessionId}`,
					actorType: "system",
					action: "escalations.requested",
					resourceType: "escalation",
					resourceId: row.id,
					before: null,
					after: {
						conversationId: input.conversationId,
						reason: input.reason,
						offline,
						assignedAgentId,
					},
				},
				tx
			)
			if (assignedAgentId) {
				await this.auditService.writeAudit(
					{
						actorId: "system",
						actorType: "system",
						action: "escalations.auto_assigned",
						resourceType: "escalation",
						resourceId: row.id,
						after: { assignedAgentId },
					},
					tx
				)
			}
			return {
				id: row.id,
				status: offline
					? ("contact_captured" as const)
					: assignedAgentId
						? ("claimed" as const)
						: ("queued" as const),
				assignedAgentId,
				createdAt: row.createdAt,
			}
		}
		if (transaction) return create(transaction)

		const result = await db.transaction(create)
		if (offline || result.assignedAgentId)
			await this.conversationLiveService.publish(input.conversationId)
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
				.where(and(eq(escalations.status, "queued"), lt(escalations.updatedAt, cutoff)))
				.limit(200)
			let missed = 0
			for (const item of waiting) {
				const changed = await db.transaction(async tx => {
					const [row] = await tx
						.select({ id: escalations.id, updatedAt: escalations.updatedAt })
						.from(escalations)
						.where(and(eq(escalations.id, item.id), eq(escalations.status, "queued")))
						.for("update")
					if (!row || row.updatedAt > cutoff) return false
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

	/** Requeue chats whose assigned agent stopped heartbeating for the wait limit. */
	@Cron("*/15 * * * * *", { name: "escalation-agent-presence-timeout" })
	async recoverUnattendedChats(): Promise<number> {
		try {
			const settings = await this.settingsService.getEscalationSettings()
			const cutoff = new Date(Date.now() - settings.businessHours.waitLimitSeconds * 1000)
			const stale = await db
				.select({ id: escalations.id, conversationId: escalations.conversationId })
				.from(escalations)
				.leftJoin(agentPresence, eq(agentPresence.agentId, escalations.assignedAgentId))
				.where(
					and(
						eq(escalations.status, "claimed"),
						or(
							lt(agentPresence.lastSeenAt, cutoff),
							and(isNull(agentPresence.agentId), lt(escalations.claimedAt, cutoff))
						)
					)
				)
				.orderBy(asc(escalations.claimedAt))
				.limit(200)
			let recovered = 0
			for (const candidate of stale) {
				const changed = await db.transaction(async tx => {
					const [row] = await tx
						.select({
							id: escalations.id,
							conversationId: escalations.conversationId,
							status: escalations.status,
							assignedAgentId: escalations.assignedAgentId,
							claimedAt: escalations.claimedAt,
						})
						.from(escalations)
						.where(eq(escalations.id, candidate.id))
						.for("update")
					if (row?.status !== "claimed" || !row.assignedAgentId) return false
					const [presence] = await tx
						.select()
						.from(agentPresence)
						.where(eq(agentPresence.agentId, row.assignedAgentId))
						.for("update")
					if (presence ? presence.lastSeenAt > cutoff : row.claimedAt && row.claimedAt > cutoff) {
						return false
					}
					await tx
						.update(escalations)
						.set({
							status: "queued",
							assignedAgentId: null,
							claimedAt: null,
							updatedAt: new Date(),
						})
						.where(eq(escalations.id, row.id))
					await this.conversationService.returnToEscalationQueue(tx, row.conversationId)
					await tx.insert(escalationTransfers).values({
						escalationId: row.id,
						fromAgentId: row.assignedAgentId,
						toAgentId: null,
						note: "Agent availability expired; returned to the queue.",
					})
					await this.conversationService.postTransferNotice(
						tx,
						row.conversationId,
						"Your agent is unavailable. We are finding another colleague, and your conversation history is preserved."
					)
					await this.auditService.writeAudit(
						{
							actorId: "system",
							actorType: "system",
							action: "escalations.agent_unavailable",
							resourceType: "escalation",
							resourceId: row.id,
							before: { status: "claimed", assignedAgentId: row.assignedAgentId },
							after: { status: "queued" },
						},
						tx
					)
					const reassignedAgentId =
						settings.routing.mode === "least_busy"
							? await this.assignLeastBusy(
									tx,
									row.id,
									row.conversationId,
									settings.routing.maxOpenChatsPerAgent,
									settings.businessHours.waitLimitSeconds
								)
							: null
					if (reassignedAgentId) {
						await this.auditService.writeAudit(
							{
								actorId: "system",
								actorType: "system",
								action: "escalations.auto_assigned",
								resourceType: "escalation",
								resourceId: row.id,
								after: { assignedAgentId: reassignedAgentId, reason: "agent_unavailable" },
							},
							tx
						)
					}
					return true
				})
				if (changed) {
					recovered += 1
					await this.conversationLiveService.publish(candidate.conversationId)
				}
			}
			return recovered
		} catch (error) {
			this.logger.error(
				"Failed to recover unattended escalation chats",
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
		const transfers = await db
			.select({
				id: escalationTransfers.id,
				fromAgentId: escalationTransfers.fromAgentId,
				toAgentId: escalationTransfers.toAgentId,
				note: escalationTransfers.note,
				createdAt: escalationTransfers.createdAt,
			})
			.from(escalationTransfers)
			.where(eq(escalationTransfers.escalationId, id))
			.orderBy(asc(escalationTransfers.createdAt))

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
			transfers,
		}
	}
}

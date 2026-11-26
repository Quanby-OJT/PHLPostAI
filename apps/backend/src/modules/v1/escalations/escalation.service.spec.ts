import { ConflictException, NotFoundException } from "@nestjs/common"

import { isWithinBusinessHours } from "./escalation-rules"
import { EscalationService } from "./escalation.service"

const mockSelect = jest.fn()
const mockInsert = jest.fn()
const mockUpdate = jest.fn()
const mockTx = { select: mockSelect, insert: mockInsert, update: mockUpdate }
const mockTransaction = jest.fn((callback: (tx: typeof mockTx) => Promise<unknown>) =>
	callback(mockTx)
)

jest.mock("@repo/db/schema", () => ({
	conversations: { id: "conversation.id", customerSessionId: "conversation.customerSessionId" },
	customerSessions: { id: "customerSessions.id", language: "customerSessions.language" },
	escalations: {
		id: "escalations.id",
		conversationId: "escalations.conversationId",
		createdAt: "escalations.createdAt",
		status: "escalations.status",
		assignedAgentId: "escalations.assignedAgentId",
	},
	messages: {},
	agentPresence: { agentId: "agentPresence.agentId" },
	escalationTransfers: {},
	users: { id: "users.id", name: "users.name" },
}))

jest.mock("drizzle-orm", () => ({
	and: (...parts: unknown[]) => ({ and: parts }),
	asc: (column: unknown) => ({ asc: column }),
	desc: (column: unknown) => ({ desc: column }),
	eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
	gt: (column: unknown, value: unknown) => ({ gt: [column, value] }),
	lt: (column: unknown, value: unknown) => ({ lt: [column, value] }),
	isNull: (column: unknown) => ({ isNull: column }),
	or: (...parts: unknown[]) => ({ or: parts }),
	sql: Object.assign(() => "sql-fragment", { join: () => "sql-list" }),
}))

jest.mock("@/common/database/database.client", () => ({
	db: { transaction: (callback: (tx: unknown) => Promise<unknown>) => mockTransaction(callback) },
}))

jest.mock("@/modules/v1/customer/conversation.service", () => ({
	ConversationService: class ConversationService {},
}))
jest.mock("@/modules/v1/assistant/assistant-settings.service", () => ({
	AssistantSettingsService: class AssistantSettingsService {},
}))

jest.mock("./escalation-rules", () => ({ isWithinBusinessHours: jest.fn() }))

describe("EscalationService", () => {
	let service: EscalationService
	let conversationService: {
		markEscalationRequested: jest.Mock
		activateAgent: jest.Mock
		postAgentMessage: jest.Mock
		resolveByAgent: jest.Mock
		markContactCaptured: jest.Mock
		returnToEscalationQueue: jest.Mock
		postTransferNotice: jest.Mock
	}
	let auditService: { writeAudit: jest.Mock }
	let liveService: { publish: jest.Mock }
	let settingsService: { getEscalationSettings: jest.Mock }

	beforeEach(() => {
		jest.clearAllMocks()
		;(isWithinBusinessHours as jest.Mock).mockReturnValue(true)
		conversationService = {
			markEscalationRequested: jest.fn().mockResolvedValue(undefined),
			activateAgent: jest.fn().mockResolvedValue(undefined),
			postAgentMessage: jest.fn().mockResolvedValue({ id: "message-1", turnIndex: 2 }),
			resolveByAgent: jest.fn().mockResolvedValue(undefined),
			markContactCaptured: jest.fn().mockResolvedValue(undefined),
			returnToEscalationQueue: jest.fn().mockResolvedValue(undefined),
			postTransferNotice: jest.fn().mockResolvedValue(undefined),
		}
		auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		liveService = { publish: jest.fn().mockResolvedValue(undefined) }
		settingsService = {
			getEscalationSettings: jest.fn().mockResolvedValue({
				routing: { mode: "manual", maxOpenChatsPerAgent: 3 },
				businessHours: { waitLimitSeconds: 180 },
			}),
		}
		service = new EscalationService(
			conversationService as never,
			auditService as never,
			liveService as never,
			settingsService as never
		)
		mockUpdate.mockReturnValue({ set: () => ({ where: async () => [] }) })
		mockInsert.mockReturnValue({
			values: jest.fn().mockReturnValue({
				returning: jest
					.fn()
					.mockResolvedValue([{ id: "escalation-1", createdAt: new Date("2026-11-19T00:00:00Z") }]),
			}),
		})
	})

	it("claims once under row locks and activates the conversation", async () => {
		mockSelect
			.mockReturnValueOnce({
				from: () => ({
					where: () => ({
						for: async () => [
							{ id: "escalation-1", conversationId: "conversation-1", status: "queued" },
						],
					}),
				}),
			})
			.mockReturnValueOnce({
				from: () => ({ where: () => ({ for: async () => [{ status: "escalation_requested" }] }) }),
			})
			.mockReturnValueOnce({
				from: () => ({
					where: () => ({
						for: async () => [{ available: true, maxOpenChats: 3, lastSeenAt: new Date() }],
					}),
				}),
			})
			.mockReturnValueOnce({
				from: () => ({ where: async () => [{ openChats: 0 }] }),
			})

		const result = await service.claim("escalation-1", "agent-1")

		expect(result).toMatchObject({ status: "claimed", assignedAgentId: "agent-1" })
		expect(conversationService.activateAgent).toHaveBeenCalledWith(mockTx, "conversation-1")
		expect(auditService.writeAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: "escalations.claimed", actorId: "agent-1" }),
			mockTx
		)
		expect(liveService.publish).toHaveBeenCalledWith("conversation-1")
	})

	it("rejects a second claim without changing state", async () => {
		mockSelect.mockReturnValueOnce({
			from: () => ({
				where: () => ({
					for: async () => [
						{ id: "escalation-1", conversationId: "conversation-1", status: "claimed" },
					],
				}),
			}),
		})

		await expect(service.claim("escalation-1", "agent-2")).rejects.toBeInstanceOf(ConflictException)
		expect(mockUpdate).not.toHaveBeenCalled()
		expect(auditService.writeAudit).not.toHaveBeenCalled()
		expect(liveService.publish).not.toHaveBeenCalled()
	})

	it("stores replies through ConversationService and publishes them", async () => {
		mockSelect.mockReturnValueOnce({
			from: () => ({
				where: () => ({
					for: async () => [
						{
							id: "escalation-1",
							conversationId: "conversation-1",
							status: "claimed",
							assignedAgentId: "agent-1",
						},
					],
				}),
			}),
		})

		const result = await service.reply("escalation-1", "agent-1", "How can I help?")

		expect(result).toMatchObject({ id: "message-1" })
		expect(conversationService.postAgentMessage).toHaveBeenCalledWith(mockTx, {
			conversationId: "conversation-1",
			agentId: "agent-1",
			content: "How can I help?",
		})
		expect(auditService.writeAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: "escalations.agent_replied", actorId: "agent-1" }),
			mockTx
		)
		expect(liveService.publish).toHaveBeenCalledWith("conversation-1")
	})

	it("resolves the escalation with an outcome note", async () => {
		mockSelect.mockReturnValueOnce({
			from: () => ({
				where: () => ({
					for: async () => [
						{
							id: "escalation-1",
							conversationId: "conversation-1",
							status: "claimed",
							assignedAgentId: "agent-1",
						},
					],
				}),
			}),
		})

		const result = await service.resolve(
			"escalation-1",
			"agent-1",
			"Customer received the tracking details"
		)

		expect(result).toMatchObject({
			status: "resolved",
			outcomeNote: "Customer received the tracking details",
		})
		expect(conversationService.resolveByAgent).toHaveBeenCalledWith(mockTx, "conversation-1")
		expect(liveService.publish).toHaveBeenCalledWith("conversation-1")
	})

	it("returns a transferred chat to the queue with a note, transcript notice, and audit", async () => {
		mockSelect.mockReturnValueOnce({
			from: () => ({
				where: () => ({
					for: async () => [
						{
							id: "escalation-1",
							conversationId: "conversation-1",
							status: "claimed",
							assignedAgentId: "agent-1",
						},
					],
				}),
			}),
		})

		const result = await service.transfer(
			"escalation-1",
			"agent-1",
			null,
			"Customer needs a customs specialist"
		)

		expect(result).toMatchObject({ status: "queued", assignedAgentId: null })
		expect(conversationService.returnToEscalationQueue).toHaveBeenCalledWith(
			mockTx,
			"conversation-1"
		)
		expect(conversationService.postTransferNotice).toHaveBeenCalledWith(
			mockTx,
			"conversation-1",
			expect.stringContaining("returned to the agent queue")
		)
		expect(mockInsert).toHaveBeenCalledWith(expect.anything())
		expect(auditService.writeAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "escalations.transferred",
				before: { status: "claimed", assignedAgentId: "agent-1" },
				after: expect.objectContaining({ status: "queued", assignedAgentId: null }),
			}),
			mockTx
		)
		expect(liveService.publish).toHaveBeenCalledWith("conversation-1")
	})

	it("creates a queued escalation and transitions the owned conversation in one transaction", async () => {
		mockSelect
			.mockReturnValueOnce({
				from: () => ({
					where: () => ({
						for: async () => [
							{ id: "conversation-1", status: "ai_active", customerSessionId: "session-1" },
						],
					}),
				}),
			})
			.mockReturnValueOnce({
				from: () => ({ where: () => ({ limit: async () => [] }) }),
			})

		const result = await service.request({
			conversationId: "conversation-1",
			customerSessionId: "session-1",
			reason: "I want to speak with a person",
		})

		expect(result).toMatchObject({ id: "escalation-1", status: "queued" })
		expect(mockTransaction).toHaveBeenCalledTimes(1)
		expect(mockInsert).toHaveBeenCalledTimes(1)
		expect(conversationService.markEscalationRequested).toHaveBeenCalledWith(
			mockTx,
			"conversation-1",
			undefined
		)
	})

	it("marks an off-hours escalation contact_captured immediately", async () => {
		;(isWithinBusinessHours as jest.Mock).mockReturnValue(false)
		mockSelect
			.mockReturnValueOnce({
				from: () => ({
					where: () => ({
						for: async () => [
							{ id: "conversation-1", status: "ai_active", customerSessionId: "session-1" },
						],
					}),
				}),
			})
			.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })

		const result = await service.request({
			conversationId: "conversation-1",
			customerSessionId: "session-1",
			reason: "I want to speak with a person",
		})

		expect(result.status).toBe("contact_captured")
		expect(conversationService.markContactCaptured).toHaveBeenCalledWith(mockTx, "conversation-1", {
			missed: false,
		})
		expect(liveService.publish).toHaveBeenCalledWith("conversation-1")
	})

	it("rejects a conversation owned by another customer session", async () => {
		mockSelect.mockReturnValueOnce({
			from: () => ({ where: () => ({ for: async () => [] }) }),
		})

		await expect(
			service.request({
				conversationId: "conversation-1",
				customerSessionId: "other-session",
				reason: "I still need help",
			})
		).rejects.toBeInstanceOf(NotFoundException)
		expect(mockInsert).not.toHaveBeenCalled()
	})

	it("rejects a conversation that is no longer AI active", async () => {
		mockSelect.mockReturnValueOnce({
			from: () => ({
				where: () => ({
					for: async () => [{ id: "conversation-1", status: "escalation_requested" }],
				}),
			}),
		})

		await expect(
			service.request({
				conversationId: "conversation-1",
				customerSessionId: "session-1",
				reason: "I still need help",
			})
		).rejects.toBeInstanceOf(ConflictException)
		expect(mockInsert).not.toHaveBeenCalled()
	})
})

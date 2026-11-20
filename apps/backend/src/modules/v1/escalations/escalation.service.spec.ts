import { ConflictException, NotFoundException } from "@nestjs/common"

import { EscalationService } from "./escalation.service"

const mockSelect = jest.fn()
const mockInsert = jest.fn()
const mockTx = { select: mockSelect, insert: mockInsert }
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
	},
	messages: {},
}))

jest.mock("drizzle-orm", () => ({
	and: (...parts: unknown[]) => ({ and: parts }),
	asc: (column: unknown) => ({ asc: column }),
	eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
	sql: Object.assign(() => "sql-fragment", { join: () => "sql-list" }),
}))

jest.mock("@/common/database/database.client", () => ({
	db: { transaction: (callback: (tx: unknown) => Promise<unknown>) => mockTransaction(callback) },
}))

jest.mock("@/modules/v1/customer/conversation.service", () => ({
	ConversationService: class ConversationService {},
}))

describe("EscalationService", () => {
	let service: EscalationService
	let conversationService: { markEscalationRequested: jest.Mock }

	beforeEach(() => {
		jest.clearAllMocks()
		conversationService = { markEscalationRequested: jest.fn().mockResolvedValue(undefined) }
		service = new EscalationService(conversationService as never, {} as never)
		mockInsert.mockReturnValue({
			values: jest.fn().mockReturnValue({
				returning: jest
					.fn()
					.mockResolvedValue([{ id: "escalation-1", createdAt: new Date("2026-11-19T00:00:00Z") }]),
			}),
		})
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
			"conversation-1"
		)
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

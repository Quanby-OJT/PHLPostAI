import { ConversationService } from "./conversation.service"

jest.mock("@repo/db/schema", () => ({
	conversations: { id: "id", customerSessionId: "customer_session_id", status: "status" },
	messages: { id: "id", conversationId: "conversation_id", turnIndex: "turn_index" },
}))

jest.mock("drizzle-orm", () => ({
	and: (...parts: unknown[]) => ({ and: parts }),
	eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
	sql: () => "sql-fragment",
}))

const inserted: { table: string; values: Record<string, unknown> }[] = []
let maxTurnIndex: number | null = null
let insertCounter = 0
let transactionSelectCalls = 0
let lockedConversationStatus = "ai_active"

function chainedInsert() {
	return {
		values: (values: Record<string, unknown>) => {
			insertCounter += 1
			inserted.push({ table: "messages", values })
			return { returning: async () => [{ id: `message-${insertCounter}` }] }
		},
	}
}

const tx = {
	select: () => {
		const call = transactionSelectCalls++
		if (call === 0) {
			return {
				from: () => ({
					where: () => ({ for: async () => [{ status: lockedConversationStatus }] }),
				}),
			}
		}
		return {
			from: () => ({ where: async () => [{ nextTurn: (maxTurnIndex ?? -1) + 1 }] }),
		}
	},
	insert: chainedInsert,
}

jest.mock("@/common/database/database.client", () => ({
	db: {
		transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
		insert: () => ({
			values: (values: Record<string, unknown>) => {
				inserted.push({ table: "conversations", values })
				return {
					returning: async () => [{ id: "conversation-1", ...values, createdAt: new Date() }],
				}
			},
		}),
		select: () => ({
			from: () => ({ where: () => ({ limit: async () => ownedRows }) }),
		}),
		update: () => ({ set: () => ({ where: async () => undefined }) }),
	},
}))

let ownedRows: unknown[] = []

describe("ConversationService (CNV-1 sole writer)", () => {
	let service: ConversationService

	beforeEach(() => {
		service = new ConversationService()
		inserted.length = 0
		insertCounter = 0
		maxTurnIndex = null
		transactionSelectCalls = 0
		lockedConversationStatus = "ai_active"
		ownedRows = []
	})

	describe("opening a customer conversation", () => {
		it("keys the row to the session, not a user, and starts in ai_active", async () => {
			await service.startCustomerConversation({
				customerSessionId: "session-1",
				channelCode: "web",
			})

			expect(inserted[0]).toEqual({
				table: "conversations",
				values: {
					userId: null,
					customerSessionId: "session-1",
					channelCode: "web",
					status: "ai_active",
				},
			})
		})
	})

	describe("ownership", () => {
		it("returns a conversation that belongs to the session", async () => {
			ownedRows = [{ id: "conversation-1", customerSessionId: "session-1" }]

			expect(await service.findOwnedByCustomerSession("conversation-1", "session-1")).toMatchObject(
				{ id: "conversation-1" }
			)
		})

		it("returns null for another session's conversation", async () => {
			ownedRows = []

			expect(await service.findOwnedByCustomerSession("conversation-1", "other-session")).toBeNull()
		})
	})

	describe("recording a turn (AC3: the stored Message holds the masked form)", () => {
		it("does not append an AI answer after an escalation has been requested", async () => {
			lockedConversationStatus = "escalation_requested"

			await expect(
				service.recordTurn({
					conversationId: "conversation-1",
					maskedQuery: "question",
					answer: "late AI reply",
					answerKind: "answer",
				})
			).rejects.toThrow("A human agent has been requested")
			expect(inserted).toHaveLength(0)
		})

		it("writes the customer turn with exactly the masked text it was handed", async () => {
			await service.recordTurn({
				conversationId: "conversation-1",
				maskedQuery: "my number is [PHONE] and my email is [EMAIL]",
				answer: "Here is the answer.",
				answerKind: "answer",
			})

			const customerTurn = inserted[0]?.values
			expect(customerTurn?.content).toBe("my number is [PHONE] and my email is [EMAIL]")
			expect(customerTurn?.sender).toBe("customer")
			// The template's column is kept in step so the staff history reader
			// does not have to know which path wrote the row.
			expect(customerTurn?.role).toBe("user")
		})

		it("writes the assistant turn with its answer kind and citations", async () => {
			const citations = [{ chunkId: "chunk-1", documentId: "document-1" }]

			await service.recordTurn({
				conversationId: "conversation-1",
				maskedQuery: "how much is express mail",
				answer: "165 pesos.",
				answerKind: "answer",
				citations,
				tokenUsage: { totalTokens: 42 },
				modelUsed: "gpt-4o-mini",
			})

			const assistantTurn = inserted[1]?.values
			expect(assistantTurn).toMatchObject({
				role: "assistant",
				sender: "assistant",
				answerKind: "answer",
				content: "165 pesos.",
				citations,
				modelUsed: "gpt-4o-mini",
			})
		})

		it("returns both message ids from the one transaction", async () => {
			const result = await service.recordTurn({
				conversationId: "conversation-1",
				maskedQuery: "q",
				answer: "a",
				answerKind: "answer",
			})

			expect(result).toEqual({
				customerMessageId: "message-1",
				assistantMessageId: "message-2",
			})
		})

		it("numbers the first turn of a conversation from zero", async () => {
			maxTurnIndex = null

			await service.recordTurn({
				conversationId: "conversation-1",
				maskedQuery: "q",
				answer: "a",
				answerKind: "answer",
			})

			expect(inserted[0]?.values.turnIndex).toBe(0)
			expect(inserted[1]?.values.turnIndex).toBe(1)
		})

		it("appends after the existing turns when the conversation continues", async () => {
			maxTurnIndex = 3

			await service.recordTurn({
				conversationId: "conversation-1",
				maskedQuery: "q",
				answer: "a",
				answerKind: "answer",
			})

			expect(inserted[0]?.values.turnIndex).toBe(4)
			expect(inserted[1]?.values.turnIndex).toBe(5)
		})

		it("records a refusal as its own answer kind", async () => {
			await service.recordTurn({
				conversationId: "conversation-1",
				maskedQuery: "",
				answer: "I can't help with that request.",
				answerKind: "refusal",
			})

			expect(inserted[1]?.values.answerKind).toBe("refusal")
		})

		it("runs the caller's hook inside the same transaction with both message ids (TRK-1)", async () => {
			const onRecorded = jest.fn().mockResolvedValue(undefined)

			await service.recordTurn({
				conversationId: "conversation-1",
				maskedQuery: "where is [TRACKING_NUMBER]",
				answer: "Status: In transit",
				answerKind: "tool",
				onRecorded,
			})

			expect(onRecorded).toHaveBeenCalledWith(tx, {
				customerMessageId: "message-1",
				assistantMessageId: "message-2",
			})
			expect(inserted[1]?.values.answerKind).toBe("tool")
		})
	})
})

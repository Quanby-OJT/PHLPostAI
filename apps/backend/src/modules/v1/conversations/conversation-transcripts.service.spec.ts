import { NotFoundException } from "@nestjs/common"

import {
	ConversationTranscriptsService,
	TRANSCRIPT_VIEWED_ACTION,
} from "./conversation-transcripts.service"

const mockResults: unknown[] = []
const mockSelect = jest.fn()

function chain(): Record<string, unknown> {
	const link: Record<string, unknown> = {}
	for (const method of ["from", "where", "orderBy", "limit", "offset"]) {
		link[method] = jest.fn(() => link)
	}
	link.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
		Promise.resolve(mockResults.shift()).then(resolve, reject)
	return link
}

jest.mock("@repo/db/schema", () => ({
	auditLog: {
		action: "audit.action",
		resourceType: "audit.resourceType",
		resourceId: "audit.resourceId",
		after: "audit.after",
	},
	conversations: {
		id: "conversations.id",
		createdAt: "conversations.createdAt",
		status: "conversations.status",
		channelCode: "conversations.channelCode",
	},
	messages: {
		id: "messages.id",
		conversationId: "messages.conversationId",
		role: "messages.role",
		turnIndex: "messages.turnIndex",
	},
	trackingLookups: { messageId: "tl.messageId", createdAt: "tl.createdAt" },
}))

jest.mock("drizzle-orm", () => {
	const op =
		(name: string) =>
		(...args: unknown[]) => ({ op: name, args })
	return {
		and: op("and"),
		asc: op("asc"),
		desc: op("desc"),
		eq: op("eq"),
		gte: op("gte"),
		inArray: op("inArray"),
		lt: op("lt"),
		or: op("or"),
		sql: Object.assign((...args: unknown[]) => ({ sql: args }), {}),
	}
})

jest.mock("@/common/database/database.client", () => ({
	db: { select: (...args: unknown[]) => mockSelect(...args) },
}))

jest.mock("@/config/env.config", () => ({
	env: { TRACE_VIEWER_URL: "https://trace.example/t/{traceId}" },
}))

const CONVERSATION_ID = "00000000-0000-4000-8000-0000000000c1"
const ASSISTANT_ID = "00000000-0000-4000-8000-0000000000a1"
const CUSTOMER_ID = "00000000-0000-4000-8000-0000000000b1"

describe("ConversationTranscriptsService", () => {
	let writeAudit: jest.Mock
	let service: ConversationTranscriptsService

	beforeEach(() => {
		mockResults.length = 0
		mockSelect.mockReset()
		mockSelect.mockImplementation(() => chain())
		writeAudit = jest.fn().mockResolvedValue(undefined)
		service = new ConversationTranscriptsService({ writeAudit } as never)
	})

	describe("get", () => {
		const conversationRow = {
			id: CONVERSATION_ID,
			createdAt: new Date("2026-11-20T02:00:00Z"),
			status: "resolved_by_ai",
			channelCode: "web",
		}
		const messageRows = [
			{
				id: CUSTOMER_ID,
				role: "user",
				sender: "customer",
				answerKind: null,
				turnIndex: 0,
				inquiryCategory: "rates",
				language: "en",
				content: "How much to Cebu?",
				citations: null,
				confidence: null,
				retrievalScore: null,
				groundednessResult: null,
				modelUsed: null,
				traceId: null,
				createdAt: new Date("2026-11-20T02:00:00Z"),
			},
			{
				id: ASSISTANT_ID,
				role: "assistant",
				sender: "assistant",
				answerKind: "answer",
				turnIndex: 1,
				inquiryCategory: null,
				language: "en",
				content: "Cebu is zone 2.",
				citations: [],
				confidence: 0.9,
				retrievalScore: 0.8,
				groundednessResult: { grounded: true },
				modelUsed: "gemma-4",
				traceId: "trace-9",
				createdAt: new Date("2026-11-20T02:00:01Z"),
			},
		]

		it("records the view before returning the transcript", async () => {
			mockResults.push(
				[conversationRow],
				messageRows,
				[],
				[{ after: { messageId: ASSISTANT_ID, provider: "anthropic" } }]
			)

			const detail = await service.get(CONVERSATION_ID, "staff-1")

			expect(writeAudit).toHaveBeenCalledTimes(1)
			expect(writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({
					actorId: "staff-1",
					actorType: "user",
					action: TRANSCRIPT_VIEWED_ACTION,
					resourceType: "conversation",
					resourceId: CONVERSATION_ID,
				})
			)
			expect(detail.id).toBe(CONVERSATION_ID)
			expect(detail.messages).toHaveLength(2)
		})

		it("attaches the provider and trace link to the assistant answer only", async () => {
			mockResults.push(
				[conversationRow],
				messageRows,
				[],
				[{ after: { messageId: ASSISTANT_ID, provider: "anthropic" } }]
			)

			const detail = await service.get(CONVERSATION_ID, "staff-1")
			const [customer, assistant] = detail.messages

			expect(customer?.provenance).toBeNull()
			expect(assistant?.provenance?.provider).toBe("anthropic")
			expect(assistant?.provenance?.traceUrl).toBe("https://trace.example/t/trace-9")
			expect(assistant?.provenance?.confidence).toBe(0.9)
			expect(assistant?.provenance?.modelUsed).toBe("gemma-4")
		})

		it("throws 404 and writes no audit when the conversation does not exist", async () => {
			mockResults.push([])

			await expect(service.get(CONVERSATION_ID, "staff-1")).rejects.toBeInstanceOf(
				NotFoundException
			)
			expect(writeAudit).not.toHaveBeenCalled()
		})

		it("returns no transcript when the view audit cannot be written", async () => {
			writeAudit.mockRejectedValueOnce(new Error("audit store down"))
			mockResults.push([conversationRow], messageRows, [], [])

			await expect(service.get(CONVERSATION_ID, "staff-1")).rejects.toThrow("audit store down")
		})
	})

	describe("search", () => {
		it("returns the total and masked rows for one page", async () => {
			mockResults.push(
				[{ total: 1 }],
				[
					{
						id: CONVERSATION_ID,
						createdAt: new Date("2026-11-20T02:00:00Z"),
						status: "ai_active",
						channelCode: "web",
					},
				],
				[
					{
						conversationId: CONVERSATION_ID,
						role: "user",
						turnIndex: 0,
						inquiryCategory: "tracking",
						language: "en",
						content: "Email me at ana@example.com",
					},
				]
			)

			const page = await service.search({ page: 1, pageSize: 25 })

			expect(page.total).toBe(1)
			expect(page.rows[0]).toMatchObject({
				id: CONVERSATION_ID,
				category: "tracking",
				language: "en",
				messageCount: 1,
			})
			expect(page.rows[0]?.preview).not.toContain("ana@example.com")
		})

		it("skips the message query when the page is empty", async () => {
			mockResults.push([{ total: 0 }], [])

			const page = await service.search({ page: 2, pageSize: 25 })

			expect(page).toEqual({ rows: [], total: 0, page: 2, pageSize: 25 })
			expect(mockSelect).toHaveBeenCalledTimes(2)
		})
	})
})

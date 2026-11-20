import { EventService } from "./event.service"

const mockInserted: Record<string, unknown>[] = []

jest.mock("@repo/contracts", () => ({}))
jest.mock("@repo/db/schema", () => ({ interactionEvents: { name: "interaction_events" } }))
jest.mock("@/common/database/database.client", () => ({
	db: {
		insert: () => ({
			values: async (values: Record<string, unknown>) => {
				mockInserted.push(values)
			},
		}),
	},
}))

describe("EventService", () => {
	let service: EventService

	beforeEach(() => {
		service = new EventService()
		mockInserted.length = 0
	})

	it("persists only the event codes and leaves payload empty", async () => {
		await service.record({
			conversationId: "conversation-1",
			kind: "answer_sent",
			category: "tracking",
			language: "en",
			channelCode: "web-widget",
		})

		expect(mockInserted).toEqual([
			{
				conversationId: "conversation-1",
				kind: "answer_sent",
				category: "tracking",
				language: "en",
				channelCode: "web-widget",
				payload: null,
			},
		])
	})

	it("rejects free-text categories", async () => {
		await expect(
			service.record({
				conversationId: "conversation-1",
				kind: "answer_sent",
				category: "my tracking number is 123",
				language: "en",
				channelCode: "web-widget",
			})
		).rejects.toThrow("validated category code")
		expect(mockInserted).toHaveLength(0)
	})

	it("rejects free-text language and channel values", async () => {
		await expect(
			service.record({
				conversationId: "conversation-1",
				kind: "answer_sent",
				category: "other",
				language: "customer text",
				channelCode: "web-widget",
			})
		).rejects.toThrow("language code")

		await expect(
			service.record({
				conversationId: "conversation-1",
				kind: "answer_sent",
				category: "other",
				language: "en",
				channelCode: "please tell me a secret",
			})
		).rejects.toThrow("channel code")
		expect(mockInserted).toHaveLength(0)
	})
})

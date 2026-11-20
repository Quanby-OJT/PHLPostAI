import { AnalyticsOverviewService } from "./analytics-overview.service"

jest.mock("drizzle-orm", () => ({
	sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts: [...parts], values }),
}))
jest.mock("@repo/db/schema", () => ({
	interactionEvents: { kind: "kind", occurredAt: "occurred_at" },
}))
jest.mock("@/common/database/database.client", () => ({ db: { select: jest.fn() } }))

const mockSelect = jest.requireMock("@/common/database/database.client").db.select as jest.Mock
const mockTable = jest.requireMock("@repo/db/schema").interactionEvents

describe("AnalyticsOverviewService", () => {
	let service: AnalyticsOverviewService

	beforeEach(() => {
		service = new AnalyticsOverviewService()
		mockSelect.mockReset()
	})

	it("returns the four counts from interaction_events using Manila day boundaries", async () => {
		const where = jest.fn().mockResolvedValue([
			{
				date: "2026-11-19",
				conversations: "3",
				answers: 8,
				trackingLookups: "2",
				escalations: 1,
			},
		])
		const from = jest.fn().mockReturnValue({ where })
		mockSelect.mockReturnValue({ from })

		expect(await service.getToday()).toEqual({
			date: "2026-11-19",
			conversations: 3,
			answers: 8,
			trackingLookups: 2,
			escalations: 1,
		})
		expect(from).toHaveBeenCalledWith(mockTable)
		const query = JSON.stringify({ selection: mockSelect.mock.calls[0]?.[0], where: where.mock.calls[0]?.[0] })
		expect(query).toContain("Asia/Manila")
		expect(query).toContain("answer_sent")
		expect(query).toContain("message_answered")
		expect(query).toContain("escalated")
		expect(query).toContain("escalation_requested")
	})

	it("returns zero counts when the aggregate returns no row", async () => {
		mockSelect.mockReturnValue({ from: () => ({ where: async () => [] }) })

		expect(await service.getToday()).toMatchObject({
			conversations: 0,
			answers: 0,
			trackingLookups: 0,
			escalations: 0,
		})
	})
})

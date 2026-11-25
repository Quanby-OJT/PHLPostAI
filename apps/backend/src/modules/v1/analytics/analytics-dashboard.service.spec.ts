import { AnalyticsDashboardService, DEFAULT_DASHBOARD_TILES } from "./analytics-dashboard.service"

jest.mock("drizzle-orm", () => ({
	and: (...items: unknown[]) => ({ operator: "and", items }),
	asc: (value: unknown) => ({ operator: "asc", value }),
	eq: (column: unknown, value: unknown) => ({ operator: "eq", column, value }),
	gte: (column: unknown, value: unknown) => ({ operator: "gte", column, value }),
	isNull: (column: unknown) => ({ operator: "isNull", column }),
	lt: (column: unknown, value: unknown) => ({ operator: "lt", column, value }),
	sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({
		parts: [...parts],
		values,
	}),
}))
jest.mock("@repo/db/schema", () => ({
	dashboardLayouts: { userId: "user_id", tiles: "tiles" },
	interactionEvents: {
		occurredAt: "occurred_at",
		kind: "kind",
		category: "category",
		language: "language",
		channelCode: "channel_code",
		conversationId: "conversation_id",
		payload: "payload",
	},
}))
jest.mock("@/common/database/database.client", () => ({
	db: { select: jest.fn(), transaction: jest.fn() },
}))

const mockSelect = jest.requireMock("@/common/database/database.client").db.select as jest.Mock
const mockTransaction = jest.requireMock("@/common/database/database.client").db
	.transaction as jest.Mock
const mockWriteAudit = jest.fn()

function groupedQuery(rows: unknown[]) {
	return {
		from: () => ({
			where: () => ({
				groupBy: () => ({ orderBy: async () => rows }),
			}),
		}),
	}
}

describe("AnalyticsDashboardService", () => {
	let service: AnalyticsDashboardService

	beforeEach(() => {
		mockSelect.mockReset()
		mockTransaction.mockReset()
		mockWriteAudit.mockReset()
		service = new AnalyticsDashboardService({ writeAudit: mockWriteAudit } as never)
	})

	it("returns Manila-day inquiry charts and response metrics using the selected filters", async () => {
		const whereCalls: unknown[] = []
		const buildGrouped = (rows: unknown[]) => ({
			from: () => ({
				where: (where: unknown) => {
					whereCalls.push(where)
					return { groupBy: () => ({ orderBy: async () => rows }) }
				},
			}),
		})
		mockSelect
			.mockReturnValueOnce(buildGrouped([{ date: "2026-11-23", count: "3" }]))
			.mockReturnValueOnce(buildGrouped([{ code: "tracking", count: "3" }]))
			.mockReturnValueOnce(buildGrouped([{ code: "fil", count: "3" }]))
			.mockReturnValueOnce(buildGrouped([{ code: "web-widget", count: "3" }]))
			.mockReturnValueOnce(buildGrouped([{ code: "tracking" }, { code: "rates" }]))
			.mockReturnValueOnce(buildGrouped([{ code: "en" }, { code: "fil" }]))
			.mockReturnValueOnce(buildGrouped([{ code: "web-widget" }]))
			.mockReturnValueOnce({
				from: () => ({
					where: (where: unknown) => {
						whereCalls.push(where)
						return Promise.resolve([
							{ inquiries: "3", escalations: "1", median: "840", p95: "1900" },
						])
					},
				}),
			})

		const result = await service.getDashboard({
			startDate: "2026-11-23",
			endDate: "2026-11-24",
			category: "tracking",
			language: "fil",
			channel: "web-widget",
		})

		expect(result.daily).toEqual([
			{ date: "2026-11-23", count: 3 },
			{ date: "2026-11-24", count: 0 },
		])
		expect(result.availableFilters).toEqual({
			categories: ["tracking", "rates"],
			languages: ["en", "fil"],
			channels: ["web-widget"],
		})
		expect(result.byCategory).toEqual([{ code: "tracking", count: 3 }])
		expect(result.byLanguage).toEqual([{ code: "fil", count: 3 }])
		expect(result.byChannel).toEqual([{ code: "web-widget", count: 3 }])
		expect(result.escalations).toBe(1)
		expect(result.escalationRate).toBe(1 / 3)
		expect(result.medianResponseTimeMs).toBe(840)
		expect(result.p95ResponseTimeMs).toBe(1900)
		expect(whereCalls).toHaveLength(8)
		expect(JSON.stringify(whereCalls)).toContain("2026-11-22T16:00:00.000Z")
		expect(JSON.stringify(whereCalls)).toContain("2026-11-24T16:00:00.000Z")
		expect(JSON.stringify(mockSelect.mock.calls)).toContain("Asia/Manila")
		for (const where of [...whereCalls.slice(0, 4), whereCalls[7]]) {
			expect(JSON.stringify(where)).toContain('"value":"tracking"')
			expect(JSON.stringify(where)).toContain('"value":"fil"')
			expect(JSON.stringify(where)).toContain('"value":"web-widget"')
		}
		for (const where of whereCalls.slice(4, 7)) {
			expect(JSON.stringify(where)).not.toContain('"value":"tracking"')
			expect(JSON.stringify(where)).not.toContain('"value":"fil"')
			expect(JSON.stringify(where)).not.toContain('"value":"web-widget"')
		}
	})

	it("uses the stored workspace default layout for a new user", async () => {
		mockSelect
			.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
			.mockReturnValueOnce({
				from: () => ({
					where: () => ({
						limit: async () => [{ tiles: ["inquiry-volume", "response-time"] }],
					}),
				}),
			})

		expect(await service.getLayout("new-user")).toEqual({
			tiles: ["inquiry-volume", "response-time"],
		})
	})

	it("saves an ordered personal layout and audits the change in the same transaction", async () => {
		mockSelect.mockReturnValueOnce({
			from: () => ({
				where: () => ({ limit: async () => [{ tiles: ["inquiry-volume"] }] }),
			}),
		})
		const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined)
		const tx = {
			insert: jest.fn().mockReturnValue({
				values: jest.fn().mockReturnValue({ onConflictDoUpdate }),
			}),
		}
		mockTransaction.mockImplementation(async (work: (transaction: unknown) => Promise<void>) =>
			work(tx)
		)

		const result = await service.saveLayout("user-1", {
			tiles: ["response-time", "by-category"],
		})

		expect(result).toEqual({ tiles: ["response-time", "by-category"] })
		expect(mockTransaction).toHaveBeenCalledTimes(1)
		expect(onConflictDoUpdate).toHaveBeenCalledWith({
			target: "user_id",
			set: { tiles: ["response-time", "by-category"] },
		})
		expect(mockWriteAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				actorId: "user-1",
				action: "analytics.dashboard.layout.updated",
				before: { tiles: ["inquiry-volume"] },
				after: { tiles: ["response-time", "by-category"] },
			}),
			tx
		)
	})

	it("defines the domain default tiles for a new workspace", () => {
		expect(DEFAULT_DASHBOARD_TILES).toEqual([
			"inquiry-volume",
			"by-category",
			"by-language",
			"by-channel",
			"escalations",
			"response-time",
		])
	})
})

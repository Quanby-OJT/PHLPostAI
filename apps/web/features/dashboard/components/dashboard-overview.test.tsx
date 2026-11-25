import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DashboardOverview } from "./dashboard-overview"

const mocks = vi.hoisted(() => ({
	useAnalyticsOverviewQuery: vi.fn(),
	useAnalyticsDashboardQuery: vi.fn(),
	useDashboardLayoutQuery: vi.fn(),
	useSaveDashboardLayoutMutation: vi.fn(),
	useRolesQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
	useUsersQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}))

vi.mock("@/features/dashboard/api/analytics.hooks", () => ({
	useAnalyticsOverviewQuery: mocks.useAnalyticsOverviewQuery,
	useAnalyticsDashboardQuery: mocks.useAnalyticsDashboardQuery,
	useDashboardLayoutQuery: mocks.useDashboardLayoutQuery,
	useSaveDashboardLayoutMutation: mocks.useSaveDashboardLayoutMutation,
}))
vi.mock("@/features/user-management/api/rbac.hooks", () => ({
	useRolesQuery: mocks.useRolesQuery,
	useUsersQuery: mocks.useUsersQuery,
}))

describe("DashboardOverview analytics counters (ANL-1)", () => {
	beforeEach(() => {
		mocks.useAnalyticsOverviewQuery.mockReset()
		mocks.useAnalyticsDashboardQuery.mockReset()
		mocks.useDashboardLayoutQuery.mockReset()
		mocks.useSaveDashboardLayoutMutation.mockReset()
		mocks.useRolesQuery.mockClear()
		mocks.useUsersQuery.mockClear()
		mocks.useAnalyticsDashboardQuery.mockReturnValue({
			data: {
				availableFilters: {
					categories: ["tracking"],
					languages: ["fil"],
					channels: ["web-widget"],
				},
				daily: [{ date: "2026-11-19", count: 14 }],
				byCategory: [{ code: "tracking", count: 8 }],
				byLanguage: [{ code: "fil", count: 14 }],
				byChannel: [{ code: "web-widget", count: 14 }],
				inquiries: 14,
				escalations: 2,
				escalationRate: 2 / 14,
				medianResponseTimeMs: 840,
				p95ResponseTimeMs: 1900,
			},
			isLoading: false,
			isFetching: false,
			isError: false,
		})
		mocks.useDashboardLayoutQuery.mockReturnValue({
			data: {
				tiles: [
					"inquiry-volume",
					"by-category",
					"by-language",
					"by-channel",
					"escalations",
					"response-time",
				],
			},
			isLoading: false,
			isError: false,
		})
		mocks.useSaveDashboardLayoutMutation.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
			isSuccess: false,
			isError: false,
		})
	})

	it("shows today's four event-backed counts to permitted users", () => {
		mocks.useAnalyticsOverviewQuery.mockReturnValue({
			data: {
				date: "2026-11-19",
				conversations: 14,
				answers: 21,
				trackingLookups: 5,
				escalations: 2,
			},
			isLoading: false,
			isError: false,
		})

		render(
			<DashboardOverview
				user={{ name: "Dana User", email: "dana@example.test" }}
				access={{ roles: [], permissions: ["analytics.dashboard.view"] }}
			/>
		)

		expect(screen.getByText("Today's conversations")).toBeInTheDocument()
		expect(screen.getByText("Today's answers")).toBeInTheDocument()
		expect(screen.getByText("Tracking lookups")).toBeInTheDocument()
		expect(screen.getByText("Escalations")).toBeInTheDocument()
		expect(screen.getByText("Management dashboard")).toBeInTheDocument()
		expect(screen.getAllByText("Inquiry volume over time")).toHaveLength(2)
		expect(screen.getAllByText("Response time")).toHaveLength(2)
		for (const count of [14, 21, 5, 2]) {
			expect(screen.getAllByText(String(count)).length).toBeGreaterThan(0)
		}
		expect(mocks.useAnalyticsOverviewQuery).toHaveBeenCalledWith(true)
	})

	it("does not request or show analytics counts without permission", () => {
		mocks.useAnalyticsOverviewQuery.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: false,
		})

		render(
			<DashboardOverview
				user={{ name: null, email: "dana@example.test" }}
				access={{ roles: [], permissions: [] }}
			/>
		)

		expect(screen.queryByText("Today's conversations")).not.toBeInTheDocument()
		expect(screen.queryByText("Today's answers")).not.toBeInTheDocument()
		expect(mocks.useAnalyticsOverviewQuery).toHaveBeenCalledWith(false)
	})
})

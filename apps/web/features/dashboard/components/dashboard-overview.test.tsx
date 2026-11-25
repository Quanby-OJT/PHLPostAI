import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DashboardOverview } from "./dashboard-overview"


const mocks = vi.hoisted(() => ({
	useAnalyticsOverviewQuery: vi.fn(),
	useRolesQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
	useUsersQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}))

vi.mock("@/features/dashboard/api/analytics.hooks", () => ({
	useAnalyticsOverviewQuery: mocks.useAnalyticsOverviewQuery,
}))
vi.mock("@/features/user-management/api/rbac.hooks", () => ({
	useRolesQuery: mocks.useRolesQuery,
	useUsersQuery: mocks.useUsersQuery,
}))
vi.mock("./deflection-dashboard-tile", () => ({
	DeflectionDashboardTile: () => null,
}))

describe("DashboardOverview analytics counters (ANL-1)", () => {
	beforeEach(() => {
		mocks.useAnalyticsOverviewQuery.mockReset()
		mocks.useRolesQuery.mockClear()
		mocks.useUsersQuery.mockClear()
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
		for (const count of [14, 21, 5, 2]) expect(screen.getByText(String(count))).toBeInTheDocument()
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

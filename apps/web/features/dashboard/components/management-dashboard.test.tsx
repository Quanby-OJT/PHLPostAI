import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ManagementDashboard } from "./management-dashboard"

const mocks = vi.hoisted(() => ({
	useAnalyticsDashboardQuery: vi.fn(),
	useDashboardLayoutQuery: vi.fn(),
	useSaveDashboardLayoutMutation: vi.fn(),
}))

vi.mock("@/features/dashboard/api/analytics.hooks", () => ({
	useAnalyticsDashboardQuery: mocks.useAnalyticsDashboardQuery,
	useDashboardLayoutQuery: mocks.useDashboardLayoutQuery,
	useSaveDashboardLayoutMutation: mocks.useSaveDashboardLayoutMutation,
}))

describe("ManagementDashboard tile customization", () => {
	beforeEach(() => {
		mocks.useAnalyticsDashboardQuery.mockReset()
		mocks.useDashboardLayoutQuery.mockReset()
		mocks.useSaveDashboardLayoutMutation.mockReset()
		mocks.useAnalyticsDashboardQuery.mockReturnValue({
			data: {
				availableFilters: { categories: [], languages: [], channels: [] },
				daily: [],
				byCategory: [],
				byLanguage: [],
				byChannel: [],
				inquiries: 0,
				escalations: 0,
				escalationRate: null,
				medianResponseTimeMs: null,
				p95ResponseTimeMs: null,
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
			isError: false,
		})
		mocks.useSaveDashboardLayoutMutation.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
			isSuccess: false,
			isError: false,
		})
	})

	it("keeps the customization controls in the same order as the dashboard tiles", async () => {
		render(
			<ManagementDashboard access={{ roles: [], permissions: ["analytics.dashboard.view"] }} />
		)

		const customize = screen.getByText("Customize dashboard tiles").closest("details")
		expect(customize).not.toBeNull()
		const controls = within(customize as HTMLElement)
		fireEvent.click(controls.getByRole("button", { name: "Move Inquiry volume over time down" }))

		await waitFor(() => {
			const labels = controls
				.getAllByRole("checkbox")
				.map(checkbox => checkbox.parentElement?.textContent?.trim())
			expect(labels.indexOf("Inquiries by category")).toBeLessThan(
				labels.indexOf("Inquiry volume over time")
			)
		})
	})
})

import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InquiryCategoriesView } from "./inquiry-categories-view"

const mutateMock = vi.fn()
const useInquiryCategoriesQueryMock = vi.fn()

vi.mock("../api/categories.hooks", () => ({
	useInquiryCategoriesQuery: () => useInquiryCategoriesQueryMock(),
	useUpdateInquiryCategoryMutation: () => ({
		mutate: mutateMock,
		isPending: false,
		error: null,
	}),
}))

describe("InquiryCategoriesView", () => {
	beforeEach(() => {
		mutateMock.mockReset()
		useInquiryCategoriesQueryMock.mockReturnValue({
			data: [
				{
					code: "tracking",
					name: "Tracking",
					isEligible: true,
					isActive: true,
					createdAt: "2026-11-23T00:00:00.000Z",
					updatedAt: "2026-11-23T00:00:00.000Z",
				},
				{
					code: "complaint",
					name: "Complaint",
					isEligible: false,
					isActive: true,
					createdAt: "2026-11-23T00:00:00.000Z",
					updatedAt: "2026-11-23T00:00:00.000Z",
				},
			],
			isLoading: false,
			error: null,
		})
	})

	it("renders seeded categories and toggles eligibility", () => {
		render(<InquiryCategoriesView />)
		expect(screen.getByText("Tracking")).toBeTruthy()
		expect(screen.getByText("Complaint")).toBeTruthy()

		fireEvent.click(screen.getByRole("switch", { name: "Toggle eligibility for Complaint" }))
		expect(mutateMock).toHaveBeenCalledWith({
			code: "complaint",
			isEligible: true,
			isActive: true,
		})
	})
})

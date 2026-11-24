import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { InquiryCategoriesView } from "./inquiry-categories-view"

const mutateMock = vi.fn()
const createMock = vi.fn()
const useInquiryCategoriesQueryMock = vi.fn()

vi.mock("../api/categories.hooks", () => ({
	useInquiryCategoriesQuery: () => useInquiryCategoriesQueryMock(),
	useUpdateInquiryCategoryMutation: () => ({
		mutate: mutateMock,
		isPending: false,
		error: null,
	}),
	useCreateInquiryCategoryMutation: () => ({ mutateAsync: createMock, isPending: false }),
}))

describe("InquiryCategoriesView", () => {
	beforeEach(() => {
		mutateMock.mockReset()
		createMock.mockReset()
		createMock.mockResolvedValue({})
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
				{
					code: "other",
					name: "Other",
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

	it("AC3: adds a category with a lower-case code", async () => {
		const user = userEvent.setup()
		render(<InquiryCategoriesView />)

		await user.type(screen.getByLabelText("Code"), "Customs-Help")
		await user.type(screen.getByLabelText("Name"), "Customs help")
		await user.click(screen.getByRole("button", { name: "Add category" }))

		expect(createMock).toHaveBeenCalledWith({
			code: "customs-help",
			name: "Customs help",
			isEligible: false,
		})
	})

	it("rejects a code with spaces and adds nothing", async () => {
		const user = userEvent.setup()
		render(<InquiryCategoriesView />)

		await user.type(screen.getByLabelText("Code"), "customs help")
		await user.type(screen.getByLabelText("Name"), "Customs help")
		await user.click(screen.getByRole("button", { name: "Add category" }))

		expect(
			await screen.findByText("Use lowercase letters, numbers and hyphens, such as customs-help")
		).toBeInTheDocument()
		expect(createMock).not.toHaveBeenCalled()
	})

	it("does not let the fallback category be deactivated", () => {
		render(<InquiryCategoriesView />)

		expect(screen.getByRole("button", { name: "Toggle active status for Other" })).toBeDisabled()
		expect(
			screen.getByRole("button", { name: "Toggle active status for Tracking" })
		).not.toBeDisabled()
	})
})

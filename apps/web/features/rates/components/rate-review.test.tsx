import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RateReview } from "./rate-review"

const approveMock = vi.fn()
const rejectMock = vi.fn()

vi.mock("@/features/rates/api/rates.hooks", () => ({
	useRateReviewQueueQuery: () => ({
		isPending: false,
		isError: false,
		data: [
			{
				id: "batch-1",
				fileName: "december-rates.csv",
				rowCount: 1,
				status: "pending",
				submittedBy: "manager-1",
				reviewedBy: null,
				reviewedAt: null,
				reviewNote: null,
				createdAt: "2026-11-24T00:00:00Z",
				entries: [
					{
						id: "entry-1",
						batchId: "batch-1",
						serviceCode: "express-mail",
						serviceName: "Express Mail",
						zone: "Visayas",
						weightMinG: 0,
						weightMaxG: 2000,
						priceCentavos: 32000,
						effectiveFrom: "2026-12-01",
						effectiveTo: null,
						status: "pending",
					},
				],
			},
		],
	}),
	useApproveRateBatchMutation: () => ({ mutateAsync: approveMock, isPending: false }),
	useRejectRateBatchMutation: () => ({ mutateAsync: rejectMock, isPending: false }),
}))

describe("RateReview (KB-2 AC4)", () => {
	beforeEach(() => {
		approveMock.mockReset()
		rejectMock.mockReset()
	})

	it("shows the batch's rates and approves it", async () => {
		approveMock.mockResolvedValue({})
		const user = userEvent.setup()
		render(<RateReview />)

		expect(screen.getByRole("table", { name: "Rates in december-rates.csv" })).toHaveTextContent(
			"Express Mail"
		)
		await user.click(screen.getByRole("button", { name: "Approve" }))

		expect(approveMock).toHaveBeenCalledWith("batch-1")
	})

	it("shows why approval was refused, such as approving your own batch", async () => {
		approveMock.mockRejectedValue(
			new Error("You submitted this batch, so a different user must approve it")
		)
		const user = userEvent.setup()
		render(<RateReview />)

		await user.click(screen.getByRole("button", { name: "Approve" }))

		expect(await screen.findByRole("alert")).toHaveTextContent("a different user must approve it")
	})

	it("needs a note to reject a batch", async () => {
		rejectMock.mockResolvedValue({})
		const user = userEvent.setup()
		render(<RateReview />)

		await user.click(screen.getByRole("button", { name: "Reject" }))
		expect(screen.getByRole("button", { name: "Reject batch" })).toBeDisabled()

		await user.type(screen.getByLabelText("Why is this batch rejected?"), "Wrong Visayas prices")
		await user.click(screen.getByRole("button", { name: "Reject batch" }))

		expect(rejectMock).toHaveBeenCalledWith({ id: "batch-1", note: "Wrong Visayas prices" })
	})
})

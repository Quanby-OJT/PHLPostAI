import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RateImport } from "./rate-import"

const previewMock = vi.fn()
const submitMock = vi.fn()

vi.mock("@/features/rates/api/rates.hooks", () => ({
	usePreviewRatesMutation: () => ({ mutateAsync: previewMock, isPending: false }),
	useSubmitRatesMutation: () => ({ mutateAsync: submitMock, isPending: false }),
}))

const CSV = "service_code,service_name,zone,weight_min_g,weight_max_g,price_php,effective_from\n"
const ROW = {
	line: 2,
	serviceCode: "express-mail",
	serviceName: "Express Mail",
	zone: "Visayas",
	weightMinG: 0,
	weightMaxG: 2000,
	priceCentavos: 32000,
	effectiveFrom: "2026-12-01",
	effectiveTo: null,
}

async function chooseFile(user: ReturnType<typeof userEvent.setup>) {
	const file = new File([CSV], "rates.csv", { type: "text/csv" })
	await user.upload(screen.getByLabelText("Rates CSV file"), file)
}

describe("RateImport (KB-2 AC4)", () => {
	beforeEach(() => {
		previewMock.mockReset()
		submitMock.mockReset()
	})

	it("shows the errors with their line numbers and does not allow submitting", async () => {
		previewMock.mockResolvedValue({
			rows: [],
			errors: [{ line: 3, message: "price_php must be a positive amount such as 165.00" }],
			valid: false,
		})
		const user = userEvent.setup()
		render(<RateImport />)

		await chooseFile(user)
		await user.click(screen.getByRole("button", { name: "Preview" }))

		expect(
			await screen.findByText("Line 3: price_php must be a positive amount such as 165.00")
		).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Submit for approval" })).toBeDisabled()
		expect(previewMock).toHaveBeenCalledWith({ fileName: "rates.csv", csv: CSV })
	})

	it("previews valid rows and submits them for approval", async () => {
		previewMock.mockResolvedValue({ rows: [ROW], errors: [], valid: true })
		submitMock.mockResolvedValue({ rowCount: 1 })
		const user = userEvent.setup()
		render(<RateImport />)

		await chooseFile(user)
		await user.click(screen.getByRole("button", { name: "Preview" }))
		expect(await screen.findByRole("table", { name: "Preview" })).toHaveTextContent("₱320.00")

		await user.click(screen.getByRole("button", { name: "Submit for approval" }))

		expect(submitMock).toHaveBeenCalledWith({ fileName: "rates.csv", csv: CSV })
		expect(await screen.findByText(/go live when a second user approves/)).toBeInTheDocument()
	})
})

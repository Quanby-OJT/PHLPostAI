import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ExplanationEditor } from "./explanation-editor"

const mutateAsync = vi.fn()

vi.mock("@/features/tracking-explanations/api/explanations.hooks", () => ({
	useSaveExplanationMutation: () => ({ mutateAsync, isPending: false }),
}))

describe("ExplanationEditor (TRK-2)", () => {
	beforeEach(() => {
		mutateAsync.mockReset()
		mutateAsync.mockResolvedValue({})
	})

	it("requires an explanation and saves nothing without one", async () => {
		const user = userEvent.setup()
		render(<ExplanationEditor onDone={vi.fn()} onCancel={vi.fn()} />)

		await user.type(screen.getByLabelText("Status code"), "IN_TRANSIT")
		await user.click(screen.getByRole("button", { name: "Save explanation" }))

		expect(await screen.findByText("Explanation is required")).toBeInTheDocument()
		expect(mutateAsync).not.toHaveBeenCalled()
	})

	it("saves the code in upper case and an empty next step as none", async () => {
		const user = userEvent.setup()
		const onDone = vi.fn()
		render(<ExplanationEditor onDone={onDone} onCancel={vi.fn()} />)

		await user.type(screen.getByLabelText("Status code"), "in_transit")
		await user.type(screen.getByLabelText("What this status means"), "Your item is on its way.")
		await user.click(screen.getByRole("button", { name: "Save explanation" }))

		expect(mutateAsync).toHaveBeenCalledWith({
			statusCode: "IN_TRANSIT",
			language: "en",
			explanation: "Your item is on its way.",
			nextSteps: null,
		})
		expect(onDone).toHaveBeenCalled()
	})

	it("keeps the status code fixed when it comes from the 'needs explanation' list", () => {
		render(
			<ExplanationEditor
				initial={{ statusCode: "HELD_AT_CUSTOMS", language: "fil" }}
				onDone={vi.fn()}
				onCancel={vi.fn()}
			/>
		)

		expect(screen.getByLabelText("Status code")).toHaveValue("HELD_AT_CUSTOMS")
		expect(screen.getByLabelText("Status code")).toBeDisabled()
	})

	it("shows the server's message when saving fails", async () => {
		mutateAsync.mockRejectedValue(new Error("Forbidden"))
		const user = userEvent.setup()
		render(
			<ExplanationEditor
				initial={{ statusCode: "IN_TRANSIT", language: "en", explanation: "On its way." }}
				editing
				onDone={vi.fn()}
				onCancel={vi.fn()}
			/>
		)

		await user.click(screen.getByRole("button", { name: "Save explanation" }))

		expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden")
	})
})

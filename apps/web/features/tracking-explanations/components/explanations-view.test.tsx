import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
	NeededExplanationUi,
	StatusExplanationUi,
} from "@/features/tracking-explanations/api/explanations.hooks"

import { ExplanationsView } from "./explanations-view"

const deactivateMutate = vi.fn()
let explanations: StatusExplanationUi[] = []
let needed: NeededExplanationUi[] = []

vi.mock("@/features/tracking-explanations/api/explanations.hooks", () => ({
	useExplanationsQuery: () => ({ data: explanations, isPending: false, isError: false }),
	useNeededExplanationsQuery: () => ({ data: needed, isPending: false, isError: false }),
	useDeactivateExplanationMutation: () => ({ mutate: deactivateMutate, isPending: false }),
	useSaveExplanationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

const EXPLANATION: StatusExplanationUi = {
	id: "e1",
	statusCode: "IN_TRANSIT",
	language: "en",
	explanation: "Your item is on its way.",
	nextSteps: "No action is needed.",
	isActive: true,
	createdAt: "2026-11-23T00:00:00Z",
	updatedAt: "2026-11-23T00:00:00Z",
}

describe("ExplanationsView (TRK-2)", () => {
	beforeEach(() => {
		deactivateMutate.mockReset()
		explanations = [EXPLANATION]
		needed = [
			{
				statusCode: "HELD_AT_CUSTOMS",
				language: "fil",
				lookups: 2,
				lastSeenAt: "2026-11-23T01:00:00Z",
			},
		]
	})

	it("lists explanations and deactivates one", async () => {
		const user = userEvent.setup()
		render(<ExplanationsView />)

		expect(screen.getByText("Your item is on its way.")).toBeInTheDocument()
		await user.click(screen.getByRole("button", { name: "Deactivate IN_TRANSIT (English)" }))

		expect(deactivateMutate).toHaveBeenCalledWith("e1")
	})

	it("AC2: shows codes that need an explanation and opens the editor for one", async () => {
		const user = userEvent.setup()
		render(<ExplanationsView />)

		await user.click(screen.getByRole("tab", { name: "Needs explanation" }))
		expect(await screen.findByText("HELD_AT_CUSTOMS")).toBeInTheDocument()
		await user.click(
			screen.getByRole("button", { name: "Write explanation for HELD_AT_CUSTOMS (Filipino)" })
		)

		expect(await screen.findByLabelText("Status code")).toHaveValue("HELD_AT_CUSTOMS")
	})
})

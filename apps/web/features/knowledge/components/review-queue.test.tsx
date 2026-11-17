import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { KnowledgeReviewItemUi } from "@/features/knowledge/api/knowledge.hooks"

import { ReviewQueue } from "./review-queue"

const approveMutate = vi.fn()
const returnMutate = vi.fn()
let queueItems: KnowledgeReviewItemUi[] = []

vi.mock("@/features/knowledge/api/knowledge.hooks", () => ({
	useKnowledgeReviewQueueQuery: () => ({
		data: queueItems,
		isPending: false,
		isError: false,
		error: null,
	}),
	useApproveVersionMutation: () => ({ mutate: approveMutate, isPending: false }),
	useReturnVersionMutation: () => ({ mutate: returnMutate, isPending: false }),
}))

function item(overrides: Partial<KnowledgeReviewItemUi["version"]> = {}): KnowledgeReviewItemUi {
	return {
		version: {
			id: "v2",
			articleId: "a1",
			version: 2,
			body: "Bring two valid IDs.",
			language: "en",
			status: "in_review",
			submittedBy: "author",
			approvedBy: null,
			approvedAt: null,
			documentId: null,
			reviewNote: null,
			indexing: false,
			indexError: null,
			createdAt: "2026-11-17T00:00:00Z",
			updatedAt: "2026-11-17T00:00:00Z",
			...overrides,
		},
		article: {
			id: "a1",
			title: "Postal ID requirements",
			category: "postal-id",
			languages: ["en"],
			status: "active",
		},
		currentApproved: null,
	}
}

describe("ReviewQueue (KB-1)", () => {
	beforeEach(() => {
		approveMutate.mockReset()
		returnMutate.mockReset()
		queueItems = [item()]
	})

	it("approves a version", async () => {
		render(<ReviewQueue />)
		await userEvent.click(screen.getByRole("button", { name: "Approve" }))
		expect(approveMutate).toHaveBeenCalledWith("v2", expect.anything())
	})

	it("shows the API's refusal when the approver submitted the version", async () => {
		approveMutate.mockImplementation((_id: string, options: { onError: (e: Error) => void }) =>
			options.onError(new Error("You cannot approve a version you submitted."))
		)
		render(<ReviewQueue />)
		await userEvent.click(screen.getByRole("button", { name: "Approve" }))
		expect(screen.getByRole("alert")).toHaveTextContent(
			"You cannot approve a version you submitted."
		)
	})

	it("requires a note to return a version", async () => {
		render(<ReviewQueue />)
		await userEvent.click(screen.getByRole("button", { name: "Return" }))
		await userEvent.click(screen.getByRole("button", { name: "Return to author" }))
		expect(returnMutate).not.toHaveBeenCalled()
		expect(screen.getByText("Say what needs to change")).toBeInTheDocument()

		await userEvent.type(screen.getByLabelText("What needs to change?"), "Add the fee.")
		await userEvent.click(screen.getByRole("button", { name: "Return to author" }))
		expect(returnMutate).toHaveBeenCalledWith({ id: "v2", note: "Add the fee." }, expect.anything())
	})

	it("disables decisions while indexing and explains a failed index", () => {
		queueItems = [item({ indexing: true })]
		const { unmount } = render(<ReviewQueue />)
		expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled()
		expect(screen.getByRole("status")).toHaveTextContent(/Indexing is running/)
		unmount()

		queueItems = [item({ indexError: "HTML parse failed" })]
		render(<ReviewQueue />)
		expect(screen.getByRole("alert")).toHaveTextContent("Indexing failed: HTML parse failed")
		expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled()
	})

	it("shows the indexing label once and does not claim an old version serves a new article", () => {
		queueItems = [item({ indexError: "Indexing failed: Error code: 401" })]
		render(<ReviewQueue />)
		const alert = screen.getByRole("alert")
		expect(alert).toHaveTextContent("Indexing failed: Error code: 401.")
		expect(alert.textContent?.match(/Indexing failed/g)).toHaveLength(1)
		expect(alert).toHaveTextContent("Nothing is serving for this article yet.")
		expect(alert).not.toHaveTextContent(/keeps serving/)
	})
})

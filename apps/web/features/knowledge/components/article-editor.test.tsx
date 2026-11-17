import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ArticleEditor } from "./article-editor"

const createMutateAsync = vi.fn()

vi.mock("@/features/knowledge/api/knowledge.hooks", () => ({
	EXTRACT_ACCEPT: ".pdf,.html,.docx",
	MAX_EXTRACT_BYTES: 25 * 1024 * 1024,
	useCreateArticleMutation: () => ({ mutateAsync: createMutateAsync, isPending: false }),
	useUpdateArticleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useSaveDraftMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useExtractTextMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

describe("ArticleEditor (KB-1)", () => {
	it("shows the shared schema's errors and sends nothing when required fields are empty", async () => {
		render(<ArticleEditor onDone={vi.fn()} onCancel={vi.fn()} />)

		await userEvent.click(screen.getByRole("button", { name: "Create draft" }))

		expect(screen.getByText("Title is required")).toBeInTheDocument()
		expect(screen.getByText("Article text is required")).toBeInTheDocument()
		expect(createMutateAsync).not.toHaveBeenCalled()
	})

	it("explains that editing an approved article opens a new version", () => {
		render(
			<ArticleEditor
				article={{
					id: "a1",
					title: "Postal ID requirements",
					category: "postal-id",
					languages: ["en"],
					status: "active",
					currentVersion: { id: "v1", version: 1, status: "approved" },
					latestVersion: { id: "v1", version: 1, status: "approved" },
					updatedAt: "2026-11-17T00:00:00Z",
					createdAt: "2026-11-17T00:00:00Z",
					versions: [
						{
							id: "v1",
							articleId: "a1",
							version: 1,
							body: "Bring one valid ID.",
							language: "en",
							status: "approved",
							submittedBy: "author",
							approvedBy: "approver",
							approvedAt: "2026-11-17T00:00:00Z",
							documentId: "doc-1",
							reviewNote: null,
							indexing: false,
							indexError: null,
							createdAt: "2026-11-17T00:00:00Z",
							updatedAt: "2026-11-17T00:00:00Z",
						},
					],
				}}
				onDone={vi.fn()}
				onCancel={vi.fn()}
			/>
		)

		expect(screen.getByText(/Saving creates version 2 as a draft/)).toBeInTheDocument()
		expect(screen.getByLabelText("Article text")).toHaveValue("Bring one valid ID.")
	})
})

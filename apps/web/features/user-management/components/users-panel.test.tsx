import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { UsersPanel } from "./users-panel"

const roles = [
	{ id: 1, name: "Customer Service Agent", description: null, permissions: [], userCount: 0 },
	{ id: 2, name: "Scam Reviewer", description: null, permissions: [], userCount: 0 },
]

const createMutate = vi.fn()

vi.mock("@/core/hooks/use-rate-limit-toast", () => ({
	useRateLimitToast: () => ({ isActive: false }),
}))

vi.mock("@/features/user-management/api/rbac.hooks", () => ({
	useUsersQuery: () => ({ data: [], isLoading: false, isError: false, error: null }),
	useRolesQuery: () => ({ data: roles }),
	useAssignRoleMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
	useRemoveRoleMutation: () => ({
		mutate: vi.fn(),
		isPending: false,
		isError: false,
		error: null,
		data: undefined,
	}),
	useCreateUserMutation: () => ({
		mutate: createMutate,
		isPending: false,
		isError: false,
		error: null,
	}),
	useSetUserDisabledMutation: () => ({
		mutate: vi.fn(),
		isPending: false,
		isError: false,
		error: null,
	}),
}))

function fillForm() {
	fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ana Reyes" } })
	fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@phlpost.test" } })
}

describe("UsersPanel create form (ADM-1)", () => {
	beforeEach(() => {
		createMutate.mockReset()
	})

	it("has no password field: the person sets it from the emailed invitation", () => {
		render(<UsersPanel />)
		expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
	})

	it("keeps the submit button disabled until at least one role is chosen", () => {
		render(<UsersPanel />)
		fillForm()
		const submit = screen.getByRole("button", { name: /create user and send invitation/i })
		expect(submit).toBeDisabled()

		fireEvent.click(screen.getByRole("checkbox", { name: "Scam Reviewer" }))
		expect(submit).toBeEnabled()
	})

	it("submits name, email and the chosen roles, and nothing else", () => {
		render(<UsersPanel />)
		fillForm()
		fireEvent.click(screen.getByRole("checkbox", { name: "Customer Service Agent" }))
		fireEvent.click(screen.getByRole("checkbox", { name: "Scam Reviewer" }))
		fireEvent.click(screen.getByRole("button", { name: /create user and send invitation/i }))

		expect(createMutate).toHaveBeenCalledTimes(1)
		const [input] = createMutate.mock.calls[0] as [Record<string, unknown>]
		expect(input).toEqual({
			name: "Ana Reyes",
			email: "ana@phlpost.test",
			roleNames: ["Customer Service Agent", "Scam Reviewer"],
		})
	})

	it("unchecking a role removes it from the submitted set", () => {
		render(<UsersPanel />)
		fillForm()
		const agent = screen.getByRole("checkbox", { name: "Customer Service Agent" })
		fireEvent.click(agent)
		fireEvent.click(agent)
		expect(screen.getByRole("button", { name: /create user and send invitation/i })).toBeDisabled()
	})
})

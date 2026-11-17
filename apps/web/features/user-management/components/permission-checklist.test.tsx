import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PermissionChecklist } from "./permission-checklist"

const catalog = [
	{ name: "users.roles.manage", description: "Define roles" },
	{ name: "knowledge.articles.manage", description: "Write articles" },
	{ name: "knowledge.articles.approve", description: "Approve articles" },
	{ name: "scam.reports.validate", description: "Validate scam reports" },
]

vi.mock("@/features/user-management/api/rbac.hooks", () => ({
	usePermissionsQuery: () => ({ data: catalog, isLoading: false, isError: false, error: null }),
}))

describe("PermissionChecklist (FND-2)", () => {
	it("groups the permissions by module, one group per module", () => {
		const { container } = render(<PermissionChecklist value={[]} onChange={() => undefined} />)

		// One <fieldset> per module. (The ui Field wrapper around each checkbox
		// also has role="group", so query the fieldsets themselves.)
		const groups = Array.from(container.querySelectorAll("fieldset"))
		expect(groups.map(group => group.querySelector("legend")?.textContent)).toEqual([
			"users",
			"knowledge",
			"scam",
		])
		const knowledge = groups[1]
		expect(knowledge).toHaveTextContent("knowledge.articles.manage")
		expect(knowledge).toHaveTextContent("knowledge.articles.approve")
	})
})

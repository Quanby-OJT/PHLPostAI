/**
 * ADM-2: admin reset of a second factor. One transaction removes the authenticator app and
 * recovery codes, clears the enrolment flag, ends the user's sessions, and writes the audit row.
 */
import { RbacAdminService } from "./rbac-admin.service"

const updateSet = jest.fn()
const txDelete = jest.fn()
const txSelect = jest.fn()

const tx = {
	select: () => ({ from: () => ({ where: () => txSelect() }) }),
	delete: (table: unknown) => ({
		where: () => {
			txDelete(table)
			return Promise.resolve()
		},
	}),
	update: () => ({
		set: (values: unknown) => {
			updateSet(values)
			return { where: () => Promise.resolve() }
		},
	}),
}

// @orpc/server is ESM-only and this spec only needs the error class the service throws.
jest.mock("@orpc/server", () => ({
	ORPCError: class ORPCError extends Error {},
}))
// The service reads only these two values from contracts; the full contract tree is ESM-only.
jest.mock("@repo/contracts", () => ({ ADMIN_ROLE: "System Administrator", PERMISSION_NAMES: [] }))
jest.mock("@repo/auth", () => ({ sendStaffInvitation: jest.fn() }))
jest.mock("@/common/database/database.client", () => ({
	db: { transaction: (fn: (t: unknown) => unknown) => fn(tx) },
}))
jest.mock("@/common/rbac/rbac-cache.service", () => ({ RbacCacheService: class {} }))

describe("RbacAdminService.resetSecondFactor (ADM-2)", () => {
	it("removes the second factor, clears the flag, ends sessions and audits in one transaction", async () => {
		txSelect.mockResolvedValueOnce([{ id: "u1", twoFactorEnabled: true }])
		const writeAudit = jest.fn().mockResolvedValue(undefined)
		const service = new RbacAdminService({ clear: jest.fn() } as never, { writeAudit } as never)

		const result = await service.resetSecondFactor({ userId: "u1" }, "admin-1")

		expect(result).toEqual({ id: "u1", twoFactorEnabled: false })
		expect(txDelete).toHaveBeenCalledTimes(2)
		expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ twoFactorEnabled: false }))
		expect(writeAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				actorId: "admin-1",
				action: "users.mfa.reset",
				resourceId: "u1",
				before: { twoFactorEnabled: true },
				after: { twoFactorEnabled: false },
			}),
			tx
		)
	})
})

/**
 * ADM-1: staff endpoints refuse a caller who lacks the keys, with 403, and the denial is
 * audited. The probe class carries the same decorators as the RBAC controller's staff
 * endpoints, so this runs without the controller's ESM-only dependencies.
 */
import { ForbiddenException, type ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import type { ApiKeysService } from "@/common/apikeys/apikeys.service"
import type { AuditService } from "@/common/audit/audit.service"
import type { RbacService } from "@/common/rbac/rbac.service"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"

import { RbacGuard } from "./rbac.guard"

jest.mock("@/common/database/database.client", () => ({
	db: {},
}))

// The guard's constructor types are needed at runtime (Nest injection metadata), so mock
// the modules they come from, as rbac.guard.spec.ts does.
jest.mock("@/common/audit/audit.service", () => ({
	AuditService: class AuditService {},
}))

jest.mock("@/common/rbac/rbac.service", () => ({
	RbacService: class RbacService {},
}))

jest.mock("@/common/apikeys/apikeys.service", () => ({
	ApiKeysService: class ApiKeysService {},
}))

jest.mock("@/config/env.config", () => ({
	env: { NODE_ENV: "development" },
}))

jest.mock("better-auth/node", () => ({
	fromNodeHeaders: jest.fn(() => ({})),
}))

jest.mock("@repo/auth", () => ({
	getAuth: jest.fn(() => ({ api: { getSession: jest.fn().mockResolvedValue(null) } })),
}))

const ACCOUNTS = "users.accounts.manage"
const ROLES = "users.roles.manage"

/** Same decorators as RbacController's staff endpoints (rbac.controller.ts). */
class StaffProbe {
	@RequirePermissions(ACCOUNTS, ROLES)
	createUser() {}

	@RequirePermissions(ACCOUNTS, ROLES)
	assignRole() {}

	@RequirePermissions(ACCOUNTS, ROLES)
	removeRole() {}

	@RequirePermissions(ACCOUNTS)
	setDisabled() {}
}

const CALLER = "caller-1"

describe("ADM-1 staff endpoints: 403 and denial audit", () => {
	let held: Set<string>
	let rbacService: { hasAllPermissions: jest.Mock; getMissingPermissions: jest.Mock }
	let auditService: { writeAudit: jest.Mock }
	let guard: RbacGuard

	beforeEach(() => {
		held = new Set()
		rbacService = {
			hasAllPermissions: jest.fn(async (_userId: string, keys: string[]) =>
				keys.every(key => held.has(key))
			),
			getMissingPermissions: jest.fn(async (_userId: string, keys: string[]) =>
				keys.filter(key => !held.has(key))
			),
		}
		auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		const apiKeysService = { authenticate: jest.fn(), touch: jest.fn() }
		guard = new RbacGuard(
			new Reflector(),
			rbacService as unknown as RbacService,
			auditService as unknown as AuditService,
			apiKeysService as unknown as ApiKeysService
		)
	})

	const contextFor = (handler: keyof StaffProbe): ExecutionContext =>
		({
			getHandler: () => StaffProbe.prototype[handler],
			getClass: () => StaffProbe,
			switchToHttp: () => ({
				getRequest: () => ({
					session: { user: { id: CALLER } },
					headers: {},
					method: "POST",
					originalUrl: "/api/v1/rbac/users",
					ip: "203.0.113.7",
				}),
			}),
		}) as unknown as ExecutionContext

	it.each(["createUser", "assignRole", "removeRole"] as const)(
		"%s is refused with 403 and audited when the caller has only users.accounts.manage",
		async handler => {
			held.add(ACCOUNTS)

			await expect(guard.canActivate(contextFor(handler))).rejects.toBeInstanceOf(
				ForbiddenException
			)

			expect(auditService.writeAudit).toHaveBeenCalledTimes(1)
			expect(auditService.writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({
					actorId: CALLER,
					action: "rbac.denied",
					after: expect.objectContaining({
						outcome: "denied",
						requiredPermissions: [ACCOUNTS, ROLES],
						ip: "203.0.113.7",
					}),
				})
			)
		}
	)

	it("is refused with 403 and audited when the caller has neither key", async () => {
		await expect(guard.canActivate(contextFor("createUser"))).rejects.toBeInstanceOf(
			ForbiddenException
		)
		expect(auditService.writeAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: "rbac.denied" })
		)
	})

	it("lets the caller through when both keys are held", async () => {
		held.add(ACCOUNTS).add(ROLES)

		await expect(guard.canActivate(contextFor("createUser"))).resolves.toBe(true)
		expect(auditService.writeAudit).not.toHaveBeenCalled()
	})

	it("disable needs only users.accounts.manage", async () => {
		held.add(ACCOUNTS)

		await expect(guard.canActivate(contextFor("setDisabled"))).resolves.toBe(true)
		expect(auditService.writeAudit).not.toHaveBeenCalled()
	})
})

/**
 * ADM-1: the staff endpoints of the real RbacController refuse a caller who lacks the keys, with
 * 403, and the denial is audited. Unlike rbac.staff-denial.spec.ts, which copies the decorators
 * onto a probe class, this reads the decorators that RbacController actually declares, so a
 * change to the controller's keys fails here.
 *
 * The controller's HTTP plumbing (oRPC implement, the versioned contract, the session decorator)
 * is replaced with inert stand-ins. The guard and the decorator metadata are the real ones.
 */
import { ForbiddenException, type ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import type { ApiKeysService } from "@/common/apikeys/apikeys.service"
import type { AuditService } from "@/common/audit/audit.service"
import type { RbacService } from "@/common/rbac/rbac.service"
import { RbacGuard } from "@/shared/guards/rbac.guard"

import { RbacController } from "./rbac.controller"

// @thallesp/nestjs-better-auth ships ESM only, which this Jest setup cannot load. @Session()
// only hands the caller's session to the handler; the guard reads the session itself.
jest.mock("@thallesp/nestjs-better-auth", () => ({
	Session: () => () => undefined,
}))

jest.mock("@orpc/nest", () => ({
	Implement: () => () => undefined,
}))

jest.mock("@orpc/server", () => ({
	implement: jest.fn(() => ({ handler: jest.fn() })),
}))

// Any path under v1 (v1.rbac.users.create, ...) resolves to an inert object, so the decorators
// receive a value without loading the real contract.
jest.mock("@/config/api-versions.config", () => {
	const anything = (): unknown => new Proxy({}, { get: () => anything() })
	return { v1: new Proxy({}, { get: () => anything() }) }
})

jest.mock("./rbac-admin.service", () => ({
	RbacAdminService: class RbacAdminService {},
}))

jest.mock("@/common/database/database.client", () => ({
	db: {},
}))

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
const CALLER = "caller-1"
const IP = "203.0.113.7"

describe("ADM-1 RbacController staff endpoints (real decorators, real guard)", () => {
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
		guard = new RbacGuard(
			new Reflector(),
			rbacService as unknown as RbacService,
			auditService as unknown as AuditService,
			{} as unknown as ApiKeysService
		)
	})

	/** An execution context whose handler is the named method of the real controller class. */
	function contextFor(handler: keyof RbacController): ExecutionContext {
		return {
			getHandler: () => RbacController.prototype[handler] as () => unknown,
			getClass: () => RbacController,
			switchToHttp: () => ({
				getRequest: () => ({
					session: { user: { id: CALLER } },
					headers: {},
					method: "POST",
					originalUrl: `/api/v1/rbac/${String(handler)}`,
					ip: IP,
				}),
			}),
		} as unknown as ExecutionContext
	}

	describe("with only users.accounts.manage", () => {
		it.each(["createUser", "assignRole", "removeRole"] as const)(
			"%s is refused with 403 and the denial is audited",
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
							ip: IP,
						}),
					})
				)
			}
		)

		it("setUserDisabled is allowed, because deactivation needs only users.accounts.manage", async () => {
			held.add(ACCOUNTS)

			await expect(guard.canActivate(contextFor("setUserDisabled"))).resolves.toBe(true)
			expect(auditService.writeAudit).not.toHaveBeenCalled()
		})
	})

	describe("with only users.roles.manage", () => {
		it.each(["createUser", "assignRole", "removeRole"] as const)(
			"%s is refused with 403, because it also needs users.accounts.manage",
			async handler => {
				held.add(ROLES)

				await expect(guard.canActivate(contextFor(handler))).rejects.toBeInstanceOf(
					ForbiddenException
				)
				expect(auditService.writeAudit).toHaveBeenCalledWith(
					expect.objectContaining({
						action: "rbac.denied",
						after: expect.objectContaining({ requiredPermissions: [ACCOUNTS, ROLES] }),
					})
				)
			}
		)
	})

	describe("with no ADM-1 keys", () => {
		it("setUserDisabled is refused with 403 and audited", async () => {
			await expect(guard.canActivate(contextFor("setUserDisabled"))).rejects.toBeInstanceOf(
				ForbiddenException
			)
			expect(auditService.writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({ action: "rbac.denied" })
			)
		})
	})

	describe("with both keys", () => {
		it.each(["createUser", "assignRole", "removeRole"] as const)(
			"%s is allowed through and nothing is audited as denied",
			async handler => {
				held.add(ACCOUNTS).add(ROLES)

				await expect(guard.canActivate(contextFor(handler))).resolves.toBe(true)
				expect(auditService.writeAudit).not.toHaveBeenCalled()
			}
		)
	})
})

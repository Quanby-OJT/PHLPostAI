/**
 * ADM-1 integration proof: the staff-account rules hold against a real database.
 *
 *  - The last active System Administrator cannot be disabled or demoted.
 *  - Two concurrent changes cannot both remove the last administrator (row lock).
 *  - Disabling an account revokes its sessions and leaves its audit trail.
 *  - Creating an account assigns its roles and sends an invitation (mocked here).
 *  - Role changes are audited with the role sets before and after.
 *  - A failed cache invalidation rolls a role change back (see the cache tests below).
 *
 * DESTRUCTIVE: this spec resets the System Administrator role across every account in
 * the database it points at. It runs only when BOTH DATABASE_URL is set AND
 * ADM1_E2E_DISPOSABLE_DB=true, and only when that database is on localhost. If the flag
 * is set and the host is not local, the file fails to load instead of running. It never
 * runs against a shared, staging or hosted database.
 *
 * Requires a migrated and seeded database (`pnpm db:migrate && pnpm db:seed`).
 */
import "dotenv/config"

import { randomUUID } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"

import { ADMIN_ROLE } from "@repo/contracts"
import { accounts, auditLog, roles, sessions, userRoles, users } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { db } from "@/common/database/database.client"
import { RbacCacheService } from "@/common/rbac/rbac-cache.service"
import { RbacAdminService } from "@/modules/v1/rbac/rbac-admin.service"

// The modules below load ESM-only packages (@orpc/server, @t3-oss/env-core) that this
// Jest config cannot execute. The service needs only: the admin role name, an error
// class carrying a `code`, a drizzle handle on the real database, and Better Auth's
// invitation call. Everything else under test is the real code.
const mockSendStaffInvitation = jest.fn()
jest.mock("@repo/auth", () => ({
	sendStaffInvitation: (input: unknown) => mockSendStaffInvitation(input),
}))

jest.mock("@repo/contracts", () => ({
	ADMIN_ROLE: "System Administrator",
	PERMISSION_NAMES: [],
}))

jest.mock("@orpc/server", () => {
	class ORPCError extends Error {
		code: string
		constructor(code: string, options?: { message?: string }) {
			super(options?.message ?? code)
			this.code = code
			this.name = "ORPCError"
		}
	}
	return { ORPCError }
})

jest.mock("@/config/env.config", () => ({ env: {} }))

jest.mock("@/common/redis/redis.provider", () => ({ REDIS_CLIENT: Symbol("REDIS_CLIENT") }))

jest.mock("@/common/database/database.client", () => {
	const { drizzle } = require("drizzle-orm/node-postgres")
	const { schema } = require("@repo/db/schema")
	return { db: drizzle(process.env.DATABASE_URL as string, { schema }) }
})

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

function isLocalDatabaseUrl(url: string | undefined): boolean {
	if (!url) return false
	try {
		return LOCAL_HOSTNAMES.has(new URL(url).hostname)
	} catch {
		return false
	}
}

const destructiveRunRequested = process.env.ADM1_E2E_DISPOSABLE_DB === "true"
if (destructiveRunRequested && !isLocalDatabaseUrl(process.env.DATABASE_URL)) {
	// Loud failure: the flag says "disposable", but the database is not local.
	throw new Error(
		"ADM1_E2E_DISPOSABLE_DB=true requires DATABASE_URL to point at localhost. Refusing to reset administrators on a non-local database."
	)
}

const describeIfDb = process.env.DATABASE_URL && destructiveRunRequested ? describe : describe.skip

const ACTOR = "test-actor-not-in-scope"

describeIfDb("ADM-1 staff accounts and roles (integration)", () => {
	let service: RbacAdminService
	let adminRoleId: number
	const created: string[] = []
	/** Administrators present before the spec started; restored afterwards. */
	let originalAdminIds: string[] = []
	/** Set only once the snapshot exists, so afterAll never restores an empty list by mistake. */
	let adminsSnapshotTaken = false

	async function makeUser(label: string, roleNames: string[] = []): Promise<string> {
		const id = randomUUID()
		await db.insert(users).values({
			id,
			name: label,
			email: `${label}-${id.slice(0, 8)}@adm1.test`,
			emailVerified: true,
		})
		created.push(id)
		if (roleNames.length) {
			const rows = await db
				.select({ id: roles.id, name: roles.name })
				.from(roles)
				.where(inArray(roles.name, roleNames))
			await db.insert(userRoles).values(rows.map(r => ({ userId: id, roleId: r.id })))
		}
		return id
	}

	/** Make `activeIds` the only active System Administrators; every other holder loses the role. */
	async function setAdmins(activeIds: string[]) {
		await db.delete(userRoles).where(eq(userRoles.roleId, adminRoleId))
		if (activeIds.length) {
			await db.insert(userRoles).values(activeIds.map(userId => ({ userId, roleId: adminRoleId })))
		}
		// Make sure the fixture admins themselves are active.
		if (activeIds.length) {
			await db.update(users).set({ disabled: false }).where(inArray(users.id, activeIds))
		}
	}

	async function isDisabled(userId: string): Promise<boolean> {
		const [row] = await db
			.select({ disabled: users.disabled })
			.from(users)
			.where(eq(users.id, userId))
		return row!.disabled
	}

	async function rolesOf(userId: string): Promise<string[]> {
		const rows = await db
			.select({ name: roles.name })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(userRoles.userId, userId))
		return rows.map(r => r.name).sort()
	}

	async function auditFor(resourceId: string, action: string) {
		return db
			.select()
			.from(auditLog)
			.where(and(eq(auditLog.resourceId, resourceId), eq(auditLog.action, action)))
	}

	beforeAll(async () => {
		const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, ADMIN_ROLE))
		if (!row) throw new Error("System Administrator role missing: run the seed first")
		adminRoleId = row.id
		originalAdminIds = (
			await db
				.select({ userId: userRoles.userId })
				.from(userRoles)
				.where(eq(userRoles.roleId, adminRoleId))
		).map(r => r.userId)
		adminsSnapshotTaken = true
		service = new RbacAdminService(new RbacCacheService(null as never), new AuditService())
	})

	beforeEach(() => {
		mockSendStaffInvitation.mockReset().mockResolvedValue(undefined)
	})

	afterAll(async () => {
		try {
			if (created.length) {
				// Cascades remove user_roles and sessions. audit_log is append-only by design and keeps its rows.
				await db.delete(users).where(inArray(users.id, created))
			}
		} finally {
			// The tests reassign the administrator role. Put back exactly what was there
			// before, so the database is usable by the next run and by the app. Skipped when
			// beforeAll never reached the snapshot, because restoring an unknown list would
			// strip every administrator.
			if (adminsSnapshotTaken) {
				await setAdmins(originalAdminIds)
			}
		}
	})

	describe("last active System Administrator", () => {
		it("refuses to disable the last active administrator", async () => {
			const a = await makeUser("last-admin")
			await setAdmins([a])

			await expect(
				service.setUserDisabled({ userId: a, disabled: true }, ACTOR)
			).rejects.toMatchObject({ code: "FORBIDDEN" })

			expect(await isDisabled(a)).toBe(false)
			expect(await auditFor(a, "users.accounts.disable")).toHaveLength(0)
		})

		it("refuses to demote the last active administrator", async () => {
			const a = await makeUser("last-admin-demote")
			await setAdmins([a])

			await expect(
				service.removeUserRole({ userId: a, roleName: ADMIN_ROLE }, ACTOR)
			).rejects.toMatchObject({ code: "FORBIDDEN" })

			expect(await rolesOf(a)).toContain(ADMIN_ROLE)
			expect(await auditFor(a, "users.roles.remove")).toHaveLength(0)
		})

		it("allows disabling an administrator while another active one remains", async () => {
			const a = await makeUser("admin-one")
			const b = await makeUser("admin-two")
			await setAdmins([a, b])

			await expect(service.setUserDisabled({ userId: b, disabled: true }, ACTOR)).resolves.toEqual({
				id: b,
				disabled: true,
			})
			expect(await isDisabled(b)).toBe(true)
		})

		it("refuses the next change once only one active administrator is left", async () => {
			const a = await makeUser("chain-admin-one")
			const b = await makeUser("chain-admin-two")
			await setAdmins([a, b])

			await service.setUserDisabled({ userId: b, disabled: true }, ACTOR)

			await expect(
				service.setUserDisabled({ userId: a, disabled: true }, ACTOR)
			).rejects.toMatchObject({ code: "FORBIDDEN" })
			expect(await isDisabled(a)).toBe(false)
		})

		it("lets two concurrent changes race for the last administrator, and only one wins", async () => {
			const a = await makeUser("race-admin-one")
			const b = await makeUser("race-admin-two")
			await setAdmins([a, b])

			const results = await Promise.allSettled([
				service.setUserDisabled({ userId: a, disabled: true }, ACTOR),
				service.setUserDisabled({ userId: b, disabled: true }, ACTOR),
			])

			const fulfilled = results.filter(r => r.status === "fulfilled")
			const rejected = results.filter(r => r.status === "rejected") as PromiseRejectedResult[]
			expect(fulfilled).toHaveLength(1)
			expect(rejected).toHaveLength(1)
			expect(rejected[0]!.reason).toMatchObject({ code: "FORBIDDEN" })

			// Exactly one administrator is still active, so the guard never left the system without one.
			const stillActive = await db
				.select({ id: users.id })
				.from(users)
				.where(and(inArray(users.id, [a, b]), eq(users.disabled, false)))
			expect(stillActive).toHaveLength(1)
		})

		it("does not block removing a non-admin role from the sole administrator", async () => {
			const a = await makeUser("admin-with-extra", ["Scam Reviewer"])
			await setAdmins([a])

			await expect(
				service.removeUserRole({ userId: a, roleName: "Scam Reviewer" }, ACTOR)
			).resolves.toMatchObject({ success: true })
			expect(await rolesOf(a)).toEqual([ADMIN_ROLE])
		})

		it("does not block disabling an ordinary account when only one administrator exists", async () => {
			const a = await makeUser("sole-admin")
			const plain = await makeUser("plain-user", ["End User"])
			await setAdmins([a])

			await expect(
				service.setUserDisabled({ userId: plain, disabled: true }, ACTOR)
			).resolves.toMatchObject({
				disabled: true,
			})
		})
	})

	describe("deactivation", () => {
		it("revokes every live session and keeps the audit trail", async () => {
			const user = await makeUser("to-disable", ["End User"])
			await db.insert(sessions).values([
				{
					id: randomUUID(),
					token: randomUUID(),
					userId: user,
					expiresAt: new Date(Date.now() + 86_400_000),
				},
				{
					id: randomUUID(),
					token: randomUUID(),
					userId: user,
					expiresAt: new Date(Date.now() + 86_400_000),
				},
			])

			await service.setUserDisabled({ userId: user, disabled: true }, ACTOR)

			const live = await db
				.select({ id: sessions.id })
				.from(sessions)
				.where(eq(sessions.userId, user))
			expect(live).toHaveLength(0)
			expect(await isDisabled(user)).toBe(true)

			const entries = await auditFor(user, "users.accounts.disable")
			expect(entries).toHaveLength(1)
			expect(entries[0]).toMatchObject({
				actorId: ACTOR,
				actorType: "user",
				before: { disabled: false },
				after: { disabled: true },
			})
		})

		it("re-enables without touching the audit trail of the earlier disable", async () => {
			const user = await makeUser("to-reenable", ["End User"])
			await service.setUserDisabled({ userId: user, disabled: true }, ACTOR)
			await service.setUserDisabled({ userId: user, disabled: false }, ACTOR)

			expect(await isDisabled(user)).toBe(false)
			expect(await auditFor(user, "users.accounts.disable")).toHaveLength(1)
			expect(await auditFor(user, "users.accounts.enable")).toHaveLength(1)
		})
	})

	describe("account creation", () => {
		it("creates the account with exactly the chosen roles and no password", async () => {
			const email = `new-${randomUUID().slice(0, 8)}@adm1.test`
			const result = await service.createUser(
				{ name: "New Staff", email, roleNames: ["Customer Service Agent", "Scam Reviewer"] },
				ACTOR
			)
			created.push(result.id)

			expect(result).toMatchObject({ email, roles: ["Customer Service Agent", "Scam Reviewer"] })
			expect(await rolesOf(result.id)).toEqual(["Customer Service Agent", "Scam Reviewer"])

			// No credential row: nothing can sign in until the invitation link sets a password.
			const creds = await db.select().from(accounts).where(eq(accounts.userId, result.id))
			expect(creds).toHaveLength(0)

			expect(mockSendStaffInvitation).toHaveBeenCalledTimes(1)
			expect(mockSendStaffInvitation).toHaveBeenCalledWith({ userId: expect.any(String), email })

			const entries = await auditFor(result.id, "users.accounts.create")
			expect(entries).toHaveLength(1)
			expect(entries[0]!.after).toMatchObject({
				email,
				roles: ["Customer Service Agent", "Scam Reviewer"],
			})
		})

		it("removes the new account and audits the failure when the invitation email cannot be sent", async () => {
			mockSendStaffInvitation.mockRejectedValueOnce(new Error("smtp down"))
			const email = `invite-fail-${randomUUID().slice(0, 8)}@adm1.test`

			await expect(
				service.createUser({ name: "Invite Fail", email, roleNames: ["End User"] }, ACTOR)
			).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

			const found = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
			expect(found).toHaveLength(0)
			const failed = await db
				.select()
				.from(auditLog)
				.where(eq(auditLog.action, "users.accounts.invite_failed"))
			expect(failed.some(row => (row.after as { email?: string } | null)?.email === email)).toBe(
				true
			)
		})

		it("rejects an unknown role before creating anything", async () => {
			const email = `bad-role-${randomUUID().slice(0, 8)}@adm1.test`

			await expect(
				service.createUser({ name: "X", email, roleNames: ["No Such Role"] }, ACTOR)
			).rejects.toMatchObject({ code: "BAD_REQUEST" })

			const found = await db.select().from(users).where(eq(users.email, email))
			expect(found).toHaveLength(0)
			expect(mockSendStaffInvitation).not.toHaveBeenCalled()
		})

		it("rejects an email that already exists", async () => {
			const email = `dupe-${randomUUID().slice(0, 8)}@adm1.test`
			const first = await service.createUser(
				{ name: "First", email, roleNames: ["End User"] },
				ACTOR
			)
			created.push(first.id)

			await expect(
				service.createUser({ name: "Second", email, roleNames: ["End User"] }, ACTOR)
			).rejects.toMatchObject({ code: "CONFLICT" })
		})
	})

	describe("role changes", () => {
		it("audits assignment with the role sets before and after", async () => {
			const user = await makeUser("assignee", ["End User"])

			await service.assignUserRole({ userId: user, roleName: "Scam Reviewer" }, ACTOR)

			const entries = await auditFor(user, "users.roles.assign")
			expect(entries).toHaveLength(1)
			expect(entries[0]).toMatchObject({
				before: { roles: ["End User"] },
				after: { roles: ["End User", "Scam Reviewer"] },
			})
			expect(await rolesOf(user)).toEqual(["End User", "Scam Reviewer"])
		})

		it("audits removal with the role sets before and after", async () => {
			const user = await makeUser("remover", ["End User", "Scam Reviewer"])

			await service.removeUserRole({ userId: user, roleName: "Scam Reviewer" }, ACTOR)

			const entries = await auditFor(user, "users.roles.remove")
			expect(entries).toHaveLength(1)
			expect(entries[0]).toMatchObject({
				before: { roles: ["End User", "Scam Reviewer"] },
				after: { roles: ["End User"] },
			})
		})

		it("refuses to remove the only role of a staff account and changes nothing", async () => {
			const user = await makeUser("only-role", ["Scam Reviewer"])

			await expect(
				service.removeUserRole({ userId: user, roleName: "Scam Reviewer" }, ACTOR)
			).rejects.toMatchObject({ code: "BAD_REQUEST" })
			expect(await rolesOf(user)).toEqual(["Scam Reviewer"])
			expect(await auditFor(user, "users.roles.remove")).toHaveLength(0)
		})

		it("returns NOT_FOUND for an unknown role without changing anything", async () => {
			const user = await makeUser("no-role", ["End User"])

			await expect(
				service.assignUserRole({ userId: user, roleName: "Ghost Role" }, ACTOR)
			).rejects.toMatchObject({ code: "NOT_FOUND" })
			expect(await rolesOf(user)).toEqual(["End User"])
		})
	})

	describe("cache invalidation", () => {
		it("rolls the change back and fails the request when invalidation fails inside the transaction", async () => {
			const invalidate = jest.fn().mockRejectedValue(new Error("redis unreachable"))
			const degraded = new RbacAdminService(
				{ invalidate } as unknown as RbacCacheService,
				new AuditService()
			)
			const user = await makeUser("cache-fail", ["End User"])

			await expect(
				degraded.assignUserRole({ userId: user, roleName: "Scam Reviewer" }, ACTOR)
			).rejects.toThrow("redis unreachable")

			expect(await rolesOf(user)).toEqual(["End User"])
			expect(await auditFor(user, "users.roles.assign")).toHaveLength(0)
		})

		it("fails the request when only the post-commit invalidation fails, and the change stays saved", async () => {
			const invalidate = jest
				.fn()
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error("redis unreachable"))
			const degraded = new RbacAdminService(
				{ invalidate } as unknown as RbacCacheService,
				new AuditService()
			)
			const user = await makeUser("cache-late", ["End User"])

			await expect(
				degraded.assignUserRole({ userId: user, roleName: "Scam Reviewer" }, ACTOR)
			).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

			expect(invalidate).toHaveBeenCalledTimes(2)
			expect(await rolesOf(user)).toEqual(["End User", "Scam Reviewer"])
			expect(await auditFor(user, "users.roles.assign")).toHaveLength(1)
		})

		it("succeeds when invalidation succeeds", async () => {
			const user = await makeUser("cache-ok", ["End User", "Scam Reviewer"])

			const result = await service.removeUserRole(
				{ userId: user, roleName: "Scam Reviewer" },
				ACTOR
			)

			expect(result).toMatchObject({ success: true })
		})
	})
})

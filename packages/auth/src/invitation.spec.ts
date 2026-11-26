/**
 * ADM-1: an admin-provisioned staff account cannot sign in until its invitation link sets a
 * password, and then signs in with the roles it was given. This runs the real Better Auth
 * instance against a real database, so the set-password step is Better Auth's own reset route.
 *
 * DESTRUCTIVE to the database it points at: it inserts and deletes test users. It runs only when
 * ADM1_E2E_DISPOSABLE_DB=true AND DATABASE_URL is set to a localhost database, the same rule as
 * the backend integration spec. If the flag is set and the host is not local, the file fails to
 * load. Requires a migrated and seeded database (`pnpm db:migrate && pnpm db:seed`).
 */
import { randomUUID } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { accounts, roles, userRoles, users, verifications } from "@repo/db/schema"

const sendMailMock = vi.fn()

vi.mock("./mailer/send-mail.js", () => ({
	sendMail: (...args: unknown[]) => sendMailMock(...args),
}))

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

function isLocalDatabaseUrl(url: string | undefined): boolean {
	if (!url) return false
	try {
		return LOCAL_HOSTNAMES.has(new URL(url).hostname)
	} catch {
		return false
	}
}

const databaseUrl = process.env.DATABASE_URL
const destructiveRunRequested = process.env.ADM1_E2E_DISPOSABLE_DB === "true"
if (destructiveRunRequested && !isLocalDatabaseUrl(databaseUrl)) {
	throw new Error(
		"ADM1_E2E_DISPOSABLE_DB=true requires DATABASE_URL to point at localhost. Refusing to write test users to a non-local database."
	)
}

const describeIfDb = destructiveRunRequested && databaseUrl ? describe : describe.skip

const PASSWORD = "Invitation123!"
const NEW_PASSWORD = "Chosen-by-staff-1"

describeIfDb("ADM-1 invitation: set password, then sign in with assigned roles", () => {
	let auth: ReturnType<typeof import("./config.js").getAuth>
	let sendStaffInvitation: typeof import("./invitation.js").sendStaffInvitation
	let db: ReturnType<typeof import("@repo/db/client").createDBClient>
	const created: string[] = []

	beforeAll(async () => {
		vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-value-at-least-32-characters-long")
		vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3001")
		vi.stubEnv("DATABASE_URL", databaseUrl as string)
		vi.stubEnv("APP_WEB_URL", "http://localhost:3001")
		// Sign-in is rate limited; this spec signs in a handful of times and must not trip the limit.
		vi.stubEnv("AUTH_RATE_LIMIT_MAX", "1000")

		const config = await import("./config.js")
		auth = config.getAuth()
		const invitation = await import("./invitation.js")
		sendStaffInvitation = invitation.sendStaffInvitation
		const client = await import("@repo/db/client")
		db = client.createDBClient()
	})

	beforeEach(() => {
		sendMailMock.mockReset().mockResolvedValue(undefined)
	})

	afterAll(async () => {
		if (created.length) {
			// Cascades remove accounts and user_roles. Invitation tokens are not foreign-keyed to users,
			// so they are removed by their value (the user id) before the users go.
			await db.delete(verifications).where(inArray(verifications.value, created))
			await db.delete(users).where(inArray(users.id, created))
		}
		vi.unstubAllEnvs()
	})

	/**
	 * Mirrors what RbacAdminService.createUser writes: the user row and its roles, and no
	 * credential row. The backend spec covers the service itself; this spec covers what the
	 * person can do with the resulting account.
	 */
	async function createStaffAccount(roleNames: string[]) {
		const id = randomUUID()
		const email = `invite-${id.slice(0, 8)}@adm1.test`
		await db.insert(users).values({ id, name: "Invited Staff", email, emailVerified: true })
		created.push(id)
		const roleRows = await db
			.select({ id: roles.id, name: roles.name })
			.from(roles)
			.where(inArray(roles.name, roleNames))
		expect(roleRows).toHaveLength(roleNames.length)
		await db.insert(userRoles).values(roleRows.map(role => ({ userId: id, roleId: role.id })))
		return { id, email }
	}

	/** Sends the invitation through the real mailer path and returns the link's token. */
	async function sendInvitation(userId: string, email: string) {
		await sendStaffInvitation({ userId, email })
		expect(sendMailMock).toHaveBeenCalledTimes(1)
		const message = sendMailMock.mock.calls[0]![2] as { to: string; text: string }
		expect(message.to).toBe(email)
		const token = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(message.text)?.[1]
		expect(token).toBeTruthy()
		return token as string
	}

	async function roleNamesOf(userId: string): Promise<string[]> {
		const rows = await db
			.select({ name: roles.name })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(userRoles.userId, userId))
		return rows.map(row => row.name).sort()
	}

	async function credentialCount(userId: string): Promise<number> {
		const rows = await db
			.select({ id: accounts.id })
			.from(accounts)
			.where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
		return rows.length
	}

	it("cannot sign in before the invitation link sets a password", async () => {
		const staff = await createStaffAccount(["Customer Service Agent"])
		await sendInvitation(staff.id, staff.email)

		expect(await credentialCount(staff.id)).toBe(0)
		await expect(
			auth.api.signInEmail({ body: { email: staff.email, password: PASSWORD } })
		).rejects.toThrow()
	})

	it("signs in with exactly the assigned roles after the link sets the password", async () => {
		const staff = await createStaffAccount(["Customer Service Agent", "Scam Reviewer"])
		const token = await sendInvitation(staff.id, staff.email)

		const reset = await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } })
		expect(reset).toMatchObject({ status: true })
		expect(await credentialCount(staff.id)).toBe(1)

		const session = await auth.api.signInEmail({
			body: { email: staff.email, password: NEW_PASSWORD },
		})
		expect(session.user.id).toBe(staff.id)
		expect(session.token).toBeTruthy()
		expect(await roleNamesOf(staff.id)).toEqual(["Customer Service Agent", "Scam Reviewer"])
	})

	it("uses the invitation link once: a second use is refused", async () => {
		const staff = await createStaffAccount(["End User"])
		const token = await sendInvitation(staff.id, staff.email)

		await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } })
		await expect(
			auth.api.resetPassword({ body: { newPassword: "Another-one-2", token } })
		).rejects.toThrow()
	})

	it("keeps a disabled account from signing in even after it sets its password", async () => {
		const staff = await createStaffAccount(["End User"])
		const token = await sendInvitation(staff.id, staff.email)
		await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } })

		await db.update(users).set({ disabled: true }).where(eq(users.id, staff.id))

		await expect(
			auth.api.signInEmail({ body: { email: staff.email, password: NEW_PASSWORD } })
		).rejects.toThrow(/disabled/i)
	})

	it("gives the invitation link a seven-day lifetime", async () => {
		const staff = await createStaffAccount(["End User"])
		const before = Date.now()
		const token = await sendInvitation(staff.id, staff.email)

		const [row] = await db
			.select({ expiresAt: verifications.expiresAt })
			.from(verifications)
			.where(eq(verifications.identifier, `reset-password:${token}`))
		expect(row).toBeDefined()
		const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
		const lifetime = row!.expiresAt.getTime() - before
		expect(lifetime).toBeGreaterThanOrEqual(sevenDaysMs - 60_000)
		expect(lifetime).toBeLessThanOrEqual(sevenDaysMs + 60_000)
	})
})

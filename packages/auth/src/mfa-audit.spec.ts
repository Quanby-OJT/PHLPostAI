/**
 * ADM-2: the after-hook. Recovery-code sign-ins are audited through the registered sink, failed
 * requests are not audited, and confirming the authenticator app extends the session.
 */
import { APIError } from "better-auth/api"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createMfaAfterHook, MFA_RECOVERY_CODE_USED, setAuthAuditSink } from "./mfa-audit.js"

function fakeDb() {
	const where = vi.fn().mockResolvedValue(undefined)
	const set = vi.fn(() => ({ where }))
	const update = vi.fn(() => ({ set }))
	return { db: { update } as never, set }
}

describe("ADM-2 after hook", () => {
	afterEach(() => setAuthAuditSink(null))

	it("audits a successful recovery-code sign-in through the registered sink", async () => {
		const sink = vi.fn().mockResolvedValue(undefined)
		setAuthAuditSink(sink)
		const { db } = fakeDb()

		await createMfaAfterHook(db)({
			path: "/two-factor/verify-backup-code",
			context: { returned: { user: { id: "u1" } }, session: null },
		} as never)

		expect(sink).toHaveBeenCalledWith({
			actorId: "u1",
			actorType: "user",
			action: MFA_RECOVERY_CODE_USED,
			resourceType: "user",
			resourceId: "u1",
		})
	})

	it("does not audit a failed recovery-code attempt", async () => {
		const sink = vi.fn()
		setAuthAuditSink(sink)
		const { db } = fakeDb()

		await createMfaAfterHook(db)({
			path: "/two-factor/verify-backup-code",
			context: {
				returned: APIError.from("UNAUTHORIZED", { code: "INVALID_BACKUP_CODE", message: "invalid" } as never),
				session: null,
			},
		} as never)

		expect(sink).not.toHaveBeenCalled()
	})

	it("refuses to complete a recovery sign-in when no audit sink is registered", async () => {
		const { db } = fakeDb()

		await expect(
			createMfaAfterHook(db)({
				path: "/two-factor/verify-backup-code",
				context: { returned: { user: { id: "u1" } }, session: null },
			} as never)
		).rejects.toThrow(/audit/)
	})

	it("extends the current session once the authenticator app is confirmed", async () => {
		const { db, set } = fakeDb()

		await createMfaAfterHook(db)({
			path: "/two-factor/verify-totp",
			context: { returned: { status: true }, session: { session: { id: "s1" } } },
		} as never)

		expect(set).toHaveBeenCalledWith({ expiresAt: expect.any(Date) })
	})
})

import { APIError, createAuthMiddleware } from "better-auth/api"
import { eq, sql } from "drizzle-orm"

import type { createDBClient } from "@repo/db/client"
import { sessions } from "@repo/db/schema"

import { recordAuthAudit } from "./audit-sink.js"
import { MFA_ENROLMENT_SESSION_SECONDS, STAFF_SESSION_SECONDS } from "./mfa.js"

export { setAuthAuditSink, type AuthAuditEntry } from "./audit-sink.js"

/** Audit action for a successful recovery-code sign-in (ADM-2). */
export const MFA_RECOVERY_CODE_USED = "auth.mfa.recovery_code_used"

type DbClient = ReturnType<typeof createDBClient>

/**
 * ADM-2: Better Auth after-hook for the two-factor routes. It acts only on successful responses.
 *
 * - A successful recovery-code sign-in is audited. The plugin consumes the code, so it works once.
 * - When a signed-in account confirms its authenticator app, the current session is moved to the
 *   normal staff lifetime. Until then it keeps the short enrolment lifetime set in config.ts.
 */
export function createMfaAfterHook(db: DbClient) {
	return createAuthMiddleware(async ctx => {
		const returned: unknown = ctx.context.returned
		if (returned instanceof APIError) return

		if (ctx.path === "/two-factor/verify-backup-code") {
			const userId = (returned as { user?: { id?: unknown } } | undefined)?.user?.id
			if (typeof userId !== "string") return
			await recordAuthAudit({
				actorId: userId,
				actorType: "user",
				action: MFA_RECOVERY_CODE_USED,
				resourceType: "user",
				resourceId: userId,
			})
			return
		}

		if (ctx.path === "/two-factor/verify-totp") {
			const sessionId = (ctx.context.session as { session?: { id?: string } } | null | undefined)
				?.session?.id
			if (!sessionId) return
			await db
				.update(sessions)
				.set({ expiresAt: new Date(Date.now() + STAFF_SESSION_SECONDS * 1000) })
				.where(eq(sessions.id, sessionId))
		}

		// Better Auth renews a session on get-session and resets expiresAt to the full
		// 7-day lifetime, which would undo the 15-minute enrolment window above on the
		// first page load. For an account without a confirmed factor, cap the session at
		// 15 minutes from creation again. Enrolled sessions are not touched.
		if (ctx.path === "/get-session") {
			const result = returned as
				| { session?: { id?: string }; user?: { twoFactorEnabled?: boolean } }
				| null
				| undefined
			if (!result?.session?.id || !result.user || result.user.twoFactorEnabled === true) return
			await db
				.update(sessions)
				.set({
					expiresAt: sql`least(${sessions.expiresAt}, ${sessions.createdAt} + make_interval(secs => ${MFA_ENROLMENT_SESSION_SECONDS}))`,
				})
				.where(eq(sessions.id, result.session.id))
		}
	})
}

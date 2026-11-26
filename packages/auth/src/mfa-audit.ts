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
/** Name of the session cookie. Better Auth adds the `__Secure-` prefix over HTTPS. */
const SESSION_COOKIE = /^(__Secure-)?better-auth\.session_token=/

/** Minimal shape of the middleware context this file uses. */
type HookContext = { context: { responseHeaders?: Headers | null } }

/**
 * Sets Max-Age on the session cookie that the current request is writing, so the browser
 * expires the cookie at the same time as the server-side session. Better Auth writes the
 * cookie with the standard 7-day Max-Age, so this rewrite is needed.
 */
function setSessionCookieMaxAge(ctx: HookContext, seconds: number): void {
	const headers = ctx.context.responseHeaders
	if (!headers) return
	const cookies = headers.getSetCookie()
	const rewritten = cookies.map(c =>
		SESSION_COOKIE.test(c) ? c.replace(/Max-Age=\d+/i, `Max-Age=${Math.max(0, Math.floor(seconds))}`) : c
	)
	if (rewritten.every((c, i) => c === cookies[i])) return
	headers.delete("set-cookie")
	for (const c of rewritten) headers.append("set-cookie", c)
}

/**
 * Caps the session of an account without a confirmed factor at the enrolment lifetime, in the
 * database and in the cookie the client receives. Returns the capped expiry, or undefined.
 */
async function capEnrolmentSession(
	db: DbClient,
	ctx: HookContext,
	sessionId: string
): Promise<Date | undefined> {
	const [row] = await db
		.update(sessions)
		.set({
			expiresAt: sql`least(${sessions.expiresAt}, ${sessions.createdAt} + make_interval(secs => ${MFA_ENROLMENT_SESSION_SECONDS}))`,
		})
		.where(eq(sessions.id, sessionId))
		.returning({ expiresAt: sessions.expiresAt })
	if (!row) return undefined
	setSessionCookieMaxAge(ctx, (row.expiresAt.getTime() - Date.now()) / 1000)
	return row.expiresAt
}

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
			// Confirming the factor moves the session to the staff lifetime, so the cookie follows it.
			setSessionCookieMaxAge(ctx, STAFF_SESSION_SECONDS)
			return
		}

		// Sign-in with a password for an account without a confirmed factor. The session was
		// created by the session.create hook; this caps the cookie the response carries.
		if (ctx.path === "/sign-in/email") {
			const result = returned as
				| { token?: string; user?: { twoFactorEnabled?: boolean } }
				| null
				| undefined
			if (!result?.token || !result.user || result.user.twoFactorEnabled === true) return
			const [row] = await db
				.select({ id: sessions.id })
				.from(sessions)
				.where(eq(sessions.token, result.token))
				.limit(1)
			if (row) await capEnrolmentSession(db, ctx, row.id)
			return
		}

		// Better Auth renews a session on get-session and resets it to the full 7-day lifetime.
		// For an account without a confirmed factor, cap it again, and report the capped expiry
		// in the response body as well as the database and cookie.
		if (ctx.path === "/get-session") {
			const result = returned as
				| { session?: { id?: string; expiresAt?: Date }; user?: { twoFactorEnabled?: boolean } }
				| null
				| undefined
			if (!result?.session?.id || !result.user || result.user.twoFactorEnabled === true) return
			const expiresAt = await capEnrolmentSession(db, ctx, result.session.id)
			if (expiresAt) result.session.expiresAt = expiresAt
		}
	})
}

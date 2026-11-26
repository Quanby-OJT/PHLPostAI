import { createAuthMiddleware } from "better-auth/api"
import { twoFactor } from "better-auth/plugins"

/**
 * ADM-2: second factor for every staff account.
 *
 * Authenticator-app (TOTP) enrolment and challenge, plus single-use recovery codes, come from the
 * Better Auth two-factor plugin. Admin reset lives in the backend.
 */

/** Name shown in the authenticator app next to the account. */
export const MFA_ISSUER = "PHLPost"

/** Five consecutive wrong codes lock verification (ADM-2 acceptance criterion). */
export const MFA_MAX_FAILED_ATTEMPTS = 5

/** How long the lock lasts after the fifth wrong code: 15 minutes. */
export const MFA_LOCKOUT_SECONDS = 15 * 60

/** Lifetime of a session for an account that has not yet enrolled: 15 minutes. */
export const MFA_ENROLMENT_SESSION_SECONDS = 15 * 60

/** Normal staff session lifetime: 7 days. Must match the session expiresIn in config.ts. */
export const STAFF_SESSION_SECONDS = 60 * 60 * 24 * 7

/**
 * Routes where a second factor is checked. `trustDevice` must never be honoured on them.
 * `/two-factor/verify-otp` is listed although SMS and email codes are out of scope and no OTP
 * method is configured. If one is ever enabled, trustDevice stays refused on it too.
 */
export const MFA_VERIFY_PATHS: readonly string[] = [
	"/two-factor/verify-totp",
	"/two-factor/verify-backup-code",
	"/two-factor/verify-otp",
]

/**
 * ADM-2: trusted-device cookies would let a staff member skip the code on later sign-ins.
 * The ticket requires a valid code on every sign-in, so the flag is forced off here, on the
 * server, whatever the client sends. Registered as the `before` hook in config.ts.
 */
export const mfaTrustDeviceBlockHandler = createAuthMiddleware(async ctx => {
	if (!MFA_VERIFY_PATHS.includes(ctx.path)) return
	return {
		context: { body: { ...(ctx.body as Record<string, unknown> | undefined), trustDevice: false } },
	}
})

/**
 * Options passed to the two-factor plugin. Exported so the policy values can be checked directly.
 * Recovery codes are stored encrypted with the auth secret, and the plugin removes a code from the
 * stored list when it is used. Enrolment requires a verified code before the factor is active.
 */
export const MFA_PLUGIN_OPTIONS = {
	issuer: MFA_ISSUER,
	skipVerificationOnEnable: false,
	backupCodeOptions: { storeBackupCodes: "encrypted" },
	accountLockout: {
		enabled: true,
		maxFailedAttempts: MFA_MAX_FAILED_ATTEMPTS,
		durationSeconds: MFA_LOCKOUT_SECONDS,
	},
} as const

export function buildMfaPlugin() {
	return twoFactor(MFA_PLUGIN_OPTIONS)
}

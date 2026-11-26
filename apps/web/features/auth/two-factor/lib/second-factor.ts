/**
 * ADM-2: whether the signed-in account has confirmed an authenticator app. The backend
 * sets `twoFactorEnabled` on the user, and refuses API routes until it is true. The web
 * app reads the same flag to send the person to enrolment.
 *
 * The session type from @repo/auth does not expose the plugin's user field, so it is read
 * here through one narrow cast rather than at every call site.
 */
export function hasConfirmedSecondFactor(user: object): boolean {
	return (user as { twoFactorEnabled?: boolean }).twoFactorEnabled === true
}

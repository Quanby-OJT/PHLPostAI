import { SetMetadata, type ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { createHash } from "node:crypto"

export const SESSION_THROTTLE_KEY = "throttle:session-enabled"

const reflector = new Reflector()

/** Skip the `session` limiter unless the route opted in via @SessionThrottle(). */
export const skipSessionThrottle = (context: ExecutionContext): boolean => {
	const enabled = reflector.getAllAndOverride<boolean>(SESSION_THROTTLE_KEY, [
		context.getHandler(),
		context.getClass(),
	])
	return !enabled
}

/**
 * Tracker for the `session` limiter. Keys on a SHA-256 of x-customer-session
 * so the raw token never reaches Redis. No header (e.g. session start) falls
 * back to the address, the same value ThrottlerProxyGuard uses.
 */
export const sessionTracker = (req: Record<string, unknown>): string => {
	const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>
	const raw = headers["x-customer-session"]
	const token = Array.isArray(raw) ? raw[0] : raw
	if (token) {
		return `session:${createHash("sha256").update(token).digest("hex")}`
	}
	const ips = req.ips as string[] | undefined
	return `ip:${ips?.[ips.length - 1] ?? String(req.ip)}`
}

/** Opt a customer route into the per-session limiter. */
export const SessionThrottle = () => SetMetadata(SESSION_THROTTLE_KEY, true)

import {
	ForbiddenException,
	Injectable,
	type CanActivate,
	type ExecutionContext,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { resolveRequestSession, type RequestWithSession } from "./resolve-request-session"

/** Metadata key set by the library's public/anonymous decorators (see session-auth.guard.ts). */
const PUBLIC_KEY = "PUBLIC"

/**
 * ADM-2: server-side second-factor gate. A staff session whose account has not confirmed an
 * authenticator app may reach no API route. Enrolment itself runs on Better Auth's own
 * routes, which this guard does not cover, so the account can finish enrolling.
 *
 * Skipped for public routes, API-key requests (not staff sessions), and anonymous requests
 * (AuthGuard decides those). Runs before RbacGuard, so a 403 here is not a permission
 * denial and is not audited as one.
 */
@Injectable()
export class MfaEnrolmentGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (context.getType() !== "http") return true

		const handler = [context.getHandler(), context.getClass()]
		if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, handler)) return true

		const request = context
			.switchToHttp()
			.getRequest<RequestWithSession & { headers: Record<string, unknown> }>()
		if (typeof request.headers?.["x-api-key"] === "string") return true

		const session = await resolveRequestSession(request)
		const user = session?.user as { twoFactorEnabled?: boolean } | undefined
		if (!user || user.twoFactorEnabled === true) return true

		throw new ForbiddenException({
			code: "MFA_ENROLMENT_REQUIRED",
			message: "Set up an authenticator app before continuing.",
		})
	}
}

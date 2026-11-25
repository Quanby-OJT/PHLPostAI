import {
	ForbiddenException,
	Injectable,
	Logger,
	ServiceUnavailableException,
	type CanActivate,
	type ExecutionContext,
} from "@nestjs/common"
import type { Request } from "express"

import { AuditService } from "@/common/audit/audit.service"

import { ChannelsService, normalizeOrigin, WEB_WIDGET_CHANNEL } from "./channels.service"

/**
 * Requests with no Origin header (curl, server-side tools) are allowed.
 * A browser always sends Origin on a cross-origin POST, so this only lets
 * non-browser clients through, and those can fake the header anyway.
 * The rate limit is the real abuse control. Flip this if Ivy says to refuse.
 */
const ALLOW_MISSING_ORIGIN = true

/**
 * CHN-1: refuse customer-chat requests from origins not listed in
 * `channels.config.allowedOrigins` for `web-widget`, and record the refusal.
 */
@Injectable()
export class AllowedOriginGuard implements CanActivate {
	private readonly logger = new Logger(AllowedOriginGuard.name)

	constructor(
		private readonly channels: ChannelsService,
		private readonly audit: AuditService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<Request>()
		const origin = request.headers.origin

		if (!(await this.channels.isEnabled(WEB_WIDGET_CHANNEL))) {
			throw new ServiceUnavailableException("The assistant is unavailable")
		}
		if (!origin) return ALLOW_MISSING_ORIGIN

		const allowed = await this.channels.getAllowedOrigins(WEB_WIDGET_CHANNEL)
		if (allowed.includes(normalizeOrigin(origin))) return true

		try {
			await this.audit.writeAudit({
				actorId: null,
				actorType: "system",
				action: "customer.origin.refused",
				resourceType: "channel",
				resourceId: WEB_WIDGET_CHANNEL,
				after: { origin, path: request.path },
			})
		} catch (error) {
			this.logger.error(`Could not audit refused origin ${origin}`, error as Error)
		}

		throw new ForbiddenException("Origin not allowed")
	}
}

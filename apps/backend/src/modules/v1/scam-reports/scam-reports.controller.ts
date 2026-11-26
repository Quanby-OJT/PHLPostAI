import { Controller, Header, Headers, UnauthorizedException, UseGuards } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { SessionThrottle } from "@/shared/decorators/session-throttle.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { toORPCError } from "../corpus/rag-gateway.service"
import { AllowedOriginGuard } from "../customer/allowed-origin.guard"
import { CustomerSessionService } from "../customer/customer-session.service"
import { ScamReportsService } from "./scam-reports.service"

@Controller()
export class ScamReportsController {
	constructor(
		private readonly reports: ScamReportsService,
		private readonly sessions: CustomerSessionService
	) {}

	@AllowAnonymous()
	@StrictThrottle()
	@SessionThrottle()
	@UseGuards(AllowedOriginGuard)
	@Implement(v1.scamReports.create)
	async create(@Headers("x-customer-session") token: string | undefined) {
		return implement(v1.scamReports.create).handler(async ({ input }) => {
			const session = token ? await this.sessions.resolve(token) : null
			if (!session) toORPCError(new UnauthorizedException("Invalid or expired customer session"))
			return this.reports.create(input, session).catch(toORPCError)
		})
	}

	@RequirePermissions("scam.reports.view")
	@Header("Cache-Control", "no-store")
	@Implement(v1.scamReports.list)
	async list() {
		return implement(v1.scamReports.list).handler(({ input }) => this.reports.list(input.page))
	}

	@RequirePermissions("scam.reports.view")
	@Header("Cache-Control", "no-store")
	@Implement(v1.scamReports.detail)
	async detail() {
		return implement(v1.scamReports.detail).handler(({ input }) =>
			this.reports.detail(input.id).catch(toORPCError)
		)
	}

	@RequirePermissions("scam.reports.view", "scam.reports.validate")
	@StrictThrottle()
	@Implement(v1.scamReports.change)
	async change(@Session() session: UserSession) {
		return implement(v1.scamReports.change).handler(({ input }) =>
			this.reports.change(input, session.user.id).catch(toORPCError)
		)
	}
}

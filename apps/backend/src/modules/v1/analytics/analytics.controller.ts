import { Controller, Req, UnauthorizedException } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import type { Request } from "express"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"

import { AnalyticsDashboardService } from "./analytics-dashboard.service"
import { AnalyticsOverviewService } from "./analytics-overview.service"

type RequestWithSession = Request & { session?: { user?: { id?: string } } }

@Controller()
export class AnalyticsController {
	constructor(
		private readonly analyticsOverviewService: AnalyticsOverviewService,
		private readonly analyticsDashboardService: AnalyticsDashboardService
	) {}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.overview)
	async overview() {
		return implement(v1.analytics.overview).handler(async () =>
			this.analyticsOverviewService.getToday()
		)
	}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.dashboard)
	async dashboard() {
		return implement(v1.analytics.dashboard).handler(async ({ input }) =>
			this.analyticsDashboardService.getDashboard(input)
		)
	}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.getLayout)
	async getLayout(@Req() request: RequestWithSession) {
		return implement(v1.analytics.getLayout).handler(async () =>
			this.analyticsDashboardService.getLayout(this.requireUserId(request))
		)
	}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.saveLayout)
	async saveLayout(@Req() request: RequestWithSession) {
		return implement(v1.analytics.saveLayout).handler(async ({ input }) =>
			this.analyticsDashboardService.saveLayout(this.requireUserId(request), input)
		)
	}

	private requireUserId(request: RequestWithSession): string {
		const userId = request.session?.user?.id
		if (!userId) throw new UnauthorizedException("Authentication required")
		return userId
	}
}

import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"

import { AnalyticsOverviewService } from "./analytics-overview.service"
import { DeflectionKpiService } from "./deflection-kpi.service"

@Controller()
export class AnalyticsController {
	constructor(
		private readonly analyticsOverviewService: AnalyticsOverviewService,
		private readonly deflectionKpiService: DeflectionKpiService
	) {}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.overview)
	async overview() {
		return implement(v1.analytics.overview).handler(async () =>
			this.analyticsOverviewService.getToday()
		)
	}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.deflectionReport)
	async deflectionReport() {
		return implement(v1.analytics.deflectionReport).handler(async ({ input }) =>
			this.deflectionKpiService.report(input)
		)
	}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.deflectionDrilldown)
	async deflectionDrilldown() {
		return implement(v1.analytics.deflectionDrilldown).handler(async ({ input }) =>
			this.deflectionKpiService.drilldown(input)
		)
	}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.listKpiDefinitions)
	async listKpiDefinitions() {
		return implement(v1.analytics.listKpiDefinitions).handler(async () =>
			this.deflectionKpiService.listDefinitions()
		)
	}

	@RequirePermissions("analytics.kpi.manage")
	@Implement(v1.analytics.saveKpiDefinition)
	async saveKpiDefinition(@Session() session: UserSession) {
		return implement(v1.analytics.saveKpiDefinition).handler(async ({ input }) =>
			this.deflectionKpiService.approveVersion(input, { userId: session.user.id })
		)
	}
}

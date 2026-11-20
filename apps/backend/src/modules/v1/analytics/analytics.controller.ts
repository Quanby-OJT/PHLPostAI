import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"

import { AnalyticsOverviewService } from "./analytics-overview.service"

@Controller()
export class AnalyticsController {
	constructor(private readonly analyticsOverviewService: AnalyticsOverviewService) {}

	@RequirePermissions("analytics.dashboard.view")
	@Implement(v1.analytics.overview)
	async overview() {
		return implement(v1.analytics.overview).handler(async () =>
			this.analyticsOverviewService.getToday()
		)
	}
}

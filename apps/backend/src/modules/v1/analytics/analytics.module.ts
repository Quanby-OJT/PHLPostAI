import { Module } from "@nestjs/common"

import { RbacModule } from "@/common/rbac/rbac.module"

import { AnalyticsDashboardService } from "./analytics-dashboard.service"
import { AnalyticsOverviewService } from "./analytics-overview.service"
import { AnalyticsController } from "./analytics.controller"
import { DeflectionKpiService } from "./deflection-kpi.service"
import { EventService } from "./event.service"

@Module({
	imports: [RbacModule],
	controllers: [AnalyticsController],
	providers: [EventService, AnalyticsOverviewService, DeflectionKpiService],
	providers: [EventService, AnalyticsOverviewService, AnalyticsDashboardService],
	exports: [EventService],
})
export class AnalyticsModule {}

import { Module } from "@nestjs/common"

import { RbacModule } from "@/common/rbac/rbac.module"

import { AnalyticsOverviewService } from "./analytics-overview.service"
import { AnalyticsController } from "./analytics.controller"
import { EventService } from "./event.service"

@Module({
	imports: [RbacModule],
	controllers: [AnalyticsController],
	providers: [EventService, AnalyticsOverviewService],
	exports: [EventService],
})
export class AnalyticsModule {}

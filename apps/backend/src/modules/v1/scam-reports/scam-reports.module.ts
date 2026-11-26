import { Module } from "@nestjs/common"

import { AnalyticsModule } from "../analytics/analytics.module"
import { CustomerModule } from "../customer/customer.module"
import { EscalationsModule } from "../escalations/escalations.module"
import { ScamReportsController } from "./scam-reports.controller"
import { ScamReportsService } from "./scam-reports.service"

@Module({
	imports: [AnalyticsModule, CustomerModule, EscalationsModule],
	controllers: [ScamReportsController],
	providers: [ScamReportsService],
})
export class ScamReportsModule {}

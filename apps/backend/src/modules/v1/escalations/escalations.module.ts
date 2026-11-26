import { Module } from "@nestjs/common"

import { CustomerModule } from "@/modules/v1/customer/customer.module"

import { EscalationService } from "./escalation.service"
import { EscalationsController } from "./escalations.controller"

@Module({
	imports: [CustomerModule],
	controllers: [EscalationsController],
	providers: [EscalationService],
	exports: [EscalationService],
})
export class EscalationsModule {}

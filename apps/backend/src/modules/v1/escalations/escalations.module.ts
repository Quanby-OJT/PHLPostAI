import { Module } from "@nestjs/common"

import { CustomerModule } from "@/modules/v1/customer/customer.module"

import { EscalationsController } from "./escalations.controller"

@Module({
	imports: [CustomerModule],
	controllers: [EscalationsController],
})
export class EscalationsModule {}

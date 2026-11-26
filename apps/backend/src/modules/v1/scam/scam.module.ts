import { Module } from "@nestjs/common"

import { CustomerModule } from "../customer/customer.module"
import { ScamConfigurationService } from "./scam-configuration.service"
import { ScamController } from "./scam.controller"

@Module({
	imports: [CustomerModule],
	controllers: [ScamController],
	providers: [ScamConfigurationService],
})
export class ScamModule {}

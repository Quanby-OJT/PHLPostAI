import { Module } from "@nestjs/common"

import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"

import { RateLookupService } from "./rate-lookup.service"
import { RatesController } from "./rates.controller"
import { RatesRepository } from "./rates.repository"
import { RatesService } from "./rates.service"

/** Postal rates (KB-2). AuditService comes from the global AuditModule. */
@Module({
	controllers: [RatesController],
	providers: [RatesService, RatesRepository, RateLookupService, RagGatewayService],
	// CNV-1's chat pipeline calls the lookup tool for the `rates` category.
	exports: [RateLookupService],
})
export class RatesModule {}

import { Module } from "@nestjs/common"

import { AuditModule } from "@/common/audit/audit.module"
import { RbacModule } from "@/common/rbac/rbac.module"

import { AssistantModule } from "../assistant/assistant.module"
import { RagGatewayService } from "../corpus/rag-gateway.service"
import { CustomerModule } from "../customer/customer.module"
import { RatesModule } from "../rates/rates.module"
import { TrackingModule } from "../tracking/tracking.module"
import { AnswerQualityService } from "./answer-quality.service"
import { EvalGoldenService } from "./eval-golden.service"
import { EvalRunsService } from "./eval-runs.service"
import { EvalController } from "./eval.controller"

@Module({
	imports: [RbacModule, AuditModule, AssistantModule, CustomerModule, RatesModule, TrackingModule],
	controllers: [EvalController],
	providers: [EvalGoldenService, EvalRunsService, RagGatewayService, AnswerQualityService],
	// RP-3's quality report reads runs/baseline through this service.
	exports: [EvalRunsService],
})
export class EvalModule {}

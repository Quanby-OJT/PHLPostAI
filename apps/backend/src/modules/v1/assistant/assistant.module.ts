import { Module } from "@nestjs/common"

import { AuditModule } from "@/common/audit/audit.module"

import { AssistantController } from "./assistant.controller"
import { AssistantRepository } from "./assistant.repository"
import { AssistantService } from "./assistant.service"

@Module({
	imports: [AuditModule],
	controllers: [AssistantController],
	providers: [AssistantRepository, AssistantService],
	exports: [AssistantService],
})
export class AssistantModule {}

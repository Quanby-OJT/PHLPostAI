import { Module } from "@nestjs/common"

import { AuditModule } from "@/common/audit/audit.module"

import { AssistantController } from "./assistant.controller"
import { AssistantRepository } from "./assistant.repository"
import { AssistantService } from "./assistant.service"
import { AssistantSettingsRepository } from "./assistant-settings.repository"
import { AssistantSettingsService } from "./assistant-settings.service"

@Module({
	imports: [AuditModule],
	controllers: [AssistantController],
	providers: [
		AssistantRepository,
		AssistantService,
		AssistantSettingsRepository,
		AssistantSettingsService,
	],
	exports: [AssistantService, AssistantSettingsService],
})
export class AssistantModule {}

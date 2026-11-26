import { Module } from "@nestjs/common"

import { AuditModule } from "@/common/audit/audit.module"
import { RbacModule } from "@/common/rbac/rbac.module"

import { ConversationTranscriptsController } from "./conversation-transcripts.controller"
import { ConversationTranscriptsService } from "./conversation-transcripts.service"

@Module({
	imports: [RbacModule, AuditModule],
	controllers: [ConversationTranscriptsController],
	providers: [ConversationTranscriptsService],
})
export class ConversationTranscriptsModule {}

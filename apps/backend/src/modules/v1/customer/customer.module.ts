import { Module } from "@nestjs/common"

import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"
import { KnowledgeModule } from "@/modules/v1/knowledge/knowledge.module"

import { ConversationService } from "./conversation.service"
import { CustomerChatService } from "./customer-chat.service"
import { CustomerSessionService } from "./customer-session.service"
import { CustomerController } from "./customer.controller"

/**
 * Public customer chat (CNV-1). `KnowledgeModule` is imported for its
 * repository, so citations resolve to article titles without this module
 * querying the knowledge tables itself. AuditService comes from the global
 * AuditModule.
 *
 * `ConversationService` is exported because later epics write conversations
 * through it rather than touching the tables: ESC-1/ESC-2 (escalation and
 * agent replies) and CHN-3 (end-of-chat rating) all depend on it staying the
 * only writer.
 */
@Module({
	imports: [KnowledgeModule],
	controllers: [CustomerController],
	providers: [CustomerSessionService, ConversationService, CustomerChatService, RagGatewayService],
	exports: [ConversationService],
})
export class CustomerModule {}

import { Module } from "@nestjs/common"

import { RbacModule } from "@/common/rbac/rbac.module"
import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"

import { KnowledgeController } from "./knowledge.controller"
import { KnowledgeRepository } from "./knowledge.repository"
import { KnowledgeService } from "./knowledge.service"

/** Knowledge base (KB-1). AuditService comes from the global AuditModule. */
@Module({
	imports: [RbacModule],
	controllers: [KnowledgeController],
	providers: [KnowledgeService, KnowledgeRepository, RagGatewayService],
})
export class KnowledgeModule {}

import { Module } from "@nestjs/common"

import { AnalyticsModule } from "@/modules/v1/analytics/analytics.module"
import { AssistantModule } from "@/modules/v1/assistant/assistant.module"
import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"
import { KnowledgeModule } from "@/modules/v1/knowledge/knowledge.module"
import { RatesModule } from "@/modules/v1/rates/rates.module"
import { TrackingModule } from "@/modules/v1/tracking/tracking.module"

import { ChannelAdapterRegistry, WebWidgetChannelAdapter } from "../channels/channel-adapter"
import { AllowedOriginGuard } from "./allowed-origin.guard"
import { ChannelsService } from "./channels.service"
import { ConversationService } from "./conversation.service"
import { CustomerChatService } from "./customer-chat.service"
import { CustomerSessionService } from "./customer-session.service"
import { CustomerController } from "./customer.controller"
import { ScamAssessmentService } from "./scam-assessment.service"

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
 *
 * `ChannelsService` (CHN-1) backs the allowed-origin guard on the customer routes.
 */
@Module({
	imports: [KnowledgeModule, TrackingModule, AnalyticsModule, AssistantModule, RatesModule],
	controllers: [CustomerController],
	providers: [
		CustomerSessionService,
		ConversationService,
		CustomerChatService,
		RagGatewayService,
		ChannelsService,
		AllowedOriginGuard,
		ScamAssessmentService,
		{
			provide: ChannelAdapterRegistry,
			useFactory: () => {
				const registry = new ChannelAdapterRegistry()
				registry.register(new WebWidgetChannelAdapter())
				return registry
			},
		},
	],

	exports: [ConversationService, CustomerSessionService, ChannelsService, AllowedOriginGuard],
})
export class CustomerModule {}

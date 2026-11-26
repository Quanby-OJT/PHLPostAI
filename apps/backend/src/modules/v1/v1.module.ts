import { Module } from "@nestjs/common"

import { env } from "@/config/env.config"

import { AnalyticsModule } from "./analytics/analytics.module"
import { ApiKeysV1Module } from "./apikeys/apikeys.module"
import { AssistantModule } from "./assistant/assistant.module"
import { ChannelsModule } from "./channels/channels.module"
import { ChatModule } from "./chat/chat.module"
import { ConversationTranscriptsModule } from "./conversations/conversation-transcripts.module"
import { CorpusModule } from "./corpus/corpus.module"
import { CustomerModule } from "./customer/customer.module"
import { DiagnosticsModule } from "./diagnostics/diagnostics.module"
import { EscalationsModule } from "./escalations/escalations.module"
import { EvalModule } from "./eval/eval.module"
import { HealthModule } from "./health/health.module"
import { KnowledgeModule } from "./knowledge/knowledge.module"
import { MeModule } from "./me/me.module"
import { OpsModule } from "./ops/ops.module"
import { RatesModule } from "./rates/rates.module"
import { RbacAdminModule } from "./rbac/rbac.module"
import { ReportsModule } from "./reports/reports.module"
import { ScamReportsModule } from "./scam-reports/scam-reports.module"
import { ScamModule } from "./scam/scam.module"

@Module({
	imports: [
		AssistantModule,
		ApiKeysV1Module,
		AnalyticsModule,
		ChatModule,
		ConversationTranscriptsModule,
		ChannelsModule,
		CorpusModule,
		CustomerModule,
		EvalModule,
		EscalationsModule,
		HealthModule,
		KnowledgeModule,
		RatesModule,
		MeModule,
		OpsModule,
		ReportsModule,
		ScamReportsModule,
		ScamModule,
		RbacAdminModule,
		// Sentry diagnostics exist ONLY in development. Conditional import rather
		// than a runtime guard on the handler: the routes are then absent from the
		// router entirely (404), so there is no guard to misconfigure and no
		// deliberate-error endpoint sitting in a production build.
		...(env.NODE_ENV === "development" ? [DiagnosticsModule] : []),
	],
})
export class V1Module {}

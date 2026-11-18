import { Module } from "@nestjs/common"

import { env } from "@/config/env.config"

import { ApiKeysV1Module } from "./apikeys/apikeys.module"
import { ChatModule } from "./chat/chat.module"
import { CorpusModule } from "./corpus/corpus.module"
import { CustomerModule } from "./customer/customer.module"
import { DiagnosticsModule } from "./diagnostics/diagnostics.module"
import { EvalModule } from "./eval/eval.module"
import { HealthModule } from "./health/health.module"
import { KnowledgeModule } from "./knowledge/knowledge.module"
import { MeModule } from "./me/me.module"
import { OpsModule } from "./ops/ops.module"
import { ReportsModule } from "./reports/reports.module"
import { RbacAdminModule } from "./rbac/rbac.module"

@Module({
    imports: [
        ApiKeysV1Module,
        ChatModule,
        CorpusModule,
        CustomerModule,
        EvalModule,
        HealthModule,
        KnowledgeModule,
        MeModule,
        OpsModule,
        ReportsModule,
        RbacAdminModule,
        // Sentry diagnostics exist ONLY in development. Conditional import rather
        // than a runtime guard on the handler: the routes are then absent from the
        // router entirely (404), so there is no guard to misconfigure and no
        // deliberate-error endpoint sitting in a production build.
        ...(env.NODE_ENV === "development" ? [DiagnosticsModule] : []),
    ],
})
export class V1Module {}
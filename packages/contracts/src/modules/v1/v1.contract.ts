import { oc } from "@orpc/contract"

import { analyticsContract } from "./analytics/analytics.contract.js"
import { apiKeysContract } from "./apikeys/apikeys.contract.js"
import { chatContract } from "./chat/chat.contract.js"
import { corpusContract } from "./corpus/corpus.contract.js"
import { customerContract } from "./customer/customer.contract.js"
import { evalContract } from "./eval/eval.contract.js"
import { healthContract } from "./health/health.contract.js"
import { knowledgeContract } from "./knowledge/knowledge.contract.js"
import { meContract } from "./me/me.contract.js"
import { opsContract } from "./ops/ops.contract.js"
import { rbacContract } from "./rbac/rbac.contract.js"
import { reportsContract } from "./reports/reports.contract.js"

/**
 * V1 contract router (versioned paths: /v1/health, /v1/chat, etc.)
 * Assembles all v1 feature contracts and applies the /v1 prefix
 */
export const v1Contract = oc.prefix("/v1").router(
    oc.router({
        health: healthContract,
        me: meContract,
        rbac: rbacContract,
        corpus: corpusContract,
        chat: chatContract,
        apikeys: apiKeysContract,
        eval: evalContract,
        ops: opsContract,
        reports: reportsContract,
        analytics: analyticsContract,
        knowledge: knowledgeContract,
        customer: customerContract,
    })
)

export type V1Contract = typeof v1Contract

import { describe, expect, it } from "vitest"

import { ADMIN_ROLE, PERMISSION_NAMES, permissionModule, ROLE_NAMES } from "./rbac.catalog"

/**
 * FND-2: every key in the DOMAIN-MODEL.md §2 catalog must exist in
 * PERMISSION_NAMES (unknown keys fail closed, so a missing key silently
 * locks everyone out of a feature). This list is copied from the catalog
 * table; a ticket that adds a key adds it to DOMAIN-MODEL first, then here.
 */
const DOMAIN_MODEL_CATALOG = [
	"users.accounts.manage",
	"users.roles.manage",
	"audit.log.view",
	"audit.log.export",
	"corpus.documents.upload",
	"corpus.documents.read",
	"corpus.ingest.run",
	"corpus.chunks.inspect",
	"corpus.reembed.run",
	"chat.query.submit",
	"chat.history.read",
	"eval.golden.manage",
	"eval.runs.execute",
	"eval.gate.approve",
	"apikeys.keys.manage",
	"ops.dashboards.view",
	"ops.config.view",
	"reports.reports.view",
	"reports.reports.export",
	"reports.schedules.manage",
	"knowledge.articles.manage",
	"knowledge.articles.approve",
	"knowledge.rates.manage",
	"knowledge.gaps.view",
	"channels.channels.manage",
	"settings.assistant.manage",
	"settings.escalation.manage",
	"settings.retention.manage",
	"conversations.transcripts.view",
	"escalations.queue.view",
	"escalations.conversations.handle",
	"escalations.connectors.manage",
	"scam.indicators.manage",
	"scam.reports.view",
	"scam.reports.validate",
	"tracking.connectors.manage",
	"tracking.explanations.manage",
	"analytics.dashboard.view",
	"analytics.kpi.manage",
	"analytics.summaries.generate",
	"analytics.summaries.approve",
	"analytics.monitoring.view",
	"privacy.requests.manage",
	"privacy.exports.create",
]

const PHLPOST_ROLES = [
	"System Administrator",
	"Knowledge Manager",
	"Knowledge Approver",
	"Customer Service Agent",
	"Customer Service Supervisor",
	"Scam Reviewer",
	"Management Viewer",
	"Quality Analyst",
	"Data Protection Officer",
	"Auditor/Viewer",
]

describe("RBAC catalog (FND-2)", () => {
	it("contains every DOMAIN-MODEL catalog key", () => {
		const catalog = new Set<string>(PERMISSION_NAMES)
		const missing = DOMAIN_MODEL_CATALOG.filter(key => !catalog.has(key))
		expect(missing).toEqual([])
	})

	it("holds no key outside the DOMAIN-MODEL catalog", () => {
		const documented = new Set(DOMAIN_MODEL_CATALOG)
		expect(PERMISSION_NAMES.filter(key => !documented.has(key))).toEqual([])
	})

	it("has no duplicate keys and follows module.submodule.action", () => {
		expect(new Set(PERMISSION_NAMES).size).toBe(PERMISSION_NAMES.length)
		for (const key of PERMISSION_NAMES) {
			expect(key).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/)
		}
	})

	it("lists the ten PHLPost roles and keeps the two template roles", () => {
		expect(ROLE_NAMES).toEqual(expect.arrayContaining(PHLPOST_ROLES))
		expect(ROLE_NAMES).toEqual(expect.arrayContaining(["Developer/Integrator", "End User"]))
		expect(ROLE_NAMES).toHaveLength(12)
		expect(ROLE_NAMES).toContain(ADMIN_ROLE)
	})

	it("derives the module of a key from its first segment", () => {
		expect(permissionModule("knowledge.articles.approve")).toBe("knowledge")
		expect(permissionModule("scam.reports.validate")).toBe("scam")
	})
})

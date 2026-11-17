import { z } from "zod"

/**
 * RBAC catalog
 *
 * Shared role and permission constants, Zod enums, and inferred types.
 * Consumed by the backend RBAC guard, seed scripts, and the frontend.
 */

// ---------------------------------------------------------------------------
// Role names
// ---------------------------------------------------------------------------

/**
 * Canonical role names (DOMAIN-MODEL §2 "Seeded roles"). The first ten are the
 * PHLPost staff roles; `Developer/Integrator` and `End User` are template roles
 * kept for internal testing and API keys (FND-2 technical notes). Order is
 * significant for display only.
 */
export const ROLE_NAMES = [
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
	"Developer/Integrator",
	"End User",
] as const

/** Zod enum validating a role name. */
export const RoleNameSchema = z.enum(ROLE_NAMES)

/**
 * The super-role. The RBAC guard short-circuits and grants access when a
 * principal holds this role, regardless of the required permission.
 */
export const ADMIN_ROLE = "System Administrator" as const

/** A valid role name. */
export type RoleName = z.infer<typeof RoleNameSchema>

// ---------------------------------------------------------------------------
// Permission catalog
// ---------------------------------------------------------------------------

/**
 * Permission naming convention: `module.submodule.action` (DOMAIN-MODEL v1).
 *
 * Wildcard semantics: a granted key ending in `.*` matches every catalog key
 * under that dotted prefix. Matching is progressive: a granted `corpus.*` or
 * `corpus.documents.*` both satisfy a required `corpus.documents.upload`.
 * Wildcards are grant-side constructs only — required permissions are always
 * exact catalog keys, and unknown/non-catalog required keys fail closed.
 */
export const PERMISSION_NAMES = [
	// Users & roles
	"users.accounts.manage",
	"users.roles.manage",
	// Audit
	"audit.log.view",
	"audit.log.export",
	// Corpus / ingestion
	"corpus.documents.upload",
	"corpus.documents.read",
	"corpus.ingest.run",
	"corpus.chunks.inspect",
	"corpus.reembed.run",
	// Chat
	"chat.query.submit",
	"chat.history.read",
	// Evaluation
	"eval.golden.manage",
	"eval.runs.execute",
	"eval.gate.approve",
	// API keys
	"apikeys.keys.manage",
	// Ops
	"ops.dashboards.view",
	"ops.config.view",
	// Reports
	"reports.reports.view",
	"reports.reports.export",
	"reports.schedules.manage",
	// ── PHLPost modules (DOMAIN-MODEL §2 catalog, FND-2) ──────────────────────
	// Knowledge base
	"knowledge.articles.manage",
	"knowledge.articles.approve",
	"knowledge.rates.manage",
	"knowledge.gaps.view",
	// Channels
	"channels.channels.manage",
	// Assistant settings
	"settings.assistant.manage",
	"settings.escalation.manage",
	"settings.retention.manage",
	// Conversations
	"conversations.transcripts.view",
	// Escalations
	"escalations.queue.view",
	"escalations.conversations.handle",
	"escalations.connectors.manage",
	// Scam protection
	"scam.indicators.manage",
	"scam.reports.view",
	"scam.reports.validate",
	// Tracking
	"tracking.connectors.manage",
	"tracking.explanations.manage",
	// Analytics
	"analytics.dashboard.view",
	"analytics.kpi.manage",
	"analytics.summaries.generate",
	"analytics.summaries.approve",
	"analytics.monitoring.view",
	// Privacy
	"privacy.requests.manage",
	"privacy.exports.create",
] as const

/** Zod enum validating a permission name. */
export const PermissionNameSchema = z.enum(PERMISSION_NAMES)

/** A valid permission name. */
export type PermissionName = z.infer<typeof PermissionNameSchema>

/**
 * The module of a permission key: the first dotted segment
 * (`knowledge.articles.approve` -> `knowledge`). The roles screen groups its
 * permission checklist by this value.
 */
export function permissionModule(permission: string): string {
	return permission.split(".")[0] ?? permission
}

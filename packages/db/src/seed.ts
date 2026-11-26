/* eslint-disable no-console -- CLI entrypoint: stdout/stderr is this script's only UI. */
import "dotenv/config"

import { randomBytes, scryptSync } from "node:crypto"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import {
	ADMIN_ROLE,
	PERMISSION_NAMES,
	ROLE_NAMES,
	type PermissionName,
	type RoleName,
} from "@repo/contracts"

import { POSTAL_ID_TEMPLATES } from "./postal-id-templates.js"
import {
	accounts,
	permissions,
	rolePermissions,
	roles,
	schema,
	userRoles,
	users,
	inquiryCategories,
	knowledgeArticles,
	knowledgeArticleVersions,
} from "./schema.js"
import {
	ALLOW_REMOTE_SEED_ENV,
	assertSeedAllowed,
	FORCE_PASSWORD_FLAG,
	hasForcePasswordFlag,
	resolveSeedPassword,
	SeedRefusedError,
	shouldWritePassword,
} from "./seed-guard.js"

async function hashPassword(password: string): Promise<string> {
	const saltHex = randomBytes(16).toString("hex")
	const key = scryptSync(password.normalize("NFKC"), saltHex, 64, {
		N: 16384,
		r: 16,
		p: 1,
		maxmem: 128 * 16384 * 16 * 2,
	})

	return `${saltHex}:${key.toString("hex")}`
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	if (a.size !== b.size) return false
	for (const value of a) {
		if (!b.has(value)) return false
	}
	return true
}

async function seedDatabase() {
	const connectionString = process.env.DATABASE_URL

	if (!connectionString) {
		throw new Error("DATABASE_URL environment variable is not set")
	}

	// Refuse production (and any non-local database) BEFORE opening a pool
	// or writing a single row. Throws SeedRefusedError -> non-zero exit below.
	assertSeedAllowed({
		nodeEnv: process.env.NODE_ENV,
		databaseUrl: connectionString,
		allowRemote: process.env[ALLOW_REMOTE_SEED_ENV] === "true",
	})

	const forcePassword = hasForcePasswordFlag(process.argv.slice(2))
	const { password: seedPassword, generated: passwordWasGenerated } = resolveSeedPassword(
		process.env.SEED_ADMIN_PASSWORD
	)

	const pool = new Pool({ connectionString, max: 2 })
	const db = drizzle({ client: pool, schema })
	const now = new Date()
	const hashedSeedPassword = await hashPassword(seedPassword)

	const seedUsers: Array<typeof users.$inferInsert> = [
		{
			id: "seed-user-admin",
			name: "Admin User",
			email: "admin@turbo-template.local",
			emailVerified: true,
			image: null,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "seed-user-alex",
			name: "Alex Johnson",
			email: "alex@turbo-template.local",
			emailVerified: true,
			image: null,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "seed-user-sam",
			name: "Sam Rivera",
			email: "sam@turbo-template.local",
			emailVerified: false,
			image: null,
			createdAt: now,
			updatedAt: now,
		},
	]

	const seededUserIds = seedUsers.map(user => user.id)
	const seedCredentialAccounts: Array<typeof accounts.$inferInsert> = seedUsers.map(user => ({
		providerId: "credential",
		accountId: user.id,
		userId: user.id,
		password: hashedSeedPassword,
		createdAt: now,
		updatedAt: now,
	}))

	const roleDescriptions: Record<RoleName, string> = {
		"System Administrator": "Everything; full access via the role-name short-circuit",
		"Knowledge Manager":
			"Writes knowledge articles, rate tables and status explanations; reads knowledge gaps",
		"Knowledge Approver": "Reviews and approves knowledge article versions",
		"Customer Service Agent": "Works the escalation queue and handles live chats",
		"Customer Service Supervisor":
			"Agent work plus transcripts, escalation rules, the dashboard and reports",
		"Scam Reviewer": "Maintains scam indicators and validates scam reports",
		"Management Viewer": "Reads dashboards and reports; drafts and approves summaries",
		"Quality Analyst": "Runs evaluations and watches AI performance and KPI definitions",
		"Data Protection Officer":
			"Handles privacy requests, retention and exports; reads and exports the audit log",
		"Auditor/Viewer": "Read-only: audit trail, reports and the dashboard",
		"Developer/Integrator": "Template role for internal testing: provisions own API credentials",
		"End User": "Template role for internal testing: asks questions via chat",
	}

	const seedRoles: Array<typeof roles.$inferInsert> = ROLE_NAMES.map(name => ({
		name,
		description: roleDescriptions[name],
		createdAt: now,
		updatedAt: now,
	}))

	const permissionDescriptions: Record<PermissionName, string> = {
		"users.accounts.manage": "Create/disable users",
		"users.roles.manage": "Define roles, assign permissions",
		"audit.log.view": "Read audit trail",
		"audit.log.export": "Export the audit trail",
		"corpus.documents.upload": "Add sources to the corpus",
		"corpus.documents.read": "View corpus sources",
		"corpus.ingest.run": "Trigger ingestion/re-index jobs",
		"corpus.chunks.inspect": "View chunk-boundary inspection",
		"corpus.reembed.run": "Run shadow re-embedding cutover",
		"chat.query.submit": "Ask questions via /chat",
		"chat.history.read": "Read own conversation history",
		"eval.golden.manage": "Maintain golden set",
		"eval.runs.execute": "Run evaluations, view results",
		"eval.gate.approve": "Accept a new baseline / override gate",
		"apikeys.keys.manage": "Provision/revoke own API credentials",
		"ops.dashboards.view": "Quality/ops dashboards",
		"ops.config.view": "Read-only config review, secrets masked",
		"reports.reports.view": "View reports",
		"reports.reports.export": "Export reports",
		"reports.schedules.manage": "Schedule report generation",
		"knowledge.articles.manage": "Write, edit, submit and deactivate knowledge articles",
		"knowledge.articles.approve": "Approve or return knowledge article versions",
		"knowledge.rates.manage": "Maintain the postal rate table",
		"knowledge.gaps.view": "View knowledge gaps from unanswered questions",
		"channels.channels.manage": "Enable, disable and configure channels",
		"settings.assistant.manage": "Change assistant settings",
		"settings.escalation.manage": "Set escalation rules, business hours and holidays",
		"settings.retention.manage": "Set retention periods per data class",
		"conversations.transcripts.view": "Read conversation transcripts with their AI trace",
		"escalations.queue.view": "View the escalation queue",
		"escalations.conversations.handle": "Claim, reply to and close escalated chats",
		"escalations.connectors.manage": "Configure outbound helpdesk connectors",
		"scam.indicators.manage": "Maintain risk indicators and official contacts",
		"scam.reports.view": "View scam reports",
		"scam.reports.validate": "Set a finding on a scam report",
		"tracking.connectors.manage": "Configure tracking connectors",
		"tracking.explanations.manage": "Maintain status explanations",
		"analytics.dashboard.view": "View the management dashboard",
		"analytics.kpi.manage": "Maintain KPI definitions",
		"analytics.summaries.generate": "Generate AI-drafted management summaries",
		"analytics.summaries.approve": "Approve management summaries",
		"analytics.monitoring.view": "View AI performance monitoring",
		"privacy.requests.manage": "Handle privacy requests",
		"privacy.exports.create": "Create data export bundles",
	}

	const seedPermissions: Array<typeof permissions.$inferInsert> = PERMISSION_NAMES.map(name => ({
		name,
		description: permissionDescriptions[name],
		createdAt: now,
		updatedAt: now,
	}))

	/** Every catalog key under a module prefix (`scam` -> all `scam.*` keys). */
	const allIn = (module: string): PermissionName[] =>
		PERMISSION_NAMES.filter(name => name.startsWith(`${module}.`))

	const agentGrants: PermissionName[] = [
		"escalations.queue.view",
		"escalations.conversations.handle",
	]

	// Default grants per role (DOMAIN-MODEL §2 "Seeded roles"). System
	// Administrator is omitted: it holds everything through the ADMIN_ROLE
	// short-circuit. Wildcard grants in DOMAIN-MODEL (`scam.*`, `eval.*`,
	// `privacy.*`) are expanded to their concrete catalog keys, because the
	// `permissions` table and the roles screen only hold catalog keys; the
	// effective access is identical. Channels, connectors and
	// settings.assistant.manage stay with the System Administrator only.
	const rolePermissionNames: Partial<Record<RoleName, PermissionName[]>> = {
		"Knowledge Manager": [
			"knowledge.articles.manage",
			"knowledge.rates.manage",
			"knowledge.gaps.view",
			"tracking.explanations.manage",
			"corpus.documents.read",
		],
		"Knowledge Approver": [
			"knowledge.articles.approve",
			"knowledge.gaps.view",
			"corpus.documents.read",
		],
		"Customer Service Agent": agentGrants,
		"Customer Service Supervisor": [
			...agentGrants,
			"conversations.transcripts.view",
			"settings.escalation.manage",
			"analytics.dashboard.view",
			"reports.reports.view",
			"reports.reports.export",
		],
		"Scam Reviewer": allIn("scam"),
		"Management Viewer": [
			"analytics.dashboard.view",
			"analytics.summaries.generate",
			"analytics.summaries.approve",
			"reports.reports.view",
			"reports.reports.export",
		],
		"Quality Analyst": [
			...allIn("eval"),
			"analytics.monitoring.view",
			"analytics.kpi.manage",
			"conversations.transcripts.view",
			"ops.dashboards.view",
		],
		"Data Protection Officer": [
			...allIn("privacy"),
			"settings.retention.manage",
			"audit.log.view",
			"audit.log.export",
			"conversations.transcripts.view",
		],
		"Auditor/Viewer": ["audit.log.view", "reports.reports.view", "analytics.dashboard.view"],
		"Developer/Integrator": ["apikeys.keys.manage"],
		"End User": ["chat.query.submit", "chat.history.read"],
	}

	// The template's original default grants for roles whose defaults changed
	// in FND-2. A database seeded before FND-2 still holds these; when a role's
	// grants are EXACTLY this set, nobody has edited it, so it is safe to move
	// it to the new defaults. Any other set means an admin changed the role,
	// and the seed leaves it alone.
	const legacyTemplateGrants: Partial<Record<RoleName, PermissionName[]>> = {
		"Knowledge Manager": [
			"corpus.documents.upload",
			"corpus.documents.read",
			"corpus.ingest.run",
			"corpus.chunks.inspect",
			"corpus.reembed.run",
		],
		"Quality Analyst": [
			"eval.golden.manage",
			"eval.runs.execute",
			"eval.gate.approve",
			"ops.dashboards.view",
		],
		"Auditor/Viewer": [
			"audit.log.view",
			"reports.reports.view",
			"reports.reports.export",
			"ops.dashboards.view",
		],
	}

	// User id -> role name.
	const userRoleAssignments: Array<{ userId: string; roleName: RoleName }> = [
		{ userId: "seed-user-admin", roleName: ADMIN_ROLE },
		{ userId: "seed-user-alex", roleName: "End User" },
		{ userId: "seed-user-sam", roleName: "End User" },
	]

	let rolePermissionCount = 0
	let userRoleCount = 0
	let postalIdTemplateCount = 0
	let passwordsWritten = false

	try {
		await db.transaction(async tx => {
			for (const user of seedUsers) {
				await tx
					.insert(users)
					.values(user)
					.onConflictDoUpdate({
						target: users.id,
						set: {
							name: user.name,
							email: user.email,
							emailVerified: user.emailVerified,
							image: user.image,
							updatedAt: now,
						},
					})
			}

			// Re-running the seeder must NOT rotate credentials that already
			// exist — only an explicit --force-password does that. New accounts still
			// get the resolved password on the INSERT path.
			const existingCredentialRows = await tx
				.select({ accountId: accounts.accountId })
				.from(accounts)
				.where(
					and(eq(accounts.providerId, "credential"), inArray(accounts.accountId, seededUserIds))
				)
			const existingCredentialIds = new Set(existingCredentialRows.map(row => row.accountId))

			for (const account of seedCredentialAccounts) {
				const writePassword = shouldWritePassword({
					accountExists: existingCredentialIds.has(account.accountId),
					forcePassword,
				})

				await tx
					.insert(accounts)
					.values(account)
					.onConflictDoUpdate({
						target: [accounts.providerId, accounts.accountId],
						set: writePassword
							? { userId: account.userId, password: account.password, updatedAt: now }
							: { userId: account.userId, updatedAt: now },
					})

				if (writePassword) {
					passwordsWritten = true
				}
			}

			// Idempotent catalog sync (FND-2): roles and permissions are upserted by
			// name, never deleted and recreated, so re-running the seed creates no
			// duplicates and keeps every grant an admin made on the roles screen.
			const existingRoleNames = new Set(
				(await tx.select({ name: roles.name }).from(roles)).map(row => row.name)
			)

			for (const role of seedRoles) {
				await tx
					.insert(roles)
					.values(role)
					.onConflictDoUpdate({
						target: roles.name,
						set: { description: role.description, updatedAt: now },
					})
			}

			for (const permission of seedPermissions) {
				await tx
					.insert(permissions)
					.values(permission)
					.onConflictDoUpdate({
						target: permissions.name,
						set: { description: permission.description, updatedAt: now },
					})
			}

			// Keys that left the catalog can never be granted (unknown keys fail
			// closed), so drop them; their role grants go with them (FK cascade).
			await tx.delete(permissions).where(notInArray(permissions.name, [...PERMISSION_NAMES]))

			const roleRows = await tx.select().from(roles)
			const permissionRows = await tx.select().from(permissions)
			const roleIdByName = new Map<string, number>(roleRows.map(r => [r.name, r.id]))
			const permissionIdByName = new Map<string, number>(permissionRows.map(p => [p.name, p.id]))
			const permissionNameById = new Map<number, string>(permissionRows.map(p => [p.id, p.name]))

			const grantRows = await tx.select().from(rolePermissions)
			const grantedByRoleId = new Map<number, Set<string>>()
			for (const row of grantRows) {
				const name = permissionNameById.get(row.permissionId)
				if (name === undefined) continue
				const set = grantedByRoleId.get(row.roleId) ?? new Set<string>()
				set.add(name)
				grantedByRoleId.set(row.roleId, set)
			}

			for (const [roleName, defaults] of Object.entries(rolePermissionNames) as Array<
				[RoleName, PermissionName[]]
			>) {
				const roleId = roleIdByName.get(roleName)
				if (roleId === undefined) continue

				const current = grantedByRoleId.get(roleId) ?? new Set<string>()
				const isNewRole = !existingRoleNames.has(roleName)
				const legacy = legacyTemplateGrants[roleName]
				const isUntouchedLegacy =
					legacy !== undefined && sameSet(current, new Set<string>(legacy))

				// A role that already existed keeps its grants (an admin may have
				// changed them), except an untouched pre-FND-2 template default.
				if (!isNewRole && !isUntouchedLegacy) continue

				if (isUntouchedLegacy) {
					await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
				}
				for (const permName of defaults) {
					const permissionId = permissionIdByName.get(permName)
					if (permissionId === undefined) continue
					await tx.insert(rolePermissions).values({ roleId, permissionId }).onConflictDoNothing()
					rolePermissionCount += 1
				}
			}

			const seedUserRoles: Array<typeof userRoles.$inferInsert> = []
			for (const assignment of userRoleAssignments) {
				const roleId = roleIdByName.get(assignment.roleName)
				if (roleId === undefined) continue
				seedUserRoles.push({ userId: assignment.userId, roleId })
			}

			for (const row of seedUserRoles) {
				await tx.insert(userRoles).values(row).onConflictDoNothing()
			}
			userRoleCount = seedUserRoles.length
			for (const c of [
				{ code: "tracking", name: "Tracking", isEligible: true, isActive: true },
				{ code: "rates", name: "Rates", isEligible: true, isActive: true },
				{ code: "postal-id", name: "Postal ID", isEligible: true, isActive: true },
				{ code: "service-info", name: "Service Info", isEligible: true, isActive: true },
				{ code: "scam", name: "Scam Guidance", isEligible: true, isActive: true },
				{ code: "complaint", name: "Complaint", isEligible: false, isActive: true },
				{ code: "other", name: "Other", isEligible: false, isActive: true },
			]) {
				await tx.insert(inquiryCategories).values(c).onConflictDoNothing({ target: inquiryCategories.code })
			}

			// CNV-6: Postal ID article templates, as drafts only. A title that
			// already exists is left alone, so re-seeding never overwrites edits.
			const existingTitles = new Set(
				(
					await tx
						.select({ title: knowledgeArticles.title })
						.from(knowledgeArticles)
						.where(eq(knowledgeArticles.category, "postal-id"))
				).map(row => row.title)
			)
			for (const template of POSTAL_ID_TEMPLATES) {
				if (existingTitles.has(template.title)) continue
				const [article] = await tx
					.insert(knowledgeArticles)
					.values({ title: template.title, category: "postal-id", languages: ["en"] })
					.returning({ id: knowledgeArticles.id })
				if (!article) continue
				await tx.insert(knowledgeArticleVersions).values({
					articleId: article.id,
					version: 1,
					body: template.body,
					language: "en",
					status: "draft",
				})
				postalIdTemplateCount += 1
			}
		})

		// The password is printed ONLY when this run generated it AND actually
		// wrote it. An operator-supplied SEED_ADMIN_PASSWORD is never echoed, and
		// a preserved existing password is not ours to disclose.
		const credentialNote = !passwordsWritten
			? `Existing seed credentials left untouched (re-run with ${FORCE_PASSWORD_FLAG} to reset them).`
			: passwordWasGenerated
				? `Generated seed password (shown once, not stored anywhere): ${seedPassword}`
				: "Seed password taken from SEED_ADMIN_PASSWORD (not printed)."

		console.log(
			`Seeded ${seedUsers.length} users and ${seedCredentialAccounts.length} credential accounts.\n` +
				`RBAC: ${seedRoles.length} roles, ${seedPermissions.length} permissions, ${rolePermissionCount} default grants written (existing roles keep their grants), ${userRoleCount} user-role assignments.\n` +
				`Postal ID article templates: ${postalIdTemplateCount} new drafts (existing titles left untouched).\n${
					credentialNote
				}`
		)
	} finally {
		await pool.end()
	}
}

void seedDatabase().catch(error => {
	// A refusal is a deliberate outcome, not a crash: print the actionable
	// message without a stack trace, but still exit non-zero so CI/scripts stop.
	if (error instanceof SeedRefusedError) {
		console.error(error.message)
	} else {
		console.error("Database seeding failed.")
		console.error(error)
	}
	process.exitCode = 1
})

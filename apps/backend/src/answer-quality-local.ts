import "dotenv/config"

import { randomBytes, scryptSync } from "node:crypto"
import { eq } from "drizzle-orm"

import type { EvalRunItem } from "@repo/contracts"
import {
	accounts,
	chunks,
	documents,
	evalRuns,
	goldenItems,
	knowledgeArticles,
	knowledgeArticleVersions,
	permissions,
	rateBatches,
	rateEntries,
	rolePermissions,
	roles,
	userRoles,
	users,
} from "@repo/db/schema"

import { db } from "@/common/database/database.client"

import {
	draftQualitySet,
	qualityFixtureItems,
	qualityRateFixtures,
	qualitySourceFixtures,
} from "./modules/v1/eval/answer-quality-fixtures"
import { qualityBlockers, qualityMetrics } from "./modules/v1/eval/answer-quality-gate"

const accountsForQa = [
	{ id: "evl1-qa-a", email: "evl1.golden@example.test", permission: "eval.golden.manage" },
	{ id: "evl1-qa-b", email: "evl1.operator@example.test", permission: "eval.runs.execute" },
	{ id: "evl1-qa-c", email: "evl1.approver@example.test", permission: "eval.gate.approve" },
	{ id: "evl1-qa-d", email: "evl1.denied@example.test", permission: null },
] as const

function localGuard() {
	const target = new URL(process.env.DATABASE_URL ?? "")
	if (
		process.env.EVL1_MODE !== "evl1-local" ||
		process.env.NODE_ENV === "production" ||
		!["127.0.0.1", "localhost"].includes(target.hostname) ||
		target.pathname !== "/phlpost_evl1_qa"
	) {
		throw new Error("The local seed can only use the dedicated loopback EVL-1 QA database")
	}
}

async function seed() {
	const password = process.env.EVL1_QA_PASSWORD
	if (!password || password.length < 12)
		throw new Error("Set a local-only QA password of at least 12 characters")
	await db.transaction(async tx => {
		for (const member of accountsForQa) {
			const salt = randomBytes(16).toString("hex")
			const key = scryptSync(password.normalize("NFKC"), salt, 64, {
				N: 16384,
				r: 16,
				p: 1,
				maxmem: 128 * 16384 * 16 * 2,
			})
			await tx
				.insert(users)
				.values({ id: member.id, name: member.id, email: member.email, emailVerified: true })
				.onConflictDoNothing()
			await tx
				.insert(accounts)
				.values({
					id: member.id,
					accountId: member.id,
					userId: member.id,
					providerId: "credential",
					password: `${salt}:${key.toString("hex")}`,
				})
				.onConflictDoUpdate({
					target: [accounts.providerId, accounts.accountId],
					set: { password: `${salt}:${key.toString("hex")}` },
				})
			if (member.permission) {
				const roleName = `EVL-1 QA ${member.id.at(-1)?.toUpperCase()}`
				await tx.insert(roles).values({ name: roleName }).onConflictDoNothing()
				const [role] = await tx.select().from(roles).where(eq(roles.name, roleName))
				const [permission] = await tx
					.select()
					.from(permissions)
					.where(eq(permissions.name, member.permission))
				if (!role || !permission) throw new Error("Run the standard database seed first")
				await tx
					.insert(rolePermissions)
					.values({ roleId: role.id, permissionId: permission.id })
					.onConflictDoNothing()
				await tx
					.insert(userRoles)
					.values({ userId: member.id, roleId: role.id })
					.onConflictDoNothing()
			}
		}
		const rateBatchId = "00000000-0000-4000-8100-000000000001"
		const [batch] = await tx
			.insert(rateBatches)
			.values({
				id: rateBatchId,
				fileName: "synthetic-evl1-rates.csv",
				rowCount: qualityRateFixtures.length,
				status: "approved",
			})
			.onConflictDoNothing()
			.returning()
		if (batch)
			await tx.insert(rateEntries).values(
				qualityRateFixtures.map(entry => ({
					...entry,
					batchId: rateBatchId,
					status: "approved" as const,
				}))
			)
		for (const source of qualitySourceFixtures) {
			const suffix = String(source.index + 1).padStart(12, "0")
			const documentId = `00000000-0000-4000-8200-${suffix}`
			const articleId = `00000000-0000-4000-8400-${suffix}`
			const versionId = `00000000-0000-4000-8500-${suffix}`
			await tx
				.insert(documents)
				.values({
					id: documentId,
					sourceUri: `urn:evl1:synthetic:${source.index}`,
					docType: "text",
					contentHash: source.contentHash,
					status: "indexed",
				})
				.onConflictDoNothing()
			await tx
				.insert(knowledgeArticles)
				.values({
					id: articleId,
					title: `Synthetic EVL-1 reference ${source.index + 1}`,
					category: source.useCase,
					languages: ["en"],
				})
				.onConflictDoNothing()
			await tx
				.insert(knowledgeArticleVersions)
				.values({
					id: versionId,
					articleId,
					documentId,
					version: 1,
					body: source.content,
					language: "en",
					status: "approved",
					reviewNote: "Local simulated QA source",
				})
				.onConflictDoNothing()
			await tx
				.update(knowledgeArticles)
				.set({ currentVersionId: versionId })
				.where(eq(knowledgeArticles.id, articleId))
			const embedding = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0))
			await tx
				.insert(chunks)
				.values({
					documentId,
					content: source.content,
					contentHash: source.contentHash,
					chunkIndex: 0,
					embedding,
					embeddingModel: "text-embedding-3-large",
				})
				.onConflictDoNothing()
		}
		await tx
			.insert(goldenItems)
			.values(
				draftQualitySet().items.map((item, index) => ({
					...item,
					id: `00000000-0000-4000-8300-${String(index + 1).padStart(12, "0")}`,
					createdBy: accountsForQa[0].id,
				}))
			)
			.onConflictDoNothing()
	})
	console.log("Seeded four scoped accounts, 120 drafts, and isolated tool/source fixtures")
}

async function indexLiveFixtures() {
	const response = await fetch("https://api.openai.com/v1/embeddings", {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: "text-embedding-3-large",
			dimensions: 1536,
			input: qualitySourceFixtures.map(source => source.content),
		}),
		signal: AbortSignal.timeout(30000),
	})
	if (!response.ok)
		throw new Error(`Synthetic fixture embeddings failed with HTTP ${response.status}`)
	const payload = (await response.json()) as { data: { index: number; embedding: number[] }[] }
	await db.transaction(async tx => {
		for (const [index, source] of qualitySourceFixtures.entries()) {
			const result = payload.data.find(entry => entry.index === index)
			if (result?.embedding.length !== 1536)
				throw new Error("Provider omitted an expected embedding")
			await tx
				.update(chunks)
				.set({ embedding: result.embedding })
				.where(eq(chunks.contentHash, source.contentHash))
		}
	})
	console.log(
		`Indexed ${qualitySourceFixtures.length} synthetic references with the real embedding provider`
	)
}

async function simulations() {
	const candidates = {
		baseline: {},
		pass: {},
		regression: { regressed: true },
		tokens199: { tokens: 199 },
		tokens200: { tokens: 200 },
		tokens201: { tokens: 201 },
		missingTokens: { tokens: null },
		incomplete: { missing: true },
	}
	const created: Record<string, string> = {}
	for (const [name, overrides] of Object.entries(candidates)) {
		const items = qualityFixtureItems().map((item, index): EvalRunItem => {
			if (!item.answerQuality) throw new Error("Invalid quality fixture")
			return {
				goldenItemId: item.id,
				question: item.question,
				skipped: false,
				answer: item.idealAnswer,
				quality: {
					expected: item.answerQuality,
					actualBehavior: item.answerQuality.expectedBehavior,
					actualLanguage: item.answerQuality.language,
					actualRoute: item.answerQuality.useCase,
					idealAnswer: item.idealAnswer,
					expectedHashes: item.expectedChunkHashes,
					approvalReference: item.approvalReference,
					externalApprover: null,
					approvedAt: null,
					providerOutputTokens: null,
					visibleOutputTokens: index === 0 && "tokens" in overrides ? overrides.tokens : 30,
					tokenizer: "controlled gate input",
					toolResult: item.answerQuality.expectedTool ?? null,
					grounded: "regressed" in overrides ? index !== 60 : index !== 0 && index !== 30,
					behaviorCorrect: true,
					languageCorrect: true,
					judgeReason: "Gate simulation only",
					error: null,
				},
			}
		})
		if ("missing" in overrides) items.splice(90)
		const config = {
			profile: "evl1-local",
			compatibility: "controlled-gate-fixture-v1",
			simulation: name,
			itemCount: 120,
		}
		const [row] = await db
			.insert(evalRuns)
			.values({
				kind: "generation",
				status: "completed",
				gitSha: "gate-simulation",
				config,
				perItem: items,
				metrics: qualityMetrics(items),
				triggeredBy: "evl1-local-simulation",
				finishedAt: new Date(),
			})
			.returning()
		if (!row) throw new Error("Could not persist the gate simulation")
		await db
			.update(evalRuns)
			.set({ config: { ...config, gateIssues: qualityBlockers({ ...row, perItem: items }) } })
			.where(eq(evalRuns.id, row.id))
		created[name] = row.id
	}
	console.log(JSON.stringify(created))
}

void (async () => {
	localGuard()
	if (process.argv[2] === "seed") await seed()
	else if (process.argv[2] === "index-live") await indexLiveFixtures()
	else if (process.argv[2] === "simulations") await simulations()
	else throw new Error("Use seed, index-live, or simulations")
})()
	.catch(error => {
		console.error(error)
		process.exitCode = 1
	})
	.finally(() => db.$client.end())

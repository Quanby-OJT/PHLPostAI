import { Injectable, Logger } from "@nestjs/common"
import { createHash, randomUUID } from "node:crypto"
import { ORPCError } from "@orpc/server"
import { and, asc, eq, inArray } from "drizzle-orm"

import { EvalLanguageSchema, GoldenAnswerQualitySchema, type EvalRunItem } from "@repo/contracts"
import {
	chunks,
	evalRuns,
	goldenItems,
	knowledgeArticles,
	knowledgeArticleVersions,
	rateEntries,
	statusExplanations,
} from "@repo/db/schema"

import { db } from "@/common/database/database.client"
import { env } from "@/config/env.config"

import { AssistantSettingsService } from "../assistant/assistant-settings.service"
import { RagGatewayService } from "../corpus/rag-gateway.service"
import { CustomerChatService, type RagAnswerEnvelope } from "../customer/customer-chat.service"
import { ragLanguageFields, withLanguageNotice } from "../customer/customer-language"
import { RateLookupService } from "../rates/rate-lookup.service"
import { MOCK_RECORDS } from "../tracking/connectors/mock/mock.records"
import { TrackingService } from "../tracking/tracking.service"
import { qualityFixtureItems } from "./answer-quality-fixtures"
import {
	qualityBlockers,
	qualityCoverageBlockers,
	qualityMetrics,
	qualityTokenCap,
} from "./answer-quality-gate"
import { EvalRunsService } from "./eval-runs.service"

type Profile = "evl1" | "evl1-local"
type Evidence = NonNullable<EvalRunItem["quality"]>
type GoldenRow = Pick<
	typeof goldenItems.$inferSelect,
	| "id"
	| "question"
	| "idealAnswer"
	| "expectedChunkHashes"
	| "answerQuality"
	| "approvalReference"
	| "externalApprover"
	| "approvedAt"
>
type Settings = Awaited<ReturnType<AssistantSettingsService["get"]>>
const workflowVersion = "evl1-2"
const customerPermissions = ["chat.query.submit", "corpus.read", "eval.runs.execute"] as const

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function tokenCount(value: unknown): number | null {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
}

@Injectable()
export class AnswerQualityService {
	private readonly logger = new Logger(AnswerQualityService.name)

	constructor(
		private readonly settingsService: AssistantSettingsService,
		private readonly chat: CustomerChatService,
		private readonly rag: RagGatewayService,
		private readonly tracking: TrackingService,
		private readonly rates: RateLookupService,
		private readonly runs: EvalRunsService
	) {}

	async execute(profile: Profile, userId: string, background = true) {
		if (process.env.EVL1_MODE !== profile || env.TRACKING_CONNECTOR !== "mock") {
			throw new ORPCError("CONFLICT", {
				message:
					"EVL-1 requires an explicitly configured evaluation sandbox with the mock tracking connector",
			})
		}
		if (profile === "evl1-local") {
			const target = new URL(env.DATABASE_URL)
			if (
				env.NODE_ENV === "production" ||
				!["127.0.0.1", "localhost"].includes(target.hostname) ||
				target.pathname !== "/phlpost_evl1_qa"
			) {
				throw new ORPCError("CONFLICT", {
					message: "Simulated approvals require the isolated local EVL-1 database",
				})
			}
		}
		const rows: GoldenRow[] =
			profile === "evl1-local"
				? qualityFixtureItems()
				: (
						await db
							.select()
							.from(goldenItems)
							.where(eq(goldenItems.status, "active"))
							.orderBy(asc(goldenItems.id))
					)
						.filter(
							item =>
								item.approvalReference &&
								item.externalApprover &&
								item.approvedAt &&
								item.answerQuality
						)
						.map(
							({
								id,
								question,
								idealAnswer,
								expectedChunkHashes,
								answerQuality,
								approvalReference,
								externalApprover,
								approvedAt,
							}) => ({
								id,
								question,
								idealAnswer,
								expectedChunkHashes,
								answerQuality,
								approvalReference,
								externalApprover,
								approvedAt,
							})
						)
		const settings = await this.settingsService.get()
		const environment =
			profile === "evl1" && rows.length ? await this.releaseEnvironment(userId) : null
		const execution =
			process.env.EVL1_EXECUTION_LABEL ??
			(profile === "evl1" ? "approved-evaluation" : "offline-provider")
		const config = {
			profile,
			workflowVersion,
			settings,
			execution,
			itemCount: rows.length,
			environment,
			compatibility: createHash("sha256")
				.update(JSON.stringify({ rows, settings, workflowVersion, execution, environment }))
				.digest("hex"),
		}
		const [run] = await db
			.insert(evalRuns)
			.values({
				kind: "generation",
				status: "running",
				gitSha: process.env.GIT_SHA ?? "local-working-tree",
				config,
				triggeredBy: userId,
			})
			.returning({ id: evalRuns.id })
		if (!run) throw new ORPCError("INTERNAL_SERVER_ERROR")
		const work = this.finish(run.id, rows, settings, userId).catch(async (error: unknown) => {
			this.logger.error("EVL-1 could not complete the run", error)
			await db
				.update(evalRuns)
				.set({
					status: "failed",
					error: "Evaluation could not complete every item",
					finishedAt: new Date(),
				})
				.where(eq(evalRuns.id, run.id))
		})
		if (background)
			void work.catch(error => this.logger.error("EVL-1 run could not be finalized", error))
		else await work
		return this.runs.get(run.id)
	}

	private async releaseEnvironment(userId: string) {
		const requestId = randomUUID()
		const [response, rates, explanations] = await Promise.all([
			this.rag.fetchConfig({
				userId,
				permissions: ["eval.runs.execute"],
				requestId,
				traceId: requestId,
			}),
			db
				.select({
					service: rateEntries.serviceCode,
					name: rateEntries.serviceName,
					zone: rateEntries.zone,
					min: rateEntries.weightMinG,
					max: rateEntries.weightMaxG,
					amount: rateEntries.priceCentavos,
					from: rateEntries.effectiveFrom,
					until: rateEntries.effectiveTo,
				})
				.from(rateEntries)
				.where(eq(rateEntries.status, "approved")),
			db
				.select({
					code: statusExplanations.statusCode,
					language: statusExplanations.language,
					explanation: statusExplanations.explanation,
					nextSteps: statusExplanations.nextSteps,
				})
				.from(statusExplanations)
				.where(eq(statusExplanations.isActive, true)),
		])
		const groups = object(object(response).groups)
		const ragSettings = Object.fromEntries(
			["profile", "embedding", "generation", "routing", "retrieval"].map(group => {
				const entries = groups[group]
				if (!Array.isArray(entries) || !entries.length)
					throw new ORPCError("CONFLICT", {
						message: "RAG evaluation configuration is unavailable",
					})
				return [
					group,
					entries
						.map(object)
						.filter(entry => entry.secret === false)
						.map(entry => ({
							key: entry.key,
							value: entry.value,
						})),
				]
			})
		)
		const toolFingerprint = createHash("sha256")
			.update(
				JSON.stringify({
					rates: rates.map(row => JSON.stringify(row)).sort(),
					explanations: explanations.map(row => JSON.stringify(row)).sort(),
					tracking: MOCK_RECORDS,
				})
			)
			.digest("hex")
		return { ragSettings, toolFingerprint }
	}

	private async finish(id: string, rows: GoldenRow[], settings: Settings, userId: string) {
		const evidence: EvalRunItem[] = []
		const hashes = [...new Set(rows.flatMap(row => row.expectedChunkHashes))]
		const available = new Set(
			hashes.length
				? (
						await db
							.select({ hash: chunks.contentHash })
							.from(chunks)
							.innerJoin(
								knowledgeArticleVersions,
								eq(chunks.documentId, knowledgeArticleVersions.documentId)
							)
							.innerJoin(
								knowledgeArticles,
								eq(knowledgeArticleVersions.articleId, knowledgeArticles.id)
							)
							.where(
								and(
									inArray(chunks.contentHash, hashes),
									eq(knowledgeArticleVersions.status, "approved"),
									eq(knowledgeArticles.status, "active")
								)
							)
					).map(chunk => chunk.hash)
				: []
		)
		for (let index = 0; index < rows.length; index += 4) {
			evidence.push(
				...(await Promise.all(
					rows.slice(index, index + 4).map(row => this.evaluate(row, settings, userId, available))
				))
			)
			if (index % 20 === 16) {
				await db.update(evalRuns).set({ perItem: evidence }).where(eq(evalRuns.id, id))
			}
		}
		const firstError = evidence.find(item => item.quality?.error)?.quality?.error
		const metrics = qualityMetrics(evidence)
		const error =
			rows.length === 0
				? "No eligible approved golden items"
				: (firstError ?? qualityCoverageBlockers(metrics)[0])
		const status = error ? "failed" : "completed"
		const run = await this.runs.get(id)
		const issues = qualityBlockers({ ...run, status, perItem: evidence })
		await db
			.update(evalRuns)
			.set({
				status,
				metrics,
				perItem: evidence,
				error: error ?? null,
				config: { ...run.config, gateIssues: issues },
				finishedAt: new Date(),
			})
			.where(eq(evalRuns.id, id))
	}

	private async evaluate(
		row: GoldenRow,
		settings: Settings,
		userId: string,
		available: Set<string>
	): Promise<EvalRunItem> {
		const expected = GoldenAnswerQualitySchema.parse(row.answerQuality)
		const requestId = randomUUID()
		const quality: Evidence = {
			expected,
			idealAnswer: row.idealAnswer,
			approvalReference: row.approvalReference ?? "",
			externalApprover: row.externalApprover,
			approvedAt: row.approvedAt?.toISOString() ?? null,
			expectedHashes: row.expectedChunkHashes,
			actualBehavior: null,
			actualRoute: null,
			actualLanguage: null,
			toolResult: null,
			providerOutputTokens: null,
			visibleOutputTokens: null,
			tokenizer: null,
			grounded: null,
			behaviorCorrect: null,
			languageCorrect: null,
			judgeReason: null,
			traceId: requestId,
			error: null,
		}
		const result: EvalRunItem = {
			goldenItemId: row.id,
			question: row.question,
			skipped: false,
			quality,
		}
		try {
			const stale = row.expectedChunkHashes.filter(hash => !available.has(hash))
			if (stale.length) {
				result.staleHashes = stale
				throw new Error("Expected source is missing or stale")
			}
			const principal = `evl1:${userId}`
			const context = { principal, permissions: customerPermissions, correlationId: requestId }
			const classification = await this.chat.classify({
				query: row.question,
				...context,
				sessionLanguage: "en",
			})
			quality.actualRoute = classification.route
			const evidence: Record<string, unknown> = {}
			if (classification.route === "tracking") {
				const outcome = await this.tracking.answer(
					classification.screenedQuery,
					classification.replyLanguage
				)
				const unavailable = outcome.lookup?.outcome === "unavailable"
				const belowThreshold = unavailable && settings.confidenceThreshold > 0
				const preview = await this.chat.previewAnswer({
					envelope: { answer: outcome.reply },
					answerKind: "tool",
					classification,
					blockedTopics: settings.blockedTopics,
					...(belowThreshold && {
						answerOverride: withLanguageNotice(
							this.chat.lowConfidenceReply(classification, []),
							classification.language,
							classification.replyLanguage
						),
					}),
				})
				result.answer = preview.answer
				quality.toolResult = {
					outcome: outcome.lookup?.outcome ?? "no_lookup",
					facts: { ...outcome.event },
				}
				quality.actualBehavior = belowThreshold
					? "escalate"
					: !preview.guardrail.blocked && outcome.lookup?.outcome === "found"
						? "answer"
						: "uncertain"
			} else if (classification.route === "rates") {
				const outcome = await this.rates.answer(classification.screenedQuery, context)
				const preview = await this.chat.previewAnswer({
					envelope: { answer: outcome.reply },
					answerKind: "tool",
					classification,
					blockedTopics: settings.blockedTopics,
				})
				result.answer = preview.answer
				quality.toolResult = { outcome: outcome.outcome, facts: outcome.facts ?? {} }
				quality.actualBehavior =
					!preview.guardrail.blocked && outcome.outcome === "quoted" ? "answer" : "uncertain"
			} else if (classification.route === "retrieval") {
				const envelope = (await this.rag.submitChatQuery({
					query: row.question,
					userId: principal,
					permissions: customerPermissions,
					requestId,
					traceId: requestId,
					actorType: "customer",
					persist: false,
					freshEvaluation: true,
					...(classification.eligible && { maxOutputTokens: settings.maxOutputTokens }),
					...ragLanguageFields(classification),
				})) as RagAnswerEnvelope
				const preview = await this.chat.previewAnswer({
					envelope,
					classification,
					confidenceThreshold: settings.confidenceThreshold,
					blockedTopics: settings.blockedTopics,
				})
				result.answer = preview.answer
				quality.actualBehavior = preview.answerKind === "uncertain" ? "uncertain" : "answer"
				quality.providerOutputTokens = tokenCount(object(envelope.tokenUsage).completionTokens)
				if (
					object(envelope.tokenUsage).completionTokens !== undefined &&
					quality.providerOutputTokens === null
				) {
					throw new Error("Provider completion token count is invalid")
				}
				const retrievedIds = Array.isArray(envelope.retrievedChunks)
					? envelope.retrievedChunks
							.map(chunk => String(object(chunk).id))
							.filter(id => /^[0-9a-f-]{36}$/i.test(id))
					: []
				const citationIds = preview.citations.map(citation => citation.chunkId)
				const ids = [...new Set([...retrievedIds, ...citationIds])]
				const selected = ids.length
					? await db
							.select({
								id: chunks.id,
								hash: chunks.contentHash,
								content: chunks.content,
							})
							.from(chunks)
							.where(inArray(chunks.id, ids))
					: []
				result.retrievedHashes = selected
					.filter(chunk => retrievedIds.includes(chunk.id))
					.map(chunk => chunk.hash)
				evidence.citations = selected.filter(chunk => citationIds.includes(chunk.id))
				if (typeof envelope.model === "string") quality.answerModel = envelope.model
			} else {
				throw new Error(
					"Classifier routed this evaluation item outside the supported evaluation tools"
				)
			}
			const judge = object(
				await this.rag.scoreAnswerQuality({
					question: row.question,
					answer: result.answer,
					expected: { ...expected, idealAnswer: row.idealAnswer, hashes: row.expectedChunkHashes },
					actual: { ...evidence, tool: quality.toolResult, behavior: quality.actualBehavior },
					userId,
					requestId,
				})
			)
			quality.visibleOutputTokens = tokenCount(judge.visibleOutputTokens)
			quality.tokenizer = typeof judge.tokenizer === "string" ? judge.tokenizer : null
			quality.actualLanguage = EvalLanguageSchema.safeParse(judge.actualLanguage).data ?? null
			quality.languageCorrect = quality.actualLanguage === expected.language
			quality.judgeReason = typeof judge.reason === "string" ? judge.reason : null
			if (typeof judge.judgeModel === "string") quality.judgeModel = judge.judgeModel
			const citedHashes = Array.isArray(evidence.citations)
				? evidence.citations.map(citation => String(object(citation).hash))
				: []
			quality.citedHashes = citedHashes
			const toolMatches =
				!expected.expectedTool ||
				(quality.toolResult?.outcome === expected.expectedTool.outcome &&
					Object.entries(expected.expectedTool.facts).every(
						([key, value]) => object(quality.toolResult?.facts)[key] === value
					))
			quality.grounded =
				judge.grounded === true &&
				toolMatches &&
				row.expectedChunkHashes.every(hash => citedHashes.includes(hash))
			const expectedRoute =
				expected.useCase === "rates" || expected.useCase === "tracking"
					? expected.useCase
					: "retrieval"
			quality.behaviorCorrect =
				judge.behaviorCorrect === true &&
				classification.route === expectedRoute &&
				(quality.actualBehavior === expected.expectedBehavior ||
					(expected.expectedBehavior === "escalate" && quality.actualBehavior === "uncertain"))
		} catch (error) {
			quality.error = error instanceof Error ? error.message : "Evaluation item failed"
		}
		quality.tokenLimitPassed =
			quality.visibleOutputTokens === null
				? null
				: Math.max(quality.visibleOutputTokens, quality.providerOutputTokens ?? 0) <=
					qualityTokenCap
		quality.failureReasons = [
			...(quality.error ? [quality.error] : []),
			...(quality.grounded === false ? ["Grounding check failed"] : []),
			...(quality.behaviorCorrect === false ? ["Expected behavior check failed"] : []),
			...(quality.languageCorrect === false ? ["Reply language check failed"] : []),
			...(quality.tokenLimitPassed === false ? ["Output exceeds 200 tokens"] : []),
			...(quality.tokenLimitPassed === null ? ["Output token measurement unavailable"] : []),
		]
		quality.outcome = quality.error ? "error" : quality.failureReasons.length ? "failed" : "passed"
		return result
	}
}

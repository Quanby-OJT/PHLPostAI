import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import { ORPCError } from "@orpc/server"

import type {
	CreateKnowledgeArticleRequest,
	DeactivateKnowledgeArticleResponse,
	KnowledgeArticleDetail,
	KnowledgeArticleSummary,
	KnowledgeLanguage,
	KnowledgeReviewItem,
	KnowledgeTransitionResponse,
	KnowledgeVersion,
	SaveKnowledgeDraftRequest,
	UpdateKnowledgeArticleRequest,
} from "@repo/contracts"

import { AuditService } from "@/common/audit/audit.service"
import { env } from "@/config/env.config"
import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"

import { KnowledgeRepository, type ArticleRow, type VersionRow } from "./knowledge.repository"
import {
	assertArticleActive,
	assertNotSelfApproval,
	assertTransition,
	buildKnowledgeDocument,
	draftPlan,
	KnowledgeRuleError,
} from "./knowledge.rules"

/** Who is acting, and what the RAG service JWT carries for them. */
export interface KnowledgeActor {
	userId: string
	permissions: readonly string[]
	requestId: string
}

/** The response cache could not be cleared; callers roll back. */
class CacheClearError extends Error {
	constructor(cause: unknown) {
		super(cause instanceof Error ? cause.message : "Response cache invalidation failed")
		this.name = "CacheClearError"
	}
}

interface IngestResult {
	id: string
	status: string
	error: string | null
	jobId: string | null
}

const RECONCILE_INTERVAL_MS = 15_000

function parseIngestResult(value: unknown): IngestResult {
	const body = (value ?? {}) as Record<string, unknown>
	if (typeof body["id"] !== "string" || typeof body["status"] !== "string") {
		throw new Error("The ingestion service returned an unexpected response")
	}
	return {
		id: body["id"],
		status: body["status"],
		error: typeof body["error"] === "string" ? body["error"] : null,
		jobId: typeof body["jobId"] === "string" ? body["jobId"] : null,
	}
}

function messageOf(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Knowledge Articles (KB-1): write -> submit -> approve -> index, and retire
 * (DOMAIN-MODEL §5.2, Flow E).
 *
 * Approval indexes through the template ingestion service, which works in a
 * background job. The version stays `in_review` until that job succeeds; then
 * ONE transaction approves it, supersedes the previous approved version, and
 * clears the response cache. A failed job leaves the version in review with
 * `indexError`, and the previous approved version keeps serving. Nothing is
 * retrievable before it is approved: the RAG retrieval filter only returns
 * chunks of approved versions of active articles.
 *
 * Every state change is audited through AuditService.writeAudit.
 */
@Injectable()
export class KnowledgeService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(KnowledgeService.name)
	private timer: NodeJS.Timeout | undefined

	/** How long approve waits for a fast indexing job before returning. Tests set 0. */
	indexingWaitMs = 10_000
	indexingPollMs = 1_000

	constructor(
		private readonly repository: KnowledgeRepository,
		private readonly auditService: AuditService,
		private readonly ragGateway: RagGatewayService
	) {}

	onModuleInit(): void {
		if (env.NODE_ENV === "test") return
		// Finishes approvals whose indexing job outlived the approve request.
		this.timer = setInterval(() => {
			void this.reconcileAll().catch(error =>
				this.logger.warn(`Knowledge indexing reconcile failed: ${messageOf(error, "unknown")}`)
			)
		}, RECONCILE_INTERVAL_MS)
		this.timer.unref()
	}

	onModuleDestroy(): void {
		if (this.timer) clearInterval(this.timer)
	}

	// ── Reads ─────────────────────────────────────────────────────────────────

	async list(): Promise<KnowledgeArticleSummary[]> {
		await this.reconcileAll()
		const articles = await this.repository.listArticles()
		const versions = await this.repository.listVersions(articles.map(article => article.id))
		return articles.map(article =>
			this.toSummary(
				article,
				versions.filter(version => version.articleId === article.id)
			)
		)
	}

	async get(id: string): Promise<KnowledgeArticleDetail> {
		await this.reconcileAll()
		return this.detail(id)
	}

	async reviewQueue(): Promise<KnowledgeReviewItem[]> {
		await this.reconcileAll()
		const pending = await this.repository.listVersionsByStatus("in_review")
		const items: KnowledgeReviewItem[] = []
		for (const version of pending) {
			const article = await this.repository.getArticle(version.articleId)
			if (!article) continue
			const current = article.currentVersionId
				? await this.repository.getVersion(article.currentVersionId)
				: null
			items.push({
				version: this.toVersion(version),
				article: {
					id: article.id,
					title: article.title,
					category: article.category,
					languages: article.languages as KnowledgeLanguage[],
					status: article.status,
				},
				currentApproved: current?.status === "approved" ? this.toVersion(current) : null,
			})
		}
		return items
	}

	// ── Authoring (knowledge.articles.manage) ────────────────────────────────

	async create(
		input: CreateKnowledgeArticleRequest,
		actor: KnowledgeActor
	): Promise<KnowledgeArticleDetail> {
		this.assertLanguageListed(input.language, input.languages)
		const { article, version } = await this.repository.createArticleWithDraft(input)
		await this.audit(actor, "knowledge.article.create", "knowledge_article", article.id, null, {
			title: article.title,
			category: article.category,
			languages: article.languages,
			versionId: version.id,
		})
		return this.detail(article.id)
	}

	async update(
		input: UpdateKnowledgeArticleRequest,
		actor: KnowledgeActor
	): Promise<KnowledgeArticleDetail> {
		const before = await this.requireArticle(input.id)
		this.rule(() => assertArticleActive(before.status))
		const { id, ...changes } = input
		const after = await this.repository.updateArticle(id, changes)
		if (!after) throw this.conflict("The article changed while you were editing. Reload it.")
		await this.audit(
			actor,
			"knowledge.article.update",
			"knowledge_article",
			id,
			{ title: before.title, category: before.category, languages: before.languages },
			{ title: after.title, category: after.category, languages: after.languages }
		)
		return this.detail(id)
	}

	/**
	 * Save the draft. An approved article gets a NEW draft version; the approved
	 * version keeps serving until the new one is approved (KB-1 AC).
	 */
	async saveDraft(
		input: SaveKnowledgeDraftRequest,
		actor: KnowledgeActor
	): Promise<KnowledgeArticleDetail> {
		const article = await this.requireArticle(input.id)
		this.rule(() => assertArticleActive(article.status))
		this.assertLanguageListed(input.language, article.languages as KnowledgeLanguage[])

		const [latest] = await this.repository.listVersions([article.id])
		const plan = this.rule(() => draftPlan(latest ?? null))

		let saved: VersionRow | null
		if (plan === "update" && latest) {
			saved = await this.repository.updateDraft(latest.id, input.body, input.language)
		} else {
			saved = await this.repository.insertDraft(article.id, input.body, input.language)
		}
		if (!saved) throw this.conflict("The draft changed while you were editing. Reload it.")

		await this.audit(
			actor,
			"knowledge.version.save",
			"knowledge_article_version",
			saved.id,
			latest ? { versionId: latest.id, status: latest.status } : null,
			{ articleId: article.id, version: saved.version, status: saved.status, newVersion: plan === "create" }
		)
		return this.detail(article.id)
	}

	async submit(versionId: string, actor: KnowledgeActor): Promise<KnowledgeTransitionResponse> {
		const { version, article } = await this.requireVersion(versionId)
		this.rule(() => assertArticleActive(article.status))
		this.rule(() => assertTransition("submit", this.stateOf(version)))
		const updated = await this.repository.transition(version.id, ["draft"], {
			status: "in_review",
			submittedBy: actor.userId,
			reviewNote: null,
			indexError: null,
		})
		if (!updated) throw this.conflict("This version changed. Reload it.")
		await this.audit(
			actor,
			"knowledge.version.submit",
			"knowledge_article_version",
			version.id,
			{ status: version.status },
			{ status: "in_review", submittedBy: actor.userId }
		)
		return this.toTransition(updated)
	}

	/**
	 * Retire an article (KB-1 AC): in ONE transaction the article and its
	 * approved version are deactivated (the retrieval filter stops returning
	 * their chunks at commit) and the response cache is cleared. If the cache
	 * cannot be cleared, nothing changes.
	 */
	async deactivate(
		articleId: string,
		actor: KnowledgeActor
	): Promise<DeactivateKnowledgeArticleResponse> {
		const article = await this.requireArticle(articleId)
		this.rule(() => assertArticleActive(article.status))

		let result: Awaited<ReturnType<KnowledgeRepository["deactivateArticle"]>>
		try {
			result = await this.repository.deactivateArticle({
				articleId,
				invalidateCache: () => this.clearCache(actor, "knowledge.article.deactivate"),
			})
		} catch (error) {
			if (error instanceof CacheClearError) {
				throw new ORPCError("BAD_GATEWAY", {
					message:
						"Cached answers could not be cleared, so the article was not deactivated. Try again.",
				})
			}
			throw error
		}
		if (!result) throw this.conflict("The article changed while you were deactivating it.")

		await this.audit(
			actor,
			"knowledge.article.deactivate",
			"knowledge_article",
			articleId,
			{ status: "active" },
			{
				status: "deactivated",
				retiredVersionIds: result.retired.map(version => version.id),
				cacheCleared: true,
			}
		)

		// Second clear after commit covers answers cached between the first
		// clear and the commit. The content is already unretrievable.
		await this.clearCacheBestEffort(actor, "knowledge.article.deactivate")
		for (const version of result.retired) {
			if (version.documentId) await this.deindexIfUnused(version.documentId, actor)
		}
		return { id: articleId, status: "deactivated", cacheCleared: true }
	}

	// ── Review (knowledge.articles.approve) ──────────────────────────────────

	async returnVersion(
		versionId: string,
		note: string,
		actor: KnowledgeActor
	): Promise<KnowledgeTransitionResponse> {
		const { version } = await this.requireVersion(versionId)
		this.rule(() => assertTransition("return", this.stateOf(version)))
		const updated = await this.repository.transition(version.id, ["in_review"], {
			status: "returned",
			reviewNote: note,
		})
		if (!updated) throw this.conflict("This version changed. Reload the review queue.")
		await this.audit(
			actor,
			"knowledge.version.return",
			"knowledge_article_version",
			version.id,
			{ status: "in_review" },
			{ status: "returned", note }
		)
		return this.toTransition(updated)
	}

	/**
	 * Approve (Flow E step 3). Refuses and audits a self-approval. Indexes the
	 * version through the template ingestion service; the version becomes
	 * `approved` only when indexing succeeds.
	 */
	async approve(versionId: string, actor: KnowledgeActor): Promise<KnowledgeTransitionResponse> {
		const { version, article } = await this.requireVersion(versionId)
		this.rule(() => assertArticleActive(article.status))
		this.rule(() => assertTransition("approve", this.stateOf(version)))

		try {
			assertNotSelfApproval(version.submittedBy, actor.userId)
		} catch (error) {
			if (error instanceof KnowledgeRuleError) {
				await this.audit(
					actor,
					"knowledge.version.approve_refused",
					"knowledge_article_version",
					version.id,
					{ status: version.status },
					{ outcome: "denied", reason: "self_approval", submittedBy: version.submittedBy }
				)
				throw new ORPCError("FORBIDDEN", { message: error.message })
			}
			throw error
		}

		const file = buildKnowledgeDocument({
			articleId: article.id,
			version: version.version,
			title: article.title,
			language: version.language,
			body: version.body,
		})

		let ingest: IngestResult
		try {
			ingest = parseIngestResult(
				await this.ragGateway.ingestDocument({
					...file,
					userId: actor.userId,
					permissions: actor.permissions,
					requestId: actor.requestId,
					traceId: actor.requestId,
				})
			)
		} catch (error) {
			return this.failIndexing(version, actor, messageOf(error, "Indexing could not start"))
		}

		if (ingest.status === "failed") {
			return this.failIndexing(version, actor, ingest.error ?? "Indexing failed")
		}
		if (ingest.status === "indexed") {
			// Identical content is already indexed (idempotent on content hash).
			return this.toTransition(await this.completeApproval(version, ingest.id, actor.userId, actor))
		}
		if (!ingest.jobId) {
			return this.failIndexing(version, actor, "The ingestion service did not start a job")
		}

		const started = await this.repository.startIndexing(version.id, ingest.jobId, actor.userId)
		if (!started) throw this.conflict("This version changed. Reload the review queue.")
		await this.audit(
			actor,
			"knowledge.version.approve_requested",
			"knowledge_article_version",
			version.id,
			{ status: "in_review" },
			{ indexingJobId: ingest.jobId, documentId: ingest.id }
		)

		return this.toTransition(await this.waitForIndexing(version.id))
	}

	// ── Indexing lifecycle ───────────────────────────────────────────────────

	/** Finish or fail every approval whose indexing job has settled. */
	async reconcileAll(): Promise<void> {
		const pending = await this.repository.listIndexingVersions()
		for (const version of pending) {
			try {
				await this.reconcile(version)
			} catch (error) {
				this.logger.warn(
					`Reconcile of knowledge version ${version.id} failed: ${messageOf(error, "unknown")}`
				)
			}
		}
	}

	private async reconcile(version: VersionRow): Promise<VersionRow> {
		if (!version.indexingJobId) return version
		const approverId = version.indexingRequestedBy
		const actor: KnowledgeActor = {
			userId: approverId ?? "system:knowledge",
			permissions: [],
			requestId: crypto.randomUUID(),
		}

		const outcome = await this.repository.getJobOutcome(version.indexingJobId)
		if (!outcome) return this.failIndexingRow(version, actor, "The indexing job no longer exists")
		if (outcome.jobStatus === "queued" || outcome.jobStatus === "running") return version

		if (
			outcome.jobStatus === "completed" &&
			outcome.documentStatus === "indexed" &&
			outcome.documentId &&
			approverId
		) {
			return this.completeApproval(version, outcome.documentId, approverId, actor)
		}
		return this.failIndexingRow(
			version,
			actor,
			outcome.documentError ?? outcome.jobError ?? "Indexing did not complete"
		)
	}

	private async waitForIndexing(versionId: string): Promise<VersionRow> {
		const deadline = Date.now() + this.indexingWaitMs
		let latest = await this.repository.getVersion(versionId)
		while (latest?.indexingJobId && Date.now() < deadline) {
			await sleep(this.indexingPollMs)
			latest = await this.repository.getVersion(versionId)
			if (latest) latest = await this.reconcile(latest)
		}
		if (!latest) throw new ORPCError("NOT_FOUND", { message: "Version not found" })
		return latest
	}

	/** Flow E step 3: approve + supersede + clear cache in one transaction. */
	private async completeApproval(
		version: VersionRow,
		documentId: string,
		approverId: string,
		actor: KnowledgeActor
	): Promise<VersionRow> {
		let result: Awaited<ReturnType<KnowledgeRepository["finalizeApproval"]>>
		try {
			result = await this.repository.finalizeApproval({
				versionId: version.id,
				documentId,
				approverId,
				invalidateCache: () => this.clearCache(actor, "knowledge.version.approve"),
			})
		} catch (error) {
			if (error instanceof CacheClearError) {
				return this.failIndexingRow(
					version,
					actor,
					"Indexed, but cached answers could not be cleared. Approve again to finish."
				)
			}
			throw error
		}

		if (!result) {
			const current = await this.repository.getVersion(version.id)
			if (current?.status === "approved") return current // finished by another worker
			const article = await this.repository.getArticle(version.articleId)
			if (article?.status === "deactivated") {
				return this.failIndexingRow(version, actor, "The article was deactivated while indexing")
			}
			throw this.conflict("This version changed. Reload the review queue.")
		}

		await this.audit(
			actor,
			"knowledge.version.approve",
			"knowledge_article_version",
			version.id,
			{ status: "in_review" },
			{
				status: "approved",
				approvedBy: approverId,
				documentId,
				supersededVersionIds: result.superseded.map(row => row.id),
			}
		)
		await this.clearCacheBestEffort(actor, "knowledge.version.approve")
		for (const old of result.superseded) {
			if (old.documentId && old.documentId !== documentId) {
				await this.deindexIfUnused(old.documentId, actor)
			}
		}
		return result.version
	}

	private async failIndexing(
		version: VersionRow,
		actor: KnowledgeActor,
		reason: string
	): Promise<KnowledgeTransitionResponse> {
		return this.toTransition(await this.failIndexingRow(version, actor, reason))
	}

	/** Flow E failure branch: stay in review with the reason; the old version keeps serving. */
	private async failIndexingRow(
		version: VersionRow,
		actor: KnowledgeActor,
		reason: string
	): Promise<VersionRow> {
		const updated = await this.repository.recordIndexFailure(version.id, reason)
		await this.audit(
			actor,
			"knowledge.version.index_failed",
			"knowledge_article_version",
			version.id,
			{ status: version.status },
			{ status: "in_review", indexError: reason }
		)
		return updated ?? { ...version, indexError: reason, indexingJobId: null }
	}

	private async clearCache(actor: KnowledgeActor, reason: string): Promise<void> {
		try {
			await this.ragGateway.invalidateResponseCache({
				userId: actor.userId,
				permissions: actor.permissions,
				requestId: actor.requestId,
				reason,
			})
		} catch (error) {
			throw new CacheClearError(error)
		}
	}

	private async clearCacheBestEffort(actor: KnowledgeActor, reason: string): Promise<boolean> {
		try {
			await this.clearCache(actor, reason)
			return true
		} catch (error) {
			this.logger.warn(`Post-commit cache clear failed (${reason}): ${messageOf(error, "unknown")}`)
			return false
		}
	}

	/** De-index a retired document unless another approved version still uses it. */
	private async deindexIfUnused(documentId: string, actor: KnowledgeActor): Promise<void> {
		try {
			if (await this.repository.isDocumentServing(documentId)) return
			await this.ragGateway.deindexDocument({
				documentId,
				userId: actor.userId,
				permissions: actor.permissions,
				requestId: actor.requestId,
			})
		} catch (error) {
			// Already unretrievable through the filter; the chunks are just not deleted yet.
			this.logger.warn(`De-index of document ${documentId} failed: ${messageOf(error, "unknown")}`)
		}
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private async detail(id: string): Promise<KnowledgeArticleDetail> {
		const article = await this.requireArticle(id)
		const versions = await this.repository.listVersions([id])
		return {
			...this.toSummary(article, versions),
			createdAt: article.createdAt,
			versions: versions.map(version => this.toVersion(version)),
		}
	}

	private toSummary(article: ArticleRow, versions: VersionRow[]): KnowledgeArticleSummary {
		const latest = versions[0] ?? null
		const current = versions.find(
			version => version.id === article.currentVersionId && version.status === "approved"
		)
		const ref = (row: VersionRow) => ({ id: row.id, version: row.version, status: row.status })
		return {
			id: article.id,
			title: article.title,
			category: article.category,
			languages: article.languages as KnowledgeLanguage[],
			status: article.status,
			currentVersion: current ? ref(current) : null,
			latestVersion: latest ? ref(latest) : null,
			updatedAt: article.updatedAt,
		}
	}

	private toVersion(row: VersionRow): KnowledgeVersion {
		return {
			id: row.id,
			articleId: row.articleId,
			version: row.version,
			body: row.body,
			language: row.language as KnowledgeLanguage,
			status: row.status,
			submittedBy: row.submittedBy,
			approvedBy: row.approvedBy,
			approvedAt: row.approvedAt,
			documentId: row.documentId,
			reviewNote: row.reviewNote,
			indexing: row.indexingJobId !== null,
			indexError: row.indexError,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		}
	}

	private toTransition(row: VersionRow): KnowledgeTransitionResponse {
		return {
			versionId: row.id,
			status: row.status,
			indexing: row.indexingJobId !== null,
			indexError: row.indexError,
		}
	}

	private stateOf(row: VersionRow) {
		return { status: row.status, indexing: row.indexingJobId !== null }
	}

	private async requireArticle(id: string): Promise<ArticleRow> {
		const article = await this.repository.getArticle(id)
		if (!article) throw new ORPCError("NOT_FOUND", { message: "Article not found" })
		return article
	}

	private async requireVersion(id: string): Promise<{ version: VersionRow; article: ArticleRow }> {
		const version = await this.repository.getVersion(id)
		if (!version) throw new ORPCError("NOT_FOUND", { message: "Version not found" })
		return { version, article: await this.requireArticle(version.articleId) }
	}

	private assertLanguageListed(language: string, languages: readonly string[]): void {
		if (!languages.includes(language)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "The version's language must be one of the article's languages.",
			})
		}
	}

	private rule<T>(check: () => T): T {
		try {
			return check()
		} catch (error) {
			if (error instanceof KnowledgeRuleError) {
				throw new ORPCError(error.code, { message: error.message })
			}
			throw error
		}
	}

	private conflict(message: string): ORPCError<"CONFLICT", unknown> {
		return new ORPCError("CONFLICT", { message })
	}

	private async audit(
		actor: KnowledgeActor,
		action: string,
		resourceType: "knowledge_article" | "knowledge_article_version",
		resourceId: string,
		before: unknown,
		after: unknown
	): Promise<void> {
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: actor.userId.startsWith("system:") ? "system" : "user",
			action,
			resourceType,
			resourceId,
			before,
			after,
		})
	}
}

import { Injectable } from "@nestjs/common"
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm"

import type { KnowledgeVersionStatus } from "@repo/contracts"
import {
	documents,
	ingestionJobs,
	jobDocuments,
	knowledgeArticles,
	knowledgeArticleVersions,
} from "@repo/db/schema"

import { db } from "@/common/database/database.client"

export type ArticleRow = typeof knowledgeArticles.$inferSelect
export type VersionRow = typeof knowledgeArticleVersions.$inferSelect

export interface JobOutcome {
	jobStatus: "queued" | "running" | "completed" | "failed"
	jobError: string | null
	documentId: string | null
	documentStatus: string | null
	documentError: string | null
}

/**
 * All database access for the knowledge base (KB-1). Every state change is a
 * guarded UPDATE (`WHERE status = <expected>`), so two people acting on the
 * same version at once cannot both win; a guard miss returns null and the
 * service answers 409. Only this module writes the knowledge tables.
 */
@Injectable()
export class KnowledgeRepository {
	async listArticles(): Promise<ArticleRow[]> {
		return db.select().from(knowledgeArticles).orderBy(desc(knowledgeArticles.updatedAt))
	}

	async getArticle(id: string): Promise<ArticleRow | null> {
		const [row] = await db.select().from(knowledgeArticles).where(eq(knowledgeArticles.id, id))
		return row ?? null
	}

	async listVersions(articleIds: string[]): Promise<VersionRow[]> {
		if (articleIds.length === 0) return []
		return db
			.select()
			.from(knowledgeArticleVersions)
			.where(inArray(knowledgeArticleVersions.articleId, articleIds))
			.orderBy(desc(knowledgeArticleVersions.version))
	}

	async getVersion(id: string): Promise<VersionRow | null> {
		const [row] = await db
			.select()
			.from(knowledgeArticleVersions)
			.where(eq(knowledgeArticleVersions.id, id))
		return row ?? null
	}

	async listVersionsByStatus(status: KnowledgeVersionStatus): Promise<VersionRow[]> {
		return db
			.select()
			.from(knowledgeArticleVersions)
			.where(eq(knowledgeArticleVersions.status, status))
			.orderBy(knowledgeArticleVersions.updatedAt)
	}

	async listIndexingVersions(): Promise<VersionRow[]> {
		return db
			.select()
			.from(knowledgeArticleVersions)
			.where(
				and(
					eq(knowledgeArticleVersions.status, "in_review"),
					isNotNull(knowledgeArticleVersions.indexingJobId)
				)
			)
	}

	async createArticleWithDraft(input: {
		title: string
		category: string
		languages: string[]
		body: string
		language: string
	}): Promise<{ article: ArticleRow; version: VersionRow }> {
		return db.transaction(async tx => {
			const [article] = await tx
				.insert(knowledgeArticles)
				.values({ title: input.title, category: input.category, languages: input.languages })
				.returning()
			if (!article) throw new Error("Article insert returned no row")
			const [version] = await tx
				.insert(knowledgeArticleVersions)
				.values({
					articleId: article.id,
					version: 1,
					body: input.body,
					language: input.language,
					status: "draft",
				})
				.returning()
			if (!version) throw new Error("Version insert returned no row")
			return { article, version }
		})
	}

	async updateArticle(
		id: string,
		changes: { title?: string; category?: string; languages?: string[] }
	): Promise<ArticleRow | null> {
		const [row] = await db
			.update(knowledgeArticles)
			.set({ ...changes, updatedAt: new Date() })
			.where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.status, "active")))
			.returning()
		return row ?? null
	}

	/** Edit the open draft; a returned version moves back to draft. */
	async updateDraft(versionId: string, body: string, language: string): Promise<VersionRow | null> {
		const [row] = await db
			.update(knowledgeArticleVersions)
			.set({ body, language, status: "draft", updatedAt: new Date() })
			.where(
				and(
					eq(knowledgeArticleVersions.id, versionId),
					inArray(knowledgeArticleVersions.status, ["draft", "returned"])
				)
			)
			.returning()
		return row ?? null
	}

	/** Open a new draft numbered after the newest version. */
	async insertDraft(articleId: string, body: string, language: string): Promise<VersionRow> {
		return db.transaction(async tx => {
			const [max] = await tx
				.select({ value: sql<number>`coalesce(max(${knowledgeArticleVersions.version}), 0)::int` })
				.from(knowledgeArticleVersions)
				.where(eq(knowledgeArticleVersions.articleId, articleId))
			const [row] = await tx
				.insert(knowledgeArticleVersions)
				.values({
					articleId,
					version: (max?.value ?? 0) + 1,
					body,
					language,
					status: "draft",
				})
				.returning()
			if (!row) throw new Error("Version insert returned no row")
			await tx
				.update(knowledgeArticles)
				.set({ updatedAt: new Date() })
				.where(eq(knowledgeArticles.id, articleId))
			return row
		})
	}

	/** Guarded status change: only applies while the version is in `from`. */
	async transition(
		versionId: string,
		from: KnowledgeVersionStatus[],
		set: Partial<typeof knowledgeArticleVersions.$inferInsert>
	): Promise<VersionRow | null> {
		const [row] = await db
			.update(knowledgeArticleVersions)
			.set({ ...set, updatedAt: new Date() })
			.where(
				and(
					eq(knowledgeArticleVersions.id, versionId),
					inArray(knowledgeArticleVersions.status, from)
				)
			)
			.returning()
		return row ?? null
	}

	/** Record the ingestion job started on approval (the version stays in_review). */
	async startIndexing(
		versionId: string,
		jobId: string,
		requestedBy: string
	): Promise<VersionRow | null> {
		const [row] = await db
			.update(knowledgeArticleVersions)
			.set({
				indexingJobId: jobId,
				indexingRequestedBy: requestedBy,
				indexError: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(knowledgeArticleVersions.id, versionId),
					eq(knowledgeArticleVersions.status, "in_review"),
					sql`${knowledgeArticleVersions.indexingJobId} IS NULL`
				)
			)
			.returning()
		return row ?? null
	}

	/** Flow E failure branch: keep the version in review with the reason. */
	async recordIndexFailure(versionId: string, reason: string): Promise<VersionRow | null> {
		return this.transition(versionId, ["in_review"], {
			indexError: reason,
			indexingJobId: null,
			indexingRequestedBy: null,
		})
	}

	/**
	 * Flow E step 3 in ONE transaction: the version becomes approved with its
	 * document, the previous approved version is superseded, and the article
	 * points at the new version. `invalidateCache` runs inside the transaction
	 * before commit; if it throws, nothing changes.
	 */
	async finalizeApproval(input: {
		versionId: string
		documentId: string
		approverId: string
		invalidateCache: () => Promise<void>
	}): Promise<{ version: VersionRow; superseded: VersionRow[] } | null> {
		return db.transaction(async tx => {
			const [current] = await tx
				.select()
				.from(knowledgeArticleVersions)
				.where(eq(knowledgeArticleVersions.id, input.versionId))
			if (!current) return null
			const [article] = await tx
				.select()
				.from(knowledgeArticles)
				.where(eq(knowledgeArticles.id, current.articleId))
			if (!article || article.status !== "active") return null

			const now = new Date()
			const [version] = await tx
				.update(knowledgeArticleVersions)
				.set({
					status: "approved",
					approvedBy: input.approverId,
					approvedAt: now,
					documentId: input.documentId,
					indexingJobId: null,
					indexingRequestedBy: null,
					indexError: null,
					updatedAt: now,
				})
				.where(
					and(
						eq(knowledgeArticleVersions.id, input.versionId),
						eq(knowledgeArticleVersions.status, "in_review")
					)
				)
				.returning()
			if (!version) return null

			const superseded = await tx
				.update(knowledgeArticleVersions)
				.set({ status: "superseded", updatedAt: now })
				.where(
					and(
						eq(knowledgeArticleVersions.articleId, version.articleId),
						eq(knowledgeArticleVersions.status, "approved"),
						ne(knowledgeArticleVersions.id, version.id)
					)
				)
				.returning()

			await tx
				.update(knowledgeArticles)
				.set({ currentVersionId: version.id, updatedAt: now })
				.where(eq(knowledgeArticles.id, version.articleId))

			await input.invalidateCache()
			return { version, superseded }
		})
	}

	/**
	 * Deactivate in ONE transaction: the article and its approved version are
	 * retired, so the retrieval filter stops returning their chunks at commit.
	 * `invalidateCache` runs before commit; if it throws, nothing changes.
	 */
	async deactivateArticle(input: {
		articleId: string
		invalidateCache: () => Promise<void>
	}): Promise<{ article: ArticleRow; retired: VersionRow[] } | null> {
		return db.transaction(async tx => {
			const now = new Date()
			const [article] = await tx
				.update(knowledgeArticles)
				.set({ status: "deactivated", updatedAt: now })
				.where(
					and(eq(knowledgeArticles.id, input.articleId), eq(knowledgeArticles.status, "active"))
				)
				.returning()
			if (!article) return null

			const retired = await tx
				.update(knowledgeArticleVersions)
				.set({ status: "deactivated", updatedAt: now })
				.where(
					and(
						eq(knowledgeArticleVersions.articleId, input.articleId),
						eq(knowledgeArticleVersions.status, "approved")
					)
				)
				.returning()

			await input.invalidateCache()
			return { article, retired }
		})
	}

	/** The ingestion job's outcome for the document it indexed (IN-7 tables). */
	async getJobOutcome(jobId: string): Promise<JobOutcome | null> {
		const [job] = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, jobId))
		if (!job) return null
		const [entry] = await db
			.select({
				documentId: jobDocuments.documentId,
				documentStatus: documents.status,
				documentError: sql<string | null>`coalesce(${jobDocuments.error}, ${documents.error})`,
			})
			.from(jobDocuments)
			.innerJoin(documents, eq(documents.id, jobDocuments.documentId))
			.where(eq(jobDocuments.jobId, jobId))
		return {
			jobStatus: job.status,
			jobError: job.error,
			documentId: entry?.documentId ?? null,
			documentStatus: entry?.documentStatus ?? null,
			documentError: entry?.documentError ?? null,
		}
	}

	/** Whether any approved version of an active article still uses this document. */
	async isDocumentServing(documentId: string): Promise<boolean> {
		const [row] = await db
			.select({ id: knowledgeArticleVersions.id })
			.from(knowledgeArticleVersions)
			.innerJoin(knowledgeArticles, eq(knowledgeArticles.id, knowledgeArticleVersions.articleId))
			.where(
				and(
					eq(knowledgeArticleVersions.documentId, documentId),
					eq(knowledgeArticleVersions.status, "approved"),
					eq(knowledgeArticles.status, "active")
				)
			)
			.limit(1)
		return row !== undefined
	}
}

import { ORPCError } from "@orpc/server"

import { KnowledgeService, type KnowledgeActor } from "./knowledge.service"

// @orpc/server ships ESM only, which this Jest setup cannot load: mock the
// one export the service uses, like the other backend specs do.
jest.mock("@orpc/server", () => ({
	ORPCError: class ORPCError extends Error {
		code: string
		constructor(code: string, options?: { message?: string }) {
			super(options?.message ?? code)
			this.code = code
		}
	},
}))

jest.mock("@/config/env.config", () => ({
	env: {
		NODE_ENV: "test",
		RAG_SERVICE_URL: "http://rag:8000",
		RAG_SERVICE_TOKEN_SECRET: "test-secret",
		RAG_SERVICE_TIMEOUT_MS: 5000,
		RAG_SERVICE_TOKEN_TTL_SECONDS: 120,
	},
}))

jest.mock("@/common/database/database.client", () => ({ db: {} }))
// The repository and audit service are injected as mocks below; stub their
// modules so the real database schema is never loaded.
jest.mock("./knowledge.repository", () => ({ KnowledgeRepository: class KnowledgeRepository {} }))
jest.mock("@/common/audit/audit.service", () => ({ AuditService: class AuditService {} }))

const NOW = new Date("2026-11-17T00:00:00Z")

function article(overrides: Record<string, unknown> = {}) {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		title: "Postal ID requirements",
		category: "postal-id",
		languages: ["en", "fil"],
		currentVersionId: null as string | null,
		status: "active" as const,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	}
}

function version(overrides: Record<string, unknown> = {}) {
	return {
		id: "22222222-2222-4222-8222-222222222222",
		articleId: "11111111-1111-4111-8111-111111111111",
		version: 1,
		body: "Bring one valid ID.",
		language: "en",
		status: "in_review",
		submittedBy: "author",
		approvedBy: null,
		approvedAt: null,
		documentId: null,
		reviewNote: null,
		indexingJobId: null as string | null,
		indexingRequestedBy: null as string | null,
		indexError: null as string | null,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	}
}

const approver: KnowledgeActor = { userId: "approver", permissions: [], requestId: "req-1" }
const author: KnowledgeActor = { userId: "author", permissions: [], requestId: "req-2" }

function setup() {
	const repository = {
		listArticles: jest.fn().mockResolvedValue([]),
		getArticle: jest.fn().mockResolvedValue(article()),
		listVersions: jest.fn().mockResolvedValue([]),
		getVersion: jest.fn().mockResolvedValue(version()),
		listVersionsByStatus: jest.fn().mockResolvedValue([]),
		listIndexingVersions: jest.fn().mockResolvedValue([]),
		createArticleWithDraft: jest.fn(),
		updateArticle: jest.fn(),
		updateDraft: jest.fn(),
		insertDraft: jest.fn(),
		transition: jest.fn(),
		startIndexing: jest.fn(),
		recordIndexFailure: jest.fn(async (id: string, reason: string) =>
			version({ id, indexError: reason })
		),
		finalizeApproval: jest.fn(
			async (input: { versionId: string; documentId: string; approverId: string; invalidateCache: () => Promise<void> }) => {
				// Mirrors the real transaction: the cache clear runs before commit.
				await input.invalidateCache()
				return {
					version: version({
						id: input.versionId,
						status: "approved",
						approvedBy: input.approverId,
						documentId: input.documentId,
					}),
					superseded: [version({ id: "old", status: "superseded", documentId: "doc-old" })],
				}
			}
		),
		deactivateArticle: jest.fn(
			async (input: { articleId: string; invalidateCache: () => Promise<void> }) => {
				await input.invalidateCache()
				return {
					article: article({ status: "deactivated" }),
					retired: [version({ status: "deactivated", documentId: "doc-1" })],
				}
			}
		),
		getJobOutcome: jest.fn(),
		isDocumentServing: jest.fn().mockResolvedValue(false),
	}
	const auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
	const ragGateway = {
		ingestDocument: jest.fn(),
		invalidateResponseCache: jest.fn().mockResolvedValue({ generation: 2 }),
		deindexDocument: jest.fn().mockResolvedValue({ deindexed: true }),
	}
	const service = new KnowledgeService(
		repository as never,
		auditService as never,
		ragGateway as never
	)
	service.indexingWaitMs = 0
	return { service, repository, auditService, ragGateway }
}

function auditActions(auditService: { writeAudit: jest.Mock }): string[] {
	return auditService.writeAudit.mock.calls.map(([entry]) => (entry as { action: string }).action)
}

describe("KnowledgeService (KB-1)", () => {
	describe("approve (Flow E)", () => {
		it("approves, indexes, supersedes, and clears the cache when a different user approves", async () => {
			const { service, repository, auditService, ragGateway } = setup()
			// Identical content already indexed -> the ingestion service reuses it.
			ragGateway.ingestDocument.mockResolvedValue({
				id: "doc-new",
				status: "indexed",
				error: null,
				jobId: null,
			})

			const result = await service.approve(version().id, approver)

			expect(ragGateway.ingestDocument).toHaveBeenCalledWith(
				expect.objectContaining({ contentType: "text/html", userId: "approver" })
			)
			expect(repository.finalizeApproval).toHaveBeenCalledWith(
				expect.objectContaining({ documentId: "doc-new", approverId: "approver" })
			)
			expect(result).toEqual(expect.objectContaining({ status: "approved", indexing: false }))
			// Cleared inside the transaction and once more after commit.
			expect(ragGateway.invalidateResponseCache).toHaveBeenCalledTimes(2)
			// The superseded version's document is de-indexed through the RAG service.
			expect(ragGateway.deindexDocument).toHaveBeenCalledWith(
				expect.objectContaining({ documentId: "doc-old" })
			)
			expect(auditActions(auditService)).toContain("knowledge.version.approve")
		})

		it("keeps the version in review while the ingestion job runs, then approves when it finishes", async () => {
			const { service, repository, ragGateway } = setup()
			ragGateway.ingestDocument.mockResolvedValue({
				id: "doc-new",
				status: "processing",
				error: null,
				jobId: "job-1",
			})
			const indexing = version({ indexingJobId: "job-1", indexingRequestedBy: "approver" })
			repository.startIndexing.mockResolvedValue(indexing)
			repository.getVersion.mockResolvedValueOnce(version()).mockResolvedValue(indexing)

			const pending = await service.approve(version().id, approver)
			expect(pending).toEqual(expect.objectContaining({ status: "in_review", indexing: true }))
			expect(repository.finalizeApproval).not.toHaveBeenCalled()

			// The job completes; the next reconcile finishes the approval.
			repository.listIndexingVersions.mockResolvedValue([indexing])
			repository.getJobOutcome.mockResolvedValue({
				jobStatus: "completed",
				jobError: null,
				documentId: "doc-new",
				documentStatus: "indexed",
				documentError: null,
			})
			await service.reconcileAll()
			expect(repository.finalizeApproval).toHaveBeenCalledWith(
				expect.objectContaining({ versionId: indexing.id, documentId: "doc-new", approverId: "approver" })
			)
		})

		it("refuses and audits a self-approval without indexing anything", async () => {
			const { service, auditService, ragGateway } = setup()

			await expect(service.approve(version().id, author)).rejects.toMatchObject({
				code: "FORBIDDEN",
			})
			expect(ragGateway.ingestDocument).not.toHaveBeenCalled()
			expect(auditService.writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({
					actorId: "author",
					action: "knowledge.version.approve_refused",
					resourceId: version().id,
					after: expect.objectContaining({ outcome: "denied", reason: "self_approval" }),
				})
			)
		})

		it("keeps the version in review with the error when indexing fails (failure branch)", async () => {
			const { service, repository, auditService, ragGateway } = setup()
			ragGateway.ingestDocument.mockResolvedValue({
				id: "doc-new",
				status: "failed",
				error: "HTML parse failed",
				jobId: null,
			})

			const result = await service.approve(version().id, approver)

			expect(result).toEqual(
				expect.objectContaining({ status: "in_review", indexError: "HTML parse failed" })
			)
			expect(repository.finalizeApproval).not.toHaveBeenCalled()
			expect(auditActions(auditService)).toContain("knowledge.version.index_failed")
		})

		it("fails the approval when the indexing job fails, leaving the old version serving", async () => {
			const { service, repository } = setup()
			const indexing = version({ indexingJobId: "job-1", indexingRequestedBy: "approver" })
			repository.listIndexingVersions.mockResolvedValue([indexing])
			repository.getJobOutcome.mockResolvedValue({
				jobStatus: "failed",
				jobError: "embedding provider down",
				documentId: "doc-new",
				documentStatus: "failed",
				documentError: null,
			})

			await service.reconcileAll()

			expect(repository.recordIndexFailure).toHaveBeenCalledWith(
				indexing.id,
				"embedding provider down"
			)
			expect(repository.finalizeApproval).not.toHaveBeenCalled()
		})

		it("does not approve when the cache cannot be cleared, and says why", async () => {
			const { service, repository, ragGateway } = setup()
			ragGateway.ingestDocument.mockResolvedValue({
				id: "doc-new",
				status: "indexed",
				error: null,
				jobId: null,
			})
			ragGateway.invalidateResponseCache.mockRejectedValue(new Error("redis down"))

			const result = await service.approve(version().id, approver)

			expect(result.status).toBe("in_review")
			expect(result.indexError).toMatch(/cached answers could not be cleared/i)
			expect(repository.recordIndexFailure).toHaveBeenCalled()
		})
	})

	describe("deactivate", () => {
		it("retires the article, clears the cache, and de-indexes its document", async () => {
			const { service, repository, auditService, ragGateway } = setup()

			const result = await service.deactivate(article().id, author)

			expect(result).toEqual({ id: article().id, status: "deactivated", cacheCleared: true })
			expect(repository.deactivateArticle).toHaveBeenCalled()
			expect(ragGateway.invalidateResponseCache).toHaveBeenCalled()
			expect(ragGateway.deindexDocument).toHaveBeenCalledWith(
				expect.objectContaining({ documentId: "doc-1" })
			)
			expect(auditActions(auditService)).toContain("knowledge.article.deactivate")
		})

		it("changes nothing and answers 502 when the cache cannot be cleared", async () => {
			const { service, auditService, ragGateway } = setup()
			ragGateway.invalidateResponseCache.mockRejectedValue(new Error("redis down"))

			const error = await service.deactivate(article().id, author).catch(e => e)

			expect(error).toBeInstanceOf(ORPCError)
			expect((error as { code: string }).code).toBe("BAD_GATEWAY")
			expect(auditActions(auditService)).not.toContain("knowledge.article.deactivate")
		})

		it("does not de-index a document another approved version still uses", async () => {
			const { service, repository, ragGateway } = setup()
			repository.isDocumentServing.mockResolvedValue(true)

			await service.deactivate(article().id, author)

			expect(ragGateway.deindexDocument).not.toHaveBeenCalled()
		})
	})

	describe("drafts", () => {
		it("creates a new draft when an approved article is edited; the approved version keeps serving", async () => {
			const { service, repository, auditService } = setup()
			const approved = version({ status: "approved", documentId: "doc-1" })
			repository.getArticle.mockResolvedValue(article({ currentVersionId: approved.id }))
			repository.listVersions.mockResolvedValue([approved])
			repository.insertDraft.mockResolvedValue(version({ id: "v2", version: 2, status: "draft" }))

			await service.saveDraft(
				{ id: article().id, body: "Bring two valid IDs.", language: "en" },
				author
			)

			expect(repository.insertDraft).toHaveBeenCalledWith(article().id, "Bring two valid IDs.", "en")
			expect(repository.updateDraft).not.toHaveBeenCalled()
			expect(auditActions(auditService)).toContain("knowledge.version.save")
		})

		it("refuses to edit while a version is in review", async () => {
			const { service, repository } = setup()
			repository.listVersions.mockResolvedValue([version({ status: "in_review" })])

			await expect(
				service.saveDraft({ id: article().id, body: "Edit", language: "en" }, author)
			).rejects.toMatchObject({ code: "CONFLICT" })
		})

		it("submits a draft for review and records the submitter", async () => {
			const { service, repository } = setup()
			repository.getVersion.mockResolvedValue(version({ status: "draft", submittedBy: null }))
			repository.transition.mockResolvedValue(version({ status: "in_review", submittedBy: "author" }))

			const result = await service.submit(version().id, author)

			expect(repository.transition).toHaveBeenCalledWith(
				version().id,
				["draft"],
				expect.objectContaining({ status: "in_review", submittedBy: "author" })
			)
			expect(result.status).toBe("in_review")
		})

		it("rejects a draft whose language is not one of the article's languages", async () => {
			const { service } = setup()

			await expect(
				service.saveDraft({ id: article().id, body: "Text", language: "ilo" }, author)
			).rejects.toMatchObject({ code: "BAD_REQUEST" })
		})
	})
})

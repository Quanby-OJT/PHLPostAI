import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { KnowledgeController, knowledgeUploadOptions } from "./knowledge.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({
	implement: jest.fn(() => ({ handler: jest.fn() })),
	ORPCError: class ORPCError extends Error {},
}))
jest.mock("@/config/api-versions.config", () => ({
	v1: {
		knowledge: {
			articles: { list: {}, get: {}, create: {}, update: {}, saveDraft: {}, deactivate: {} },
			versions: { submit: {}, approve: {}, return: {} },
			review: { queue: {} },
		},
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
jest.mock("@/common/rbac/rbac.service", () => ({ RbacService: jest.fn() }))
jest.mock("./knowledge.service", () => ({ KnowledgeService: class KnowledgeService {} }))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))
// @repo/contracts pulls in ESM-only @orpc/contract; the controller only needs
// the extract response schema at runtime.
jest.mock("@repo/contracts", () => ({
	KnowledgeExtractResponseSchema: {
		safeParse: (value: unknown) => ({ success: true, data: value }),
	},
}))

function required(method: keyof KnowledgeController): string[] {
	return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, KnowledgeController.prototype[method])
}

describe("KnowledgeController permissions (KB-1)", () => {
	it.each([
		"listArticles",
		"getArticle",
		"createArticle",
		"updateArticle",
		"saveDraft",
		"deactivateArticle",
		"submitVersion",
		"extract",
	] as const)("%s requires knowledge.articles.manage", method => {
		expect(required(method)).toEqual(["knowledge.articles.manage"])
	})

	it.each(["reviewQueue", "approveVersion", "returnVersion"] as const)(
		"%s requires knowledge.articles.approve",
		method => {
			expect(required(method)).toEqual(["knowledge.articles.approve"])
		}
	)

	it("accepts only DOCX, PDF, and HTML as a draft's starting text", () => {
		const filter = knowledgeUploadOptions.fileFilter!
		const accept = jest.fn()
		filter({} as never, { mimetype: "application/pdf" } as never, accept)
		expect(accept).toHaveBeenCalledWith(null, true)

		const reject = jest.fn()
		filter({} as never, { mimetype: "text/csv" } as never, reject)
		expect(reject.mock.calls[0]?.[1]).toBe(false)
	})
})

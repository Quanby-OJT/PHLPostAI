import { oc } from "@orpc/contract"
import { z } from "zod"

import {
	CreateKnowledgeArticleRequestSchema,
	DeactivateKnowledgeArticleResponseSchema,
	KnowledgeArticleDetailSchema,
	KnowledgeArticleSummarySchema,
	KnowledgeIdSchema,
	KnowledgeReviewItemSchema,
	KnowledgeTransitionResponseSchema,
	ReturnKnowledgeVersionRequestSchema,
	SaveKnowledgeDraftRequestSchema,
	UpdateKnowledgeArticleRequestSchema,
} from "./knowledge.schema.js"

/**
 * Knowledge base (KB-1, Flow E). Authoring routes require
 * `knowledge.articles.manage`; the review queue and decisions require
 * `knowledge.articles.approve`. The DOCX/PDF/HTML upload that seeds a draft is
 * a plain multipart route (POST /v1/knowledge/extract), not oRPC.
 */
export const knowledgeContract = {
	articles: {
		list: oc
			.route({
				method: "GET",
				path: "/knowledge/articles",
				summary: "List knowledge articles",
				tags: ["Knowledge"],
			})
			.output(z.array(KnowledgeArticleSummarySchema)),
		get: oc
			.route({
				method: "GET",
				path: "/knowledge/articles/{id}",
				summary: "Get a knowledge article with its version history",
				tags: ["Knowledge"],
			})
			.input(KnowledgeIdSchema)
			.output(KnowledgeArticleDetailSchema),
		create: oc
			.route({
				method: "POST",
				path: "/knowledge/articles",
				summary: "Create a knowledge article with its first draft",
				tags: ["Knowledge"],
			})
			.input(CreateKnowledgeArticleRequestSchema)
			.output(KnowledgeArticleDetailSchema),
		update: oc
			.route({
				method: "PATCH",
				path: "/knowledge/articles/{id}",
				summary: "Change an article's title, category, or languages",
				tags: ["Knowledge"],
			})
			.input(UpdateKnowledgeArticleRequestSchema)
			.output(KnowledgeArticleDetailSchema),
		saveDraft: oc
			.route({
				method: "PUT",
				path: "/knowledge/articles/{id}/draft",
				summary: "Save the article's draft",
				description:
					"Updates the open draft or returned version, or creates a new draft version when the latest version is approved. The approved version keeps serving.",
				tags: ["Knowledge"],
			})
			.input(SaveKnowledgeDraftRequestSchema)
			.output(KnowledgeArticleDetailSchema),
		deactivate: oc
			.route({
				method: "POST",
				path: "/knowledge/articles/{id}/deactivate",
				summary: "Retire an article",
				description:
					"Its chunks stop being retrievable at once and cached answers are cleared.",
				tags: ["Knowledge"],
			})
			.input(KnowledgeIdSchema)
			.output(DeactivateKnowledgeArticleResponseSchema),
	},
	versions: {
		submit: oc
			.route({
				method: "POST",
				path: "/knowledge/versions/{id}/submit",
				summary: "Submit a draft for review",
				tags: ["Knowledge"],
			})
			.input(KnowledgeIdSchema)
			.output(KnowledgeTransitionResponseSchema),
		approve: oc
			.route({
				method: "POST",
				path: "/knowledge/versions/{id}/approve",
				summary: "Approve a version and index it",
				description:
					"Refused (and audited) when the approver submitted the version. The version becomes approved once indexing succeeds.",
				tags: ["Knowledge"],
			})
			.input(KnowledgeIdSchema)
			.output(KnowledgeTransitionResponseSchema),
		return: oc
			.route({
				method: "POST",
				path: "/knowledge/versions/{id}/return",
				summary: "Return a version to its author with a note",
				tags: ["Knowledge"],
			})
			.input(ReturnKnowledgeVersionRequestSchema)
			.output(KnowledgeTransitionResponseSchema),
	},
	review: {
		queue: oc
			.route({
				method: "GET",
				path: "/knowledge/review-queue",
				summary: "Versions waiting for review",
				tags: ["Knowledge"],
			})
			.output(z.array(KnowledgeReviewItemSchema)),
	},
}

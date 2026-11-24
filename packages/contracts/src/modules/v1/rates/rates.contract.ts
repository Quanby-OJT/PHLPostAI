import { oc } from "@orpc/contract"
import { z } from "zod"

import {
	RateBatchDetailSchema,
	RateBatchIdSchema,
	RateBatchSchema,
	RateCsvRequestSchema,
	RateEntrySchema,
	RatePreviewSchema,
	RejectRateBatchRequestSchema,
} from "./rates.schema.js"

/**
 * Postal rates (KB-2). Entries and imports require `knowledge.rates.manage`;
 * the review queue, approve and reject require `knowledge.articles.approve`.
 */
export const ratesContract = {
	entries: {
		list: oc
			.route({
				method: "GET",
				path: "/rates",
				summary: "List approved rate entries",
				tags: ["Rates"],
			})
			.output(z.array(RateEntrySchema)),
	},
	batches: {
		preview: oc
			.route({
				method: "POST",
				path: "/rates/batches/preview",
				summary: "Validate a rates CSV and preview its rows and errors",
				description: "Nothing is stored.",
				tags: ["Rates"],
			})
			.input(RateCsvRequestSchema)
			.output(RatePreviewSchema),
		submit: oc
			.route({
				method: "POST",
				path: "/rates/batches",
				summary: "Submit a valid rates CSV as a batch for approval",
				tags: ["Rates"],
			})
			.input(RateCsvRequestSchema)
			.output(RateBatchDetailSchema),
		list: oc
			.route({
				method: "GET",
				path: "/rates/batches",
				summary: "List rate batches",
				tags: ["Rates"],
			})
			.output(z.array(RateBatchSchema)),
	},
	review: {
		queue: oc
			.route({
				method: "GET",
				path: "/rates/review-queue",
				summary: "Rate batches waiting for approval, with their rows",
				tags: ["Rates"],
			})
			.output(z.array(RateBatchDetailSchema)),
		approve: oc
			.route({
				method: "POST",
				path: "/rates/batches/{id}/approve",
				summary: "Approve a batch; its rows go live",
				description: "The submitter cannot approve their own batch.",
				tags: ["Rates"],
			})
			.input(RateBatchIdSchema)
			.output(RateBatchSchema),
		reject: oc
			.route({
				method: "POST",
				path: "/rates/batches/{id}/reject",
				summary: "Reject a batch with a note",
				tags: ["Rates"],
			})
			.input(RejectRateBatchRequestSchema)
			.output(RateBatchSchema),
	},
}

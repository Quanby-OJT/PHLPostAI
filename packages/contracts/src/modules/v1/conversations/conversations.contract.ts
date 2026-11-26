import { oc } from "@orpc/contract"
import { z } from "zod"

import {
	TranscriptDetailSchema,
	TranscriptPageSchema,
	TranscriptSearchSchema,
} from "./conversations.schema.js"

/**
 * Conversation transcripts (ADM-3). Both routes require
 * `conversations.transcripts.view` (RbacGuard fails closed and audits the
 * denial). Reads only; the detail read writes an Audit Entry per view.
 */
export const conversationsContract = {
	transcripts: {
		search: oc
			.route({
				method: "POST",
				path: "/conversations/transcripts/search",
				summary: "Search conversation transcripts",
				description:
					"Filter by date, category, language, outcome, or reference. Personal data is masked. Requires conversations.transcripts.view.",
				tags: ["Conversations"],
			})
			.input(TranscriptSearchSchema)
			.output(TranscriptPageSchema),
		get: oc
			.route({
				method: "GET",
				path: "/conversations/transcripts/{id}",
				summary: "Open one conversation transcript",
				description:
					"Masked messages with per-answer provenance. Records an audit entry for the view. Requires conversations.transcripts.view.",
				tags: ["Conversations"],
			})
			.input(z.object({ id: z.string().uuid() }))
			.output(TranscriptDetailSchema),
	},
}

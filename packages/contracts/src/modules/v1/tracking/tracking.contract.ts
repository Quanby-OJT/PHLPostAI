import { oc } from "@orpc/contract"
import { z } from "zod"

import {
	NeededExplanationSchema,
	SaveStatusExplanationRequestSchema,
	StatusExplanationIdSchema,
	StatusExplanationSchema,
} from "./tracking.schema.js"

/** Status Explanations (TRK-2). Every route requires `tracking.explanations.manage`. */
export const trackingContract = {
	explanations: {
		list: oc
			.route({
				method: "GET",
				path: "/tracking/explanations",
				summary: "List status explanations",
				tags: ["Tracking"],
			})
			.output(z.array(StatusExplanationSchema)),
		needed: oc
			.route({
				method: "GET",
				path: "/tracking/explanations/needed",
				summary: "Status codes returned by lookups that have no active explanation",
				tags: ["Tracking"],
			})
			.output(z.array(NeededExplanationSchema)),
		save: oc
			.route({
				method: "PUT",
				path: "/tracking/explanations",
				summary: "Create or replace the explanation for a status code and language",
				description: "Saving also reactivates a deactivated explanation.",
				tags: ["Tracking"],
			})
			.input(SaveStatusExplanationRequestSchema)
			.output(StatusExplanationSchema),
		deactivate: oc
			.route({
				method: "POST",
				path: "/tracking/explanations/{id}/deactivate",
				summary: "Stop showing an explanation",
				tags: ["Tracking"],
			})
			.input(StatusExplanationIdSchema)
			.output(StatusExplanationSchema),
	},
}

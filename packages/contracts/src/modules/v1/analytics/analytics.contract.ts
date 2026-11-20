import { oc } from "@orpc/contract"

import { AnalyticsOverviewSchema } from "./analytics.schema.js"

export const analyticsContract = {
	overview: oc
		.route({
			method: "GET",
			path: "/analytics/overview",
			summary: "Today's interaction counts",
			description:
				"Return today's conversation, answer, tracking lookup, and escalation counts from append-only interaction events.",
			tags: ["Analytics"],
		})
		.output(AnalyticsOverviewSchema),
}

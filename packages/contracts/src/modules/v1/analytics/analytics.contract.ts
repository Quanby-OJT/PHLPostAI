import { oc } from "@orpc/contract"

import {
	AnalyticsOverviewSchema,
	DeflectionDrilldownSchema,
	DeflectionReportRequestSchema,
	DeflectionReportSchema,
	KpiDefinitionListSchema,
	KpiDefinitionSchema,
	SaveKpiDefinitionRequestSchema,
} from "./analytics.schema.js"

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
	deflectionReport: oc
		.route({
			method: "GET",
			path: "/analytics/deflection",
			summary: "Deflection KPI report",
			tags: ["Analytics"],
		})
		.input(DeflectionReportRequestSchema)
		.output(DeflectionReportSchema),
	deflectionDrilldown: oc
		.route({
			method: "GET",
			path: "/analytics/deflection/conversations",
			summary: "Conversations counted by the deflection KPI",
			tags: ["Analytics"],
		})
		.input(DeflectionReportRequestSchema)
		.output(DeflectionDrilldownSchema),
	listKpiDefinitions: oc
		.route({
			method: "GET",
			path: "/analytics/kpi-definitions",
			summary: "List approved deflection KPI definition versions",
			tags: ["Analytics"],
		})
		.output(KpiDefinitionListSchema),
	saveKpiDefinition: oc
		.route({
			method: "POST",
			path: "/analytics/kpi-definitions",
			summary: "Approve a new deflection KPI definition version",
			tags: ["Analytics"],
		})
		.input(SaveKpiDefinitionRequestSchema)
		.output(KpiDefinitionSchema),
}

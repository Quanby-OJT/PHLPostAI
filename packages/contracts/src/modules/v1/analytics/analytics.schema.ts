import { z } from "zod"

/** Event kinds are a closed vocabulary; new kinds are added by later tickets. */
export const InteractionEventKindSchema = z.enum([
	"conversation_started",
	"conversation_context",
	"message_received",
	"answer_sent",
	"answer_classified",
	"answer_blocked",
	"tracking_lookup",
	"escalated",
	"conversation_closed",
])

/** Daily counts derived only from the append-only interaction_events table. */
export const AnalyticsOverviewSchema = z.object({
	date: z.string().date(),
	conversations: z.number().int().nonnegative(),
	answers: z.number().int().nonnegative(),
	trackingLookups: z.number().int().nonnegative(),
	escalations: z.number().int().nonnegative(),
})

export const DeflectionMethodSchema = z.object({
	eligibleCategories: z
		.array(z.string().min(1))
		.min(1)
		.default(["tracking", "rates", "postal-id", "service-info", "scam"]),
	includeAbandoned: z.boolean().default(false),
	duplicateWindowMinutes: z.number().int().min(0).max(10080).default(0),
	duplicateRule: z.literal("same_session_and_category").default("same_session_and_category"),
	excludeTestSessions: z.boolean().default(true),
	excludeEscalated: z.literal(true).default(true),
	excludeUncertainOrBlocked: z.literal(true).default(true),
	failedInteractions: z.literal("included_unresolved").default("included_unresolved"),
	reportingPeriod: z.literal("selected_calendar_days").default("selected_calendar_days"),
	periodTimezone: z.literal("Asia/Manila").default("Asia/Manila"),
})

export const KpiBaselineSchema = z
	.object({
		eligible: z.number().int().nonnegative(),
		resolved: z.number().int().nonnegative(),
	})
	.refine(
		value => value.resolved <= value.eligible,
		"Resolved baseline cannot exceed eligible volume"
	)

export const KpiDefinitionSchema = z.object({
	id: z.string().uuid(),
	code: z.string(),
	version: z.number().int().positive(),
	method: DeflectionMethodSchema,
	baseline: KpiBaselineSchema.nullable(),
	target: z.number().min(0).max(1),
	approvedBy: z.string(),
	effectiveFrom: z.string().datetime(),
})

export const KpiDefinitionListSchema = z.object({ definitions: z.array(KpiDefinitionSchema) })

export const SaveKpiDefinitionRequestSchema = z.object({
	method: DeflectionMethodSchema,
	baseline: KpiBaselineSchema.nullable().optional(),
	target: z.number().min(0).max(1).default(0.7),
	effectiveFrom: z.string().datetime().optional(),
})

export const DeflectionReportRequestSchema = z
	.object({
		from: z.string().date(),
		to: z.string().date(),
		version: z.coerce.number().int().positive().optional(),
	})
	.refine(value => value.from <= value.to, "Start date must not be after end date")

export const DeflectionReportSchema = z.object({
	definition: KpiDefinitionSchema,
	from: z.string().date(),
	to: z.string().date(),
	numerator: z.number().int().nonnegative(),
	denominator: z.number().int().nonnegative(),
	rate: z.number().min(0).max(1).nullable(),
	target: z.number().min(0).max(1),
	baselineRate: z.number().min(0).max(1).nullable(),
})

export const DeflectionDrilldownRowSchema = z.object({
	conversationId: z.string().uuid(),
	startedAt: z.string().datetime(),
	category: z.string().nullable(),
	resolvedByAi: z.boolean(),
})

export const DeflectionDrilldownSchema = z.object({
	definitionVersion: z.number().int().positive(),
	conversations: z.array(DeflectionDrilldownRowSchema),
})

export type InteractionEventKind = z.infer<typeof InteractionEventKindSchema>
export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>
export type DeflectionMethod = z.infer<typeof DeflectionMethodSchema>
export type KpiBaseline = z.infer<typeof KpiBaselineSchema>
export type KpiDefinition = z.infer<typeof KpiDefinitionSchema>
export type KpiDefinitionList = z.infer<typeof KpiDefinitionListSchema>
export type SaveKpiDefinitionRequest = z.infer<typeof SaveKpiDefinitionRequestSchema>
export type DeflectionReportRequest = z.infer<typeof DeflectionReportRequestSchema>
export type DeflectionReport = z.infer<typeof DeflectionReportSchema>
export type DeflectionDrilldownRow = z.infer<typeof DeflectionDrilldownRowSchema>
export type DeflectionDrilldown = z.infer<typeof DeflectionDrilldownSchema>

export const DashboardTileSchema = z.enum([
	"inquiry-volume",
	"by-category",
	"by-language",
	"by-channel",
	"escalations",
	"response-time",
])

export const AnalyticsDashboardFiltersSchema = z
	.object({
		startDate: z.string().date(),
		endDate: z.string().date(),
		category: z
			.string()
			.regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
			.optional(),
		language: z
			.string()
			.regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
			.optional(),
		channel: z
			.string()
			.regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
			.optional(),
	})
	.refine(filters => filters.startDate <= filters.endDate, {
		message: "startDate must be on or before endDate",
		path: ["endDate"],
	})

export const AnalyticsDashboardSchema = z.object({
	availableFilters: z.object({
		categories: z.array(z.string()),
		languages: z.array(z.string()),
		channels: z.array(z.string()),
	}),
	daily: z.array(z.object({ date: z.string().date(), count: z.number().int().nonnegative() })),
	byCategory: z.array(z.object({ code: z.string(), count: z.number().int().nonnegative() })),
	byLanguage: z.array(z.object({ code: z.string(), count: z.number().int().nonnegative() })),
	byChannel: z.array(z.object({ code: z.string(), count: z.number().int().nonnegative() })),
	inquiries: z.number().int().nonnegative(),
	escalations: z.number().int().nonnegative(),
	escalationRate: z.number().min(0).max(1).nullable(),
	medianResponseTimeMs: z.number().nonnegative().nullable(),
	p95ResponseTimeMs: z.number().nonnegative().nullable(),
})

export const DashboardLayoutSchema = z
	.object({ tiles: z.array(DashboardTileSchema).max(6) })
	.refine(layout => new Set(layout.tiles).size === layout.tiles.length, {
		message: "Dashboard tiles must be unique",
		path: ["tiles"],
	})

export type AnalyticsDashboardFilters = z.infer<typeof AnalyticsDashboardFiltersSchema>
export type AnalyticsDashboard = z.infer<typeof AnalyticsDashboardSchema>
export type DashboardTile = z.infer<typeof DashboardTileSchema>
export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>

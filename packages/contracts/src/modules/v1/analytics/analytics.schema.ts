import { z } from "zod"

/** Event kinds are a closed vocabulary; new kinds are added by later tickets. */
export const InteractionEventKindSchema = z.enum([
	"conversation_started",
	"message_received",
	"answer_sent",
	"tracking_lookup",
	"escalated",
])

/** Daily counts derived only from the append-only interaction_events table. */
export const AnalyticsOverviewSchema = z.object({
	date: z.string().date(),
	conversations: z.number().int().nonnegative(),
	answers: z.number().int().nonnegative(),
	trackingLookups: z.number().int().nonnegative(),
	escalations: z.number().int().nonnegative(),
})

export type InteractionEventKind = z.infer<typeof InteractionEventKindSchema>
export type AnalyticsOverview = z.infer<typeof AnalyticsOverviewSchema>

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

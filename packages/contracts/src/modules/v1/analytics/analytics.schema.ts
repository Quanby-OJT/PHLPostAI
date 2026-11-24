import { z } from "zod"

/** Event kinds are a closed vocabulary; new kinds are added by later tickets. */
export const InteractionEventKindSchema = z.enum([
	"conversation_started",
	"answer_sent",
	"tracking_lookup",
	"scam_assessed",
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

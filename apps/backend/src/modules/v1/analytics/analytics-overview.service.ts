import { Injectable } from "@nestjs/common"
import { sql } from "drizzle-orm"

import type { AnalyticsOverview } from "@repo/contracts"
import { interactionEvents } from "@repo/db/schema"

import { db } from "@/common/database/database.client"

/** Daily aggregates for the overview, using Asia/Manila calendar days. */
@Injectable()
export class AnalyticsOverviewService {
	async getToday(): Promise<AnalyticsOverview> {
		const [row] = await db
			.select({
				date: sql<string>`to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD')`,
				conversations: sql<number>`count(*) filter (where ${interactionEvents.kind} = 'conversation_started')::int`,
				answers: sql<number>`count(*) filter (where ${interactionEvents.kind} = 'message_answered')::int`,
				trackingLookups: sql<number>`count(*) filter (where ${interactionEvents.kind} = 'tracking_lookup')::int`,
				escalations: sql<number>`count(*) filter (where ${interactionEvents.kind} = 'escalation_requested')::int`,
			})
			.from(interactionEvents).where(sql`
				${interactionEvents.occurredAt} >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')
				and ${interactionEvents.occurredAt} < ((date_trunc('day', now() at time zone 'Asia/Manila') + interval '1 day') at time zone 'Asia/Manila')
			`)

		return {
			date: row?.date ?? new Date().toISOString().slice(0, 10),
			conversations: Number(row?.conversations ?? 0),
			answers: Number(row?.answers ?? 0),
			trackingLookups: Number(row?.trackingLookups ?? 0),
			escalations: Number(row?.escalations ?? 0),
		}
	}
}

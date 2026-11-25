import { Injectable } from "@nestjs/common"
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm"

import type {
	AnalyticsDashboard,
	AnalyticsDashboardFilters,
	DashboardLayout,
} from "@repo/contracts"
import { dashboardLayouts, interactionEvents } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { db } from "@/common/database/database.client"

export const DEFAULT_DASHBOARD_TILES = [
	"inquiry-volume",
	"by-category",
	"by-language",
	"by-channel",
	"escalations",
	"response-time",
] as const

@Injectable()
export class AnalyticsDashboardService {
	constructor(private readonly auditService: AuditService) {}

	async getDashboard(filters: AnalyticsDashboardFilters): Promise<AnalyticsDashboard> {
		const where = this.eventFilters(filters)
		const dateBucket = sql<string>`to_char(${interactionEvents.occurredAt} at time zone 'Asia/Manila', 'YYYY-MM-DD')`
		const [
			dailyRows,
			categoryRows,
			languageRows,
			channelRows,
			categoryOptions,
			languageOptions,
			channelOptions,
			[totals],
		] = await Promise.all([
			db
				.select({ date: dateBucket, count: sql<number>`count(*)::int` })
				.from(interactionEvents)
				.where(and(where, eq(interactionEvents.kind, "message_received")))
				.groupBy(dateBucket)
				.orderBy(asc(dateBucket)),
			db
				.select({ code: interactionEvents.category, count: sql<number>`count(*)::int` })
				.from(interactionEvents)
				.where(and(where, eq(interactionEvents.kind, "message_received")))
				.groupBy(interactionEvents.category)
				.orderBy(asc(interactionEvents.category)),
			db
				.select({ code: interactionEvents.language, count: sql<number>`count(*)::int` })
				.from(interactionEvents)
				.where(and(where, eq(interactionEvents.kind, "message_received")))
				.groupBy(interactionEvents.language)
				.orderBy(asc(interactionEvents.language)),
			db
				.select({ code: interactionEvents.channelCode, count: sql<number>`count(*)::int` })
				.from(interactionEvents)
				.where(and(where, eq(interactionEvents.kind, "message_received")))
				.groupBy(interactionEvents.channelCode)
				.orderBy(asc(interactionEvents.channelCode)),
			db
				.select({ code: interactionEvents.category })
				.from(interactionEvents)
				.where(and(this.periodFilters(filters), eq(interactionEvents.kind, "message_received")))
				.groupBy(interactionEvents.category)
				.orderBy(asc(interactionEvents.category)),
			db
				.select({ code: interactionEvents.language })
				.from(interactionEvents)
				.where(and(this.periodFilters(filters), eq(interactionEvents.kind, "message_received")))
				.groupBy(interactionEvents.language)
				.orderBy(asc(interactionEvents.language)),
			db
				.select({ code: interactionEvents.channelCode })
				.from(interactionEvents)
				.where(and(this.periodFilters(filters), eq(interactionEvents.kind, "message_received")))
				.groupBy(interactionEvents.channelCode)
				.orderBy(asc(interactionEvents.channelCode)),
			db
				.select({
					inquiries: sql<number>`count(*) filter (where ${interactionEvents.kind} = 'message_received')::int`,
					escalations: sql<number>`count(*) filter (where ${interactionEvents.kind} = 'escalated')::int`,
					median: sql<
						number | null
					>`percentile_cont(0.5) within group (order by (${interactionEvents.payload}->>'response_time_ms')::double precision) filter (where ${interactionEvents.kind} = 'answer_sent')`,
					p95: sql<
						number | null
					>`percentile_cont(0.95) within group (order by (${interactionEvents.payload}->>'response_time_ms')::double precision) filter (where ${interactionEvents.kind} = 'answer_sent')`,
				})
				.from(interactionEvents)
				.where(where),
		])

		const dailyCounts = new Map(dailyRows.map(row => [row.date, Number(row.count)]))
		const daily = this.daysInRange(filters).map(date => ({
			date,
			count: dailyCounts.get(date) ?? 0,
		}))
		const inquiries = Number(totals?.inquiries ?? 0)
		const escalations = Number(totals?.escalations ?? 0)

		return {
			availableFilters: {
				categories: categoryOptions.flatMap(row => (row.code ? [row.code] : [])),
				languages: languageOptions.map(row => row.code),
				channels: channelOptions.map(row => row.code),
			},
			daily,
			byCategory: categoryRows
				.filter((row): row is typeof row & { code: string } => row.code !== null)
				.map(row => ({ code: row.code, count: Number(row.count) })),
			byLanguage: languageRows.map(row => ({ code: row.code, count: Number(row.count) })),
			byChannel: channelRows.map(row => ({ code: row.code, count: Number(row.count) })),
			inquiries,
			escalations,
			escalationRate: inquiries ? escalations / inquiries : null,
			medianResponseTimeMs:
				totals?.median === null || totals?.median === undefined ? null : Number(totals.median),
			p95ResponseTimeMs:
				totals?.p95 === null || totals?.p95 === undefined ? null : Number(totals.p95),
		}
	}

	async getLayout(userId: string): Promise<DashboardLayout> {
		const [personal] = await db
			.select({ tiles: dashboardLayouts.tiles })
			.from(dashboardLayouts)
			.where(eq(dashboardLayouts.userId, userId))
			.limit(1)
		if (personal) return { tiles: personal.tiles as DashboardLayout["tiles"] }

		const [workspaceDefault] = await db
			.select({ tiles: dashboardLayouts.tiles })
			.from(dashboardLayouts)
			.where(isNull(dashboardLayouts.userId))
			.limit(1)
		return {
			tiles: (workspaceDefault?.tiles ?? DEFAULT_DASHBOARD_TILES) as DashboardLayout["tiles"],
		}
	}

	async saveLayout(userId: string, layout: DashboardLayout): Promise<DashboardLayout> {
		const tiles = [...layout.tiles]
		const before = await this.getLayout(userId)
		await db.transaction(async tx => {
			await tx
				.insert(dashboardLayouts)
				.values({ userId, tiles })
				.onConflictDoUpdate({ target: dashboardLayouts.userId, set: { tiles } })
			await this.auditService.writeAudit(
				{
					actorId: userId,
					actorType: "user",
					action: "analytics.dashboard.layout.updated",
					resourceType: "dashboard_layout",
					resourceId: userId,
					before: { tiles: before.tiles },
					after: { tiles },
				},
				tx
			)
		})
		return { tiles: tiles as DashboardLayout["tiles"] }
	}

	private eventFilters(filters: AnalyticsDashboardFilters) {
		return and(
			this.periodFilters(filters),
			filters.category ? eq(interactionEvents.category, filters.category) : undefined,
			filters.language ? eq(interactionEvents.language, filters.language) : undefined,
			filters.channel ? eq(interactionEvents.channelCode, filters.channel) : undefined
		)
	}

	private periodFilters(filters: AnalyticsDashboardFilters) {
		const startAt = new Date(`${filters.startDate}T00:00:00.000+08:00`)
		const nextDay = new Date(`${filters.endDate}T00:00:00.000+08:00`)
		nextDay.setUTCDate(nextDay.getUTCDate() + 1)
		return and(
			gte(interactionEvents.occurredAt, startAt),
			lt(interactionEvents.occurredAt, nextDay)
		)
	}

	private daysInRange(filters: AnalyticsDashboardFilters): string[] {
		const current = new Date(`${filters.startDate}T00:00:00.000Z`)
		const last = new Date(`${filters.endDate}T00:00:00.000Z`)
		const days: string[] = []
		while (current <= last) {
			days.push(current.toISOString().slice(0, 10))
			current.setUTCDate(current.getUTCDate() + 1)
		}
		return days
	}
}

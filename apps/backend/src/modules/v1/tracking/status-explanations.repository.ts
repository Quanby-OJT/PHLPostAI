import { Injectable } from "@nestjs/common"
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { EXPLANATION_LANGUAGES, type ExplanationLanguage } from "@repo/contracts"
import {
	conversations,
	customerSessions,
	messages,
	statusExplanations,
	trackingLookups,
} from "@repo/db/schema"

import { db } from "@/common/database/database.client"

export type StatusExplanationRow = Omit<typeof statusExplanations.$inferSelect, "language"> & {
	language: ExplanationLanguage
}

function toRow(row: typeof statusExplanations.$inferSelect): StatusExplanationRow {
	return { ...row, language: row.language as ExplanationLanguage }
}

export interface NeededExplanationRow {
	statusCode: string
	language: ExplanationLanguage
	lookups: number
	lastSeenAt: Date
}

@Injectable()
export class StatusExplanationsRepository {
	async list(): Promise<StatusExplanationRow[]> {
		const rows = await db
			.select()
			.from(statusExplanations)
			.orderBy(asc(statusExplanations.statusCode), asc(statusExplanations.language))
		return rows.map(toRow)
	}

	async findById(id: string): Promise<StatusExplanationRow | null> {
		const [row] = await db.select().from(statusExplanations).where(eq(statusExplanations.id, id))
		return row ? toRow(row) : null
	}

	async find(statusCode: string, language: string): Promise<StatusExplanationRow | null> {
		const [row] = await db
			.select()
			.from(statusExplanations)
			.where(
				and(
					eq(statusExplanations.statusCode, statusCode),
					eq(statusExplanations.language, language)
				)
			)
		return row ? toRow(row) : null
	}

	async findActive(statusCode: string, language: string): Promise<StatusExplanationRow | null> {
		const row = await this.find(statusCode, language)
		return row?.isActive ? row : null
	}

	async upsert(input: {
		statusCode: string
		language: string
		explanation: string
		nextSteps: string | null
	}): Promise<StatusExplanationRow> {
		const now = new Date()
		const [row] = await db
			.insert(statusExplanations)
			.values({ ...input, isActive: true })
			.onConflictDoUpdate({
				target: [statusExplanations.statusCode, statusExplanations.language],
				set: {
					explanation: input.explanation,
					nextSteps: input.nextSteps,
					isActive: true,
					updatedAt: now,
				},
			})
			.returning()
		if (!row) throw new Error("Failed to save status explanation")
		return toRow(row)
	}

	async deactivate(id: string): Promise<StatusExplanationRow | null> {
		const [row] = await db
			.update(statusExplanations)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(statusExplanations.id, id))
			.returning()
		return row ? toRow(row) : null
	}

	/** Status codes that lookups returned, per customer language, with no active explanation. */
	async needed(): Promise<NeededExplanationRow[]> {
		const lastSeen = sql<Date>`max(${trackingLookups.createdAt})`
		const rows = await db
			.select({
				statusCode: trackingLookups.statusCode,
				language: customerSessions.language,
				lookups: sql<number>`count(*)::int`,
				lastSeenAt: lastSeen,
			})
			.from(trackingLookups)
			.innerJoin(messages, eq(messages.id, trackingLookups.messageId))
			.innerJoin(conversations, eq(conversations.id, messages.conversationId))
			.innerJoin(customerSessions, eq(customerSessions.id, conversations.customerSessionId))
			.leftJoin(
				statusExplanations,
				and(
					eq(statusExplanations.statusCode, trackingLookups.statusCode),
					eq(statusExplanations.language, customerSessions.language),
					eq(statusExplanations.isActive, true)
				)
			)
			.where(
				and(
					eq(trackingLookups.outcome, "found"),
					isNotNull(trackingLookups.statusCode),
					isNull(statusExplanations.id),
					inArray(customerSessions.language, [...EXPLANATION_LANGUAGES])
				)
			)
			.groupBy(trackingLookups.statusCode, customerSessions.language)
			.orderBy(desc(lastSeen))

		return rows.map(row => ({
			statusCode: row.statusCode ?? "",
			language: row.language as ExplanationLanguage,
			lookups: Number(row.lookups),
			lastSeenAt: new Date(row.lastSeenAt),
		}))
	}
}

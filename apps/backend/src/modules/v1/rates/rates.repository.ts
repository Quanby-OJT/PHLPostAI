import { Injectable } from "@nestjs/common"
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm"

import type { RatePreviewRow } from "@repo/contracts"
import { rateBatches, rateEntries } from "@repo/db/schema"

import { db } from "@/common/database/database.client"

export type RateBatchRow = typeof rateBatches.$inferSelect
export type RateEntryRow = typeof rateEntries.$inferSelect

export interface RateCatalog {
	services: { code: string; name: string }[]
	zones: string[]
}

const INSERT_CHUNK = 500

/** Entries that are approved and in effect on the given date (YYYY-MM-DD). */
function inEffectOn(date: string) {
	return and(
		eq(rateEntries.status, "approved"),
		lte(rateEntries.effectiveFrom, date),
		or(isNull(rateEntries.effectiveTo), gte(rateEntries.effectiveTo, date))
	)
}

@Injectable()
export class RatesRepository {
	async listApprovedEntries(): Promise<RateEntryRow[]> {
		return db
			.select()
			.from(rateEntries)
			.where(eq(rateEntries.status, "approved"))
			.orderBy(
				asc(rateEntries.serviceCode),
				asc(rateEntries.zone),
				asc(rateEntries.weightMinG),
				desc(rateEntries.effectiveFrom)
			)
	}

	async listBatches(): Promise<RateBatchRow[]> {
		return db.select().from(rateBatches).orderBy(desc(rateBatches.createdAt))
	}

	async findBatch(id: string): Promise<RateBatchRow | null> {
		const [row] = await db.select().from(rateBatches).where(eq(rateBatches.id, id))
		return row ?? null
	}

	async listEntriesForBatches(batchIds: string[]): Promise<RateEntryRow[]> {
		if (batchIds.length === 0) return []
		return db
			.select()
			.from(rateEntries)
			.where(inArray(rateEntries.batchId, batchIds))
			.orderBy(asc(rateEntries.serviceCode), asc(rateEntries.zone), asc(rateEntries.weightMinG))
	}

	async listPendingBatches(): Promise<RateBatchRow[]> {
		return db
			.select()
			.from(rateBatches)
			.where(eq(rateBatches.status, "pending"))
			.orderBy(asc(rateBatches.createdAt))
	}

	async createBatch(input: {
		fileName: string
		submittedBy: string
		rows: RatePreviewRow[]
	}): Promise<{ batch: RateBatchRow; entries: RateEntryRow[] }> {
		return db.transaction(async tx => {
			const [batch] = await tx
				.insert(rateBatches)
				.values({
					fileName: input.fileName,
					rowCount: input.rows.length,
					submittedBy: input.submittedBy,
				})
				.returning()
			if (!batch) throw new Error("Failed to create rate batch")

			const entries: RateEntryRow[] = []
			for (let i = 0; i < input.rows.length; i += INSERT_CHUNK) {
				const chunk = input.rows.slice(i, i + INSERT_CHUNK).map(row => ({
					batchId: batch.id,
					serviceCode: row.serviceCode,
					serviceName: row.serviceName,
					zone: row.zone,
					weightMinG: row.weightMinG,
					weightMaxG: row.weightMaxG,
					priceCentavos: row.priceCentavos,
					effectiveFrom: row.effectiveFrom,
					effectiveTo: row.effectiveTo,
				}))
				entries.push(...(await tx.insert(rateEntries).values(chunk).returning()))
			}
			return { batch, entries }
		})
	}

	/** Pending → approved or rejected, together with its rows. Null when no longer pending. */
	async reviewBatch(input: {
		id: string
		status: "approved" | "rejected"
		reviewedBy: string
		note?: string
	}): Promise<RateBatchRow | null> {
		return db.transaction(async tx => {
			const now = new Date()
			const [batch] = await tx
				.update(rateBatches)
				.set({
					status: input.status,
					reviewedBy: input.reviewedBy,
					reviewedAt: now,
					reviewNote: input.note ?? null,
					updatedAt: now,
				})
				.where(and(eq(rateBatches.id, input.id), eq(rateBatches.status, "pending")))
				.returning()
			if (!batch) return null
			await tx
				.update(rateEntries)
				.set({ status: input.status })
				.where(eq(rateEntries.batchId, input.id))
			return batch
		})
	}

	/** The services and zones that have a rate in effect on the date. */
	async catalog(date: string): Promise<RateCatalog> {
		const rows = await db
			.selectDistinct({
				code: rateEntries.serviceCode,
				name: rateEntries.serviceName,
				zone: rateEntries.zone,
			})
			.from(rateEntries)
			.where(inEffectOn(date))
		const services = new Map<string, string>()
		const zones = new Map<string, string>()
		for (const row of rows) {
			services.set(row.code, row.name)
			zones.set(row.zone.toLowerCase(), row.zone)
		}
		return {
			services: [...services].map(([code, name]) => ({ code, name })),
			zones: [...zones.values()],
		}
	}

	/** The newest approved entry in effect on the date for this service, zone and weight. */
	async findRate(input: {
		serviceCode: string
		zone: string
		weightG: number
		date: string
	}): Promise<RateEntryRow | null> {
		const [row] = await db
			.select()
			.from(rateEntries)
			.where(
				and(
					inEffectOn(input.date),
					eq(rateEntries.serviceCode, input.serviceCode),
					sql`lower(${rateEntries.zone}) = ${input.zone.toLowerCase()}`,
					lte(rateEntries.weightMinG, input.weightG),
					gte(rateEntries.weightMaxG, input.weightG)
				)
			)
			.orderBy(desc(rateEntries.effectiveFrom), desc(rateEntries.createdAt))
			.limit(1)
		return row ?? null
	}
}

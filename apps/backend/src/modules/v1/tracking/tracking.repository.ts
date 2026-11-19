import { Injectable } from "@nestjs/common"

import { trackingLookups, type TrackingLookupOutcome } from "@repo/db/schema"

import type { DbTransaction } from "@/common/database/database.client"

export interface TrackingLookupRecord {
	connectorCode: string
	trackingNumberHash: string
	outcome: TrackingLookupOutcome
	statusCode: string | null
	latencyMs: number
}

@Injectable()
export class TrackingRepository {
	async insertLookup(
		tx: Pick<DbTransaction, "insert">,
		row: TrackingLookupRecord & { messageId: string }
	): Promise<void> {
		await tx.insert(trackingLookups).values(row)
	}
}

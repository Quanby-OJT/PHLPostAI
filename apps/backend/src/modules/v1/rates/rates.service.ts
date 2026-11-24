import { Injectable } from "@nestjs/common"
import { ORPCError } from "@orpc/server"

import type { RateCsvRequest, RatePreview } from "@repo/contracts"

import { AuditService } from "@/common/audit/audit.service"

import { validateRateCsv } from "./rates.csv"
import { RatesRepository, type RateBatchRow, type RateEntryRow } from "./rates.repository"

export interface RateActor {
	userId: string
}

export type RateBatchWithEntries = RateBatchRow & { entries: RateEntryRow[] }

/** Rate table maintenance (KB-2): CSV import, preview, and second-person batch approval. */
@Injectable()
export class RatesService {
	constructor(
		private readonly repository: RatesRepository,
		private readonly auditService: AuditService
	) {}

	listEntries(): Promise<RateEntryRow[]> {
		return this.repository.listApprovedEntries()
	}

	listBatches(): Promise<RateBatchRow[]> {
		return this.repository.listBatches()
	}

	preview(input: RateCsvRequest): RatePreview {
		return validateRateCsv(input.csv)
	}

	async submit(input: RateCsvRequest, actor: RateActor): Promise<RateBatchWithEntries> {
		const preview = validateRateCsv(input.csv)
		if (!preview.valid) {
			throw new ORPCError("BAD_REQUEST", {
				message: `The file has ${preview.errors.length} error(s). Fix them and preview again.`,
			})
		}
		const { batch, entries } = await this.repository.createBatch({
			fileName: input.fileName,
			submittedBy: actor.userId,
			rows: preview.rows,
		})
		await this.audit(actor, "rates.batch.submit", batch.id, null, {
			fileName: batch.fileName,
			rowCount: batch.rowCount,
		})
		return { ...batch, entries }
	}

	async reviewQueue(): Promise<RateBatchWithEntries[]> {
		const batches = await this.repository.listPendingBatches()
		const entries = await this.repository.listEntriesForBatches(batches.map(batch => batch.id))
		return batches.map(batch => ({
			...batch,
			entries: entries.filter(entry => entry.batchId === batch.id),
		}))
	}

	/** Flow E: a different user approves; all rows of the batch go live together. */
	async approve(id: string, actor: RateActor): Promise<RateBatchRow> {
		const batch = await this.pendingBatch(id)
		if (batch.submittedBy === actor.userId) {
			await this.audit(
				actor,
				"rates.batch.approve_refused",
				id,
				{ status: batch.status },
				{ outcome: "denied", reason: "self_approval", submittedBy: batch.submittedBy }
			)
			throw new ORPCError("FORBIDDEN", {
				message: "You submitted this batch, so a different user must approve it",
			})
		}
		const approved = await this.repository.reviewBatch({
			id,
			status: "approved",
			reviewedBy: actor.userId,
		})
		if (!approved) throw this.notPending()
		await this.audit(
			actor,
			"rates.batch.approve",
			id,
			{ status: "pending" },
			{
				status: "approved",
				rowCount: approved.rowCount,
			}
		)
		return approved
	}

	async reject(id: string, note: string, actor: RateActor): Promise<RateBatchRow> {
		await this.pendingBatch(id)
		const rejected = await this.repository.reviewBatch({
			id,
			status: "rejected",
			reviewedBy: actor.userId,
			note,
		})
		if (!rejected) throw this.notPending()
		await this.audit(
			actor,
			"rates.batch.reject",
			id,
			{ status: "pending" },
			{
				status: "rejected",
				note,
			}
		)
		return rejected
	}

	private async pendingBatch(id: string): Promise<RateBatchRow> {
		const batch = await this.repository.findBatch(id)
		if (!batch) throw new ORPCError("NOT_FOUND", { message: "Rate batch not found" })
		if (batch.status !== "pending") throw this.notPending()
		return batch
	}

	private notPending(): Error {
		return new ORPCError("CONFLICT", { message: "This batch has already been reviewed" })
	}

	private async audit(
		actor: RateActor,
		action: string,
		resourceId: string,
		before: unknown,
		after: unknown
	): Promise<void> {
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: "user",
			action,
			resourceType: "rate_batch",
			resourceId,
			before,
			after,
		})
	}
}

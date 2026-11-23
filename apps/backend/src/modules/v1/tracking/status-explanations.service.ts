import { Injectable } from "@nestjs/common"
import { ORPCError } from "@orpc/server"

import type { SaveStatusExplanationRequest } from "@repo/contracts"

import { AuditService } from "@/common/audit/audit.service"

import {
	StatusExplanationsRepository,
	type NeededExplanationRow,
	type StatusExplanationRow,
} from "./status-explanations.repository"

export interface ExplanationActor {
	userId: string
}

@Injectable()
export class StatusExplanationsService {
	constructor(
		private readonly repository: StatusExplanationsRepository,
		private readonly auditService: AuditService
	) {}

	list(): Promise<StatusExplanationRow[]> {
		return this.repository.list()
	}

	needed(): Promise<NeededExplanationRow[]> {
		return this.repository.needed()
	}

	async save(
		input: SaveStatusExplanationRequest,
		actor: ExplanationActor
	): Promise<StatusExplanationRow> {
		const before = await this.repository.find(input.statusCode, input.language)
		const row = await this.repository.upsert(input)
		await this.audit(actor, "tracking.explanation.save", row.id, before, row)
		return row
	}

	async deactivate(id: string, actor: ExplanationActor): Promise<StatusExplanationRow> {
		const before = await this.repository.findById(id)
		if (!before) throw new ORPCError("NOT_FOUND", { message: "Explanation not found" })
		const row = await this.repository.deactivate(id)
		if (!row) throw new ORPCError("NOT_FOUND", { message: "Explanation not found" })
		await this.audit(actor, "tracking.explanation.deactivate", id, before, row)
		return row
	}

	private async audit(
		actor: ExplanationActor,
		action: string,
		resourceId: string,
		before: StatusExplanationRow | null,
		after: StatusExplanationRow
	): Promise<void> {
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: "user",
			action,
			resourceType: "status_explanation",
			resourceId,
			before,
			after,
		})
	}
}

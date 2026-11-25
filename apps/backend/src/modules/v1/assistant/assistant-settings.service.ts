import { Injectable } from "@nestjs/common"

import type { AssistantSettings, UpdateAssistantSettingsRequest } from "@repo/contracts"

import { AuditService } from "@/common/audit/audit.service"

import { AssistantSettingsRepository } from "./assistant-settings.repository"

/** Defaults are deliberately conservative and can be changed by an administrator. */
export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
	confidenceThreshold: 0.7,
	maxOutputTokens: 200,
}

@Injectable()
export class AssistantSettingsService {
	constructor(
		private readonly repository: AssistantSettingsRepository,
		private readonly auditService: AuditService
	) {}

	/** The only reader of `assistant_settings` for CNV-3 consumers. */
	async get(): Promise<AssistantSettings> {
		const rows = await this.repository.list()
		const values = new Map(rows.map(row => [row.key, row.value]))
		const confidenceThreshold = values.get("confidence_threshold")
		const maxOutputTokens = values.get("max_output_tokens")
		return {
			confidenceThreshold:
				typeof confidenceThreshold === "number"
					? Math.max(0, Math.min(1, confidenceThreshold))
					: DEFAULT_ASSISTANT_SETTINGS.confidenceThreshold,
			maxOutputTokens:
				typeof maxOutputTokens === "number"
					? Math.max(1, Math.min(200, Math.trunc(maxOutputTokens)))
					: DEFAULT_ASSISTANT_SETTINGS.maxOutputTokens,
		}
	}

	/** Writes through this service and audits the complete old/new settings snapshot. */
	async update(
		input: UpdateAssistantSettingsRequest,
		actor: { userId: string }
	): Promise<AssistantSettings> {
		const before = await this.get()
		const after: AssistantSettings = { ...before, ...input }
		const entries: { key: string; value: number }[] = []
		if (input.confidenceThreshold !== undefined) {
			entries.push({ key: "confidence_threshold", value: input.confidenceThreshold })
		}
		if (input.maxOutputTokens !== undefined) {
			entries.push({ key: "max_output_tokens", value: input.maxOutputTokens })
		}
		await this.repository.setMany(entries, actor.userId)
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: "user",
			action: "assistant.settings.update",
			resourceType: "assistant_settings",
			resourceId: "customer-support",
			before,
			after,
		})
		return after
	}
}

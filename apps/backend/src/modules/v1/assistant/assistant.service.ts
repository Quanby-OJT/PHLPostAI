import { Injectable } from "@nestjs/common"
import { ORPCError } from "@orpc/server"

import type { CreateInquiryCategoryRequest, UpdateInquiryCategoryRequest } from "@repo/contracts"

import { AuditService } from "@/common/audit/audit.service"

import { AssistantRepository, type InquiryCategoryRow } from "./assistant.repository"

export interface AssistantActor {
	userId: string
}

/** The classifier's fallback category (CNV-2 AC2); it must stay active. */
export const FALLBACK_CATEGORY = "other"

@Injectable()
export class AssistantService {
	constructor(
		private readonly repository: AssistantRepository,
		private readonly auditService: AuditService
	) {}

	listCategories(): Promise<InquiryCategoryRow[]> {
		return this.repository.listCategories()
	}

	/** The categories the classifier may choose from (CNV-2 AC3). */
	listActiveCategories(): Promise<{ code: string; name: string }[]> {
		return this.repository.listActiveCategories()
	}

	async createCategory(
		input: CreateInquiryCategoryRequest,
		actor: AssistantActor
	): Promise<InquiryCategoryRow> {
		const created = await this.repository.createCategory(input)
		if (!created) {
			throw new ORPCError("CONFLICT", { message: "A category with this code already exists" })
		}
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: "user",
			action: "assistant.category.create",
			resourceType: "inquiry_category",
			resourceId: created.code,
			before: null,
			after: created,
		})
		return created
	}

	async updateCategory(
		input: UpdateInquiryCategoryRequest,
		actor: AssistantActor
	): Promise<InquiryCategoryRow> {
		const normalizedCode = input.code.trim().toLowerCase()
		if (normalizedCode === FALLBACK_CATEGORY && input.isActive === false) {
			throw new ORPCError("BAD_REQUEST", {
				message: "The other category is the fallback and can't be deactivated",
			})
		}
		const before = await this.repository.findCategoryByCode(normalizedCode)
		if (!before) {
			throw new ORPCError("NOT_FOUND", { message: "Inquiry category not found" })
		}
		const updated = await this.repository.updateCategory(normalizedCode, {
			isEligible: input.isEligible,
			isActive: input.isActive,
		})
		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Inquiry category not found" })
		}
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: "user",
			action: "assistant.category.update",
			resourceType: "inquiry_category",
			resourceId: normalizedCode,
			before,
			after: updated,
		})
		return updated
	}
}

import { Injectable } from "@nestjs/common"
import { ORPCError } from "@orpc/server"
import { asc, eq } from "drizzle-orm"

import type {
	CreateOfficialContact,
	CreateRiskIndicator,
	UpdateRiskIndicator,
} from "@repo/contracts"
import { officialContacts, riskIndicators } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { db } from "@/common/database/database.client"

import { normalizeOfficialContact } from "../customer/scam-contacts"

@Injectable()
export class ScamConfigurationService {
	constructor(private readonly auditService: AuditService) {}

	async listIndicators() {
		return db.select().from(riskIndicators).orderBy(asc(riskIndicators.code))
	}

	async listContacts() {
		return db
			.select()
			.from(officialContacts)
			.orderBy(asc(officialContacts.kind), asc(officialContacts.value))
	}

	async createIndicator(input: CreateRiskIndicator, userId: string) {
		return db.transaction(async tx => {
			const [created] = await tx
				.insert(riskIndicators)
				.values(input)
				.onConflictDoNothing({ target: riskIndicators.code })
				.returning()
			if (!created)
				throw new ORPCError("CONFLICT", { message: "An indicator with this code already exists" })
			await this.auditService.writeAudit(
				{
					actorId: userId,
					actorType: "user",
					action: "scam.indicator.create",
					resourceType: "risk_indicator",
					resourceId: created.id,
					after: created,
				},
				tx
			)
			return created
		})
	}

	async updateIndicator({ code, weight, isActive }: UpdateRiskIndicator, userId: string) {
		return db.transaction(async tx => {
			const [before] = await tx
				.select()
				.from(riskIndicators)
				.where(eq(riskIndicators.code, code))
				.for("update")
			if (!before) throw new ORPCError("NOT_FOUND", { message: "Risk indicator not found" })
			if (
				(weight ?? before.weight) === before.weight &&
				(isActive ?? before.isActive) === before.isActive
			)
				return before
			const [updated] = await tx
				.update(riskIndicators)
				.set({ weight, isActive, updatedAt: new Date() })
				.where(eq(riskIndicators.id, before.id))
				.returning()
			if (!updated) throw new ORPCError("NOT_FOUND", { message: "Risk indicator not found" })
			await this.auditService.writeAudit(
				{
					actorId: userId,
					actorType: "user",
					action: "scam.indicator.update",
					resourceType: "risk_indicator",
					resourceId: updated.id,
					before,
					after: updated,
				},
				tx
			)
			return updated
		})
	}

	async createContact({ kind, value }: CreateOfficialContact, userId: string) {
		const normalized = normalizeOfficialContact(kind, value)
		if (!normalized)
			throw new ORPCError("BAD_REQUEST", {
				message:
					kind === "domain"
						? "Enter a hostname such as phlpost.gov.ph"
						: "Enter a plain contact name",
			})
		return db.transaction(async tx => {
			const [created] = await tx
				.insert(officialContacts)
				.values({ kind, value: normalized })
				.onConflictDoNothing({ target: [officialContacts.kind, officialContacts.value] })
				.returning()
			if (!created)
				throw new ORPCError("CONFLICT", { message: "This official contact already exists" })
			await this.auditService.writeAudit(
				{
					actorId: userId,
					actorType: "user",
					action: "scam.official_contact.create",
					resourceType: "official_contact",
					resourceId: created.id,
					after: created,
				},
				tx
			)
			return created
		})
	}
}

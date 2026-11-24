import type { AuditService } from "@/common/audit/audit.service"

import type { AssistantRepository } from "./assistant.repository"
import { AssistantService } from "./assistant.service"

jest.mock("@orpc/server", () => ({
	ORPCError: class ORPCError extends Error {
		constructor(
			public readonly code: string,
			options?: { message?: string }
		) {
			super(options?.message ?? code)
		}
	},
}))
jest.mock("@/common/audit/audit.service", () => ({ AuditService: class AuditService {} }))
jest.mock("./assistant.repository", () => ({
	AssistantRepository: class AssistantRepository {},
}))

const RATES = {
	code: "rates",
	name: "Rates",
	isEligible: true,
	isActive: true,
	createdAt: new Date("2026-11-23T00:00:00Z"),
	updatedAt: new Date("2026-11-23T00:00:00Z"),
}

describe("AssistantService (CNV-2 categories)", () => {
	let repository: {
		listCategories: jest.Mock
		listActiveCategories: jest.Mock
		findCategoryByCode: jest.Mock
		createCategory: jest.Mock
		updateCategory: jest.Mock
	}
	let auditService: { writeAudit: jest.Mock }
	let service: AssistantService

	beforeEach(() => {
		repository = {
			listCategories: jest.fn().mockResolvedValue([RATES]),
			listActiveCategories: jest.fn().mockResolvedValue([{ code: "rates", name: "Rates" }]),
			findCategoryByCode: jest.fn().mockResolvedValue(RATES),
			createCategory: jest.fn(),
			updateCategory: jest.fn().mockResolvedValue({ ...RATES, isEligible: false }),
		}
		auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		service = new AssistantService(
			repository as unknown as AssistantRepository,
			auditService as unknown as AuditService
		)
	})

	describe("AC3: adding a category", () => {
		it("creates it and audits the change", async () => {
			const created = { ...RATES, code: "customs-help", name: "Customs help", isEligible: false }
			repository.createCategory.mockResolvedValue(created)

			const result = await service.createCategory(
				{ code: "customs-help", name: "Customs help", isEligible: false },
				{ userId: "user-1" }
			)

			expect(result).toBe(created)
			expect(auditService.writeAudit).toHaveBeenCalledWith({
				actorId: "user-1",
				actorType: "user",
				action: "assistant.category.create",
				resourceType: "inquiry_category",
				resourceId: "customs-help",
				before: null,
				after: created,
			})
		})

		it("refuses a code that already exists and audits nothing", async () => {
			repository.createCategory.mockResolvedValue(null)

			await expect(
				service.createCategory(
					{ code: "rates", name: "Rates again", isEligible: true },
					{ userId: "user-1" }
				)
			).rejects.toThrow("A category with this code already exists")
			expect(auditService.writeAudit).not.toHaveBeenCalled()
		})
	})

	describe("AC3: changing eligibility", () => {
		it("updates the category and audits before and after", async () => {
			const updated = await service.updateCategory(
				{ code: "Rates", isEligible: false, isActive: true },
				{ userId: "user-1" }
			)

			expect(repository.updateCategory).toHaveBeenCalledWith("rates", {
				isEligible: false,
				isActive: true,
			})
			expect(auditService.writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "assistant.category.update",
					resourceId: "rates",
					before: RATES,
					after: updated,
				})
			)
		})

		it("answers not found for an unknown category", async () => {
			repository.findCategoryByCode.mockResolvedValue(null)

			await expect(
				service.updateCategory({ code: "refunds", isEligible: true }, { userId: "user-1" })
			).rejects.toThrow("Inquiry category not found")
			expect(auditService.writeAudit).not.toHaveBeenCalled()
		})
	})

	it("AC2: never deactivates the fallback category", async () => {
		await expect(
			service.updateCategory(
				{ code: "other", isEligible: false, isActive: false },
				{ userId: "user-1" }
			)
		).rejects.toThrow("can't be deactivated")
		expect(repository.updateCategory).not.toHaveBeenCalled()
	})

	it("lists the active categories for the classifier", async () => {
		await expect(service.listActiveCategories()).resolves.toEqual([
			{ code: "rates", name: "Rates" },
		])
	})
})

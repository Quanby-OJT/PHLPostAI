import type { AuditService } from "@/common/audit/audit.service"

import type { StatusExplanationsRepository } from "./status-explanations.repository"
import { StatusExplanationsService } from "./status-explanations.service"

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
jest.mock("./status-explanations.repository", () => ({
	StatusExplanationsRepository: class StatusExplanationsRepository {},
}))

const ROW = {
	id: "11111111-1111-4111-8111-111111111111",
	statusCode: "HELD_AT_CUSTOMS",
	language: "en",
	explanation: "Customs is checking your item.",
	nextSteps: "Prepare the invoice.",
	isActive: true,
	createdAt: new Date("2026-11-23T00:00:00Z"),
	updatedAt: new Date("2026-11-23T00:00:00Z"),
}

describe("StatusExplanationsService (TRK-2)", () => {
	let repository: {
		find: jest.Mock
		findById: jest.Mock
		upsert: jest.Mock
		deactivate: jest.Mock
		list: jest.Mock
		needed: jest.Mock
	}
	let auditService: { writeAudit: jest.Mock }
	let service: StatusExplanationsService

	beforeEach(() => {
		repository = {
			find: jest.fn().mockResolvedValue(null),
			findById: jest.fn().mockResolvedValue(ROW),
			upsert: jest.fn().mockResolvedValue(ROW),
			deactivate: jest.fn().mockResolvedValue({ ...ROW, isActive: false }),
			list: jest.fn().mockResolvedValue([ROW]),
			needed: jest.fn().mockResolvedValue([]),
		}
		auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		service = new StatusExplanationsService(
			repository as unknown as StatusExplanationsRepository,
			auditService as unknown as AuditService
		)
	})

	it("saves an explanation and audits it with the previous version", async () => {
		const previous = { ...ROW, explanation: "Old wording." }
		repository.find.mockResolvedValue(previous)
		const input = {
			statusCode: "HELD_AT_CUSTOMS",
			language: "en" as const,
			explanation: "Customs is checking your item.",
			nextSteps: "Prepare the invoice.",
		}

		const saved = await service.save(input, { userId: "user-1" })

		expect(repository.find).toHaveBeenCalledWith("HELD_AT_CUSTOMS", "en")
		expect(repository.upsert).toHaveBeenCalledWith(input)
		expect(saved).toBe(ROW)
		expect(auditService.writeAudit).toHaveBeenCalledWith({
			actorId: "user-1",
			actorType: "user",
			action: "tracking.explanation.save",
			resourceType: "status_explanation",
			resourceId: ROW.id,
			before: previous,
			after: ROW,
		})
	})

	it("deactivates an explanation and audits it", async () => {
		const result = await service.deactivate(ROW.id, { userId: "user-1" })

		expect(result.isActive).toBe(false)
		expect(auditService.writeAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "tracking.explanation.deactivate",
				before: ROW,
				after: expect.objectContaining({ isActive: false }),
			})
		)
	})

	it("answers not found for an unknown explanation and audits nothing", async () => {
		repository.findById.mockResolvedValue(null)

		await expect(service.deactivate(ROW.id, { userId: "user-1" })).rejects.toThrow(
			"Explanation not found"
		)
		expect(repository.deactivate).not.toHaveBeenCalled()
		expect(auditService.writeAudit).not.toHaveBeenCalled()
	})

	it("AC2: returns the 'needs explanation' list from the repository", async () => {
		const needed = [
			{ statusCode: "OUT_FOR_DELIVERY", language: "fil", lookups: 3, lastSeenAt: new Date() },
		]
		repository.needed.mockResolvedValue(needed)

		await expect(service.needed()).resolves.toBe(needed)
	})
})

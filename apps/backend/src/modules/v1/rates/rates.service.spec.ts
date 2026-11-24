import type { AuditService } from "@/common/audit/audit.service"

import type { RatesRepository } from "./rates.repository"
import { RatesService } from "./rates.service"

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
jest.mock("./rates.repository", () => ({ RatesRepository: class RatesRepository {} }))

const VALID_CSV = [
	"service_code,service_name,zone,weight_min_g,weight_max_g,price_php,effective_from,effective_to",
	"express-mail,Express Mail,Visayas,0,2000,320,2026-12-01,",
].join("\n")

const BATCH = {
	id: "11111111-1111-4111-8111-111111111111",
	fileName: "rates.csv",
	rowCount: 1,
	status: "pending" as const,
	submittedBy: "manager-1",
	reviewedBy: null,
	reviewedAt: null,
	reviewNote: null,
	createdAt: new Date("2026-11-24T00:00:00Z"),
	updatedAt: new Date("2026-11-24T00:00:00Z"),
}

describe("RatesService (KB-2)", () => {
	let repository: {
		createBatch: jest.Mock
		findBatch: jest.Mock
		reviewBatch: jest.Mock
		listPendingBatches: jest.Mock
		listEntriesForBatches: jest.Mock
	}
	let auditService: { writeAudit: jest.Mock }
	let service: RatesService

	beforeEach(() => {
		repository = {
			createBatch: jest.fn().mockResolvedValue({ batch: BATCH, entries: [] }),
			findBatch: jest.fn().mockResolvedValue(BATCH),
			reviewBatch: jest.fn(),
			listPendingBatches: jest.fn().mockResolvedValue([BATCH]),
			listEntriesForBatches: jest.fn().mockResolvedValue([{ id: "e1", batchId: BATCH.id }]),
		}
		auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		service = new RatesService(
			repository as unknown as RatesRepository,
			auditService as unknown as AuditService
		)
	})

	describe("AC4: import, preview and approval", () => {
		it("previews without storing anything", () => {
			const preview = service.preview({ fileName: "rates.csv", csv: VALID_CSV })

			expect(preview.valid).toBe(true)
			expect(repository.createBatch).not.toHaveBeenCalled()
		})

		it("stores a valid file as a pending batch and audits it", async () => {
			await service.submit({ fileName: "rates.csv", csv: VALID_CSV }, { userId: "manager-1" })

			expect(repository.createBatch).toHaveBeenCalledWith({
				fileName: "rates.csv",
				submittedBy: "manager-1",
				rows: [expect.objectContaining({ serviceCode: "express-mail", priceCentavos: 32000 })],
			})
			expect(auditService.writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({ action: "rates.batch.submit", resourceId: BATCH.id })
			)
		})

		it("refuses a file with errors and stores nothing", async () => {
			await expect(
				service.submit(
					{ fileName: "rates.csv", csv: `${VALID_CSV}\nbad,,,,,,,` },
					{ userId: "manager-1" }
				)
			).rejects.toThrow(/error\(s\)/)
			expect(repository.createBatch).not.toHaveBeenCalled()
		})

		it("goes live only when a different user approves the batch", async () => {
			repository.reviewBatch.mockResolvedValue({ ...BATCH, status: "approved" })

			const approved = await service.approve(BATCH.id, { userId: "approver-1" })

			expect(approved.status).toBe("approved")
			expect(repository.reviewBatch).toHaveBeenCalledWith({
				id: BATCH.id,
				status: "approved",
				reviewedBy: "approver-1",
			})
			expect(auditService.writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({ action: "rates.batch.approve" })
			)
		})

		it("refuses and audits approval by the user who submitted the batch", async () => {
			await expect(service.approve(BATCH.id, { userId: "manager-1" })).rejects.toThrow(
				/different user/
			)
			expect(repository.reviewBatch).not.toHaveBeenCalled()
			expect(auditService.writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "rates.batch.approve_refused",
					after: expect.objectContaining({ outcome: "denied", reason: "self_approval" }),
				})
			)
		})

		it("does not review a batch twice", async () => {
			repository.findBatch.mockResolvedValue({ ...BATCH, status: "approved" })

			await expect(service.approve(BATCH.id, { userId: "approver-1" })).rejects.toThrow(
				"already been reviewed"
			)
		})

		it("rejects a batch with a note and audits it", async () => {
			repository.reviewBatch.mockResolvedValue({ ...BATCH, status: "rejected" })

			await service.reject(BATCH.id, "Wrong prices for Visayas", { userId: "approver-1" })

			expect(repository.reviewBatch).toHaveBeenCalledWith(
				expect.objectContaining({ status: "rejected", note: "Wrong prices for Visayas" })
			)
			expect(auditService.writeAudit).toHaveBeenCalledWith(
				expect.objectContaining({ action: "rates.batch.reject" })
			)
		})

		it("answers not found for an unknown batch", async () => {
			repository.findBatch.mockResolvedValue(null)

			await expect(service.approve(BATCH.id, { userId: "approver-1" })).rejects.toThrow(
				"Rate batch not found"
			)
		})
	})

	it("lists pending batches with their rows for review", async () => {
		const queue = await service.reviewQueue()

		expect(queue).toEqual([expect.objectContaining({ id: BATCH.id, entries: [expect.anything()] })])
	})
})

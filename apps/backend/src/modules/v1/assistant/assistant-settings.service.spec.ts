import type { AuditService } from "@/common/audit/audit.service"

import { type AssistantSettingsRepository } from "./assistant-settings.repository"
import { AssistantSettingsService, DEFAULT_ASSISTANT_SETTINGS } from "./assistant-settings.service"

jest.mock("@/common/audit/audit.service", () => ({ AuditService: class AuditService {} }))

jest.mock("./assistant-settings.repository", () => ({
	AssistantSettingsRepository: class AssistantSettingsRepository {},
}))

describe("AssistantSettingsService (CNV-3)", () => {
	let repository: { list: jest.Mock; setMany: jest.Mock }
	let audit: { writeAudit: jest.Mock }
	let service: AssistantSettingsService

	beforeEach(() => {
		repository = {
			list: jest.fn().mockResolvedValue([]),
			setMany: jest.fn().mockResolvedValue(undefined),
		}
		audit = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		service = new AssistantSettingsService(
			repository as unknown as AssistantSettingsRepository,
			audit as unknown as AuditService
		)
	})

	it("uses documented defaults until a permitted user saves settings", async () => {
		await expect(service.get()).resolves.toEqual(DEFAULT_ASSISTANT_SETTINGS)
	})

	it("writes the changed values and audits the old and new snapshots", async () => {
		await service.update(
			{ confidenceThreshold: 0.82, maxOutputTokens: 120 },
			{ userId: "admin-1" }
		)

		expect(repository.setMany).toHaveBeenCalledWith(
			[
				{ key: "confidence_threshold", value: 0.82 },
				{ key: "max_output_tokens", value: 120 },
			],
			"admin-1"
		)
		expect(audit.writeAudit).toHaveBeenCalledWith({
			actorId: "admin-1",
			actorType: "user",
			action: "assistant.settings.update",
			resourceType: "assistant_settings",
			resourceId: "customer-support",
			before: DEFAULT_ASSISTANT_SETTINGS,
			after: { confidenceThreshold: 0.82, maxOutputTokens: 120 },
		})
	})

	it("saves only the setting that changed", async () => {
		await service.update({ confidenceThreshold: 0.5 }, { userId: "admin-1" })

		expect(repository.setMany).toHaveBeenCalledWith(
			[{ key: "confidence_threshold", value: 0.5 }],
			"admin-1"
		)
	})

	it("applies stored values on the next read", async () => {
		repository.list.mockResolvedValue([
			{ key: "confidence_threshold", value: 0.6 },
			{ key: "max_output_tokens", value: 90 },
		])

		await expect(service.get()).resolves.toEqual({
			confidenceThreshold: 0.6,
			maxOutputTokens: 90,
		})
	})
})

import { NotFoundException } from "@nestjs/common"

import { ChannelsAdminService } from "./channels.service"

const mockSelect = jest.fn()
const mockSet = jest.fn()
const mockUpdate = jest.fn()

jest.mock("@repo/db/schema", () => ({
	channels: { id: "channels.id", code: "channels.code", name: "channels.name" },
}))
jest.mock("drizzle-orm", () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }))
jest.mock("@/common/database/database.client", () => ({
	db: {
		select: () => mockSelect(),
		update: (...args: unknown[]) => mockUpdate(...args),
	},
}))

describe("ChannelsAdminService", () => {
	const original = {
		id: "channel-row-1",
		code: "web-widget",
		name: "Website widget",
		isEnabled: true,
		config: { allowedOrigins: ["https://old.example"], welcomeText: "Welcome" },
		updatedAt: new Date("2026-11-20T00:00:00.000Z"),
	}
	const auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
	let service: ChannelsAdminService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new ChannelsAdminService(auditService as never)
		mockSelect.mockReturnValue({
			from: () => ({ where: () => ({ limit: async () => [original] }) }),
		})
		mockSet.mockImplementation(patch => ({
			where: () => ({
				returning: async () => [
					{
						...original,
						isEnabled: patch.isEnabled,
						config: patch.config,
						updatedAt: patch.updatedAt,
					},
				],
			}),
		}))
		mockUpdate.mockReturnValue({ set: mockSet })
	})

	it("writes enabled state and configuration, then audits old and new values", async () => {
		const result = await service.update(
			{
				code: "web-widget",
				isEnabled: false,
				allowedOrigins: ["https://new.example"],
				welcomeText: "How may we help?",
			},
			"agent-1"
		)

		expect(mockSet).toHaveBeenCalledWith(
			expect.objectContaining({
				isEnabled: false,
				config: { allowedOrigins: ["https://new.example"], welcomeText: "How may we help?" },
			})
		)
		expect(auditService.writeAudit).toHaveBeenCalledWith({
			actorId: "agent-1",
			actorType: "user",
			action: "channel.updated",
			resourceType: "channel",
			resourceId: "web-widget",
			before: {
				isEnabled: true,
				allowedOrigins: ["https://old.example"],
				welcomeText: "Welcome",
			},
			after: {
				isEnabled: false,
				allowedOrigins: ["https://new.example"],
				welcomeText: "How may we help?",
			},
		})
		expect(result.config).toEqual({
			allowedOrigins: ["https://new.example"],
			welcomeText: "How may we help?",
		})
	})

	it("reports a missing channel without writing an audit change", async () => {
		mockSelect.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) })

		await expect(service.update({ code: "missing" }, "agent-1")).rejects.toBeInstanceOf(
			NotFoundException
		)
		expect(mockSet).not.toHaveBeenCalled()
		expect(auditService.writeAudit).not.toHaveBeenCalled()
	})
})

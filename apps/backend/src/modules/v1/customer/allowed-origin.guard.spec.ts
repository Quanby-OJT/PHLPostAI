import {
	ForbiddenException,
	ServiceUnavailableException,
	type ExecutionContext,
} from "@nestjs/common"

import type { AuditService } from "@/common/audit/audit.service"

import { AllowedOriginGuard } from "./allowed-origin.guard"
import type { ChannelsService } from "./channels.service"

jest.mock("@/common/database/database.client", () => ({ db: {} }))
jest.mock("@repo/db/schema", () => ({ channels: {} }))
jest.mock("@/common/audit/audit.service", () => ({ AuditService: class {} }))

function contextWith(headers: Record<string, string>): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ headers, path: "/v1/customer/chat/stream" }),
		}),
	} as unknown as ExecutionContext
}

describe("AllowedOriginGuard", () => {
	let getAllowedOrigins: jest.Mock
	let isEnabled: jest.Mock
	let writeAudit: jest.Mock
	let guard: AllowedOriginGuard

	beforeEach(() => {
		getAllowedOrigins = jest
			.fn()
			.mockResolvedValue(["http://localhost:3001", "https://www.example.ph"])
		isEnabled = jest.fn().mockResolvedValue(true)
		writeAudit = jest.fn().mockResolvedValue(undefined)
		guard = new AllowedOriginGuard(
			{ getAllowedOrigins, isEnabled } as unknown as ChannelsService,
			{ writeAudit } as unknown as AuditService
		)
	})

	it("allows a listed origin without auditing", async () => {
		await expect(guard.canActivate(contextWith({ origin: "http://localhost:3001" }))).resolves.toBe(
			true
		)
		expect(writeAudit).not.toHaveBeenCalled()
	})

	it("ignores case and a trailing slash when matching", async () => {
		await expect(
			guard.canActivate(contextWith({ origin: "HTTPS://WWW.EXAMPLE.PH/" }))
		).resolves.toBe(true)
	})

	it("refuses an unlisted origin with 403 and writes an audit entry", async () => {
		await expect(
			guard.canActivate(contextWith({ origin: "http://evil.example" }))
		).rejects.toBeInstanceOf(ForbiddenException)
		expect(writeAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				actorType: "system",
				action: "customer.origin.refused",
				resourceType: "channel",
				resourceId: "web-widget",
				after: { origin: "http://evil.example", path: "/v1/customer/chat/stream" },
			})
		)
	})

	it("refuses the literal 'null' origin", async () => {
		await expect(guard.canActivate(contextWith({ origin: "null" }))).rejects.toBeInstanceOf(
			ForbiddenException
		)
	})

	it("refuses everything when the channel has no allowed origins", async () => {
		getAllowedOrigins.mockResolvedValue([])
		await expect(
			guard.canActivate(contextWith({ origin: "http://localhost:3001" }))
		).rejects.toBeInstanceOf(ForbiddenException)
	})

	it("allows a request with no Origin header", async () => {
		await expect(guard.canActivate(contextWith({}))).resolves.toBe(true)
		expect(getAllowedOrigins).not.toHaveBeenCalled()
	})

	it("blocks customer routes while the widget channel is disabled", async () => {
		isEnabled.mockResolvedValue(false)

		await expect(
			guard.canActivate(contextWith({ origin: "https://www.example.ph" }))
		).rejects.toBeInstanceOf(ServiceUnavailableException)
		expect(getAllowedOrigins).not.toHaveBeenCalled()
	})

	it("still refuses when the audit write fails", async () => {
		writeAudit.mockRejectedValue(new Error("db down"))
		await expect(
			guard.canActivate(contextWith({ origin: "http://evil.example" }))
		).rejects.toBeInstanceOf(ForbiddenException)
	})
})

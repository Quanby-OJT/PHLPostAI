import { ForbiddenException, type ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import type { AuditService } from "@/common/audit/audit.service"
import type { RbacService } from "@/common/rbac/rbac.service"
import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"
import { RbacGuard } from "@/shared/guards/rbac.guard"

import { AssistantController } from "./assistant.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({
	implement: jest.fn(() => ({ handler: jest.fn() })),
	ORPCError: class ORPCError extends Error {},
}))
jest.mock("@/config/api-versions.config", () => ({
	v1: {
		assistant: {
			settings: { get: {}, update: {} },
			escalationSettings: { get: {}, update: {} },
			categories: { list: {}, create: {}, update: {} },
		},
	},
}))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))
jest.mock("./assistant.service", () => ({ AssistantService: class AssistantService {} }))
jest.mock("@/common/database/database.client", () => ({ db: {} }))
jest.mock("better-auth/node", () => ({ fromNodeHeaders: jest.fn(() => ({})) }))
jest.mock("@repo/auth", () => ({ getAuth: jest.fn(() => ({ api: { getSession: jest.fn() } })) }))
jest.mock("@/config/env.config", () => ({ env: { NODE_ENV: "development" } }))
jest.mock("@/common/apikeys/apikeys.service", () => ({ ApiKeysService: class ApiKeysService {} }))
jest.mock("@/common/rbac/rbac.service", () => ({ RbacService: class RbacService {} }))

function required(method: keyof AssistantController): string[] {
	return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, AssistantController.prototype[method])
}

describe("AssistantController (CNV-2)", () => {
	it.each(["getSettings", "updateSettings"] as const)(
		"CNV-3 AC3/AC5: %s requires settings.assistant.manage",
		method => expect(required(method)).toEqual(["settings.assistant.manage"])
	)
	it.each(["getEscalationSettings", "updateEscalationSettings"] as const)(
		"ESC-3: %s requires settings.escalation.manage",
		method => expect(required(method)).toEqual(["settings.escalation.manage"])
	)
	it.each(["listCategories", "createCategory", "updateCategory"] as const)(
		"AC5: %s requires settings.assistant.manage, so the RbacGuard answers 403 and audits",
		method => {
			expect(required(method)).toEqual(["settings.assistant.manage"])
		}
	)

	it("CNV-3 AC5: denies a user without the settings permission and audits the 403", async () => {
		const rbacService = {
			hasAllPermissions: jest.fn().mockResolvedValue(false),
			getMissingPermissions: jest.fn().mockResolvedValue(["settings.assistant.manage"]),
		}
		const auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		const guard = new RbacGuard(
			new Reflector(),
			rbacService as unknown as RbacService,
			auditService as unknown as AuditService,
			{ authenticate: jest.fn() } as never
		)
		const context = {
			getHandler: () => AssistantController.prototype.getSettings,
			getClass: () => AssistantController,
			switchToHttp: () => ({
				getRequest: () => ({
					method: "GET",
					originalUrl: "/api/v1/assistant/settings",
					session: { user: { id: "user-1" } },
				}),
			}),
		} as unknown as ExecutionContext

		await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
		expect(auditService.writeAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "rbac.denied",
				resourceId: "GET /api/v1/assistant/settings",
				after: expect.objectContaining({
					outcome: "denied",
					requiredPermissions: ["settings.assistant.manage"],
				}),
			})
		)
	})
})

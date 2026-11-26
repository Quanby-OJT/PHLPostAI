import { ForbiddenException, type ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import type { AuditService } from "@/common/audit/audit.service"
import type { RbacService } from "@/common/rbac/rbac.service"
import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"
import { RbacGuard } from "@/shared/guards/rbac.guard"

import { ConversationTranscriptsController } from "./conversation-transcripts.controller"

jest.mock("@orpc/nest", () => ({
	Implement: () => () => undefined,
}))

jest.mock("@orpc/server", () => ({
	implement: jest.fn(() => ({
		handler: jest.fn((fn: (ctx: { input: unknown }) => unknown) => fn({ input: {} })),
	})),
}))

jest.mock("@/config/api-versions.config", () => ({
	v1: { conversations: { transcripts: { search: {}, get: {} } } },
}))

jest.mock("@/config/env.config", () => ({
	env: { NODE_ENV: "test" },
}))

jest.mock("@/common/database/database.client", () => ({ db: {} }))

// RbacGuard pulls in ESM-only better-auth; the denial path here never reaches it.
jest.mock("better-auth/node", () => ({ fromNodeHeaders: jest.fn() }))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))
jest.mock("@repo/auth", () => ({ getAuth: jest.fn() }))

jest.mock("@/common/rbac/rbac.service", () => ({ RbacService: class RbacService {} }))

describe("ConversationTranscriptsController", () => {
	it.each(["search", "get"] as const)("requires conversations.transcripts.view on %s", method => {
		const required = Reflect.getMetadata(
			REQUIRED_PERMISSIONS_KEY,
			ConversationTranscriptsController.prototype[method]
		)
		expect(required).toEqual(["conversations.transcripts.view"])
	})

	describe("denied callers (AC: 403 and audited)", () => {
		let guard: RbacGuard
		let writeAudit: jest.Mock
		let rbacService: { hasAllPermissions: jest.Mock; getMissingPermissions: jest.Mock }

		beforeEach(() => {
			writeAudit = jest.fn().mockResolvedValue(undefined)
			rbacService = {
				hasAllPermissions: jest.fn().mockResolvedValue(false),
				getMissingPermissions: jest.fn().mockResolvedValue(["conversations.transcripts.view"]),
			}
			guard = new RbacGuard(
				new Reflector(),
				rbacService as unknown as RbacService,
				{ writeAudit } as unknown as AuditService,
				{ authenticate: jest.fn(), touch: jest.fn() } as never
			)
		})

		it.each(["search", "get"] as const)(
			"returns 403 on %s and writes rbac.denied",
			async method => {
				const handler = ConversationTranscriptsController.prototype[method]
				const context = {
					getHandler: () => handler,
					getClass: () => ConversationTranscriptsController,
					switchToHttp: () => ({
						getRequest: () => ({
							headers: {},
							method: "POST",
							originalUrl: "/v1/conversations/transcripts",
							session: { user: { id: "customer-agent-1" } },
						}),
					}),
				} as unknown as ExecutionContext

				await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
				expect(writeAudit).toHaveBeenCalledWith(
					expect.objectContaining({ actorId: "customer-agent-1", action: "rbac.denied" })
				)
			}
		)
	})
})

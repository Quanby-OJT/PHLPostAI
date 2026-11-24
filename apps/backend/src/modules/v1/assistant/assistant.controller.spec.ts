import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { AssistantController } from "./assistant.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({
	implement: jest.fn(() => ({ handler: jest.fn() })),
	ORPCError: class ORPCError extends Error {},
}))
jest.mock("@/config/api-versions.config", () => ({
	v1: { assistant: { categories: { list: {}, create: {}, update: {} } } },
}))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))
jest.mock("./assistant.service", () => ({ AssistantService: class AssistantService {} }))

function required(method: keyof AssistantController): string[] {
	return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, AssistantController.prototype[method])
}

describe("AssistantController (CNV-2)", () => {
	it.each(["listCategories", "createCategory", "updateCategory"] as const)(
		"AC5: %s requires settings.assistant.manage, so the RbacGuard answers 403 and audits",
		method => {
			expect(required(method)).toEqual(["settings.assistant.manage"])
		}
	)
})

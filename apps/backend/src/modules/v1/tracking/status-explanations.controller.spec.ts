import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { StatusExplanationsController } from "./status-explanations.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({
	implement: jest.fn(() => ({ handler: jest.fn() })),
	ORPCError: class ORPCError extends Error {},
}))
jest.mock("@/config/api-versions.config", () => ({
	v1: { tracking: { explanations: { list: {}, needed: {}, save: {}, deactivate: {} } } },
}))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))
jest.mock("./status-explanations.service", () => ({
	StatusExplanationsService: class StatusExplanationsService {},
}))

function required(method: keyof StatusExplanationsController): string[] {
	return Reflect.getMetadata(
		REQUIRED_PERMISSIONS_KEY,
		StatusExplanationsController.prototype[method]
	)
}

describe("StatusExplanationsController (TRK-2)", () => {
	it.each(["list", "needed", "save", "deactivate"] as const)(
		"AC4: %s requires tracking.explanations.manage, so the RbacGuard answers 403 and audits",
		method => {
			expect(required(method)).toEqual(["tracking.explanations.manage"])
		}
	)
})

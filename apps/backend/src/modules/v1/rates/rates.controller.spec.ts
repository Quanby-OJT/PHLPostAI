import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { RatesController } from "./rates.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({
	implement: jest.fn(() => ({ handler: jest.fn() })),
	ORPCError: class ORPCError extends Error {},
}))
jest.mock("@/config/api-versions.config", () => ({
	v1: {
		rates: {
			entries: { list: {} },
			batches: { preview: {}, submit: {}, list: {} },
			review: { queue: {}, approve: {}, reject: {} },
		},
	},
}))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))
jest.mock("./rates.service", () => ({ RatesService: class RatesService {} }))

function required(method: keyof RatesController): string[] {
	return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, RatesController.prototype[method])
}

describe("RatesController (KB-2)", () => {
	it.each(["listEntries", "listBatches", "preview", "submit"] as const)(
		"AC5: %s requires knowledge.rates.manage, so the RbacGuard answers 403 and audits",
		method => {
			expect(required(method)).toEqual(["knowledge.rates.manage"])
		}
	)

	it.each(["reviewQueue", "approve", "reject"] as const)(
		"batch review (%s) requires knowledge.articles.approve",
		method => {
			expect(required(method)).toEqual(["knowledge.articles.approve"])
		}
	)
})

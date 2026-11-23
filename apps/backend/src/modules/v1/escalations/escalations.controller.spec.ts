import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { EscalationsController } from "./escalations.controller"

jest.mock("@thallesp/nestjs-better-auth", () => ({
	AllowAnonymous: () => () => undefined,
	Session: () => () => undefined,
}))

describe("EscalationsController permission metadata", () => {
	it.each(["claim", "reply", "resolve", "agentEvents"] as const)(
		"requires conversation handling permission for %s",
		method => {
			expect(
				Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EscalationsController.prototype[method])
			).toEqual(["escalations.conversations.handle"])
		}
	)
})

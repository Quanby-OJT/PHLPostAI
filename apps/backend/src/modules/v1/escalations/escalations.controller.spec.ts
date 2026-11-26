import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { EscalationsController } from "./escalations.controller"

jest.mock("@thallesp/nestjs-better-auth", () => ({
	AllowAnonymous: () => () => undefined,
	Session: () => () => undefined,
}))
jest.mock("@/modules/v1/assistant/assistant-settings.service", () => ({
	AssistantSettingsService: class AssistantSettingsService {},
}))

describe("EscalationsController permission metadata", () => {
	it.each([
		"claim",
		"reply",
		"resolve",
		"agentEvents",
		"getPresence",
		"setPresence",
		"heartbeat",
		"listMine",
		"listAvailableAgents",
		"transfer",
	] as const)("requires conversation handling permission for %s", method => {
		expect(
			Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EscalationsController.prototype[method])
		).toEqual(["escalations.conversations.handle"])
	})

	it("limits stored customer contact to conversation handlers", () => {
		expect(
			Reflect.getMetadata(
				REQUIRED_PERMISSIONS_KEY,
				EscalationsController.prototype.getCustomerContact
			)
		).toEqual(["escalations.conversations.handle"])
	})

	it.each(["listAgentCapacities", "setAgentChatLimit"] as const)(
		"requires escalation settings management permission for %s",
		method => {
			expect(
				Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EscalationsController.prototype[method])
			).toEqual(["settings.escalation.manage"])
		}
	)
})

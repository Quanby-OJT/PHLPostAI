import { Reflector } from "@nestjs/core"
import type { UserSession } from "@thallesp/nestjs-better-auth"

import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import type { ScamAssessmentService } from "../customer/scam-assessment.service"
import type { ScamConfigurationService } from "./scam-configuration.service"
import { ScamController } from "./scam.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({
	implement: () => ({ handler: (handler: unknown) => handler }),
}))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))
jest.mock("@/config/api-versions.config", () => ({
	v1: {
		scam: {
			riskIndicators: { list: {}, create: {}, update: {} },
			officialContacts: { list: {}, create: {} },
			testAssessment: {},
		},
	},
}))
jest.mock("../customer/scam-assessment.service", () => ({ ScamAssessmentService: class {} }))
jest.mock("./scam-configuration.service", () => ({ ScamConfigurationService: class {} }))

describe("SCM-2 routes", () => {
	it.each([
		"listIndicators",
		"createIndicator",
		"updateIndicator",
		"listContacts",
		"createContact",
		"testAssessment",
	] as const)("%s requires the management permission in the RBAC guard", method => {
		const required = new Reflector().getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
			ScamController.prototype[method],
			ScamController,
		])
		expect(required).toEqual(["scam.indicators.manage"])
	})

	it("returns only findings from the shared staff evaluation", async () => {
		const findings = [{ code: "payment_request", name: "Request for payment", weight: 4 }]
		const evaluate = jest.fn().mockResolvedValue({
			assessment: { riskLevel: "high", confidence: 0.5, indicators: ["payment_request"] },
			findings,
			maskedQuery: "Test [CONTACT]",
			links: { extractedUrls: [] },
		})
		const controller = new ScamController(
			{} as ScamConfigurationService,
			{ evaluate } as unknown as ScamAssessmentService
		)
		const handler = await controller.testAssessment({ user: { id: "qa-staff" } } as UserSession)
		const invoke = handler as unknown as (options: { input: { query: string } }) => Promise<unknown>
		const query = "Please pay the fee."
		await expect(invoke({ input: { query } })).resolves.toEqual({
			riskLevel: "high",
			confidence: 0.5,
			indicators: findings,
		})
		expect(evaluate).toHaveBeenCalledWith(
			expect.objectContaining({ query, actorType: "user", principal: "qa-staff" })
		)
	})
})

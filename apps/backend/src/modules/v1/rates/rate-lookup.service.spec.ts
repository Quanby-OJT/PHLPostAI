import type { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"

import { manilaToday, RateLookupService } from "./rate-lookup.service"
import { RATE_FOLLOW_UP_PREFIX } from "./rates.replies"
import type { RatesRepository } from "./rates.repository"

jest.mock("@/modules/v1/corpus/rag-gateway.service", () => ({
	RagGatewayService: class RagGatewayService {},
}))
jest.mock("./rates.repository", () => ({ RatesRepository: class RatesRepository {} }))

const CONTEXT = { principal: "customer-session:s1", permissions: [], correlationId: "req-1" }
const TODAY = "2026-12-05"
const CATALOG = {
	services: [
		{ code: "express-mail", name: "Express Mail" },
		{ code: "registered-mail", name: "Registered Mail" },
	],
	zones: ["Metro Manila", "Visayas"],
}
const ENTRY = {
	serviceCode: "express-mail",
	serviceName: "Express Mail",
	zone: "Visayas",
	priceCentavos: 32000,
	effectiveFrom: "2026-12-01",
}

describe("RateLookupService (KB-2, PRD D4)", () => {
	let repository: { catalog: jest.Mock; findRate: jest.Mock }
	let gateway: { extractRateQuery: jest.Mock }
	let service: RateLookupService

	beforeEach(() => {
		repository = {
			catalog: jest.fn().mockResolvedValue(CATALOG),
			findRate: jest.fn().mockResolvedValue(ENTRY),
		}
		gateway = {
			extractRateQuery: jest
				.fn()
				.mockResolvedValue({ serviceCode: "express-mail", zone: "visayas", weightG: 2000 }),
		}
		service = new RateLookupService(
			repository as unknown as RatesRepository,
			gateway as unknown as RagGatewayService
		)
	})

	it("AC1: quotes the table's price with its effective date and names the service", async () => {
		const answer = await service.answer("Express Mail to Cebu, 2 kg?", CONTEXT, TODAY)

		expect(repository.findRate).toHaveBeenCalledWith({
			serviceCode: "express-mail",
			zone: "Visayas",
			weightG: 2000,
			date: TODAY,
		})
		expect(answer.outcome).toBe("quoted")
		expect(answer.reply).toContain("Express Mail")
		expect(answer.reply).toContain("₱320.00")
		expect(answer.reply).toContain("December 1, 2026")
		expect(answer.reply).toContain("2 kg")
	})

	it("only offers the model the services and zones that have a rate in effect", async () => {
		await service.answer("Express Mail to Cebu, 2 kg?", CONTEXT, TODAY)

		expect(repository.catalog).toHaveBeenCalledWith(TODAY)
		expect(gateway.extractRateQuery).toHaveBeenCalledWith(
			expect.objectContaining({ services: CATALOG.services, zones: CATALOG.zones })
		)
	})

	it.each([
		[{ serviceCode: "express-mail", zone: null, weightG: 2000 }, "where you're sending it"],
		[{ serviceCode: "express-mail", zone: "Visayas", weightG: null }, "the weight of your item"],
		[{ serviceCode: null, zone: "Visayas", weightG: 2000 }, "which service you want"],
	])("AC2: asks for a missing detail and quotes nothing (%#)", async (extracted, wording) => {
		gateway.extractRateQuery.mockResolvedValue(extracted)

		const answer = await service.answer("How much?", CONTEXT, TODAY)

		expect(answer.outcome).toBe("missing_details")
		expect(answer.reply.startsWith(RATE_FOLLOW_UP_PREFIX)).toBe(true)
		expect(answer.reply).toContain(wording)
		expect(answer.reply).not.toContain("₱")
		expect(repository.findRate).not.toHaveBeenCalled()
	})

	it("uses the only published service when the question doesn't name one", async () => {
		repository.catalog.mockResolvedValue({ ...CATALOG, services: CATALOG.services.slice(0, 1) })
		gateway.extractRateQuery.mockResolvedValue({ serviceCode: null, zone: "Visayas", weightG: 500 })

		const answer = await service.answer("How much to Cebu for 500 g?", CONTEXT, TODAY)

		expect(answer.outcome).toBe("quoted")
	})

	it("AC3: says there is no published rate when no entry matches, and quotes nothing", async () => {
		repository.findRate.mockResolvedValue(null)

		const answer = await service.answer("Express Mail to Cebu, 50 kg?", CONTEXT, TODAY)

		expect(answer.outcome).toBe("no_rate")
		expect(answer.reply).toContain("I don't have a published rate")
		expect(answer.reply).not.toContain("₱")
	})

	it("AC3: says there is no published rate when the table is empty", async () => {
		repository.catalog.mockResolvedValue({ services: [], zones: [] })

		const answer = await service.answer("How much to Cebu?", CONTEXT, TODAY)

		expect(answer.outcome).toBe("no_rate")
		expect(gateway.extractRateQuery).not.toHaveBeenCalled()
	})

	it("asks for the details when the question cannot be read", async () => {
		gateway.extractRateQuery.mockRejectedValue(new Error("RAG service is unreachable"))

		const answer = await service.answer("How much?", CONTEXT, TODAY)

		expect(answer.outcome).toBe("missing_details")
	})

	it("uses the date in the Philippines", () => {
		expect(manilaToday(new Date("2026-11-30T17:00:00Z"))).toBe("2026-12-01")
	})
})

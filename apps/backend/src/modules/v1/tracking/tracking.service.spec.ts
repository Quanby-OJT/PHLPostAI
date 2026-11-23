import { MockTrackingSource } from "./connectors/mock/mock.connector"
import type { StatusExplanationsRepository } from "./status-explanations.repository"
import { TrackingConnectorRegistry } from "./tracking-connector.registry"
import { hashTrackingNumber } from "./tracking-number"
import type { TrackingSource } from "./tracking-source"
import type { TrackingConfig } from "./tracking.config"
import { foundReply, TRACKING_REPLIES } from "./tracking.replies"
import { TrackingService } from "./tracking.service"

jest.mock("@/config/env.config", () => ({ env: {} }))
jest.mock("./status-explanations.repository", () => ({
	StatusExplanationsRepository: class StatusExplanationsRepository {},
}))

const CONFIG: TrackingConfig = {
	connectorCode: "mock",
	timeoutMs: 50,
	numberPattern: /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/,
	keywords: ["track", "tracking", "where is my"],
	hashSecret: "test-hash-secret-0123456789",
	customsStatusCodes: ["HELD_AT_CUSTOMS"],
}

let explanations: { findActive: jest.Mock }

beforeEach(() => {
	explanations = { findActive: jest.fn().mockResolvedValue(null) }
})

function serviceWith(source: TrackingSource = new MockTrackingSource()) {
	return new TrackingService(
		new TrackingConnectorRegistry([source]),
		{ ...CONFIG, connectorCode: source.code },
		explanations as unknown as StatusExplanationsRepository
	)
}

describe("TrackingService (TRK-1, Flow B)", () => {
	it("refuses to start with a connector that is not registered", () => {
		expect(
			() =>
				new TrackingService(
					new TrackingConnectorRegistry([new MockTrackingSource()]),
					{ ...CONFIG, connectorCode: "phlpost-track-trace" },
					explanations as unknown as StatusExplanationsRepository
				)
		).toThrow(/Unknown tracking connector/)
	})

	describe("routing", () => {
		const service = serviceWith()

		it.each(["Where is my parcel?", "track RR123456789PH", "RR123456789PH"])(
			"treats %s as a tracking question",
			text => expect(service.isTrackingQuestion(text)).toBe(true)
		)

		it("leaves other questions to retrieval", () => {
			expect(service.isTrackingQuestion("What do I need for a Postal ID?")).toBe(false)
		})
	})

	it("AC1: states the status, place and time exactly as the connector returned them", async () => {
		const answer = await serviceWith().answer("where is RR123456789PH?")

		expect(answer.reply).toContain("Status: Item in transit to the destination office")
		expect(answer.reply).toContain("Location: Manila Central Post Office")
		expect(answer.reply).toContain("Time: 18 Nov 2026, 2:32 PM")
		expect(answer.lookup).toEqual(
			expect.objectContaining({ connectorCode: "mock", outcome: "found", statusCode: "IN_TRANSIT" })
		)
	})

	it("AC2: says no record was found for an unknown number, without a status", async () => {
		const answer = await serviceWith().answer("track RR999999999PH")

		expect(answer.reply).toBe(TRACKING_REPLIES.notFound)
		expect(answer.lookup).toEqual(
			expect.objectContaining({ outcome: "not_found", statusCode: null })
		)
	})

	describe("AC3: asks for the number and makes no lookup", () => {
		it.each([
			["no number", "where is my parcel?", TRACKING_REPLIES.missing],
			["a malformed number", "track RR12345PH678", TRACKING_REPLIES.malformed],
		])("for %s", async (_case, text, reply) => {
			const source = new MockTrackingSource()
			const lookup = jest.spyOn(source, "lookup")

			const answer = await serviceWith(source).answer(text)

			expect(answer.reply).toBe(reply)
			expect(answer.lookup).toBeNull()
			expect(lookup).not.toHaveBeenCalled()
		})
	})

	describe("AC4: a connector that does not answer in time", () => {
		it("says the tracking system cannot be reached and offers a retry or a person", async () => {
			const answer = await serviceWith().answer("track RR000000000PH")

			expect(answer.reply).toBe(TRACKING_REPLIES.unavailable)
			expect(answer.reply).toMatch(/try again/i)
			expect(answer.reply).toMatch(/person/i)
			expect(answer.lookup).toEqual(expect.objectContaining({ outcome: "unavailable" }))
			expect(answer.lookup?.latencyMs ?? 0).toBeGreaterThanOrEqual(CONFIG.timeoutMs - 5)
		})

		it("aborts the connector call when the timeout fires", async () => {
			let signal: AbortSignal | undefined
			const source: TrackingSource = {
				code: "slow",
				lookup: (_number, abortSignal) => {
					signal = abortSignal
					return new Promise(() => undefined)
				},
			}

			await serviceWith(source).answer("track RR123456789PH")

			expect(signal?.aborted).toBe(true)
		})

		it("treats a connector error as unavailable, not as not found", async () => {
			const source: TrackingSource = {
				code: "broken",
				lookup: () => Promise.reject(new Error("connection reset")),
			}

			const answer = await serviceWith(source).answer("track RR123456789PH")

			expect(answer.lookup).toEqual(expect.objectContaining({ outcome: "unavailable" }))
		})
	})

	it("AC5: records a hash of the number, the connector, the outcome and the latency, never the number", async () => {
		const answer = await serviceWith().answer("where is RR123456789PH")

		expect(answer.lookup).toEqual({
			connectorCode: "mock",
			trackingNumberHash: hashTrackingNumber("RR123456789PH", CONFIG.hashSecret),
			outcome: "found",
			statusCode: "IN_TRANSIT",
			latencyMs: expect.any(Number),
		})
		expect(JSON.stringify(answer.lookup)).not.toContain("RR123456789PH")
		expect(answer.storedQuery).toBe("where is [TRACKING_NUMBER]")
	})

	describe("TRK-2: status explanations (Flow B step 4)", () => {
		const IN_TRANSIT = {
			statusCode: "IN_TRANSIT",
			description: "Item in transit to the destination office",
			location: "Manila Central Post Office",
			occurredAt: "18 Nov 2026, 2:32 PM",
		}

		it("AC1: gives the official status first, then the approved explanation and next steps", async () => {
			explanations.findActive.mockResolvedValue({
				explanation: "Your item is on its way to the post office that will deliver it.",
				nextSteps: "No action is needed. Check again tomorrow.",
			})

			const answer = await serviceWith().answer("where is RR123456789PH", "fil")

			expect(explanations.findActive).toHaveBeenCalledWith("IN_TRANSIT", "fil")
			expect(answer.reply).toBe(
				[
					foundReply(IN_TRANSIT),
					"",
					"What this means: Your item is on its way to the post office that will deliver it.",
					"Next steps: No action is needed. Check again tomorrow.",
				].join("\n")
			)
		})

		it("leaves out next steps when the explanation has none", async () => {
			explanations.findActive.mockResolvedValue({ explanation: "On its way.", nextSteps: null })

			const answer = await serviceWith().answer("where is RR123456789PH")

			expect(answer.reply).toContain("What this means: On its way.")
			expect(answer.reply).not.toContain("Next steps")
		})

		it("AC2: shows the official description unchanged when the code has no explanation", async () => {
			const answer = await serviceWith().answer("where is RR123456789PH", "ceb")

			expect(answer.reply).toBe(foundReply(IN_TRANSIT))
		})

		it("AC3: adds the Customs guidance and states PHLPost does not decide the release", async () => {
			explanations.findActive.mockResolvedValue({
				explanation: "Customs is checking your item before it can be delivered.",
				nextSteps: "Prepare the invoice and a valid ID.",
			})

			const answer = await serviceWith().answer("track CE444555666PH")

			expect(answer.reply).toContain("Status: Held by the Bureau of Customs for inspection")
			expect(answer.reply).toContain("Next steps: Prepare the invoice and a valid ID.")
			expect(answer.reply).toContain("PHLPost does not decide when Customs releases it.")
		})

		it("still states that PHLPost does not decide the release before guidance is written", async () => {
			const answer = await serviceWith().answer("track CE444555666PH")

			expect(answer.reply).toContain(TRACKING_REPLIES.customs)
		})

		it("shows the official status when the explanation cannot be loaded", async () => {
			explanations.findActive.mockRejectedValue(new Error("database down"))

			const answer = await serviceWith().answer("where is RR123456789PH")

			expect(answer.reply).toBe(foundReply(IN_TRANSIT))
			expect(answer.lookup).toEqual(expect.objectContaining({ outcome: "found" }))
		})

		it("never looks up an explanation when nothing was found", async () => {
			await serviceWith().answer("track RR999999999PH")

			expect(explanations.findActive).not.toHaveBeenCalled()
		})
	})
})

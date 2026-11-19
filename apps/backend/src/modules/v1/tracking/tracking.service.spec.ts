import { MockTrackingSource } from "./connectors/mock/mock.connector"
import { TrackingConnectorRegistry } from "./tracking-connector.registry"
import { hashTrackingNumber } from "./tracking-number"
import type { TrackingSource } from "./tracking-source"
import type { TrackingConfig } from "./tracking.config"
import { TRACKING_REPLIES } from "./tracking.replies"
import { TrackingService } from "./tracking.service"

jest.mock("@/config/env.config", () => ({ env: {} }))

const CONFIG: TrackingConfig = {
	connectorCode: "mock",
	timeoutMs: 50,
	numberPattern: /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/,
	keywords: ["track", "tracking", "where is my"],
	hashSecret: "test-hash-secret-0123456789",
}

function serviceWith(source: TrackingSource = new MockTrackingSource()) {
	return new TrackingService(new TrackingConnectorRegistry([source]), {
		...CONFIG,
		connectorCode: source.code,
	})
}

describe("TrackingService (TRK-1, Flow B)", () => {
	it("refuses to start with a connector that is not registered", () => {
		expect(
			() =>
				new TrackingService(new TrackingConnectorRegistry([new MockTrackingSource()]), {
					...CONFIG,
					connectorCode: "phlpost-track-trace",
				})
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
})

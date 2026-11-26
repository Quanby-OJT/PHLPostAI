import {
	buildTraceUrl,
	isUuid,
	manilaDayEndExclusive,
	manilaDayStart,
	providerByMessageId,
	summarizeMessages,
	toTranscriptMessage,
	type StoredTranscriptMessage,
} from "./transcript-query"

const CITATION = { chunkId: "c1", documentId: "d1", source: "Rates guide", section: "Zone 1" }

const ASSISTANT: StoredTranscriptMessage = {
	id: "00000000-0000-4000-8000-0000000000a1",
	role: "assistant",
	turnIndex: 1,
	sender: null,
	answerKind: "answer",
	inquiryCategory: "rates",
	language: "en",
	content: "The rate is 120 pesos.",
	citations: [CITATION, "not-a-citation"],
	confidence: 0.82,
	retrievalScore: 0.91,
	groundednessResult: { grounded: true },
	modelUsed: "gemma-4",
	traceId: "trace-123",
	createdAt: new Date("2026-11-20T02:00:00Z"),
}

describe("Asia/Manila day boundaries", () => {
	it("starts a calendar day at 00:00 Manila, which is 16:00 UTC the day before", () => {
		expect(manilaDayStart("2026-11-20").toISOString()).toBe("2026-11-19T16:00:00.000Z")
	})

	it("ends the day exclusively at the next Manila midnight", () => {
		expect(manilaDayEndExclusive("2026-11-20").toISOString()).toBe("2026-11-20T16:00:00.000Z")
	})

	it("keeps a late-evening Manila message inside its own day", () => {
		// 23:30 Manila on 2026-11-20 is 15:30 UTC, which is still before the exclusive end.
		const instant = new Date("2026-11-20T15:30:00Z").getTime()
		expect(instant).toBeGreaterThanOrEqual(manilaDayStart("2026-11-20").getTime())
		expect(instant).toBeLessThan(manilaDayEndExclusive("2026-11-20").getTime())
	})
})

describe("isUuid", () => {
	it("accepts a canonical uuid and rejects a trace id", () => {
		expect(isUuid("00000000-0000-4000-8000-0000000000a1")).toBe(true)
		expect(isUuid("trace-123")).toBe(false)
	})
})

describe("summarizeMessages", () => {
	it("uses the latest customer turn for category and the first question as preview", () => {
		const summary = summarizeMessages([
			{
				role: "user",
				turnIndex: 0,
				inquiryCategory: "tracking",
				language: "en",
				content: "Where is my parcel?",
			},
			{
				role: "assistant",
				turnIndex: 1,
				inquiryCategory: null,
				language: "en",
				content: "Checking.",
			},
			{
				role: "user",
				turnIndex: 2,
				inquiryCategory: "rates",
				language: "fil",
				content: "Magkano ang padala?",
			},
		])
		expect(summary).toEqual({
			category: "rates",
			language: "fil",
			messageCount: 3,
			preview: "Where is my parcel?",
		})
	})

	it("masks personal data in the preview and truncates long questions", () => {
		const long = `Call me at 0917 123 4567 about ${"x".repeat(300)}`
		const summary = summarizeMessages([
			{ role: "user", turnIndex: 0, inquiryCategory: "other", language: "en", content: long },
		])
		expect(summary.preview).not.toContain("0917 123 4567")
		expect(summary.preview.length).toBeLessThanOrEqual(160)
		expect(summary.preview.endsWith("…")).toBe(true)
	})

	it("returns an empty preview and null fields for a conversation with no customer turn", () => {
		expect(summarizeMessages([])).toEqual({
			category: null,
			language: null,
			messageCount: 0,
			preview: "",
		})
	})
})

describe("buildTraceUrl", () => {
	it("fills the template and encodes the trace id", () => {
		expect(buildTraceUrl("https://trace.example/t/{traceId}", "a b/c")).toBe(
			"https://trace.example/t/a%20b%2Fc"
		)
	})

	it("returns null without a template or a trace id", () => {
		expect(buildTraceUrl(undefined, "trace-1")).toBeNull()
		expect(buildTraceUrl("https://trace.example/t/{traceId}", null)).toBeNull()
	})
})

describe("providerByMessageId", () => {
	it("maps each message to the provider on its chat audit entry", () => {
		const providers = providerByMessageId([
			{ after: { messageId: "m1", provider: "anthropic", model: "x" } },
			{ after: { messageId: "m2" } },
			{ after: null },
		])
		expect(providers.get("m1")).toBe("anthropic")
		expect(providers.has("m2")).toBe(false)
	})
})

describe("toTranscriptMessage", () => {
	const providers = new Map([[ASSISTANT.id, "anthropic"]])
	const toolResults = [
		{
			messageId: ASSISTANT.id,
			connectorCode: "mock",
			outcome: "found",
			statusCode: "DELIVERED",
			latencyMs: 42,
			createdAt: new Date("2026-11-20T02:00:01Z"),
		},
		{
			messageId: "other-message",
			connectorCode: "mock",
			outcome: "not_found",
			statusCode: null,
			latencyMs: 9,
			createdAt: new Date("2026-11-20T02:00:02Z"),
		},
	]

	it("builds the provenance panel for an assistant answer", () => {
		const message = toTranscriptMessage({
			message: ASSISTANT,
			toolResults,
			providers,
			traceViewerUrl: "https://trace.example/t/{traceId}",
		})
		expect(message.provenance).toEqual({
			sources: [CITATION],
			toolResults: [
				{
					connectorCode: "mock",
					outcome: "found",
					statusCode: "DELIVERED",
					latencyMs: 42,
					createdAt: new Date("2026-11-20T02:00:01Z"),
				},
			],
			confidence: 0.82,
			retrievalScore: 0.91,
			groundednessResult: { grounded: true },
			modelUsed: "gemma-4",
			provider: "anthropic",
			traceId: "trace-123",
			traceUrl: "https://trace.example/t/trace-123",
		})
	})

	it("gives a null provider and trace link when none is recorded", () => {
		const message = toTranscriptMessage({
			message: { ...ASSISTANT, traceId: null },
			toolResults: [],
			providers: new Map(),
			traceViewerUrl: "https://trace.example/t/{traceId}",
		})
		expect(message.provenance?.provider).toBeNull()
		expect(message.provenance?.traceUrl).toBeNull()
	})

	it("has no provenance on customer turns and masks their content", () => {
		const message = toTranscriptMessage({
			message: {
				...ASSISTANT,
				id: "00000000-0000-4000-8000-0000000000b2",
				role: "user",
				sender: "customer",
				content: "Reach me at juan@example.com",
			},
			toolResults: [],
			providers,
			traceViewerUrl: undefined,
		})
		expect(message.provenance).toBeNull()
		expect(message.sender).toBe("customer")
		expect(message.content).not.toContain("juan@example.com")
	})
})

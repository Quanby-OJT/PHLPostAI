import { describe, expect, it } from "vitest"

import {
	EMPTY_TRANSCRIPT_FILTERS,
	formatConfidence,
	shortId,
	toTranscriptSearch,
	TRANSCRIPT_PAGE_SIZE,
} from "./transcript-filters"

describe("toTranscriptSearch", () => {
	it("sends only the filters the reviewer set", () => {
		const result = toTranscriptSearch(
			{ ...EMPTY_TRANSCRIPT_FILTERS, category: " rates ", outcome: "resolved_by_ai" },
			2
		)
		expect(result).toEqual({
			ok: true,
			input: {
				page: 2,
				pageSize: TRANSCRIPT_PAGE_SIZE,
				category: "rates",
				outcome: "resolved_by_ai",
			},
		})
	})

	it("sends no filter keys when the form is empty", () => {
		const result = toTranscriptSearch(EMPTY_TRANSCRIPT_FILTERS, 1)
		expect(result).toEqual({ ok: true, input: { page: 1, pageSize: TRANSCRIPT_PAGE_SIZE } })
	})

	it("rejects a range whose start is after its end", () => {
		const result = toTranscriptSearch(
			{ ...EMPTY_TRANSCRIPT_FILTERS, from: "2026-11-21", to: "2026-11-20" },
			1
		)
		expect(result.ok).toBe(false)
	})

	it("keeps a single-day range", () => {
		const result = toTranscriptSearch(
			{ ...EMPTY_TRANSCRIPT_FILTERS, from: "2026-11-20", to: "2026-11-20" },
			1
		)
		expect(result.ok).toBe(true)
	})
})

describe("display helpers", () => {
	it("formats confidence as a whole percentage or 'Not recorded'", () => {
		expect(formatConfidence(0.824)).toBe("82%")
		expect(formatConfidence(null)).toBe("Not recorded")
	})

	it("shortens long identifiers and keeps short ones", () => {
		expect(shortId("00000000-0000-4000-8000-0000000000a1")).toBe("00000000…00a1")
		expect(shortId("trace-1")).toBe("trace-1")
	})
})

import type { TranscriptSearch } from "@repo/contracts"

/** Raw form state for the transcript search. Empty strings mean "not set". */
export interface TranscriptFilterForm {
	from: string
	to: string
	category: string
	language: string
	outcome: string
	reference: string
}

export const EMPTY_TRANSCRIPT_FILTERS: TranscriptFilterForm = {
	from: "",
	to: "",
	category: "",
	language: "",
	outcome: "",
	reference: "",
}

export const TRANSCRIPT_PAGE_SIZE = 25

/**
 * Builds the search request. Only set filters are sent, so the API applies
 * exactly what the reviewer chose. Returns an error message for an invalid
 * date range instead of a request.
 */
export function toTranscriptSearch(
	form: TranscriptFilterForm,
	page: number
): { ok: true; input: TranscriptSearch } | { ok: false; error: string } {
	if (form.from && form.to && form.from > form.to) {
		return { ok: false, error: "The start date must be on or before the end date." }
	}
	const input: TranscriptSearch = { page, pageSize: TRANSCRIPT_PAGE_SIZE }
	if (form.from) input.from = form.from
	if (form.to) input.to = form.to
	if (form.category.trim()) input.category = form.category.trim()
	if (form.language) input.language = form.language as TranscriptSearch["language"]
	if (form.outcome) input.outcome = form.outcome as TranscriptSearch["outcome"]
	if (form.reference.trim()) input.reference = form.reference.trim()
	return { ok: true, input }
}

export function formatConfidence(value: number | null): string {
	return value === null ? "Not recorded" : `${Math.round(value * 100)}%`
}

export function shortId(value: string): string {
	return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

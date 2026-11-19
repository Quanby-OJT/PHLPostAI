import { createHmac } from "node:crypto"

export type TrackingNumberScan =
	| { kind: "number"; trackingNumber: string; raw: string }
	| { kind: "malformed"; raw: string }
	| { kind: "missing" }

export const TRACKING_NUMBER_PLACEHOLDER = "[TRACKING_NUMBER]"

const TOKEN_SEPARATOR = /[^A-Za-z0-9-]+/
const MIN_CANDIDATE_LENGTH = 8
const MAX_CANDIDATE_LENGTH = 30
const MIN_CANDIDATE_DIGITS = 5

export function normalizeTrackingNumber(raw: string): string {
	return raw.replace(/-/g, "").toUpperCase()
}

function isCandidate(normalized: string): boolean {
	const digits = normalized.replace(/\D/g, "").length
	return (
		normalized.length >= MIN_CANDIDATE_LENGTH &&
		normalized.length <= MAX_CANDIDATE_LENGTH &&
		digits >= MIN_CANDIDATE_DIGITS
	)
}

/** Finds the first valid tracking number, else the first number-like token, in the text. */
export function scanForTrackingNumber(text: string, pattern: RegExp): TrackingNumberScan {
	let malformed: string | null = null
	for (const raw of text.split(TOKEN_SEPARATOR)) {
		const token = raw.replace(/^-+|-+$/g, "")
		const normalized = normalizeTrackingNumber(token)
		if (!isCandidate(normalized)) continue
		if (pattern.test(normalized)) return { kind: "number", trackingNumber: normalized, raw: token }
		malformed ??= token
	}
	return malformed === null ? { kind: "missing" } : { kind: "malformed", raw: malformed }
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function mentionsTracking(text: string, keywords: readonly string[]): boolean {
	return keywords.some(keyword => new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i").test(text))
}

export function maskTrackingNumber(text: string, scan: TrackingNumberScan): string {
	return scan.kind === "missing" ? text : text.split(scan.raw).join(TRACKING_NUMBER_PLACEHOLDER)
}

export function hashTrackingNumber(trackingNumber: string, secret: string): string {
	return createHmac("sha256", secret).update(trackingNumber).digest("hex")
}

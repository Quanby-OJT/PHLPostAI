/** CNV-5 final-output checks. This is intentionally deterministic and fail closed. */
const PAYMENT_OR_SECRET_REQUEST =
	/\b(?:please\s+)?pay\b|\b(?:make|complete|submit)\s+(?:a\s+)?payment\b|\bsettle\s+(?:the\s+)?(?:fee|payment)\b|\bpayment\s+link\b|\b(?:send|share|provide|enter|give|text)\s+(?:(?:me|us)\s+)?(?:(?:your|the|my)\s+)?(?:password|one[- ]time\s+code|otp|(?:credit\s+)?card\s+number|cvv|pin)\b|\bsend\s+(?:payment|money|your\s+card)\b/i
const AMOUNT = /(?:₱|PHP\s*)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:PHP|pesos?)\b/gi
const BARE_AMOUNT =
	/\b(?:fee|cost|price|rate|postage|amount(?:\s+due)?|total|balance)\b[^.!?]{0,30}?\b(\d[\d,]*(?:\.\d{1,2})?)\b/gi
const STATUS =
	/\b(?:in transit|out for delivery|delivered|delivery attempted|available for pickup|held at|returned to sender|pending|processed|approved|rejected|cancelled|canceled|failed|successful|completed)\b/gi

function normalized(value: string): string {
	return value.toLowerCase().replace(/[,\s]/g, "").replace(/₱/g, "php")
}

export interface AnswerGuardrailResult {
	blocked: boolean
	reason:
		| "payment_or_credential_request"
		| "blocked_topic"
		| "unsupported_amount"
		| "unsupported_status"
		| null
}

export function validateCustomerAnswer(
	answer: string,
	evidence: readonly string[],
	blockedTopics: readonly string[] = []
): AnswerGuardrailResult {
	if (PAYMENT_OR_SECRET_REQUEST.test(answer)) {
		return { blocked: true, reason: "payment_or_credential_request" }
	}
	const folded = answer.toLocaleLowerCase()
	if (
		blockedTopics.some(topic => topic.trim() && folded.includes(topic.trim().toLocaleLowerCase()))
	) {
		return { blocked: true, reason: "blocked_topic" }
	}
	const sourceText = evidence.join(" ").toLocaleLowerCase()
	const source = normalized(sourceText)
	const amounts = [
		...(answer.match(AMOUNT) ?? []),
		...[...answer.matchAll(BARE_AMOUNT)].map(match => match[1] ?? ""),
	]
	for (const amount of amounts) {
		if (!source.includes(normalized(amount))) return { blocked: true, reason: "unsupported_amount" }
	}
	for (const status of answer.match(STATUS) ?? []) {
		if (!sourceText.includes(status.toLocaleLowerCase()))
			return { blocked: true, reason: "unsupported_status" }
	}
	return { blocked: false, reason: null }
}

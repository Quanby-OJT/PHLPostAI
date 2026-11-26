/** CNV-5 final-output checks. This is intentionally deterministic and fail closed. */
/** Asking the customer to pay now or through a channel, or to hand over a secret (AC2). */
const PAYMENT_OR_SECRET_REQUEST =
	/\bpay\b[^.!?]{0,40}?\b(?:now|immediately|right away|today|to\s+(?:this|the\s+following|my|our)|via|through|using|online|link|gcash|maya|paymaya|bank|account|transfer)\b|\b(?:make|complete|submit)\s+(?:a\s+|the\s+)?payment\s+(?:to|via|through|using|now|online)\b|\bsettle\s+(?:the\s+)?(?:fee|payment)\s+(?:now|via|through|online|to)\b|\bpayment\s+link\b|\b(?:send|transfer|wire)\s+(?:the\s+)?(?:payment|money|funds)\b|\b(?:send|share|provide|enter|give|text)\s+(?:(?:me|us)\s+)?(?:(?:your|the|my)\s+)?(?:password|one[- ]time\s+code|otp|(?:credit\s+)?card\s+number|cvv|pin)\b|\bsend\s+your\s+card\b/i
/** A plain payment instruction, such as "pay the fee at the counter", must come from the sources (AC1). */
const PAYMENT_MENTION = /\b(?:pay|paid|payment)\b/i
/** A warning such as "Never share your password" is advice, not a request. */
const NEGATION =
	/\b(?:never|do\s+not|don't|dont|should\s+not|shouldn't|will\s+not|won't|huwag|hindi|ayaw|dili|saan|di)\b/i
/** CNV-6: "I can't tell whether you are eligible" declines a decision; not used for payment checks. */
const DECLINING = /\b(?:cannot|can't|cant|unable|diak)\b/i
/**
 * CNV-6: telling this customer they are eligible, qualify, or will be approved
 * or rejected decides their case. A rule ("if you are 18, you can apply") does not.
 */
const INDIVIDUAL_DECISION =
	/\byou(?:'re|\s+are)\s+(?:(?:definitely|likely|probably|already|now)\s+)?(?:not\s+)?(?:eligible|ineligible|qualified|approved|rejected|denied|disqualified)\b|\byou\s+(?:definitely\s+|likely\s+|probably\s+)?(?:qualify|meet\s+(?:all\s+)?(?:the\s+)?(?:requirements|criteria))\b|\byou\s+(?:will|would|should)\s+(?:definitely\s+|likely\s+|probably\s+)?(?:not\s+)?(?:be\s+)?(?:approved|rejected|denied|eligible|qualify|accepted)\b|\byour\s+(?:postal\s+id\s+)?application\s+(?:is|has\s+been|was|will\s+be|would\s+be)\s+(?:not\s+)?(?:approved|rejected|denied|accepted)\b|\b(?:kwalipikado|kuwalipikado|eligible|qualified)\s+ka\b|\b(?:maaa?prubahan|aaprubahan|aprubado|maaprobahan|aprobado|maaprobaran)\s+(?:ka|na\s+ka|ang\s+(?:iyong|inyong)\s+aplikasyon|imong\s+aplikasyon)\b|\bmaikarika\b/i
const CONDITIONAL = /\b(?:if|unless|as\s+long\s+as|provided|kung|kapag|pag|kon|basta)\b/i
const AMOUNT = /(?:₱|PHP\s*)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:PHP|pesos?)\b/gi
const BARE_AMOUNT =
	/\b(?:fee|cost|price|rate|postage|amount(?:\s+due)?|total|balance)\b[^.!?]{0,30}?\b(\d[\d,]*(?:\.\d{1,2})?)\b/gi
const NUMBER = /\d[\d,]*(?:\.\d+)?/g
/** Citation markers such as [1] are references, not figures. */
const CITATION_MARKER = /\[\d+\]/g
const STATUS =
	/\b(?:in transit|out for delivery|delivered|delivery attempted|available for pickup|held at|returned to sender|pending|processed|approved|rejected|cancelled|canceled|failed|successful|completed)\b/gi

export interface AnswerGuardrailResult {
	blocked: boolean
	reason:
		| "payment_or_credential_request"
		| "blocked_topic"
		| "unsupported_amount"
		| "unsupported_status"
		| "unsupported_payment_instruction"
		| "individual_decision"
		| null
}

function sentences(text: string): string[] {
	return text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean)
}

function numericValue(text: string): number | null {
	const digits = text.match(NUMBER)?.[0]?.replace(/,/g, "")
	if (digits === undefined) return null
	const value = Number(digits)
	return Number.isFinite(value) ? value : null
}

export function validateCustomerAnswer(
	draft: string,
	evidence: readonly string[],
	blockedTopics: readonly string[] = []
): AnswerGuardrailResult {
	const answer = draft.replace(CITATION_MARKER, "")
	const statements = sentences(answer).filter(sentence => !NEGATION.test(sentence))
	if (statements.some(sentence => PAYMENT_OR_SECRET_REQUEST.test(sentence))) {
		return { blocked: true, reason: "payment_or_credential_request" }
	}
	const claims = statements.filter(sentence => !DECLINING.test(sentence))
	if (
		claims.some(sentence => INDIVIDUAL_DECISION.test(sentence) && !CONDITIONAL.test(sentence))
	) {
		return { blocked: true, reason: "individual_decision" }
	}
	const folded = answer.toLocaleLowerCase()
	if (
		blockedTopics.some(topic => topic.trim() && folded.includes(topic.trim().toLocaleLowerCase()))
	) {
		return { blocked: true, reason: "blocked_topic" }
	}
	const sourceText = evidence.join(" ").toLocaleLowerCase()
	if (
		statements.some(sentence => PAYMENT_MENTION.test(sentence)) &&
		!PAYMENT_MENTION.test(sourceText)
	) {
		return { blocked: true, reason: "unsupported_payment_instruction" }
	}
	const sourceValues = new Set(
		(sourceText.match(NUMBER) ?? [])
			.map(numericValue)
			.filter((value): value is number => value !== null)
	)
	const amounts = [
		...(answer.match(AMOUNT) ?? []),
		...[...answer.matchAll(BARE_AMOUNT)].map(match => match[1] ?? ""),
	]
	for (const amount of amounts) {
		const value = numericValue(amount)
		if (value === null || !sourceValues.has(value)) {
			return { blocked: true, reason: "unsupported_amount" }
		}
	}
	for (const status of claims.join(" ").match(STATUS) ?? []) {
		if (!sourceText.includes(status.toLocaleLowerCase()))
			return { blocked: true, reason: "unsupported_status" }
	}
	return { blocked: false, reason: null }
}

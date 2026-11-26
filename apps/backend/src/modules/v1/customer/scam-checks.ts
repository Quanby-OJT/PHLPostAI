import { domainToASCII } from "node:url"
import { z } from "zod"

import { SCAM_INDICATORS, type ScamIndicator } from "./scam-copy"

const MODEL_INDICATORS = [
	"payment_request",
	"information_request",
	"impersonation",
	"urgency",
] as const
const ModelAssessmentSchema = z.strictObject({
	riskLevel: z.enum(["low", "medium", "high", "uncertain"]),
	indicators: z.array(z.enum(MODEL_INDICATORS)).max(MODEL_INDICATORS.length),
	confidence: z.number().min(0).max(1),
})

// Max input length is enforced by the customer contract. These patterns identify
// candidates only; URL is the parser and the hostname is the only allowlist key.
const LINK_PART = String.raw`(?:(?!\]\()[^\s<>"\x60])`
const BARE_HOST = String.raw`(?:(?:[\p{L}\p{N}-]+[.\u3002\uFF0E\uFF61])+\p{L}[\p{L}\p{N}-]*|(?:\d{1,3}\.){3}\d{1,3})`
const LINK = new RegExp(
	String.raw`(?<![\p{L}\p{N}_@./-])(?:[a-z][a-z\d+.-]*:\/\/${LINK_PART}*|(?:https?|ftp|file|javascript|data):${LINK_PART}*|\/\/${LINK_PART}+|${BARE_HOST}(?![@\p{L}\p{N}_-]|[.\u3002\uFF0E\uFF61][\p{L}\p{N}-])(?:[/:?#]${LINK_PART}*)?)`,
	"giu"
)
const ADDRESS_PREFIX = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i
const PAYMENT_REQUESTS = [
	/\b(?:please\s+pay|(?:payment|fee)\s+(?:request|due|required|of)|request(?:ing|s|ed)?\s+(?:for\s+)?(?:a\s+)?(?:payment|fee)|(?:redelivery|delivery|release|handling)\s+fee)\b/i,
	/\b(?:pay|send|settle|remit|deposit)\s*(?:for\s+)?(?:the\s+|a\s+|your\s+)?(?:fee\b|charge\b|payment\b|php\b|₱|p?\d)/iu,
	/\b(?:magbayad|bayaran|mobayad|pagbayad|agbayad|bayadam)\b|\b(?:bayad|bayari)\s*(?:ng\s+|ug\s+|iti\s+)?₱/iu,
]
const SUSPICIOUS_MESSAGE = /\b(?:scam|phishing|fraud|suspicious|payment\s+link)\b/i
const EMAIL = /^(?:from|to|subject):.+$/im
const EMAIL_ADDRESS = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/giu
const MOBILE_NUMBER = /(?<!\d)(?:\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g
const INTERNATIONAL_NUMBER = /(?<!\d)\+\d{1,3}[\s-]?\d{3}[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)/g
const LONG_IDENTIFIER = /(?<![\p{L}\p{N}])\d(?:[ -]?\d){8,18}(?![\p{L}\p{N}])/gu
const LABELED_VALUE =
	/\b(full name|recipient name|address|account(?: number| id)?|acct|card(?: number)?|password|one[- ]time password|otp)\s*[:=]\s*[^\n,;]+/gi
const GREETING_NAME =
	/^(\s*(?:dear|hi|hello|mahal na|ginoo|ginang)\s+)\p{L}+(?:[ -]\p{L}+){1,4}(?=\s*[,!:\r\n]|$)/gimu
const DELIVERY_RECIPIENT =
	/\b((?:[Dd]elivery|[Pp]arcel|[Pp]ackage)[ \t]+(?:notice|update)[ \t]+for[ \t]+)\p{Lu}[\p{L}\p{M}’'-]*(?:[ \t]+\p{Lu}[\p{L}\p{M}’'-]*){1,4}(?=[ \t]*[,.;!:\r\n]|$)/gu

function linkAddress(candidate: string): string {
	return candidate.replace(/[.,;!?)]+$/u, "")
}

export function hasPaymentRequest(text: string): boolean {
	return PAYMENT_REQUESTS.some(pattern => pattern.test(text))
}

/** Minimize private values at the API boundary before the shared RAG screen. */
export function maskScamInput(text: string): string {
	return text
		.replace(MOBILE_NUMBER, "[PHONE]")
		.replace(INTERNATIONAL_NUMBER, "[PHONE]")
		.replace(EMAIL_ADDRESS, "[EMAIL]")
		.replace(LABELED_VALUE, "$1: [PRIVATE_DETAIL]")
		.replace(GREETING_NAME, "$1[NAME]")
		.replace(DELIVERY_RECIPIENT, "$1[NAME]")
		.replace(LONG_IDENTIFIER, "[ACCOUNT_OR_IDENTIFIER]")
}

export function isScamSubmission(text: string): boolean {
	const links = [...text.matchAll(LINK)]
	return (
		links.some(link => link[0] === text.trim()) ||
		(links.length > 0 && (hasPaymentRequest(text) || SUSPICIOUS_MESSAGE.test(text)))
	)
}

export function inspectScamLinks(
	text: string,
	officialHosts: readonly string[]
): {
	textWithoutLinks: string
	extractedUrls: string[]
	unofficialDomain: boolean
	suspiciousLink: boolean
	kind: "text" | "email" | "link"
} {
	const allowlist = new Set(officialHosts.map(host => domainToASCII(host).replace(/\.$/u, "")))
	const extractedUrls: string[] = []
	let unofficialDomain = false
	let suspiciousLink = false
	let isLinkOnly = false
	const textWithoutLinks = text.replace(LINK, (candidate: string) => {
		if (candidate === text.trim()) isLinkOnly = true
		const address = linkAddress(candidate)
		const scheme = address.match(/^[a-z][a-z\d+.-]*:/i)?.[0].toLowerCase()
		const hasScheme = ADDRESS_PREFIX.test(address) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(address)
		const input = address.startsWith("//")
			? `https:${address}`
			: hasScheme
				? address
				: `https://${address}`
		const url = URL.canParse(input) ? new URL(input) : null
		const usable =
			url &&
			/^https?:$/.test(url.protocol) &&
			!address.includes("\\") &&
			(!scheme || !hasScheme || /^https?:\/\/[^/]/i.test(address)) &&
			Boolean(url.hostname)
		if (!usable) {
			suspiciousLink = true
			extractedUrls.push("[UNPARSEABLE_URL]")
			return "[LINK]"
		}
		const hostname = url.hostname.replace(/\.$/u, "")
		const isOfficial = allowlist.has(hostname)
		if (!isOfficial) unofficialDomain = true
		if (url.username || url.password || url.port) suspiciousLink = true
		extractedUrls.push(isOfficial ? `${url.protocol}//${hostname}` : "[UNOFFICIAL_URL]")
		return "[LINK]"
	})
	return {
		textWithoutLinks,
		extractedUrls,
		unofficialDomain,
		suspiciousLink,
		kind: isLinkOnly ? "link" : EMAIL.test(text) ? "email" : "text",
	}
}

export function resolveScamAssessment(
	deterministic: readonly ScamIndicator[],
	active: ReadonlySet<string>,
	rawModel: unknown
) {
	const mandatoryHigh =
		deterministic.includes("payment_request") && deterministic.includes("unofficial_domain")
	const findings = new Set(deterministic.filter(code => active.has(code)))
	if (mandatoryHigh) {
		findings.add("payment_request")
		findings.add("unofficial_domain")
	}
	const parsed = ModelAssessmentSchema.safeParse(rawModel)
	const model =
		parsed.success && parsed.data.indicators.every(code => active.has(code)) ? parsed.data : null
	const hasDeterministicEvidence = findings.size > 0
	for (const code of model?.indicators ?? []) findings.add(code)
	const indicators = SCAM_INDICATORS.filter(code => findings.has(code))

	if (mandatoryHigh) return { riskLevel: "high", indicators, confidence: 1 } as const
	if (model && findings.has("payment_request") && findings.has("unofficial_domain")) {
		return { riskLevel: "high", indicators, confidence: Math.max(0.5, model.confidence) } as const
	}
	if (indicators.length === 0) return { riskLevel: "uncertain", indicators, confidence: 0 } as const
	if (
		model &&
		model.riskLevel !== "uncertain" &&
		(!hasDeterministicEvidence || model.riskLevel !== "low")
	) {
		return { riskLevel: model.riskLevel, indicators, confidence: model.confidence }
	}
	if (hasDeterministicEvidence) return { riskLevel: "medium", indicators, confidence: 0.5 } as const
	return { riskLevel: "uncertain", indicators, confidence: 0 } as const
}

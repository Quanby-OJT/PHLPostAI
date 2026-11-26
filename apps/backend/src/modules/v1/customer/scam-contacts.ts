import { domainToASCII, domainToUnicode } from "node:url"

type Contact = { kind: "domain" | "sender" | "payment-channel"; value: string }

export function normalizeOfficialContact(kind: Contact["kind"], value: string): string | null {
	const cleaned = value.normalize("NFKC").trim()
	if (kind !== "domain") {
		const name = cleaned.replace(/\s+/gu, " ")
		return name.length <= 100 && /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .&'’()+_-]*$/u.test(name)
			? name.toLowerCase()
			: null
	}
	if (!/^[\p{L}\p{M}\p{N}.\u3002\uFF61-]+$/u.test(cleaned)) return null
	const hostname = domainToASCII(cleaned).replace(/\.$/u, "")
	const labels = hostname.split(".")
	return hostname.length <= 253 &&
		labels.length > 1 &&
		/[a-z]/u.test(labels.at(-1) ?? "") &&
		labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
		? hostname
		: null
}

// A small defensive set for characters visually similar in common hostname fonts.
const HOMOGLYPHS: Readonly<Record<string, string>> = {
	"а": "a",
	"е": "e",
	"о": "o",
	"р": "p",
	"с": "c",
	"х": "x",
	"у": "y",
	"і": "i",
	"ј": "j",
	"ѕ": "s",
	"ԁ": "d",
	"һ": "h",
	"ӏ": "l",
	"α": "a",
	"ε": "e",
	"ο": "o",
	"ρ": "p",
	"χ": "x",
	"ι": "i",
	"κ": "k",
	"ν": "v",
	"0": "o",
	"1": "l",
}

function foldHostname(hostname: string): string {
	return Array.from(
		domainToUnicode(hostname).normalize("NFKC").toLowerCase(),
		char => HOMOGLYPHS[char] ?? char
	).join("")
}

/** Levenshtein distance at most one, with a bounded linear scan. */
function withinOneEdit(shorter: string, longer: string): boolean {
	if (shorter.length > longer.length) return withinOneEdit(longer, shorter)
	if (longer.length - shorter.length > 1) return false
	let offset = 0
	while (offset < shorter.length && shorter[offset] === longer[offset]) offset++
	return (
		shorter.slice(offset + (shorter.length === longer.length ? 1 : 0)) === longer.slice(offset + 1)
	)
}

export function resemblesOfficialHostname(hostname: string, official: string): boolean {
	if (hostname === official) return false
	if (`.${hostname}.`.includes(`.${official}.`)) return true
	const folded = foldHostname(hostname)
	const officialFolded = foldHostname(official)
	if (!folded || !officialFolded) return false
	if (folded === officialFolded) return true
	const labels = folded.split(".")
	const reference = officialFolded.split(".")
	if (labels.length !== reference.length || labels.at(-1) !== reference.at(-1)) return false
	const differences = labels.flatMap((label, index) => (label === reference[index] ? [] : [index]))
	if (differences.length !== 1) return false
	const label = labels[differences[0] ?? -1]
	const officialLabel = reference[differences[0] ?? -1]
	return Boolean(
		label &&
		officialLabel &&
		Math.min(label.length, officialLabel.length) >= 4 &&
		withinOneEdit(label, officialLabel)
	)
}

const CONTACT_FIELD = /^(from|sender|payment channel|payment method):[ \t]*([^\r\n]+)/gimu

export function inspectScamContactFields(
	text: string,
	contacts: readonly Contact[],
	textWithoutLinks = text
) {
	const configured = new Set(
		contacts.map(row => `${row.kind}:${normalizeOfficialContact(row.kind, row.value)}`)
	)
	let unofficialSender = false
	let unofficialPaymentChannel = false
	for (const [, label, raw] of text.matchAll(CONTACT_FIELD)) {
		if (!label || !raw?.trim()) continue
		const sender = /^(from|sender)$/i.test(label)
		const kind = sender ? "sender" : "payment-channel"
		const value = sender
			? raw
					.replace(/<[^<>]*>\s*$/u, "")
					.trim()
					.replace(/^"|"$/g, "")
			: raw
		const normalized = normalizeOfficialContact(kind, value)
		if (!normalized || !configured.has(`${kind}:${normalized}`)) {
			if (sender) unofficialSender = true
			else unofficialPaymentChannel = true
		}
	}
	const textWithoutContactValues = textWithoutLinks.replace(
		CONTACT_FIELD,
		(_field, label: string) => `${label}: [CONTACT]`
	)
	return { textWithoutContactValues, unofficialSender, unofficialPaymentChannel }
}

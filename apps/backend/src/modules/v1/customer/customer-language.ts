import {
	CUSTOMER_LANGUAGES,
	UNTRANSLATED_POSTAL_TERMS,
	type CustomerLanguage,
} from "@repo/contracts"

export const UNSUPPORTED_LANGUAGE = "unsupported"

export const SUPPORTED_LANGUAGES_NOTICE =
	"I can reply in English, Filipino, Cebuano and Ilocano. Please write in one of these languages if you can."

export const I_DONT_KNOW_REPLIES: Record<CustomerLanguage, string> = {
	en: "I don't know.",
	fil: "Hindi ko alam.",
	ceb: "Wala ko kahibalo.",
	ilo: "Diak ammo.",
}

export function isCustomerLanguage(value: unknown): value is CustomerLanguage {
	return typeof value === "string" && (CUSTOMER_LANGUAGES as readonly string[]).includes(value)
}

/**
 * CNV-4: a message written in Filipino, Cebuano or Ilocano is answered in that
 * language; an unsupported one in English; an English or undetected one in the
 * session's language, which the customer can pick from the widget menu.
 */
export function replyLanguageFor(
	detected: string | null,
	sessionLanguage: string
): CustomerLanguage {
	if (detected === UNSUPPORTED_LANGUAGE) return "en"
	if (detected !== "en" && isCustomerLanguage(detected)) return detected
	return isCustomerLanguage(sessionLanguage) ? sessionLanguage : "en"
}

export function withLanguageNotice(answer: string, detected: string | null): string {
	return detected === UNSUPPORTED_LANGUAGE ? `${answer}\n\n${SUPPORTED_LANGUAGES_NOTICE}` : answer
}

/** What the RAG service needs to translate the question and write the reply. */
export function ragLanguageFields(classification: {
	language: string | null
	replyLanguage: CustomerLanguage
}) {
	return {
		language: classification.replyLanguage,
		...(classification.language !== null && { queryLanguage: classification.language }),
		glossary: UNTRANSLATED_POSTAL_TERMS,
	}
}

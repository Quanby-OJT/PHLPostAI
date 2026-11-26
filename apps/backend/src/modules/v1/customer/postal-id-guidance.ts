import type { CustomerLanguage } from "@repo/contracts"

/**
 * CNV-6: Postal ID questions. The assistant explains the published steps and
 * requirements but never decides a case and has no access to application records.
 */
export type PostalIdIntent = "status" | "eligibility" | "guidance"

const STATUS_WORDS =
	/\b(?:status|update|where(?:'s|\s+is)|ready|released?|follow[- ]?up|nasaan|nasan|asan|kumusta|kamusta|handa\s+na|asa\s+na|unsa\s+na|ania\s+ti|sadino)\b/i
const OWN_APPLICATION =
	/\b(?:my|our|ko|nako|akong|namin|mo|nimo)\b|\b(?:application|aplikasyon|aplikasion)\b/i
const ELIGIBILITY =
	/\b(?:am\s+i|i'm|im|will\s+i|would\s+i|can\s+i|do\s+i)\s+(?:be\s+)?(?:eligible|qualified|qualify|approved|accepted)\b|\bwill\s+(?:my|our)\s+(?:postal\s+id\s+)?application\s+be\s+(?:approved|accepted|rejected|denied)\b|\b(?:eligible|qualified|kwalipikado|kuwalipikado)\s+(?:ba\s+)?(?:ako|ko)\b|\b(?:maaa?prubahan|ma-?aprubahan|maaprobahan|maaprobaran)\s+(?:ba|kaya|kadi)\b|\bmaikari\s+(?:kadi|ak)\b/i

/** Status beats eligibility, which beats general guidance. */
export function postalIdIntent(text: string): PostalIdIntent {
	if (STATUS_WORDS.test(text) && OWN_APPLICATION.test(text)) return "status"
	if (ELIGIBILITY.test(text)) return "eligibility"
	return "guidance"
}

/** AC4: no lookup of application records exists, so this is fixed text. */
export const POSTAL_ID_STATUS_REPLIES: Record<CustomerLanguage, string> = {
	en: "I don't have access to Postal ID application records, so I can't check the status of an application. Please contact the post office or capturing site where you applied, or ask to speak with a person below.",
	fil: "Wala akong access sa mga rekord ng aplikasyon sa Postal ID, kaya hindi ko masusuri ang status ng isang aplikasyon. Makipag-ugnayan sa post office o capturing site kung saan ka nag-apply, o humiling na makipag-usap sa isang tao sa ibaba.",
	ceb: "Wala koy access sa mga rekord sa aplikasyon sa Postal ID, busa dili nako ma-check ang status sa usa ka aplikasyon. Palihug kontaka ang post office o capturing site diin ka nag-apply, o mohangyo nga makigsulti sa usa ka tawo sa ubos.",
	ilo: "Awan ti access-ko kadagiti rekord ti aplikasion iti Postal ID, isu a diak matsek ti status ti aplikasion. Pangngaasiyo a kontaken ti post office wenno capturing site a nagaplayanyo, wenno agkiddaw a makisarita iti maysa a tao iti baba.",
}

/** AC2: always added to an eligibility answer, after the guardrail check. */
export const INDIVIDUAL_CASE_NOTICES: Record<CustomerLanguage, string> = {
	en: "I can't decide individual cases or tell whether an application will be approved. Staff at the Postal ID capturing site decide this, or you can ask to speak with a person below.",
	fil: "Hindi ako makapagpapasya sa mga indibidwal na kaso o makapagsasabi kung maaaprubahan ang isang aplikasyon. Ang mga kawani sa Postal ID capturing site ang nagpapasya nito, o maaari kang humiling na makipag-usap sa isang tao sa ibaba.",
	ceb: "Dili ko makadesisyon sa indibidwal nga mga kaso o makasulti kon maaprobahan ba ang usa ka aplikasyon. Ang mga kawani sa Postal ID capturing site ang modesisyon niini, o mahimo kang mohangyo nga makigsulti sa usa ka tawo sa ubos.",
	ilo: "Diak maikeddeng dagiti indibidual a kaso wenno maibaga no maaprobaran ti maysa nga aplikasion. Dagiti empleado iti Postal ID capturing site ti mangikeddeng iti daytoy, wenno mabalinmo ti agkiddaw a makisarita iti maysa a tao iti baba.",
}

/** AC3: added whenever the screen masked personal details in the question. */
export const PERSONAL_DETAILS_REMINDERS: Record<CustomerLanguage, string> = {
	en: "For your safety, please don't share ID numbers or other personal details in this chat. I've hidden them.",
	fil: "Para sa iyong kaligtasan, huwag magbahagi ng mga ID number o iba pang personal na detalye sa chat na ito. Itinago ko na ang mga ito.",
	ceb: "Para sa imong kaluwasan, ayaw ipaambit ang mga ID number o uban pang personal nga detalye niini nga chat. Gitago na nako kini.",
	ilo: "Para iti kinatalgedmo, saanmo nga ibinglay dagiti ID number wenno sabali pay a personal a detalye iti daytoy a chat. Inlemmengko dagitoy.",
}

/** Placeholders the RAG screen writes for personal data (tracking numbers are not personal). */
const PERSONAL_PLACEHOLDER = /\[(?:EMAIL|PHONE|PH_ID|PH_TIN|PH_SSS|ID_NUMBER)\]/

export function sharedPersonalDetails(maskedQuery: string): boolean {
	return PERSONAL_PLACEHOLDER.test(maskedQuery)
}

/** Appends the Postal ID notice (eligibility) and the personal-details reminder, in that order. */
export function withPostalIdNotices(
	answer: string,
	options: { intent?: PostalIdIntent; maskedQuery: string; language: CustomerLanguage }
): string {
	const notices = [
		...(options.intent === "eligibility" ? [INDIVIDUAL_CASE_NOTICES[options.language]] : []),
		...(sharedPersonalDetails(options.maskedQuery)
			? [PERSONAL_DETAILS_REMINDERS[options.language]]
			: []),
	]
	return notices.length > 0 ? `${answer}\n\n${notices.join("\n\n")}` : answer
}

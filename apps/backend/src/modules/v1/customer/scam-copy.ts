import type { CustomerAnswer, CustomerLanguage } from "@repo/contracts"

export const SCAM_INDICATORS = [
	"payment_request",
	"unofficial_domain",
	"suspicious_link",
	"prompt_injection",
	"information_request",
	"impersonation",
	"urgency",
] as const

export type ScamIndicator = (typeof SCAM_INDICATORS)[number]
export type ScamAssessment = NonNullable<CustomerAnswer["scamAssessment"]>

type ScamCopy = {
	risk: Record<ScamAssessment["riskLevel"], string>
	signals: Record<ScamIndicator, string>
	indicators: string
	noIndicators: string
	protect: string
	verify: string
	report: string
	advisory: string
}

// TS `3.1, p. 96. The non-English wording is pending PHLPost language review.
export const SCAM_COPY: Record<CustomerLanguage, ScamCopy> = {
	en: {
		risk: {
			low: "Assessed risk: Low",
			medium: "Assessed risk: Medium",
			high: "Assessed risk: High",
			uncertain: "Assessed risk: Uncertain",
		},
		signals: {
			payment_request: "Request for payment",
			unofficial_domain: "Link to a domain outside the official PHLPost list",
			suspicious_link: "Unusual or unreadable link",
			prompt_injection: "Instructions aimed at changing the assistant’s assessment",
			information_request: "Request for sensitive information",
			impersonation: "Possible impersonation",
			urgency: "Pressure to act quickly",
		},
		indicators: "Indicators found",
		noIndicators: "There is not enough information to assess this message.",
		protect:
			"Avoid opening links, paying, or sharing personal or banking information in response to this message.",
		verify:
			"Verify the message through the official PHLPost website or a contact you already trust.",
		report: "You can report the message to PHLPost Customer Service at (02) 8288-7678.",
		advisory:
			"AI-generated scam assessments shall be advisory and shall not be represented as conclusive determinations of fraud.",
	},
	fil: {
		risk: {
			low: "Tinatayang panganib: Mababa",
			medium: "Tinatayang panganib: Katamtaman",
			high: "Tinatayang panganib: Mataas",
			uncertain: "Tinatayang panganib: Hindi tiyak",
		},
		signals: {
			payment_request: "Humihingi ng bayad",
			unofficial_domain: "Link sa domain na wala sa opisyal na listahan ng PHLPost",
			suspicious_link: "Kakaiba o hindi mabasang link",
			prompt_injection: "Mga utos na nagtatangkang baguhin ang pagtatasa ng assistant",
			information_request: "Humihingi ng sensitibong impormasyon",
			impersonation: "Posibleng pagpapanggap",
			urgency: "Namimilit na kumilos agad",
		},
		indicators: "Mga palatandaang nakita",
		noIndicators: "Kulang ang impormasyon para masuri ang mensaheng ito.",
		protect:
			"Iwasang buksan ang mga link, magbayad, o magbigay ng personal na impormasyon o detalye ng bangko bilang tugon sa mensaheng ito.",
		verify:
			"Beripikahin ang mensahe sa opisyal na website ng PHLPost o sa isang kontak na pinagkakatiwalaan mo.",
		report: "Maaari mong iulat ang mensahe sa PHLPost Customer Service sa (02) 8288-7678.",
		advisory:
			"Ang pagtatasa ng AI tungkol sa scam ay gabay lamang at hindi tiyak na pagpapasiya na may pandaraya.",
	},
	ceb: {
		risk: {
			low: "Gibanabanang risgo: Ubos",
			medium: "Gibanabanang risgo: Kasarangan",
			high: "Gibanabanang risgo: Taas",
			uncertain: "Gibanabanang risgo: Dili matino",
		},
		signals: {
			payment_request: "Nagpangayo og bayad",
			unofficial_domain: "Link sa domain nga wala sa opisyal nga listahan sa PHLPost",
			suspicious_link: "Talagsaon o dili mabasa nga link",
			prompt_injection: "Mga sugo nga misulay sa pag-usab sa pagsusi sa assistant",
			information_request: "Nagpangayo og sensitibong impormasyon",
			impersonation: "Posibleng pagpakaaron-ingnon",
			urgency: "Nagpugos nga molihok dayon",
		},
		indicators: "Mga timailhan nga nakita",
		noIndicators: "Kulang ang impormasyon aron masusi kining mensahe.",
		protect:
			"Likayi ang pag-abli sa mga link, pagbayad, o paghatag og personal o impormasyon sa bangko isip tubag sa mensahe.",
		verify:
			"Susihon ang mensahe sa opisyal nga website sa PHLPost o pinaagi sa kasaligan nimong kontak.",
		report: "Mahimo nimong ireport ang mensahe sa PHLPost Customer Service sa (02) 8288-7678.",
		advisory:
			"Ang pagsusi sa AI bahin sa scam giya lamang ug dili kataposang hukom nga adunay pagpangilad.",
	},
	ilo: {
		risk: {
			low: "Napattapatta a peggad: Nababa",
			medium: "Napattapatta a peggad: Katengngaan",
			high: "Napattapatta a peggad: Nangato",
			uncertain: "Napattapatta a peggad: Saan a sigurado",
		},
		signals: {
			payment_request: "Agkiddaw iti bayad",
			unofficial_domain: "Link iti domain nga awan iti opisial a listaan ti PHLPost",
			suspicious_link: "Naisalsalumina wenno saan a mabasa a link",
			prompt_injection: "Dagiti bilin a mangpadas a mangbaliw iti panangusig ti assistant",
			information_request: "Agkiddaw iti sensitibo nga impormasion",
			impersonation: "Posible a panagpammarang a sabali a tao",
			urgency: "Pilitenna a kumiloska a dagus",
		},
		indicators: "Dagiti nakitada a pagilasinan",
		noIndicators: "Kulang ti impormasion tapno mausig daytoy a mensahe.",
		protect:
			"Liklikam ti pananglukat iti link, panagbayad, wenno panangited iti personal nga impormasion wenno detalye ti bangko kas sungbat iti mensahe.",
		verify:
			"Pasingkedam ti mensahe babaen iti opisial a website ti PHLPost wenno iti pagtaltalkam a kontak.",
		report: "Mabalinmo nga ireport ti mensahe iti PHLPost Customer Service iti (02) 8288-7678.",
		advisory:
			"Ti panangusig ti AI maipapan iti scam ket bagnos laeng ken saan a pinal a panangikeddeng nga adda panangallilaw.",
	},
}

export function formatScamAssessment(
	risk: ScamAssessment["riskLevel"],
	indicators: readonly ScamIndicator[],
	language: CustomerLanguage
): string {
	const copy = SCAM_COPY[language]
	const findings = indicators.length
		? [copy.indicators, ...indicators.map(code => `• ${copy.signals[code]}`)].join("\n")
		: copy.noIndicators
	const guidance =
		risk === "uncertain" || risk === "low"
			? [copy.verify, copy.protect]
			: [copy.protect, copy.verify]
	const advisory = language === "en" ? copy.advisory : `${copy.advisory}\n${SCAM_COPY.en.advisory}`
	return [copy.risk[risk], findings, ...guidance, copy.report, advisory].join("\n\n")
}

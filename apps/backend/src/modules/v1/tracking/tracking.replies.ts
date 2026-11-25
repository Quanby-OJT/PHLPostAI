import type { TrackingEvent } from "./tracking-source"
import type { CustomerLanguage } from "@repo/contracts"

export const TRACKING_REPLIES = {
	missing:
		"I can check that for you. Please send your tracking number. It usually looks like RR123456789PH.",
	malformed:
		"That doesn't look like a valid tracking number. Please check it and send it again. It usually looks like RR123456789PH.",
	notFound:
		"I couldn't find a record for that tracking number. Please check that it matches the number on your receipt and try again.",
	unavailable:
		"I can't reach the tracking system right now. Please try again in a few minutes, or ask to talk to a person.",
	customs:
		"Your item is being processed by the Bureau of Customs. PHLPost does not decide when Customs releases it.",
} as const

type TrackingReplyKey = keyof typeof TRACKING_REPLIES

const TRACKING_REPLIES_BY_LANGUAGE: Record<
	CustomerLanguage,
	Record<TrackingReplyKey, string>
> = {
	en: TRACKING_REPLIES,
	fil: {
		missing:
			"Matutulungan kitang tingnan ito. Pakisend ang tracking number mo. Karaniwan itong ganito: RR123456789PH.",
		malformed:
			"Mukhang hindi wasto ang tracking number. Pakisuri at ipadala itong muli. Karaniwan itong ganito: RR123456789PH.",
		notFound:
			"Wala akong mahanap na tala para sa tracking number na iyan. Pakisuri kung tugma ito sa nasa resibo mo at subukan muli.",
		unavailable:
			"Hindi ko ma-access ang tracking system ngayon. Pakisubukan muli pagkalipas ng ilang minuto, o humingi ng tulong sa isang tao.",
		customs:
			"Pinoproseso ng Bureau of Customs ang item mo. Hindi PHLPost ang nagpapasya kung kailan ito ilalabas ng Customs.",
	},
	ceb: {
		missing:
			"Matabangan tika sa pagsusi niini. Palihog ipadala ang imong tracking number. Kasagaran ing-ani kini: RR123456789PH.",
		malformed:
			"Murag dili balido ang tracking number. Palihog susiha ug ipadala pag-usab. Kasagaran ing-ani kini: RR123456789PH.",
		notFound:
			"Wala koy nakitang rekord para sa maong tracking number. Palihog susiha kung pareho kini sa naa sa imong resibo ug sulayi pag-usab.",
		unavailable:
			"Dili nako maabot ang tracking system karon. Palihog sulayi pag-usab human sa pipila ka minuto, o pangayo og tabang sa usa ka tawo.",
		customs:
			"Giproseso sa Bureau of Customs ang imong item. Dili ang PHLPost ang magbuot kung kanus-a kini buhian sa Customs.",
	},
	ilo: {
		missing:
			"Mabalinakon a tumulong a mangsukisok. Pangngaasi nga ipatulodmo ti tracking numbermo. Kasla kadawyan iti RR123456789PH.",
		malformed:
			"Kasla saan a husto ti tracking number. Pangngaasi a kitaem manen ket ipatulodmo manen. Kasla kadawyan iti RR123456789PH.",
		notFound:
			"Awan ti nabirok a rekord para iti dayta a tracking number. Pangngaasi a kitaem no umiso iti numero iti resibom ket padasem manen.",
		unavailable:
			"Saanak a makakonektar iti tracking system ita. Pangngaasi a padasem manen kalpasan ti sumagmamano a minuto, wenno agpatulongka iti maysa a tao.",
		customs:
			"Ipropproseso ti Bureau of Customs ti itemmo. Saan a PHLPost ti mangikeddeng no kaano a rummuar daytoy iti Customs.",
	},
}

export function trackingReply(key: TrackingReplyKey, language: CustomerLanguage = "en"): string {
	return TRACKING_REPLIES_BY_LANGUAGE[language][key]
}

const STATUS_LABELS: Record<
	CustomerLanguage,
	{ intro: string; status: string; location: string; time: string; meaning: string; nextSteps: string }
> = {
	en: {
		intro: "Here is the latest status from the PHLPost tracking system:",
		status: "Status",
		location: "Location",
		time: "Time",
		meaning: "What this means",
		nextSteps: "Next steps",
	},
	fil: {
		intro: "Narito ang pinakabagong status mula sa tracking system ng PHLPost:",
		status: "Status",
		location: "Lokasyon",
		time: "Oras",
		meaning: "Kahulugan nito",
		nextSteps: "Mga susunod na hakbang",
	},
	ceb: {
		intro: "Mao kini ang pinakabag-ong status gikan sa tracking system sa PHLPost:",
		status: "Status",
		location: "Lokasyon",
		time: "Oras",
		meaning: "Kahulugan niini",
		nextSteps: "Sunod nga mga lakang",
	},
	ilo: {
		intro: "Daytoy ti kabaruan a status manipud iti tracking system ti PHLPost:",
		status: "Status",
		location: "Lugar",
		time: "Oras",
		meaning: "Kayatna a sawen",
		nextSteps: "Dagiti sumaruno a tukad",
	},
}

export interface ReplyExplanation {
	explanation: string
	nextSteps: string | null
}

/** The official status always comes first and unchanged; the explanation is appended (TRK-2). */
export function foundReply(
	event: TrackingEvent,
	options: {
		explanation?: ReplyExplanation | null
		customs?: boolean
		language?: CustomerLanguage
	} = {}
): string {
	const labels = STATUS_LABELS[options.language ?? "en"]
	const lines = [
		labels.intro,
		`${labels.status}: ${event.description}`,
		`${labels.location}: ${event.location}`,
		`${labels.time}: ${event.occurredAt}`,
	]
	const extra: string[] = []
	if (options.explanation) {
		extra.push(`${labels.meaning}: ${options.explanation.explanation}`)
		if (options.explanation.nextSteps)
			extra.push(`${labels.nextSteps}: ${options.explanation.nextSteps}`)
	}
	if (options.customs) extra.push(trackingReply("customs", options.language))
	return extra.length ? [...lines, "", ...extra].join("\n") : lines.join("\n")
}

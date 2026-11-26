import { createHash } from "node:crypto"

import type { GoldenAnswerQuality, GoldenSetExport } from "@repo/contracts"

import { MOCK_RECORDS } from "../tracking/connectors/mock/mock.records"
import { qualityLanguages } from "./answer-quality-gate"

type Case = {
	useCase: GoldenAnswerQuality["useCase"]
	questions: [string, string, string, string]
	idealAnswer: string
	behavior?: GoldenAnswerQuality["expectedBehavior"]
	codeSwitched?: boolean
	tool?: GoldenAnswerQuality["expectedTool"]
	source?: string
}

function tracking(
	number: string | null,
	questions: Case["questions"],
	idealAnswer: string,
	outcome = "found",
	codeSwitched = false
): Case {
	const event = number ? MOCK_RECORDS[number] : undefined
	return {
		useCase: "tracking",
		questions,
		idealAnswer,
		codeSwitched,
		behavior: outcome === "found" ? "answer" : outcome === "unavailable" ? "escalate" : "uncertain",
		tool: {
			outcome,
			facts:
				event && event !== "timeout"
					? {
							statusCode: event.code,
							description: event.text,
							location: event.office,
							occurredAt: event.at,
						}
					: {},
		},
	}
}

export const qualityRateFixtures = [
	{
		serviceCode: "qa-parcel",
		serviceName: "QA Parcel",
		zone: "Zone Indigo",
		weightMinG: 1,
		weightMaxG: 1000,
		priceCentavos: 12345,
	},
	{
		serviceCode: "qa-parcel",
		serviceName: "QA Parcel",
		zone: "Zone Indigo",
		weightMinG: 1001,
		weightMaxG: 2000,
		priceCentavos: 23456,
	},
	{
		serviceCode: "qa-parcel",
		serviceName: "QA Parcel",
		zone: "Zone Amber",
		weightMinG: 1,
		weightMaxG: 1000,
		priceCentavos: 14567,
	},
	{
		serviceCode: "qa-letter",
		serviceName: "QA Letter",
		zone: "Zone Amber",
		weightMinG: 1,
		weightMaxG: 250,
		priceCentavos: 6789,
	},
].map(entry => ({ ...entry, effectiveFrom: "2025-01-15" }))

function rate(
	questions: Case["questions"],
	options: { entry?: number; weight?: number; missing?: string; codeSwitched?: boolean }
): Case {
	const row = options.entry === undefined ? undefined : qualityRateFixtures[options.entry]
	const outcome = row ? "quoted" : options.missing ? "missing_details" : "no_rate"
	return {
		useCase: "rates",
		questions,
		codeSwitched: options.codeSwitched,
		idealAnswer: row
			? `From the synthetic test table, quote ${row.serviceName} at PHP ${(row.priceCentavos / 100).toFixed(2)}, effective ${row.effectiveFrom}.`
			: options.missing
				? `Ask the customer for ${options.missing} before quoting a price.`
				: "Say there is no matching published test rate. Do not quote a price.",
		behavior: row ? "answer" : "uncertain",
		tool: {
			outcome,
			facts: row
				? {
						serviceName: row.serviceName,
						zone: row.zone,
						weightG: options.weight ?? 0,
						priceCentavos: row.priceCentavos,
						effectiveFrom: row.effectiveFrom,
					}
				: {},
		},
	}
}

function article(
	useCase: "postal-id" | "service-info",
	questions: Case["questions"],
	fact: string,
	codeSwitched = false
): Case {
	return {
		useCase,
		questions,
		source: `SYNTHETIC EVL-1 QA reference for ${useCase}. ${fact}`,
		idealAnswer: fact,
		codeSwitched,
	}
}

const cases: Case[] = [
	tracking(
		"RR123456789PH",
		[
			"Where is parcel RR123456789PH now?",
			"Nasaan na ang padalang RR123456789PH?",
			"Asa na ang akong padala nga RR123456789PH?",
			"Sadino itan ti impatulodko a RR123456789PH?",
		],
		"Show the official in-transit status, last scan, and what it means."
	),
	tracking(
		"EE987654321PH",
		[
			"Is EE987654321PH already delivered or still on its way to my address?",
			"Naihatid na ba ang EE987654321PH o papunta pa lang sa bahay?",
			"Nahatod na ba ang EE987654321PH o padulong pa sa balay?",
			"Naited kadin ti EE987654321PH wenno mapan pay laeng iti balay?",
		],
		"Show Out for delivery. Do not say it has been delivered."
	),
	tracking(
		"CP111222333PH",
		[
			"Please check whether CP111222333PH was delivered and when.",
			"Pakitingnan kung naihatid na ang CP111222333PH at kung kailan.",
			"Palihog susiha kon nahatod na ang CP111222333PH ug kanus-a.",
			"Pangngaasi a kitaem no naiteden ti CP111222333PH ken kaano.",
		],
		"Show Delivered and the recorded time; do not invent the recipient."
	),
	tracking(
		"CE444555666PH",
		[
			"Tracking shows customs for CE444555666PH, nasa customs pa. Can PHLPost release it?",
			"Nasa customs daw ang CE444555666PH. Maaari bang palabasin ito ng PHLPost?",
			"Naa sa customs ang CE444555666PH. Makapagpagawas ba ang PHLPost niini?",
			"Adda iti customs ti CE444555666PH. Mabalin kadi nga iruar ti PHLPost?",
		],
		"Keep the official customs text. Customs decides the release, and PHLPost cannot promise a date.",
		"found",
		true
	),
	tracking(
		null,
		[
			"How do I check a parcel if I don't have the tracking number?",
			"Paano ko matitingnan ang padala kung wala akong tracking number?",
			"Unsaon nako pagsusi sa padala kon wala koy tracking number?",
			"Kasano a kitaek ti impatulod no awan ti tracking numberko?",
		],
		"Ask for the tracking number and explain where to find it.",
		"no_lookup"
	),
	tracking(
		null,
		[
			"Pakitingnan if this tracking number works. Can you look up my parcel with AB12345678PH?",
			"Pwede bang i-track ang padala gamit ang AB12345678PH?",
			"Mahimo ba nimong i-track ang padala gamit ang AB12345678PH?",
			"Mabalinmo kadi nga i-track ti impatulod agraman ti AB12345678PH?",
		],
		"Explain that the format is invalid and ask the customer to check the number.",
		"no_lookup",
		true
	),
	tracking(
		null,
		[
			"Why can't I find a tracking record for RR555666777PH?",
			"Bakit walang tala para sa tracking number RR555666777PH?",
			"Nganong walay rekord sa tracking number RR555666777PH?",
			"Apay nga awan ti rekord ti tracking number RR555666777PH?",
		],
		"State that no tracking record was found and suggest checking the number.",
		"not_found"
	),
	tracking(
		"RR000000000PH",
		[
			"The tracker seems down, di yata gumagana. Can you check RR000000000PH or connect me with someone?",
			"Mukhang down ang tracker. Pakisuri ang RR000000000PH o ituro sa akin ang taong makakatulong.",
			"Murag down ang tracker. Susiha ang RR000000000PH o itudlo ko sa tawong makatabang.",
			"Kasla down ti tracker. Kitaem ti RR000000000PH wenno itudom ti tao a makatulong.",
		],
		"State that the status cannot be confirmed and offer human assistance.",
		"unavailable",
		true
	),
	rate(
		[
			"What is the postage for a 500 g QA Parcel to Zone Indigo?",
			"Magkano ang 500 g na QA Parcel papuntang Zone Indigo?",
			"Pila ang 500 g nga QA Parcel paingon sa Zone Indigo?",
			"Mano ti bayad ti 500 g a QA Parcel a mapan iti Zone Indigo?",
		],
		{ entry: 0, weight: 500 }
	),
	rate(
		[
			"What does a QA Parcel weighing exactly 1 kg cost to Zone Indigo?",
			"Magkano ang eksaktong 1 kg na QA Parcel papuntang Zone Indigo?",
			"Pila ang QA Parcel nga eksaktong 1 kg paingon sa Zone Indigo?",
			"Mano ti eksakto a 1 kg a QA Parcel a mapan iti Zone Indigo?",
		],
		{ entry: 0, weight: 1000 }
	),
	rate(
		[
			"Magkano po for a QA Parcel? Please give the rate for 1001 g to Zone Indigo.",
			"Ano ang rate ng QA Parcel na 1001 g papuntang Zone Indigo?",
			"Unsa ang rate sa QA Parcel nga 1001 g paingon sa Zone Indigo?",
			"Ania ti rate ti QA Parcel a 1001 g a mapan iti Zone Indigo?",
		],
		{ entry: 1, weight: 1001, codeSwitched: true }
	),
	rate(
		[
			"How much is a 750 g QA Parcel to Zone Amber?",
			"Magkano ang 750 g na QA Parcel papuntang Zone Amber?",
			"Pila ang 750 g nga QA Parcel paingon sa Zone Amber?",
			"Mano ti 750 g a QA Parcel a mapan iti Zone Amber?",
		],
		{ entry: 2, weight: 750 }
	),
	rate(
		[
			"Quote a 200 g QA Letter to Zone Amber and include the effective date, kailan po nagsimula?",
			"Magbigay ng rate ng 200 g na QA Letter sa Zone Amber at petsa kung kailan ito nagsimula.",
			"Ihatag ang rate sa 200 g nga QA Letter ngadto sa Zone Amber ug ang petsa sa pagsugod.",
			"Ibagam ti rate ti 200 g a QA Letter iti Zone Amber ken ti petsa ti panagrugi.",
		],
		{ entry: 3, weight: 200, codeSwitched: true }
	),
	rate(
		[
			"How much for a QA Parcel to Zone Indigo if I don't have the weight yet?",
			"Magkano ang QA Parcel sa Zone Indigo kung hindi ko pa alam ang bigat?",
			"Pila ang QA Parcel sa Zone Indigo kon wala pa ko kahibalo sa gibug-aton?",
			"Mano ti QA Parcel iti Zone Indigo no diak pay ammo ti dagsenna?",
		],
		{ missing: "weight" }
	),
	rate(
		[
			"How much to send a QA Letter weighing 100 g? I haven't picked the destination.",
			"Magkano ang 100 g na QA Letter? Hindi ko pa napipili ang destinasyon.",
			"Pila ang 100 g nga QA Letter? Wala pa koy napili nga destinasyon.",
			"Mano ti 100 g a QA Letter? Awan pay ti napilik a papanan.",
		],
		{ missing: "destination" }
	),
	rate(
		[
			"Is there a price for a 3 kg QA Parcel to Zone Indigo?",
			"May presyo ba ang 3 kg na QA Parcel papuntang Zone Indigo?",
			"Aduna bay presyo ang 3 kg nga QA Parcel paingon sa Zone Indigo?",
			"Adda kadi bayad ti 3 kg a QA Parcel a mapan iti Zone Indigo?",
		],
		{}
	),
	article(
		"postal-id",
		[
			"Can I apply for a test Postal ID at the Orchid desk as a walk-in, o kailangan ng appointment?",
			"Puwede bang mag-walk-in para sa test Postal ID sa Orchid desk?",
			"Mahimo bang walk-in sa Orchid desk alang sa test Postal ID?",
			"Mabalin kadi ti walk-in iti Orchid desk para iti test Postal ID?",
		],
		"At the fictional Orchid desk, first-time test Postal ID applications require a booked appointment.",
		true
	),
	article(
		"postal-id",
		[
			"Which proof of address does the test Postal ID desk accept?",
			"Anong katibayan ng tirahan ang tinatanggap para sa test Postal ID?",
			"Unsa nga pamatuod sa pinuy-anan ang dawaton alang sa test Postal ID?",
			"Ania a pammaneknek ti pagtaengan ti awaten para iti test Postal ID?",
		],
		"The fictional test Postal ID desk accepts the Violet residence certificate as address proof."
	),
	article(
		"postal-id",
		[
			"Can my cousin collect my test Postal ID for me?",
			"Puwede bang kunin ng pinsan ko ang test Postal ID ko?",
			"Mahimo bang kuhaon sa akong ig-agaw ang test Postal ID nako?",
			"Mabalin kadi nga alaen ti kasinsinko ti test Postal ID ko?",
		],
		"Only the named applicant can collect a fictional test Postal ID at the pickup counter."
	),
	article(
		"postal-id",
		[
			"May maling letra in my test Postal ID application. How do I correct it before printing?",
			"Paano ko itatama ang maling letra sa test Postal ID bago ito i-print?",
			"Unsaon nako pagtul-id sa sayop nga letra sa test Postal ID sa dili pa ma-print?",
			"Kasano a korektarek ti biddut a letra iti test Postal ID sakbay a ma-print?",
		],
		"Before printing, take the fictional test Postal ID receipt to the Orchid correction desk.",
		true
	),
	article(
		"postal-id",
		[
			"Where do I ask about replacing a missing test Postal ID?",
			"Saan ako magtatanong tungkol sa kapalit ng nawawalang test Postal ID?",
			"Asa ko mangutana bahin sa kapuli sa nawala nga test Postal ID?",
			"Sadinoak a mangsaludsod maipanggep iti kasukat ti napukaw a test Postal ID?",
		],
		"Ask the fictional Cedar counter about replacing a missing test Postal ID."
	),
	article(
		"postal-id",
		[
			"What name appears on the test Postal ID when my record has a suffix?",
			"Anong pangalan ang malalagay sa test Postal ID kung may hulaping gaya ng Jr. sa tala ko?",
			"Unsang ngalan ang makita sa test Postal ID kon adunay sumpay ang akong ngalan sa rekord?",
			"Ania a nagan ti maipakita iti test Postal ID no adda suplay ti naganko iti rekord?",
		],
		"The fictional test Postal ID prints the spelling and suffix from the verified identity record."
	),
	{
		useCase: "postal-id",
		questions: [
			"Can anyone confirm my test Postal ID will arrive by Friday?",
			"May makatitiyak ba na darating ang test Postal ID ko sa Biyernes?",
			"Aduna bay makakumpirma nga moabot ang test Postal ID nako sa Biyernes?",
			"Adda kadi makapasingked a dumteng ti test Postal ID ko inton Biernes?",
		],
		idealAnswer:
			"Say that the specific arrival date cannot be verified and offer to speak with a person.",
		behavior: "escalate",
	},
	article(
		"service-info",
		[
			"When does the fictional Indigo desk stop accepting mail on Saturday?",
			"Anong oras nagsasara ang pagtanggap ng sulat sa Indigo desk tuwing Sabado?",
			"Unsang orasa moundang pagdawat og sulat ang Indigo desk sa Sabado?",
			"Ania nga oras a sumardeng ti Indigo desk nga umawat iti surat no Sabado?",
		],
		"The fictional Indigo test desk accepts mail until 11 a.m. on Saturday."
	),
	article(
		"service-info",
		[
			"Does the Cedar test branch take card payments at the packing counter, o cash lang?",
			"Tumatanggap ba ng card payment ang packing counter sa Cedar test branch?",
			"Modawat ba og card payment ang packing counter sa Cedar test branch?",
			"Umawat kadi iti card payment ti packing counter iti Cedar test branch?",
		],
		"The packing counter at the fictional Cedar test branch accepts cash only.",
		true
	),
	article(
		"service-info",
		[
			"Do I need to show the pickup slip for a parcel at the Violet test locker?",
			"Kailangan ko bang ipakita ang pickup slip para sa padala sa Violet test locker?",
			"Kinahanglan ba nakong ipakita ang pickup slip sa padala sa Violet test locker?",
			"Masapul kadi nga ipakitak ti pickup slip ti pakete iti Violet test locker?",
		],
		"Bring the test pickup slip to claim a parcel from the fictional Violet locker."
	),
	article(
		"service-info",
		[
			"Which counter checks the packaging of fragile items at the test branch?",
			"Saang counter sinusuri ang balot ng babasaging gamit sa test branch?",
			"Unsang counter ang mosusi sa putos sa mabuak nga butang sa test branch?",
			"Ania a counter ti mangsukimat iti bungon ti nalaka a maburak iti test branch?",
		],
		"The fictional Amber test counter checks the packaging of fragile items."
	),
	article(
		"service-info",
		[
			"Can I update the return address at the Orchid test desk if naihulog ko na ang sulat?",
			"Maaari ko bang baguhin ang return address matapos ihulog ang sulat sa Orchid test desk?",
			"Mahimo ba nakong usbon ang return address human ihulog ang sulat sa Orchid test desk?",
			"Mabalin ko kadi a baliwan ti return address kalpasan nga intedko ti surat iti Orchid test desk?",
		],
		"For the fictional Orchid service, return addresses can only be changed before acceptance.",
		true
	),
	article(
		"service-info",
		[
			"Does the Cedar test branch have a step-free entrance?",
			"May pasukan bang walang hagdan sa Cedar test branch?",
			"Aduna bay agianan nga walay hagdan sa Cedar test branch?",
			"Adda kadi pagserkan nga awan iti agdan iti Cedar test branch?",
		],
		"Use the fictional Cedar test branch side entrance for step-free access."
	),
	{
		useCase: "service-info",
		questions: [
			"Will the fictional Juniper desk open on the next public holiday?",
			"Bukas ba ang Juniper test desk sa susunod na pampublikong pista opisyal?",
			"Abli ba ang Juniper test desk sa sunod nga opisyal nga holiday?",
			"Lukat kadi ti Juniper test desk iti sumaruno a publiko a piesta opisial?",
		],
		idealAnswer:
			"Acknowledge that no approved opening hours are available for the Juniper test desk on that day.",
		behavior: "uncertain",
	},
]

export const qualitySourceFixtures = cases.flatMap((entry, index) =>
	entry.source
		? [
				{
					index,
					useCase: entry.useCase,
					content: entry.source,
					contentHash: createHash("sha256").update(entry.source).digest("hex"),
				},
			]
		: []
)

export function draftQualitySet(): GoldenSetExport {
	return {
		version: 1,
		items: qualityLanguages.flatMap((language, localeIndex) =>
			cases.map((entry, index) => ({
				question: entry.questions[localeIndex as 0 | 1 | 2 | 3],
				idealAnswer: entry.idealAnswer,
				expectedChunkHashes: qualitySourceFixtures
					.filter(source => source.index === index)
					.map(source => source.contentHash),
				tags: ["evl1-draft", "synthetic-review-candidate"],
				status: "active",
				answerQuality: {
					language,
					useCase: entry.useCase,
					codeSwitched: entry.codeSwitched ?? false,
					expectedBehavior: entry.behavior ?? "answer",
					...(entry.tool && { expectedTool: entry.tool }),
				},
			}))
		),
	}
}

export function qualityFixtureItems() {
	return draftQualitySet().items.map((item, index) => ({
		...item,
		id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
		answerQuality: item.answerQuality ?? null,
		approvalReference: "LOCAL SIMULATION ONLY / evl1-fixtures-v1",
		externalApprover: null,
		approvedAt: null,
	}))
}

import type { CustomerLanguage } from "@repo/contracts"

export const LANGUAGE_LABELS: Record<CustomerLanguage, string> = {
	en: "English",
	fil: "Filipino",
	ceb: "Cebuano",
	ilo: "Ilocano",
}

/** Handoff reasons are sent in English so agents see one wording; only the label is translated. */
export const HANDOFF_REASONS = [
	"I want to speak with a person",
	"I still need help",
	"The answer did not solve my question",
] as const

export type HandoffReason = (typeof HANDOFF_REASONS)[number]

export interface AssistantCopy {
	aiNotice: string
	privacyNotice: string
	language: string
	beforeStartTitle: string
	beforeStartBody: string
	privacyPrefix: string
	privacyLink: string
	accept: string
	conversation: string
	emptyPrompt: string
	youSaid: string
	assistantSaid: string
	agentLabel: string
	sources: string
	handoffQueued: string
	handoffJoined: string
	handoffResolved: string
	handoffOffline: string
	contactLabel: string
	saveContact: string
	skipContact: string
	contactSaved: string
	contactFailed: string
	needPerson: string
	handoffReasons: Record<HandoffReason, string>
	confirmHandoff: string
	requestingHandoff: string
	tooQuick: (seconds: number) => string
	questionLabel: string
	questionPlaceholder: string
	scamEntry: string
	scamPlaceholder: string
	scamSubmitted: string
	scamAsk: string
	ask: string
	asking: string
	unavailable: string
	handoffFailed: string
	languageFailed: string
}

export const ASSISTANT_COPY: Record<CustomerLanguage, AssistantCopy> = {
	en: {
		aiNotice: "You are chatting with an AI assistant, not a person.",
		privacyNotice: "Privacy notice",
		language: "Language",
		beforeStartTitle: "Before you start",
		beforeStartBody:
			"This chat is answered by an AI assistant. It replies using information PHLPost has approved, and it can make mistakes. Do not share passwords or payment details.",
		privacyPrefix: "Read how your chat is handled in the ",
		privacyLink: "privacy notice",
		accept: "I understand, start chat",
		conversation: "Conversation",
		emptyPrompt: "Ask a question about PHLPost services.",
		youSaid: "You said: ",
		assistantSaid: "Assistant said: ",
		agentLabel: "PHLPost agent",
		sources: "From these PHLPost articles:",
		handoffQueued: "Your request is in the queue. A PHLPost agent will join when available.",
		handoffJoined: "A PHLPost agent has joined. You can continue the conversation here.",
		handoffResolved: "This conversation has been resolved by a PHLPost agent.",
		handoffOffline:
			"Our agents are offline. You may leave an email address or phone number for follow-up.",
		contactLabel: "Email address or phone number (optional)",
		saveContact: "Leave contact",
		skipContact: "Continue without leaving contact",
		contactSaved: "Thank you. Your request has been recorded.",
		contactFailed: "We couldn't save that. Please try again.",
		needPerson: "Need a person?",
		handoffReasons: {
			"I want to speak with a person": "I want to speak with a person",
			"I still need help": "I still need help",
			"The answer did not solve my question": "The answer did not solve my question",
		},
		confirmHandoff: "Confirm human handoff",
		requestingHandoff: "Requesting…",
		tooQuick: seconds =>
			`You're sending messages too quickly. Please wait ${seconds} second${seconds === 1 ? "" : "s"} before sending another.`,
		questionLabel: "Your question",
		questionPlaceholder: "How do I send Express Mail?",
		scamEntry: "Check a suspicious message",
		scamPlaceholder: "Paste the message, email, or link",
		scamSubmitted: "Suspicious message submitted",
		scamAsk: "Check message",
		ask: "Ask",
		asking: "Asking…",
		unavailable: "The assistant is unavailable. Please try again.",
		handoffFailed: "We couldn't request an agent. Please try again.",
		languageFailed: "We couldn't change the language. Please try again.",
	},
	fil: {
		aiNotice: "Nakikipag-chat ka sa isang AI assistant, hindi sa isang tao.",
		privacyNotice: "Paunawa sa privacy",
		language: "Wika",
		beforeStartTitle: "Bago ka magsimula",
		beforeStartBody:
			"Ang chat na ito ay sinasagot ng isang AI assistant gamit ang impormasyong inaprubahan ng PHLPost, at maaari itong magkamali. Huwag ibahagi ang iyong password o mga detalye ng bayad.",
		privacyPrefix: "Basahin kung paano pinangangasiwaan ang iyong chat sa ",
		privacyLink: "paunawa sa privacy",
		accept: "Nauunawaan ko, simulan ang chat",
		conversation: "Usapan",
		emptyPrompt: "Magtanong tungkol sa mga serbisyo ng PHLPost.",
		youSaid: "Sinabi mo: ",
		assistantSaid: "Sinabi ng assistant: ",
		agentLabel: "PHLPost agent",
		sources: "Mula sa mga artikulong ito ng PHLPost:",
		handoffQueued:
			"Nasa pila na ang iyong kahilingan. Sasali ang isang PHLPost agent kapag may available na.",
		handoffJoined:
			"Sumali na ang isang PHLPost agent. Maaari kang magpatuloy sa pakikipag-usap dito.",
		handoffResolved: "Nalutas na ng isang PHLPost agent ang usapang ito.",
		handoffOffline:
			"Walang agent na naka-duty ngayon. Maaari kang mag-iwan ng email o numero ng telepono para matawagan.",
		contactLabel: "Email o numero ng telepono (opsyonal)",
		saveContact: "Mag-iwan ng contact",
		skipContact: "Magpatuloy nang walang contact",
		contactSaved: "Salamat. Naitala na ang iyong kahilingan.",
		contactFailed: "Hindi namin ito na-save. Pakisubukan ulit.",
		needPerson: "Kailangan mo ba ng makakausap na tao?",
		handoffReasons: {
			"I want to speak with a person": "Gusto kong makausap ang isang tao",
			"I still need help": "Kailangan ko pa rin ng tulong",
			"The answer did not solve my question": "Hindi nasagot ang tanong ko",
		},
		confirmHandoff: "Kumpirmahin ang paglipat sa tao",
		requestingHandoff: "Hinihiling…",
		tooQuick: seconds =>
			`Masyadong mabilis ang pagpapadala mo ng mensahe. Maghintay ng ${seconds} segundo bago magpadala ulit.`,
		questionLabel: "Ang iyong tanong",
		questionPlaceholder: "Paano magpadala ng Express Mail?",
		scamEntry: "Suriin ang kahina-hinalang mensahe",
		scamPlaceholder: "I-paste ang mensahe, email, o link",
		scamSubmitted: "Naipadala ang kahina-hinalang mensahe",
		scamAsk: "Suriin",
		ask: "Itanong",
		asking: "Nagtatanong…",
		unavailable: "Hindi available ang assistant ngayon. Pakisubukan ulit.",
		handoffFailed: "Hindi kami makahiling ng agent. Pakisubukan ulit.",
		languageFailed: "Hindi mapalitan ang wika. Pakisubukan ulit.",
	},
	ceb: {
		aiNotice: "Nakig-chat ka sa usa ka AI assistant, dili sa usa ka tawo.",
		privacyNotice: "Pahibalo sa privacy",
		language: "Pinulongan",
		beforeStartTitle: "Sa dili pa ka magsugod",
		beforeStartBody:
			"Kini nga chat gitubag sa usa ka AI assistant gamit ang impormasyon nga giaprobahan sa PHLPost, ug mahimo kini masayop. Ayaw ipaambit ang imong password o mga detalye sa bayad.",
		privacyPrefix: "Basaha kon giunsa pagdumala ang imong chat sa ",
		privacyLink: "pahibalo sa privacy",
		accept: "Nakasabot ko, sugdi ang chat",
		conversation: "Panag-istorya",
		emptyPrompt: "Pangutana bahin sa mga serbisyo sa PHLPost.",
		youSaid: "Ingon nimo: ",
		assistantSaid: "Ingon sa assistant: ",
		agentLabel: "PHLPost agent",
		sources: "Gikan niining mga artikulo sa PHLPost:",
		handoffQueued:
			"Naa na sa linya ang imong hangyo. Moapil ang usa ka PHLPost agent kon naa nay bakante.",
		handoffJoined: "Miapil na ang usa ka PHLPost agent. Mahimo kang mopadayon sa pag-chat dinhi.",
		handoffResolved: "Nasulbad na sa usa ka PHLPost agent kining panag-istoryaha.",
		handoffOffline:
			"Walay agent nga naka-duty karon. Mahimo kang magbilin og email o numero sa telepono aron makontak ka.",
		contactLabel: "Email o numero sa telepono (opsyonal)",
		saveContact: "Ibilin ang contact",
		skipContact: "Padayon nga walay ibiling contact",
		contactSaved: "Salamat. Natala na ang imong hangyo.",
		contactFailed: "Wala namo kini ma-save. Sulayi pag-usab.",
		needPerson: "Gusto ka bang makig-istorya sa usa ka tawo?",
		handoffReasons: {
			"I want to speak with a person": "Gusto kong makig-istorya sa usa ka tawo",
			"I still need help": "Nagkinahanglan pa ko og tabang",
			"The answer did not solve my question": "Wala matubag ang akong pangutana",
		},
		confirmHandoff: "Kumpirmaha ang pagbalhin sa tawo",
		requestingHandoff: "Naghangyo…",
		tooQuick: seconds =>
			`Paspas kaayo ang imong pagpadala og mensahe. Palihug paghulat og ${seconds} ka segundo sa dili pa magpadala pag-usab.`,
		questionLabel: "Imong pangutana",
		questionPlaceholder: "Unsaon pagpadala og Express Mail?",
		scamEntry: "Susihon ang kadudahang mensahe",
		scamPlaceholder: "I-paste ang mensahe, email, o link",
		scamSubmitted: "Gipadala ang kadudahang mensahe",
		scamAsk: "Susihon",
		ask: "Pangutana",
		asking: "Nangutana…",
		unavailable: "Dili magamit ang assistant karon. Palihug sulayi pag-usab.",
		handoffFailed: "Dili kami makahangyo og agent. Palihug sulayi pag-usab.",
		languageFailed: "Dili mausab ang pinulongan. Palihug sulayi pag-usab.",
	},
	ilo: {
		aiNotice: "Makisarsaritaka iti maysa nga AI assistant, saan a tao.",
		privacyNotice: "Pakdaar maipapan iti privacy",
		language: "Pagsasao",
		beforeStartTitle: "Sakbay a mangrugika",
		beforeStartBody:
			"Daytoy a chat ket sungbatan ti maysa nga AI assistant babaen ti impormasion nga inaprobaran ti PHLPost, ket mabalin nga agbiddut. Saanmo nga ibinglay ti password wenno detalye ti bayadmo.",
		privacyPrefix: "Basaem no kasano a maaywanan ti chat-mo iti ",
		privacyLink: "pakdaar maipapan iti privacy",
		accept: "Maawatak, rugian ti chat",
		conversation: "Saritaan",
		emptyPrompt: "Agdamag maipapan kadagiti serbisio ti PHLPost.",
		youSaid: "Kinunam: ",
		assistantSaid: "Kinuna ti assistant: ",
		agentLabel: "Agent ti PHLPost",
		sources: "Manipud kadagitoy nga artikulo ti PHLPost:",
		handoffQueued:
			"Adda iti pila ti kiddawmo. Sumangpet ti maysa nga agent ti PHLPost no adda makaasikaso.",
		handoffJoined: "Immayen ti maysa nga agent ti PHLPost. Mabalinmo nga ituloy ti saritaan ditoy.",
		handoffResolved: "Nalusawen ti daytoy a saritaan babaen ti maysa nga agent ti PHLPost.",
		handoffOffline:
			"Awan ti agent nga agserbi ita. Mabalinmo ti mangibati iti email wenno numero ti telepono tapno tawagan ka.",
		contactLabel: "Email wenno numero ti telepono (opsional)",
		saveContact: "Mangibati iti contact",
		skipContact: "Ituloy a saan nga agibati iti contact",
		contactSaved: "Agyaman kami. Nairehistro ti kiddawmo.",
		contactFailed: "Saanmi a naidulin dayta. Padasem manen.",
		needPerson: "Masapulmo kadi ti tao a makasarita?",
		handoffReasons: {
			"I want to speak with a person": "Kayatko ti makisarita iti tao",
			"I still need help": "Masapulko pay laeng ti tulong",
			"The answer did not solve my question": "Saan a nasungbatan ti saludsodko",
		},
		confirmHandoff: "Kumpirmaren ti panagbalhin iti tao",
		requestingHandoff: "Agkidkiddaw…",
		tooQuick: seconds =>
			`Napardas unay ti panangipatulodmo kadagiti mensahe. Agurayka iti ${seconds} a segundo sakbay nga agipatulodka manen.`,
		questionLabel: "Ti saludsodmo",
		scamEntry: "Sukimatem ti makapagduda a mensahe",
		scamPlaceholder: "Ipasta ti mensahe, email, wenno link",
		scamSubmitted: "Naipatulod ti makapagduda a mensahe",
		scamAsk: "Sukimaten",
		questionPlaceholder: "Kasano ti agipatulod iti Express Mail?",
		ask: "Agdamag",
		asking: "Agdamdamag…",
		unavailable: "Saan a mausar ti assistant ita. Padasem manen.",
		handoffFailed: "Saankami a makakiddaw iti agent. Padasem manen.",
		languageFailed: "Saan a masukatan ti pagsasao. Padasem manen.",
	},
}

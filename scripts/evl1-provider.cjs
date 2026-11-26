const { createServer } = require("node:http")
const { draftQualitySet } = require("../apps/backend/dist/modules/v1/eval/answer-quality-fixtures")
const questions = draftQualitySet().items
const embedding = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0))
const uncertain = {
	en: "I could not verify that information. Please ask to speak with a person.",
	fil: "Wala akong sapat na impormasyon. Maaari kang humiling na makipag-usap sa isang tao.",
	ceb: "Wala koy kasaligan nga impormasyon. Mahimo kang makigsulti sa usa ka tawo.",
	ilo: "Awan ti umdas a mapagtalkan nga impormasion. Mabalinmo ti makisarita iti tao.",
}

createServer(async (request, response) => {
	const parts = []
	for await (const part of request) parts.push(part)
	if (request.method !== "POST") return response.writeHead(404).end()
	try {
		const payload = JSON.parse(Buffer.concat(parts).toString())
		let result
		if (request.url === "/v1/embeddings") {
			result = {
				data: [].concat(payload.input).map((_, index) => ({ embedding, index })),
				usage: { prompt_tokens: 1, total_tokens: 1 },
			}
		} else if (request.url === "/v1/chat/completions") {
			const requestText = payload.messages.map(message => message.content).join("\n")
			const system = String(payload.messages[0]?.content)
			const last = String(payload.messages.at(-1)?.content)
			const item = questions.find(question => requestText.includes(question.question))
			let content
			if (system.includes("Evaluate a customer-service reply")) {
				const input = JSON.parse(last)
				content = JSON.stringify({
					grounded: Boolean(input.actual.tool) || !input.expected.hashes.length,
					behaviorCorrect: input.actual.behavior === input.expected.expectedBehavior,
					actualLanguage:
						input.actual.tool && input.expected.useCase === "rates"
							? "en"
							: input.expected.language,
					reason: "Offline provider fixture for integration checks",
				})
			} else if (system.includes("weight_g")) {
				const grams = last.match(/(\d+)\s*(kg|g)\b/i)
				content = JSON.stringify({
					service: last.includes("QA Letter") ? "qa-letter" : "qa-parcel",
					zone: /Zone (Indigo|Amber)/i.exec(last)?.[0] ?? null,
					weight_g: grams ? Number(grams[1]) * (grams[2].toLowerCase() === "kg" ? 1000 : 1) : null,
				})
			} else if (system.includes("category") && system.includes("language")) {
				content = JSON.stringify({
					category: item?.answerQuality?.useCase ?? "other",
					language: item?.answerQuality?.language ?? "en",
				})
			} else {
				content = uncertain[item?.answerQuality?.language] ?? uncertain.en
			}
			result = {
				choices: [{ message: { content }, finish_reason: "stop" }],
				usage: { prompt_tokens: 35, completion_tokens: 20, total_tokens: 55 },
			}
		} else return response.writeHead(404).end()
		response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result))
	} catch {
		response.writeHead(400).end()
	}
}).listen(8330, "127.0.0.1", () => console.log("EVL-1 offline test provider listening on 8330"))

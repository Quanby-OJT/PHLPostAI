import { resolveScamAssessment } from "./scam-checks"
import { SCAM_INDICATORS } from "./scam-copy"

const active = new Map<string, number>(SCAM_INDICATORS.map(code => [code, 1]))

describe("SCM-1 assessment validation", () => {
	it.each([
		null,
		{ riskLevel: "low", indicators: [], confidence: 0.99 },
		{ riskLevel: "uncertain", indicators: [], confidence: 0 },
		{ riskLevel: "safe", indicators: ["undeclared_flag"], confidence: 1 },
	])("preserves mandatory high risk for a fee and an unofficial domain", output => {
		expect(resolveScamAssessment(["payment_request", "unofficial_domain"], active, output)).toEqual(
			{
				riskLevel: "high",
				indicators: ["payment_request", "unofficial_domain"],
				confidence: 1,
			}
		)
	})

	it.each([
		{ riskLevel: "high", indicators: ["undeclared_flag"], confidence: 1 },
		{ riskLevel: "medium", indicators: ["urgency", "unofficial_domain"], confidence: 0.8 },
		{ riskLevel: "medium", indicators: ["urgency"], confidence: 1.1 },
		{ riskLevel: "high", indicators: [], confidence: 0.99, answer: "Untrusted text" },
		{ riskLevel: "high", indicators: [], confidence: 0.99 },
	])("returns uncertain when no supported evidence is validated", output => {
		expect(resolveScamAssessment([], active, output)).toEqual({
			riskLevel: "uncertain",
			indicators: [],
			confidence: 0,
		})
	})

	it("accepts configured semantic indicators and rejects inactive ones", () => {
		const model = { riskLevel: "medium", indicators: ["urgency"], confidence: 0.8 }
		expect(resolveScamAssessment([], active, model)).toEqual(model)
		expect(resolveScamAssessment([], new Map(), model).riskLevel).toBe("uncertain")
	})

	it("keeps injection evidence when the model is absent", () => {
		expect(resolveScamAssessment(["prompt_injection"], active, null)).toEqual({
			riskLevel: "medium",
			indicators: ["prompt_injection"],
			confidence: 0.5,
		})
	})

	it("uses the current weight and active state for both deterministic and approved model evidence", () => {
		const model = { riskLevel: "medium", indicators: ["gift_card_request"], confidence: 0.8 }
		const lowWeights = new Map([
			["payment_request", 1],
			["gift_card_request", 1],
		])
		const newWeights = new Map([
			["payment_request", 1],
			["gift_card_request", 4],
		])
		expect(resolveScamAssessment(["payment_request"], lowWeights, model).riskLevel).toBe("medium")
		expect(resolveScamAssessment(["payment_request"], newWeights, model)).toMatchObject({
			riskLevel: "high",
			indicators: ["payment_request", "gift_card_request"],
		})
		expect(resolveScamAssessment(["payment_request"], new Map(), model).riskLevel).toBe("uncertain")
	})

	it("scores an approved custom finding even when the model is uncertain about overall risk", () => {
		const code = "qa_gift_card"
		const model = { riskLevel: "uncertain", indicators: [code], confidence: 0.8 }
		const weights = new Map([[code, 1]])
		expect(resolveScamAssessment([], weights, model)).toEqual({
			riskLevel: "medium",
			indicators: [code],
			confidence: 0.8,
		})
		expect(resolveScamAssessment([], new Map([[code, 4]]), model).riskLevel).toBe("high")
		expect(resolveScamAssessment([], new Map(), model).indicators).toEqual([])
		expect(resolveScamAssessment([], weights, { ...model, confidence: 0 }).riskLevel).toBe(
			"uncertain"
		)
	})

	it("requires locally verified evidence for look-alikes and unapproved contacts", () => {
		const model = {
			riskLevel: "high",
			indicators: ["lookalike_domain", "unofficial_sender"],
			confidence: 1,
		}
		expect(resolveScamAssessment([], active, model).riskLevel).toBe("uncertain")
		expect(resolveScamAssessment(["lookalike_domain"], active, null).indicators).toEqual([
			"lookalike_domain",
		])
	})
})

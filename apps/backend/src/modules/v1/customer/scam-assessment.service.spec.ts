import { resolveScamAssessment } from "./scam-checks"
import { SCAM_INDICATORS } from "./scam-copy"

const active = new Set<string>(SCAM_INDICATORS)

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
		expect(resolveScamAssessment([], new Set(), model).riskLevel).toBe("uncertain")
	})

	it("keeps injection evidence when the model is absent", () => {
		expect(resolveScamAssessment(["prompt_injection"], active, null)).toEqual({
			riskLevel: "medium",
			indicators: ["prompt_injection"],
			confidence: 0.5,
		})
	})
})

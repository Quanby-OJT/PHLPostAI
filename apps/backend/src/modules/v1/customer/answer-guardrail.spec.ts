import { validateCustomerAnswer } from "./answer-guardrail"
import { MUST_BLOCK, MUST_PASS } from "./answer-guardrail.cases"

describe("CNV-5 guardrail evaluation set", () => {
	it.each(MUST_BLOCK.map(item => [item.label, item] as const))("blocks %s", (_label, item) => {
		expect(validateCustomerAnswer(item.answer, item.evidence, item.blockedTopics)).toEqual({
			blocked: true,
			reason: item.reason,
		})
	})

	it.each(MUST_PASS.map(item => [item.label, item] as const))("delivers %s", (_label, item) => {
		expect(validateCustomerAnswer(item.answer, item.evidence, item.blockedTopics)).toEqual({
			blocked: false,
			reason: null,
		})
	})
})

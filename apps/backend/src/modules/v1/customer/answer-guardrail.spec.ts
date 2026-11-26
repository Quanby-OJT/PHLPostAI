import { validateCustomerAnswer } from "./answer-guardrail"

describe("CNV-5 answer guardrail", () => {
	it.each([
		["an unsupported amount", "The fee is ₱500.", [], "unsupported_amount"],
		[
			"an unsupported amount without a currency marker",
			"The posted amount due is 500.",
			[],
			"unsupported_amount",
		],
		["an unsupported tracking status", "Your parcel is delivered.", [], "unsupported_status"],
		["a payment request", "Please pay ₱320 now.", ["₱320"], "payment_or_credential_request"],
		["a password request", "Please share your password.", [], "payment_or_credential_request"],
		["a one-time code request", "Enter your one-time code.", [], "payment_or_credential_request"],
		["a sent OTP request", "Send me the one-time code.", [], "payment_or_credential_request"],
		["a card number request", "Provide your card number.", [], "payment_or_credential_request"],
		[
			"a payment link",
			"Use this payment link to complete checkout.",
			[],
			"payment_or_credential_request",
		],
		[
			"a configured blocked topic",
			"For customs clearance, contact the office.",
			[],
			"blocked_topic",
		],
	] as const)("blocks %s", (_label, answer, evidence, reason) => {
		const topics = reason === "blocked_topic" ? ["customs clearance"] : []
		expect(validateCustomerAnswer(answer, evidence, topics)).toEqual({ blocked: true, reason })
	})

	it("allows a supported amount and status", () => {
		expect(
			validateCustomerAnswer("The fee is ₱320 and the item is in transit.", [
				"Fee: ₱320. Status: In transit.",
			])
		).toEqual({ blocked: false, reason: null })
	})
})

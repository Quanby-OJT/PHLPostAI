import { routeForCategory } from "./inquiry-routing"
import {
	INDIVIDUAL_CASE_NOTICES,
	PERSONAL_DETAILS_REMINDERS,
	postalIdIntent,
	sharedPersonalDetails,
	withPostalIdNotices,
} from "./postal-id-guidance"
import { POSTAL_ID_QUESTIONS } from "./postal-id-guidance.cases"

describe("CNV-6 Postal ID evaluation set", () => {
	it.each(POSTAL_ID_QUESTIONS.map(item => [item.question, item.intent] as const))(
		"%s → %s",
		(question, intent) => {
			expect(postalIdIntent(question)).toBe(intent)
		}
	)
})

describe("CNV-6 Postal ID routing", () => {
	it("gives a status question the fixed no-records route", () => {
		expect(routeForCategory("postal-id", "status")).toBe("postal-id-status")
	})

	it.each(["eligibility", "guidance"] as const)("answers a %s question from articles", intent => {
		expect(routeForCategory("postal-id", intent)).toBe("retrieval")
	})

	it("leaves other categories alone", () => {
		expect(routeForCategory("tracking", "status")).toBe("tracking")
		expect(routeForCategory("service-info")).toBe("retrieval")
	})
})

describe("CNV-6 Postal ID notices", () => {
	it("adds the can't-decide notice to an eligibility answer", () => {
		expect(
			withPostalIdNotices("Bring one valid ID [1].", {
				intent: "eligibility",
				maskedQuery: "am I eligible?",
				language: "en",
			})
		).toBe(`Bring one valid ID [1].\n\n${INDIVIDUAL_CASE_NOTICES.en}`)
	})

	it("reminds the customer when personal details were masked", () => {
		expect(
			withPostalIdNotices("Bring one valid ID [1].", {
				intent: "guidance",
				maskedQuery: "My Postal ID number is [ID_NUMBER]",
				language: "fil",
			})
		).toBe(`Bring one valid ID [1].\n\n${PERSONAL_DETAILS_REMINDERS.fil}`)
	})

	it("adds both in order", () => {
		const answer = withPostalIdNotices("A.", {
			intent: "eligibility",
			maskedQuery: "email [EMAIL]",
			language: "ceb",
		})
		expect(answer).toBe(
			`A.\n\n${INDIVIDUAL_CASE_NOTICES.ceb}\n\n${PERSONAL_DETAILS_REMINDERS.ceb}`
		)
	})

	it("leaves an ordinary answer unchanged", () => {
		expect(
			withPostalIdNotices("A.", { intent: "guidance", maskedQuery: "how?", language: "en" })
		).toBe("A.")
	})

	it.each(["[EMAIL]", "[PHONE]", "[PH_ID]", "[PH_TIN]", "[PH_SSS]", "[ID_NUMBER]"])(
		"treats %s as personal",
		placeholder => {
			expect(sharedPersonalDetails(`x ${placeholder}`)).toBe(true)
		}
	)

	it("does not treat a tracking number as personal", () => {
		expect(sharedPersonalDetails("where is [TRACKING_NUMBER]")).toBe(false)
	})
})

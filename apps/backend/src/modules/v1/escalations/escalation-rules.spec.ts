import type { EscalationSettings } from "@repo/contracts"

import { isWithinBusinessHours, matchesEscalationRule } from "./escalation-rules"

describe("ESC-3 escalation rules", () => {
	const settings: EscalationSettings = {
		rules: { topics: [], keywords: [], categories: [], repeatedLowConfidenceCount: 2 },
		businessHours: {
			timezone: "Asia/Manila",
			days: [
				{ day: "monday", open: true, start: "08:00", end: "17:00" },
				{ day: "tuesday", open: true, start: "08:00", end: "17:00" },
				{ day: "wednesday", open: true, start: "08:00", end: "17:00" },
				{ day: "thursday", open: true, start: "08:00", end: "17:00" },
				{ day: "friday", open: true, start: "08:00", end: "17:00" },
				{ day: "saturday", open: false, start: "08:00", end: "17:00" },
				{ day: "sunday", open: false, start: "08:00", end: "17:00" },
			],
			holidays: [],
			waitLimitSeconds: 180,
		},
	}

	it("uses Asia/Manila hours and excludes the closing minute", () => {
		expect(
			isWithinBusinessHours(new Date("2026-11-23T00:00:00.000Z"), settings.businessHours)
		).toBe(true)
		expect(
			isWithinBusinessHours(new Date("2026-11-23T09:00:00.000Z"), settings.businessHours)
		).toBe(false)
	})

	it("treats configured local holidays as offline", () => {
		const schedule = { ...settings.businessHours, holidays: ["2026-11-23"] }
		expect(isWithinBusinessHours(new Date("2026-11-23T00:00:00.000Z"), schedule)).toBe(false)
	})

	it("matches phrases case-insensitively and matches configured categories", () => {
		const ruleSettings: EscalationSettings = {
			...settings,
			rules: {
				...settings.rules,
				topics: ["lost parcel"],
				keywords: ["refund"],
				categories: ["scam"],
			},
		}
		expect(matchesEscalationRule("My LOST PARCEL is missing", undefined, ruleSettings)).toBe(true)
		expect(matchesEscalationRule("Please process my refund", undefined, ruleSettings)).toBe(true)
		expect(matchesEscalationRule("Can you help?", "scam", ruleSettings)).toBe(true)
		expect(matchesEscalationRule("Can you help?", "rates", ruleSettings)).toBe(false)
	})
})

import { describe, expect, it } from "vitest"

import {
	EscalationBusinessHoursSchema,
	EscalationRulesSchema,
	UpdateAssistantSettingsRequestSchema,
} from "./assistant.schema.js"

describe("assistant settings validation (CNV-3)", () => {
	it.each([0, 0.5, 1])("accepts confidence threshold %s", confidenceThreshold => {
		expect(UpdateAssistantSettingsRequestSchema.safeParse({ confidenceThreshold }).success).toBe(
			true
		)
	})

	it.each([-0.01, 1.01])("rejects confidence threshold %s", confidenceThreshold => {
		expect(UpdateAssistantSettingsRequestSchema.safeParse({ confidenceThreshold }).success).toBe(
			false
		)
	})

	it.each([1, 100, 200])("accepts output token limit %s", maxOutputTokens => {
		expect(UpdateAssistantSettingsRequestSchema.safeParse({ maxOutputTokens }).success).toBe(true)
	})

	it.each([0, 201, 1.5])("rejects output token limit %s", maxOutputTokens => {
		expect(UpdateAssistantSettingsRequestSchema.safeParse({ maxOutputTokens }).success).toBe(false)
	})

	it("requires at least one setting", () => {
		expect(UpdateAssistantSettingsRequestSchema.safeParse({}).success).toBe(false)
	})
})

describe("escalation settings validation (ESC-3)", () => {
	const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
		day => ({ day, open: day !== "saturday" && day !== "sunday", start: "08:00", end: "17:00" })
	)

	it("accepts valid rules", () => {
		expect(
			EscalationRulesSchema.safeParse({
				topics: ["payment dispute"],
				keywords: ["urgent"],
				categories: ["scam"],
				repeatedLowConfidenceCount: 2,
			}).success
		).toBe(true)
	})

	it("requires a complete Asia/Manila schedule and a bounded wait", () => {
		expect(
			EscalationBusinessHoursSchema.safeParse({
				timezone: "Asia/Manila",
				days,
				holidays: ["2026-12-25"],
				waitLimitSeconds: 180,
			}).success
		).toBe(true)
		expect(
			EscalationBusinessHoursSchema.safeParse({
				timezone: "UTC",
				days: days.slice(0, 6),
				holidays: [],
				waitLimitSeconds: 10,
			}).success
		).toBe(false)
	})
})

import { describe, expect, it } from "vitest"

import { UpdateAssistantSettingsRequestSchema } from "./assistant.schema.js"

describe("assistant settings validation (CNV-3)", () => {
	it.each([0, 0.5, 1])("accepts confidence threshold %s", confidenceThreshold => {
		expect(UpdateAssistantSettingsRequestSchema.safeParse({ confidenceThreshold }).success).toBe(true)
	})

	it.each([-0.01, 1.01])("rejects confidence threshold %s", confidenceThreshold => {
		expect(UpdateAssistantSettingsRequestSchema.safeParse({ confidenceThreshold }).success).toBe(false)
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

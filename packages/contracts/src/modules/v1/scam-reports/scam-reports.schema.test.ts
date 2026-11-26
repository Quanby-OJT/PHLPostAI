import { describe, expect, it } from "vitest"

import {
	CreateScamReportSchema,
	ScamReportChangeSchema,
	ScamReportStatusSchema,
} from "./scam-reports.schema.js"

const id = "eaf081f1-62b7-4ce5-8eca-4eeec87d1cb9"

describe("SCM-3 contracts", () => {
	it("requires a submission UUID and an explicit boolean handoff preference", () => {
		expect(CreateScamReportSchema.parse({ submissionId: id })).toEqual({
			submissionId: id,
			requestAgent: false,
		})
		expect(CreateScamReportSchema.safeParse({ submissionId: "abc" }).success).toBe(false)
		expect(
			CreateScamReportSchema.safeParse({ submissionId: id, requestAgent: "true" }).success
		).toBe(false)
	})

	it("validates findings and trimmed notes independently from report status", () => {
		const input = {
			id,
			action: "record_finding",
			finding: "confirmed_scam",
			notes: "  Checked evidence  ",
		}
		expect(ScamReportChangeSchema.parse(input)).toEqual({ ...input, notes: "Checked evidence" })
		expect(ScamReportChangeSchema.safeParse({ ...input, notes: "  " }).success).toBe(false)
		expect(ScamReportChangeSchema.safeParse({ ...input, finding: "closed" }).success).toBe(false)
		expect(ScamReportStatusSchema.safeParse("reopened").success).toBe(false)
	})
})

import { ConflictException } from "@nestjs/common"

import type { ScamFinding, ScamReportChange, ScamReportStatus } from "@repo/contracts"

import { applyScamReportChange } from "./scam-reports.service"

jest.mock("@/common/database/database.client", () => ({ db: {} }))
jest.mock("../escalations/escalation.service", () => ({ EscalationService: class {} }))

const id = "eaf081f1-62b7-4ce5-8eca-4eeec87d1cb9"
const review = { id, status: "reported" as const, reviewerId: null, finding: null, notes: null }

describe("SCM-3 review state machine", () => {
	it("records the reviewer when a reported case enters review", () => {
		expect(applyScamReportChange(review, { id, action: "start_review" }, "reviewer")).toEqual({
			status: "under_review",
			reviewerId: "reviewer",
			finding: null,
			notes: null,
		})
	})

	it.each<ScamFinding>(["confirmed_scam", "legitimate", "inconclusive"])(
		"records %s and retains its reviewer, finding and notes at closure",
		finding => {
			const current = { ...review, status: "under_review" as const, reviewerId: "starter" }
			const next = applyScamReportChange(
				current,
				{ id, action: "record_finding", finding, notes: "Evidence reviewed. Call 09170000000." },
				"reviewer"
			)
			expect(next).toEqual({
				status: finding,
				reviewerId: "reviewer",
				finding,
				notes: "Evidence reviewed. Call [PHONE].",
			})
			expect(applyScamReportChange({ id, ...next }, { id, action: "close" }, "closer")).toEqual({
				...next,
				status: "closed",
			})
		}
	)

	it.each<[ScamReportStatus, ScamReportChange]>([
		["reported", { id, action: "record_finding", finding: "legitimate", notes: "Too early" }],
		["reported", { id, action: "close" }],
		["under_review", { id, action: "start_review" }],
		["under_review", { id, action: "close" }],
		["confirmed_scam", { id, action: "record_finding", finding: "legitimate", notes: "Overwrite" }],
		["closed", { id, action: "start_review" }],
	])("rejects an invalid change from %s", (status, change) => {
		expect(() => applyScamReportChange({ ...review, status }, change, "reviewer")).toThrow(
			ConflictException
		)
	})
})

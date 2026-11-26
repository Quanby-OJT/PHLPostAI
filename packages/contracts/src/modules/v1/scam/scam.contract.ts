import { oc } from "@orpc/contract"
import { z } from "zod"

import {
	CreateOfficialContactSchema,
	CreateRiskIndicatorSchema,
	OfficialContactSchema,
	RiskIndicatorSchema,
	TestScamAssessmentRequestSchema,
	TestScamAssessmentSchema,
	UpdateRiskIndicatorSchema,
} from "./scam.schema.js"

const tags = ["Scam protection"]
const indicatorsPath = "/scam/risk-indicators"
const contactsPath = "/scam/official-contacts"

export const scamContract = {
	riskIndicators: {
		list: oc
			.route({ method: "GET", path: indicatorsPath, summary: "List risk indicators", tags })
			.output(z.array(RiskIndicatorSchema)),
		create: oc
			.route({ method: "POST", path: indicatorsPath, summary: "Add a risk indicator", tags })
			.input(CreateRiskIndicatorSchema)
			.output(RiskIndicatorSchema),
		update: oc
			.route({
				method: "PUT",
				path: indicatorsPath,
				summary: "Change indicator weight or status",
				tags,
			})
			.input(UpdateRiskIndicatorSchema)
			.output(RiskIndicatorSchema),
	},
	officialContacts: {
		list: oc
			.route({ method: "GET", path: contactsPath, summary: "List official contacts", tags })
			.output(z.array(OfficialContactSchema)),
		create: oc
			.route({ method: "POST", path: contactsPath, summary: "Add an official contact", tags })
			.input(CreateOfficialContactSchema)
			.output(OfficialContactSchema),
	},
	testAssessment: oc
		.route({
			method: "POST",
			path: "/scam/test-assessment",
			summary: "Preview a scam assessment",
			tags,
		})
		.input(TestScamAssessmentRequestSchema)
		.output(TestScamAssessmentSchema),
}

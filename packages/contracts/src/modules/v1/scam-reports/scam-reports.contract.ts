import { oc } from "@orpc/contract"

import {
	CreateScamReportSchema,
	ScamReportChangeSchema,
	ScamReportDetailSchema,
	ScamReportIdSchema,
	ScamReportPageResultSchema,
	ScamReportPageSchema,
	ScamReportReceiptSchema,
	ScamReportReviewSchema,
} from "./scam-reports.schema.js"

const tags = ["Scam reports"]

export const scamReportsContract = {
	create: oc
		.route({
			method: "POST",
			path: "/customer/scam-reports",
			summary: "Report an assessed submission",
			tags,
		})
		.input(CreateScamReportSchema)
		.output(ScamReportReceiptSchema),
	list: oc
		.route({ method: "GET", path: "/scam/reports", summary: "List scam reports", tags })
		.input(ScamReportPageSchema)
		.output(ScamReportPageResultSchema),
	detail: oc
		.route({ method: "GET", path: "/scam/reports/{id}", summary: "Read a scam report", tags })
		.input(ScamReportIdSchema)
		.output(ScamReportDetailSchema),
	change: oc
		.route({
			method: "POST",
			path: "/scam/reports/{id}/review",
			summary: "Update scam report review",
			tags,
		})
		.input(ScamReportChangeSchema)
		.output(ScamReportReviewSchema),
}

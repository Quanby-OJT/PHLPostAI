import { z } from "zod"

import { ScamRiskLevelSchema } from "../customer/customer.schema.js"

export const ScamFindingSchema = z.enum(["confirmed_scam", "legitimate", "inconclusive"])
export const ScamReportStatusSchema = z.enum([
	"reported",
	"under_review",
	...ScamFindingSchema.options,
	"closed",
])

export const CreateScamReportSchema = z.strictObject({
	submissionId: z.uuid(),
	requestAgent: z.boolean().default(false),
})
export const ScamReportReceiptSchema = z.object({
	reference: z.uuid(),
	handoff: z.enum(["queued", "claimed"]).nullable(),
})
export const ScamReportIdSchema = z.object({ id: z.uuid() })
export const ScamReportPageSchema = z.object({
	page: z.coerce.number().int().min(1).max(10000).default(1),
})
export const ScamReportChangeSchema = z.discriminatedUnion("action", [
	ScamReportIdSchema.extend({ action: z.literal("start_review") }).strict(),
	ScamReportIdSchema.extend({
		action: z.literal("record_finding"),
		finding: ScamFindingSchema,
		notes: z.string().trim().min(1).max(2000),
	}).strict(),
	ScamReportIdSchema.extend({ action: z.literal("close") }).strict(),
])

export const ScamReportSummarySchema = z.object({
	id: z.uuid(),
	status: ScamReportStatusSchema,
	riskLevel: ScamRiskLevelSchema,
	createdAt: z.iso.datetime(),
})
export const ScamReportPageResultSchema = z.object({
	reports: z.array(ScamReportSummarySchema),
	hasNextPage: z.boolean(),
})
export const ScamReportReviewSchema = z.object({
	id: z.uuid(),
	status: ScamReportStatusSchema,
	reviewerId: z.string().nullable(),
	finding: ScamFindingSchema.nullable(),
	notes: z.string().nullable(),
})
export const ScamReportDetailSchema = ScamReportSummarySchema.merge(ScamReportReviewSchema).extend({
	contentMasked: z.string(),
	extractedUrls: z.array(z.string()),
	indicators: z.array(z.string()),
	confidence: z.number().min(0).max(1),
	guidanceKey: z.string(),
})

export type CreateScamReport = z.infer<typeof CreateScamReportSchema>
export type ScamReportReceipt = z.infer<typeof ScamReportReceiptSchema>
export type ScamFinding = z.infer<typeof ScamFindingSchema>
export type ScamReportStatus = z.infer<typeof ScamReportStatusSchema>
export type ScamReportChange = z.infer<typeof ScamReportChangeSchema>
export type ScamReportDetail = z.infer<typeof ScamReportDetailSchema>
export type ScamReportPageResult = z.infer<typeof ScamReportPageResultSchema>

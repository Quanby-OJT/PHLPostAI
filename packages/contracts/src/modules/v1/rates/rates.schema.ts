import { z } from "zod"

/** Rate Entries and Rate Batches (KB-2, DOMAIN-MODEL `rate_entries` / `rate_batches`). */

const DateSchema = z
	.union([z.date(), z.string()])
	.transform(val => (typeof val === "string" ? new Date(val) : val))

export const RateStatusSchema = z.enum(["pending", "approved", "rejected"])

export const RateEntrySchema = z.object({
	id: z.string().uuid(),
	batchId: z.string().uuid(),
	serviceCode: z.string(),
	serviceName: z.string(),
	zone: z.string(),
	weightMinG: z.number().int(),
	weightMaxG: z.number().int(),
	priceCentavos: z.number().int(),
	effectiveFrom: z.string(),
	effectiveTo: z.string().nullable(),
	status: RateStatusSchema,
})

export const RateBatchSchema = z.object({
	id: z.string().uuid(),
	fileName: z.string(),
	rowCount: z.number().int(),
	status: RateStatusSchema,
	submittedBy: z.string().nullable(),
	reviewedBy: z.string().nullable(),
	reviewedAt: DateSchema.nullable(),
	reviewNote: z.string().nullable(),
	createdAt: DateSchema,
})

export const RateBatchDetailSchema = RateBatchSchema.extend({
	entries: z.array(RateEntrySchema),
})

export const RateCsvRequestSchema = z.object({
	fileName: z.string().trim().min(1, "File name is required").max(200),
	csv: z.string().min(1, "The file is empty").max(1_000_000, "The file is too large"),
})

export const RatePreviewRowSchema = z.object({
	line: z.number().int(),
	serviceCode: z.string(),
	serviceName: z.string(),
	zone: z.string(),
	weightMinG: z.number().int(),
	weightMaxG: z.number().int(),
	priceCentavos: z.number().int(),
	effectiveFrom: z.string(),
	effectiveTo: z.string().nullable(),
})

export const RatePreviewErrorSchema = z.object({
	line: z.number().int(),
	message: z.string(),
})

export const RatePreviewSchema = z.object({
	rows: z.array(RatePreviewRowSchema),
	errors: z.array(RatePreviewErrorSchema),
	valid: z.boolean(),
})

export const RateBatchIdSchema = z.object({ id: z.string().uuid() })

export const RejectRateBatchRequestSchema = z.object({
	id: z.string().uuid(),
	note: z.string().trim().min(1, "Say why the batch is rejected").max(1000),
})

export type RateEntry = z.infer<typeof RateEntrySchema>
export type RateBatch = z.infer<typeof RateBatchSchema>
export type RateBatchDetail = z.infer<typeof RateBatchDetailSchema>
export type RateCsvRequest = z.infer<typeof RateCsvRequestSchema>
export type RatePreviewRow = z.infer<typeof RatePreviewRowSchema>
export type RatePreviewError = z.infer<typeof RatePreviewErrorSchema>
export type RatePreview = z.infer<typeof RatePreviewSchema>
export type RateStatus = z.infer<typeof RateStatusSchema>

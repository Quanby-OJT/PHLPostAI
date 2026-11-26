import { z } from "zod"

const CodeSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "Use lowercase words separated by underscores")
	.max(60)
const NameSchema = z
	.string()
	.trim()
	.max(100)
	.regex(/^[\p{L}\p{N}][\p{L}\p{M}\p{N} '’()-]*$/u, "Describe a signal in plain text")
const WeightSchema = z.number().int().min(1).max(10)
const DateSchema = z.union([z.date(), z.iso.datetime()]).transform(value => new Date(value))

export const CreateRiskIndicatorSchema = z.object({
	code: CodeSchema,
	name: NameSchema,
	weight: WeightSchema,
})
export const UpdateRiskIndicatorSchema = z
	.object({
		code: CodeSchema,
		weight: WeightSchema.optional(),
		isActive: z.boolean().optional(),
	})
	.refine(value => value.weight !== undefined || value.isActive !== undefined, {
		message: "Provide a weight or an active status",
	})
export const RiskIndicatorSchema = z.object({
	id: z.uuid(),
	code: z.string(),
	name: z.string(),
	weight: z.number().int(),
	isActive: z.boolean(),
	createdAt: DateSchema,
	updatedAt: DateSchema,
})

export const CreateOfficialContactSchema = z.object({
	kind: z.enum(["domain", "sender", "payment-channel"]),
	value: z.string().trim().min(1).max(253),
})
export const OfficialContactSchema = CreateOfficialContactSchema.extend({
	id: z.uuid(),
	isActive: z.boolean(),
	createdAt: DateSchema,
	updatedAt: DateSchema,
})
export const TestScamAssessmentRequestSchema = z.object({
	query: z.string().trim().min(1).max(4000),
})
export const TestScamAssessmentSchema = z.object({
	riskLevel: z.enum(["low", "medium", "high", "uncertain"]),
	confidence: z.number().min(0).max(1),
	indicators: z.array(RiskIndicatorSchema.pick({ code: true, name: true, weight: true })),
})

export type CreateRiskIndicator = z.infer<typeof CreateRiskIndicatorSchema>
export type UpdateRiskIndicator = z.infer<typeof UpdateRiskIndicatorSchema>
export type RiskIndicator = z.infer<typeof RiskIndicatorSchema>
export type CreateOfficialContact = z.infer<typeof CreateOfficialContactSchema>
export type OfficialContact = z.infer<typeof OfficialContactSchema>
export type TestScamAssessment = z.infer<typeof TestScamAssessmentSchema>

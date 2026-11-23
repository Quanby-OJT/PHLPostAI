import { z } from "zod"

const DateSchema = z
	.union([z.date(), z.string()])
	.transform(val => (typeof val === "string" ? new Date(val) : val))

export const InquiryCategorySchema = z.object({
	code: z.string(),
	name: z.string(),
	isEligible: z.boolean(),
	isActive: z.boolean(),
	createdAt: DateSchema,
	updatedAt: DateSchema,
})

export const UpdateInquiryCategoryRequestSchema = z.object({
	code: z.string().trim().min(1),
	isEligible: z.boolean(),
	isActive: z.boolean().optional(),
})

export type InquiryCategory = z.infer<typeof InquiryCategorySchema>
export type UpdateInquiryCategoryRequest = z.infer<typeof UpdateInquiryCategoryRequestSchema>

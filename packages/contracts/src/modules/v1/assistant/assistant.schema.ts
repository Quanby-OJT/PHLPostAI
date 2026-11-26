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

export const CreateInquiryCategoryRequestSchema = z.object({
	code: z
		.string()
		.trim()
		.transform(value => value.toLowerCase())
		.pipe(
			z
				.string()
				.regex(
					/^[a-z][a-z0-9-]{1,39}$/,
					"Use lowercase letters, numbers and hyphens, such as customs-help"
				)
		),
	name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
	isEligible: z.boolean().default(false),
})

export const AssistantSettingsSchema = z.object({
	confidenceThreshold: z.number().min(0).max(1),
	maxOutputTokens: z.number().int().min(1).max(200),
	blockedTopics: z.array(z.string().trim().min(1).max(120)).max(100),
})

export const UpdateAssistantSettingsRequestSchema = z
	.object({
		confidenceThreshold: z.number().min(0).max(1).optional(),
		maxOutputTokens: z.number().int().min(1).max(200).optional(),
		blockedTopics: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
	})
	.refine(
		value =>
			value.confidenceThreshold !== undefined ||
			value.maxOutputTokens !== undefined ||
			value.blockedTopics !== undefined,
		{
			message: "At least one assistant setting must be provided",
		}
	)

export type InquiryCategory = z.infer<typeof InquiryCategorySchema>
export type CreateInquiryCategoryRequest = z.infer<typeof CreateInquiryCategoryRequestSchema>
export type UpdateInquiryCategoryRequest = z.infer<typeof UpdateInquiryCategoryRequestSchema>
export type AssistantSettings = z.infer<typeof AssistantSettingsSchema>
export type UpdateAssistantSettingsRequest = z.infer<typeof UpdateAssistantSettingsRequestSchema>

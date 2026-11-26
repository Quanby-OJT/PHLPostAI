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

const EscalationDaySchema = z.enum([
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
])

const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const HolidayDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(value => {
		const date = new Date(`${value}T00:00:00.000Z`)
		return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
	})

export const EscalationRulesSchema = z.object({
	topics: z.array(z.string().trim().min(2).max(80)).max(50),
	keywords: z.array(z.string().trim().min(2).max(80)).max(100),
	categories: z.array(
		z.enum(["tracking", "rates", "postal-id", "service-info", "scam", "complaint", "other"])
	),
	repeatedLowConfidenceCount: z.number().int().min(1).max(5),
})

export const EscalationBusinessHoursSchema = z.object({
	timezone: z.literal("Asia/Manila"),
	days: z
		.array(
			z.object({
				day: EscalationDaySchema,
				open: z.boolean(),
				start: ClockTimeSchema,
				end: ClockTimeSchema,
			})
		)
		.length(7)
		.refine(days => new Set(days.map(day => day.day)).size === 7, {
			message: "Business hours must include each weekday once",
		})
		.refine(days => days.every(day => !day.open || day.start < day.end), {
			message: "Opening time must be earlier than closing time",
		}),
	holidays: z.array(HolidayDateSchema).max(100),
	waitLimitSeconds: z.number().int().min(30).max(3600),
})

export const EscalationSettingsSchema = z.object({
	rules: EscalationRulesSchema,
	businessHours: EscalationBusinessHoursSchema,
})

export const UpdateEscalationSettingsRequestSchema = EscalationSettingsSchema

export type InquiryCategory = z.infer<typeof InquiryCategorySchema>
export type CreateInquiryCategoryRequest = z.infer<typeof CreateInquiryCategoryRequestSchema>
export type UpdateInquiryCategoryRequest = z.infer<typeof UpdateInquiryCategoryRequestSchema>
export type AssistantSettings = z.infer<typeof AssistantSettingsSchema>
export type UpdateAssistantSettingsRequest = z.infer<typeof UpdateAssistantSettingsRequestSchema>
export type EscalationSettings = z.infer<typeof EscalationSettingsSchema>
export type EscalationBusinessHours = z.infer<typeof EscalationBusinessHoursSchema>
export type EscalationRules = z.infer<typeof EscalationRulesSchema>
export type UpdateEscalationSettingsRequest = z.infer<typeof UpdateEscalationSettingsRequestSchema>

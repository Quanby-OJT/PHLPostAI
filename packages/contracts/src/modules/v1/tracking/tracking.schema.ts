import { z } from "zod"

/** Status Explanations (TRK-2, DOMAIN-MODEL `status_explanations`, Flow B step 4). */

const DateSchema = z
	.union([z.date(), z.string()])
	.transform(val => (typeof val === "string" ? new Date(val) : val))

export const EXPLANATION_LANGUAGES = ["en", "fil", "ceb", "ilo"] as const
export const ExplanationLanguageSchema = z.enum(EXPLANATION_LANGUAGES)

export const StatusCodeSchema = z
	.string()
	.trim()
	.transform(value => value.toUpperCase())
	.pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_]{1,59}$/, "Use a status code such as HELD_AT_CUSTOMS"))

export const StatusExplanationSchema = z.object({
	id: z.string().uuid(),
	statusCode: z.string(),
	language: ExplanationLanguageSchema,
	explanation: z.string(),
	nextSteps: z.string().nullable(),
	isActive: z.boolean(),
	createdAt: DateSchema,
	updatedAt: DateSchema,
})

export const SaveStatusExplanationRequestSchema = z.object({
	statusCode: StatusCodeSchema,
	language: ExplanationLanguageSchema,
	explanation: z
		.string()
		.trim()
		.min(1, "Explanation is required")
		.max(2000, "Explanation is too long"),
	nextSteps: z
		.string()
		.trim()
		.max(2000, "Next steps are too long")
		.nullish()
		.transform(value => (value ? value : null)),
})

export const StatusExplanationIdSchema = z.object({ id: z.string().uuid() })

export const NeededExplanationSchema = z.object({
	statusCode: z.string(),
	language: ExplanationLanguageSchema,
	lookups: z.number().int().nonnegative(),
	lastSeenAt: DateSchema,
})

export type StatusExplanation = z.infer<typeof StatusExplanationSchema>
export type SaveStatusExplanationRequest = z.infer<typeof SaveStatusExplanationRequestSchema>
export type NeededExplanation = z.infer<typeof NeededExplanationSchema>
export type ExplanationLanguage = z.infer<typeof ExplanationLanguageSchema>

import { z } from "zod"

import { ChatCitationSchema } from "../chat/chat.schema.js"

/**
 * Conversation transcripts (ADM-3). Read-only review of Conversations with
 * the AI trace behind each assistant answer. Stored text is already masked
 * (CNV-1 / RAG screening); the viewer masks again before returning it, so the
 * masked form is the only form that leaves the API.
 *
 * Names follow DOMAIN-MODEL.md: `conversations`, `messages`, and the
 * Conversation state machine (5.1) for `outcome`.
 */

/** Conversation state machine values (DOMAIN-MODEL 5.1), used as "outcome". */
export const TRANSCRIPT_OUTCOMES = [
	"ai_active",
	"resolved_by_ai",
	"escalation_requested",
	"agent_active",
	"resolved_by_agent",
	"contact_captured",
	"abandoned",
] as const

/** Message language codes (DOMAIN-MODEL `messages.language`, CNV-4). */
export const TRANSCRIPT_LANGUAGES = ["en", "fil", "ceb", "ilo", "unsupported"] as const

const CalendarDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
	.refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Enter a real date")

export const TranscriptSearchSchema = z.object({
	/** Inclusive Asia/Manila calendar day (DOMAIN-MODEL: reports use Asia/Manila). */
	from: CalendarDateSchema.optional(),
	to: CalendarDateSchema.optional(),
	/** Inquiry Category code (`messages.inquiry_category`). */
	category: z.string().trim().min(1).max(64).optional(),
	language: z.enum(TRANSCRIPT_LANGUAGES).optional(),
	outcome: z.enum(TRANSCRIPT_OUTCOMES).optional(),
	/** A Conversation id, or a trace id (`messages.trace_id`). */
	reference: z.string().trim().min(1).max(64).optional(),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(25),
})

export const TranscriptRowSchema = z.object({
	id: z.string().uuid(),
	createdAt: z.coerce.date(),
	status: z.enum(TRANSCRIPT_OUTCOMES),
	channelCode: z.string().nullable(),
	messageCount: z.number().int(),
	category: z.string().nullable(),
	language: z.string().nullable(),
	/** Masked, truncated first customer question. */
	preview: z.string(),
})

export const TranscriptPageSchema = z.object({
	rows: z.array(TranscriptRowSchema),
	total: z.number().int(),
	page: z.number().int(),
	pageSize: z.number().int(),
})

export const ToolResultSchema = z.object({
	connectorCode: z.string(),
	outcome: z.string(),
	statusCode: z.string().nullable(),
	latencyMs: z.number().int(),
	createdAt: z.coerce.date(),
})

/** The per-answer provenance panel (ADM-3 AC2). */
export const AnswerProvenanceSchema = z.object({
	/** Sources used: the resolved citations of the answer. */
	sources: z.array(ChatCitationSchema),
	/** Tool results for tool answers (tracking lookups); empty otherwise. */
	toolResults: z.array(ToolResultSchema),
	/** 0 to 1, or null when no confidence was recorded. */
	confidence: z.number().nullable(),
	retrievalScore: z.number().nullable(),
	groundednessResult: z.record(z.string(), z.unknown()).nullable(),
	modelUsed: z.string().nullable(),
	/** From the RAG chat audit entry; null when none was recorded. */
	provider: z.string().nullable(),
	traceId: z.string().nullable(),
	/** Built from the configured trace viewer; null when none is configured. */
	traceUrl: z.string().nullable(),
})

export const TranscriptMessageSchema = z.object({
	id: z.string().uuid(),
	turnIndex: z.number().int(),
	sender: z.string(),
	role: z.enum(["user", "assistant"]),
	answerKind: z.enum(["answer", "uncertain", "refusal", "tool"]).nullable(),
	inquiryCategory: z.string().nullable(),
	language: z.string().nullable(),
	/** Masked message text. */
	content: z.string(),
	createdAt: z.coerce.date(),
	/** Present on assistant messages only. */
	provenance: AnswerProvenanceSchema.nullable(),
})

export const TranscriptDetailSchema = z.object({
	id: z.string().uuid(),
	createdAt: z.coerce.date(),
	status: z.enum(TRANSCRIPT_OUTCOMES),
	channelCode: z.string().nullable(),
	messages: z.array(TranscriptMessageSchema),
})

export type TranscriptSearch = z.infer<typeof TranscriptSearchSchema>
export type TranscriptRow = z.infer<typeof TranscriptRowSchema>
export type TranscriptPage = z.infer<typeof TranscriptPageSchema>
export type AnswerProvenance = z.infer<typeof AnswerProvenanceSchema>
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>
export type TranscriptDetail = z.infer<typeof TranscriptDetailSchema>

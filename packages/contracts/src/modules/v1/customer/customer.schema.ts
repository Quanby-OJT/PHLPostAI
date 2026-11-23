import { z } from "zod"

import { ChatCitationSchema } from "../chat/chat.schema.js"

// ============================================================================
// SCHEMAS
// ============================================================================

/** Channels a public session may be opened on. CHN-1/CHN-2 add codes here. */
export const CUSTOMER_CHANNEL_CODES = ["web", "web-widget"] as const
export const CustomerChannelCodeSchema = z.enum(CUSTOMER_CHANNEL_CODES)

/** Languages the assistant serves (PRD non-functional requirements). */
export const CUSTOMER_LANGUAGES = ["en", "fil", "ceb", "ilo"] as const
export const CustomerLanguageSchema = z.enum(CUSTOMER_LANGUAGES)

/**
 * What a customer turn produced (DOMAIN-MODEL `messages.answer_kind`).
 * `answer` is grounded on approved content, `uncertain` is the grounded
 * "I don't have that information", `refusal` is a screened-out question,
 * `tool` is a reply built from a tool result such as a tracking lookup (TRK-1).
 */
export const CustomerAnswerKindSchema = z.enum(["answer", "uncertain", "refusal", "tool"])

export const StartCustomerSessionRequestSchema = z.object({
	channelCode: CustomerChannelCodeSchema.optional().default("web"),
	language: CustomerLanguageSchema.optional().default("en"),
})

/**
 * A new anonymous session. `sessionToken` is returned ONCE and never stored in
 * recoverable form — only its hash is kept — so a lost token cannot be
 * recovered, only replaced. The caller sends it back in `x-customer-session`.
 */
export const CustomerSessionSchema = z.object({
	sessionToken: z.string(),
	channelCode: CustomerChannelCodeSchema,
	language: CustomerLanguageSchema,
	/** When the session lapses if the customer stops sending messages. */
	idleExpiresAt: z.string(),
	welcomeText: z.string().optional(),
})

export const CustomerChannelStatusSchema = z.object({
	enabled: z.boolean(),
	welcomeText: z.string(),
})

export const CustomerChatRequestSchema = z.object({
	query: z.string().trim().min(1).max(4000),
	/** Continue a conversation opened by the SAME session; omitted -> new. */
	conversationId: z.string().uuid().optional(),
})

/**
 * One approved Knowledge Article an answer drew on (CNV-1 AC1: the customer
 * sees article TITLES, not internal document ids).
 */
export const CustomerAnswerSourceSchema = z.object({
	articleId: z.string().uuid(),
	title: z.string(),
})

export const CustomerAnswerSchema = z.object({
	answer: z.string(),
	conversationId: z.string().uuid(),
	messageId: z.string().uuid(),
	/** Titles of the approved articles the answer used; empty on a refusal. */
	sources: z.array(CustomerAnswerSourceSchema),
	citations: z.array(ChatCitationSchema),
	answerKind: CustomerAnswerKindSchema,
	/** True for the grounded "I don't have that information" (AC2). */
	isIDontKnow: z.boolean(),
})

// ============================================================================
// TYPES
// ============================================================================

export type CustomerChannelCode = z.infer<typeof CustomerChannelCodeSchema>
export type CustomerLanguage = z.infer<typeof CustomerLanguageSchema>
export type CustomerAnswerKind = z.infer<typeof CustomerAnswerKindSchema>
export type StartCustomerSessionRequest = z.infer<typeof StartCustomerSessionRequestSchema>
export type CustomerSession = z.infer<typeof CustomerSessionSchema>
export type CustomerChatRequest = z.infer<typeof CustomerChatRequestSchema>
export type CustomerAnswerSource = z.infer<typeof CustomerAnswerSourceSchema>
export type CustomerAnswer = z.infer<typeof CustomerAnswerSchema>
export type CustomerChannelStatus = z.infer<typeof CustomerChannelStatusSchema>

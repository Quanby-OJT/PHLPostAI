import type {
	AnswerProvenance,
	ChatCitation,
	TranscriptDetail,
	TranscriptMessage,
	TranscriptRow,
} from "@repo/contracts"

import { maskScamInput } from "@/modules/v1/customer/scam-checks"

/** Pure helpers for transcript review (ADM-3). No database access here. */

const MANILA_OFFSET = "+08:00"
const DAY_MS = 24 * 60 * 60 * 1000
const PREVIEW_LENGTH = 160
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Start of an Asia/Manila calendar day, as a UTC instant. Manila has no DST. */
export function manilaDayStart(date: string): Date {
	return new Date(`${date}T00:00:00${MANILA_OFFSET}`)
}

/** Exclusive end of an Asia/Manila calendar day (start of the next day). */
export function manilaDayEndExclusive(date: string): Date {
	return new Date(manilaDayStart(date).getTime() + DAY_MS)
}

export function isUuid(value: string): boolean {
	return UUID.test(value)
}

/**
 * Display-time masking. Stored text is already masked when written (CNV-1,
 * RAG screening), so this is a second pass that keeps unmasked personal data
 * out of the transcript API even if an earlier stage missed it.
 */
export function maskTranscriptText(text: string): string {
	return maskScamInput(text)
}

function truncate(text: string, length: number): string {
	return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

export interface StoredMessageLike {
	role: "user" | "assistant"
	turnIndex: number
	inquiryCategory: string | null
	language: string | null
	content: string
}

/** Derives the list-row fields from one conversation's messages. */
export function summarizeMessages(messages: readonly StoredMessageLike[]): {
	category: string | null
	language: string | null
	messageCount: number
	preview: string
} {
	const ordered = [...messages].sort((a, b) => a.turnIndex - b.turnIndex)
	const userTurns = ordered.filter(message => message.role === "user")
	const latestUser = userTurns.at(-1)
	const firstUser = userTurns.at(0)
	const latestLanguage = [...ordered].reverse().find(message => message.language)?.language ?? null
	return {
		category: latestUser?.inquiryCategory ?? null,
		language: latestUser?.language ?? latestLanguage,
		messageCount: ordered.length,
		preview: firstUser ? truncate(maskTranscriptText(firstUser.content), PREVIEW_LENGTH) : "",
	}
}

export function toTranscriptRow(input: {
	id: string
	createdAt: Date
	status: TranscriptRow["status"]
	channelCode: string | null
	messages: readonly StoredMessageLike[]
}): TranscriptRow {
	const summary = summarizeMessages(input.messages)
	return {
		id: input.id,
		createdAt: input.createdAt,
		status: input.status,
		channelCode: input.channelCode,
		messageCount: summary.messageCount,
		category: summary.category,
		language: summary.language,
		preview: summary.preview,
	}
}

/** Fills `{traceId}` in the configured trace viewer template; null when unset. */
export function buildTraceUrl(template: string | undefined, traceId: string | null): string | null {
	if (!template || !traceId) return null
	return template.replace("{traceId}", encodeURIComponent(traceId))
}

/** Maps message id to the provider recorded on its RAG chat audit entry. */
export function providerByMessageId(auditRows: readonly { after: unknown }[]): Map<string, string> {
	const providers = new Map<string, string>()
	for (const row of auditRows) {
		const after = row.after as { messageId?: unknown; provider?: unknown } | null
		if (typeof after?.messageId === "string" && typeof after.provider === "string") {
			providers.set(after.messageId, after.provider)
		}
	}
	return providers
}

export interface StoredTranscriptMessage extends StoredMessageLike {
	id: string
	sender: string | null
	answerKind: TranscriptMessage["answerKind"]
	citations: unknown
	confidence: number | null
	retrievalScore: number | null
	groundednessResult: Record<string, unknown> | null
	modelUsed: string | null
	traceId: string | null
	createdAt: Date
}

export interface StoredToolResult {
	messageId: string
	connectorCode: string
	outcome: string
	statusCode: string | null
	latencyMs: number
	createdAt: Date
}

function isCitation(value: unknown): value is ChatCitation {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { chunkId?: unknown }).chunkId === "string"
	)
}

/** Builds the provenance panel for one assistant answer (ADM-3 AC2). */
export function buildProvenance(input: {
	message: StoredTranscriptMessage
	toolResults: readonly StoredToolResult[]
	provider: string | null
	traceViewerUrl: string | undefined
}): AnswerProvenance {
	const { message } = input
	// The citations column is untyped jsonb: keep only citation-shaped objects.
	const sources = Array.isArray(message.citations)
		? (message.citations as unknown[]).filter(isCitation)
		: []
	return {
		sources,
		toolResults: input.toolResults
			.filter(result => result.messageId === message.id)
			.map(result => ({
				connectorCode: result.connectorCode,
				outcome: result.outcome,
				statusCode: result.statusCode,
				latencyMs: result.latencyMs,
				createdAt: result.createdAt,
			})),
		confidence: message.confidence,
		retrievalScore: message.retrievalScore,
		groundednessResult: message.groundednessResult,
		modelUsed: message.modelUsed,
		provider: input.provider,
		traceId: message.traceId,
		traceUrl: buildTraceUrl(input.traceViewerUrl, message.traceId),
	}
}

export function toTranscriptMessage(input: {
	message: StoredTranscriptMessage
	toolResults: readonly StoredToolResult[]
	providers: ReadonlyMap<string, string>
	traceViewerUrl: string | undefined
}): TranscriptMessage {
	const { message } = input
	const isAssistant = message.role === "assistant"
	return {
		id: message.id,
		turnIndex: message.turnIndex,
		sender: message.sender ?? message.role,
		role: message.role,
		answerKind: message.answerKind,
		inquiryCategory: message.inquiryCategory,
		language: message.language,
		content: maskTranscriptText(message.content),
		createdAt: message.createdAt,
		provenance: isAssistant
			? buildProvenance({
					message,
					toolResults: input.toolResults,
					provider: input.providers.get(message.id) ?? null,
					traceViewerUrl: input.traceViewerUrl,
				})
			: null,
	}
}

export function toTranscriptDetail(input: {
	id: string
	createdAt: Date
	status: TranscriptDetail["status"]
	channelCode: string | null
	messages: readonly StoredTranscriptMessage[]
	toolResults: readonly StoredToolResult[]
	providers: ReadonlyMap<string, string>
	traceViewerUrl: string | undefined
}): TranscriptDetail {
	return {
		id: input.id,
		createdAt: input.createdAt,
		status: input.status,
		channelCode: input.channelCode,
		messages: input.messages.map(message =>
			toTranscriptMessage({
				message,
				toolResults: input.toolResults,
				providers: input.providers,
				traceViewerUrl: input.traceViewerUrl,
			})
		),
	}
}

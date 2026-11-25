"use client"

import type { CustomerAnswer, CustomerSession } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

/** Header the public endpoints authenticate with (CNV-1). */
export const CUSTOMER_SESSION_HEADER = "x-customer-session"

/** Where the tab keeps its session token between page loads (CHN-1: per tab). */
export const SESSION_STORAGE_KEY = "phlpost.assistant.session"

/** Seconds to wait when a 429 carries no usable Retry-After. */
const DEFAULT_RETRY_AFTER_SECONDS = 60

export interface StoredSession {
	sessionToken: string
	idleExpiresAt: string
}

/** 429 from the per-session or per-IP limiter (CHN-1). */
export class RateLimitedError extends ApiError {
	readonly retryAfterSeconds: number

	constructor(message: string, retryAfterSeconds: number) {
		super(429, message)
		this.retryAfterSeconds = retryAfterSeconds
	}
}

async function parseError(response: Response): Promise<ApiError> {
	let message = `Request failed (${response.status})`
	try {
		const body = (await response.json()) as { message?: string; error?: { message?: string } }
		message = body?.message ?? body?.error?.message ?? message
	} catch {
		// ignore non-JSON error bodies
	}

	if (response.status === 429) {
		const header = response.headers.get("retry-after") ?? response.headers.get("x-retry-after")
		const seconds = Number(header)
		return new RateLimitedError(
			message,
			Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_RETRY_AFTER_SECONDS
		)
	}
	return new ApiError(response.status, message)
}

/** POST /customer/session — opens an anonymous session for the web widget. */
export async function startSession(): Promise<CustomerSession> {
	const response = await fetch(`${API_BASE}/customer/session`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ channelCode: "web-widget", language: "en" }),
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as CustomerSession
}

export async function requestHumanHandoff(input: {
	conversationId: string
	reason: string
	sessionToken: string
}): Promise<{ id: string; status: "queued"; createdAt: string }> {
	const response = await fetch(`${API_BASE}/customer/escalations`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[CUSTOMER_SESSION_HEADER]: input.sessionToken,
		},
		body: JSON.stringify({ conversationId: input.conversationId, reason: input.reason }),
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as { id: string; status: "queued"; createdAt: string }
}

export async function endConversation(input: {
	conversationId: string
	sessionToken: string
}): Promise<{ resolvedByAi: boolean }> {
	const response = await fetch(`${API_BASE}/customer/conversations/end`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[CUSTOMER_SESSION_HEADER]: input.sessionToken,
		},
		body: JSON.stringify({ conversationId: input.conversationId }),
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as { resolvedByAi: boolean }
}

export interface AssistantStreamHandlers {
	onToken: (delta: string) => void
	onFinal: (final: CustomerAnswer) => void
}

/**
 * POST /customer/chat/stream — streams one answer.
 *
 * The endpoint answers in one of two shapes: an SSE stream of `token` frames
 * followed by one `final` frame, or — when screening refuses the question —
 * a plain JSON turn. Both end in `onFinal`.
 *
 * A 401 means the session is unknown or idle (caller retries with a new one).
 * A 429 throws RateLimitedError so the widget can show a "please wait" notice.
 */
export async function streamQuestion(
	input: { query: string; conversationId?: string },
	sessionToken: string,
	handlers: AssistantStreamHandlers,
	signal?: AbortSignal
): Promise<void> {
	const response = await fetch(`${API_BASE}/customer/chat/stream`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[CUSTOMER_SESSION_HEADER]: sessionToken,
		},
		body: JSON.stringify(input),
		signal,
	})
	if (!response.ok) throw await parseError(response)

	// Screening refusal (and any other non-streamed turn) comes back as JSON.
	if (!response.headers.get("content-type")?.includes("text/event-stream")) {
		handlers.onFinal((await response.json()) as CustomerAnswer)
		return
	}
	if (!response.body) throw new ApiError(502, "The assistant is unavailable.")

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ""

	const handleFrame = (frame: string) => {
		let event = "message"
		let data = ""
		for (const line of frame.split("\n")) {
			if (line.startsWith("event: ")) event = line.slice(7).trim()
			else if (line.startsWith("data: ")) data += line.slice(6)
		}
		if (!data) return
		if (event === "token") {
			handlers.onToken((JSON.parse(data) as { delta: string }).delta)
		} else if (event === "final") {
			handlers.onFinal(JSON.parse(data) as CustomerAnswer)
		}
	}

	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })
		let separator = buffer.indexOf("\n\n")
		while (separator !== -1) {
			handleFrame(buffer.slice(0, separator))
			buffer = buffer.slice(separator + 2)
			separator = buffer.indexOf("\n\n")
		}
	}
}

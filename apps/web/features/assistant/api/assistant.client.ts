"use client"

import {
	ScamReportReceiptSchema,
	type CustomerAnswer,
	type CustomerLanguage,
	type CustomerSession,
	type ScamReportReceipt,
} from "@repo/contracts"

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
	welcomeText?: string
}

export async function getChannelStatus(): Promise<{ enabled: boolean; welcomeText: string }> {
	const response = await fetch(`${API_BASE}/customer/channel-status`, { cache: "no-store" })
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as { enabled: boolean; welcomeText: string }
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
export async function startSession(language: CustomerLanguage = "en"): Promise<CustomerSession> {
	const response = await fetch(`${API_BASE}/customer/session`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ channelCode: "web-widget", language }),
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as CustomerSession
}

/** POST /customer/session/language — CNV-4: the language picked from the widget menu. */
export async function setSessionLanguage(
	language: CustomerLanguage,
	sessionToken: string
): Promise<void> {
	const response = await fetch(`${API_BASE}/customer/session/language`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[CUSTOMER_SESSION_HEADER]: sessionToken,
		},
		body: JSON.stringify({ language }),
	})
	if (!response.ok) throw await parseError(response)
}

export async function requestHumanHandoff(input: {
	conversationId: string
	reason: string
	sessionToken: string
}): Promise<{ id: string; status: "queued" | "claimed" | "contact_captured"; createdAt: string }> {
	const response = await fetch(`${API_BASE}/customer/escalations`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[CUSTOMER_SESSION_HEADER]: input.sessionToken,
		},
		body: JSON.stringify({ conversationId: input.conversationId, reason: input.reason }),
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as {
		id: string
		status: "queued" | "claimed" | "contact_captured"
		createdAt: string
	}
}

export async function submitOfflineContact(input: {
	conversationId: string
	contact?: string
	sessionToken: string
}): Promise<{ status: "contact_captured"; contactProvided: boolean }> {
	const response = await fetch(`${API_BASE}/customer/escalations/contact`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[CUSTOMER_SESSION_HEADER]: input.sessionToken,
		},
		body: JSON.stringify({ conversationId: input.conversationId, contact: input.contact }),
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as { status: "contact_captured"; contactProvided: boolean }
}

export async function sendScamReport(
	submissionId: string,
	requestAgent: boolean,
	sessionToken: string
): Promise<ScamReportReceipt> {
	const response = await fetch(`${API_BASE}/customer/scam-reports`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[CUSTOMER_SESSION_HEADER]: sessionToken,
		},
		body: JSON.stringify({ submissionId, requestAgent }),
	})
	if (!response.ok) throw await parseError(response)
	return ScamReportReceiptSchema.parse(await response.json())
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
	onAgentMode?: (result: {
		conversationId: string
		messageId: string
		status?: "queued" | "claimed" | "contact_captured"
	}) => void
}

export interface AgentMessageEvent {
	id: string
	sender: "agent" | "system"
	content: string
	turnIndex: number
	createdAt: string
}

export async function watchAgentConversation(
	conversationId: string,
	sessionToken: string,
	handlers: {
		onMessage: (message: AgentMessageEvent) => void
		onStatus: (status: string) => void
	},
	signal: AbortSignal
): Promise<void> {
	const response = await fetch(`${API_BASE}/customer/conversations/${conversationId}/events`, {
		headers: { [CUSTOMER_SESSION_HEADER]: sessionToken },
		signal,
	})
	if (!response.ok) throw await parseError(response)
	if (!response.body) throw new ApiError(502, "Live agent messages are unavailable.")
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
		const payload = JSON.parse(data) as AgentMessageEvent | { status: string }
		if (event === "message") handlers.onMessage(payload as AgentMessageEvent)
		if (event === "status") handlers.onStatus((payload as { status: string }).status)
	}
	for (;;) {
		const { done, value } = await reader.read()
		if (done) return
		buffer += decoder.decode(value, { stream: true })
		let separator = buffer.indexOf("\n\n")
		while (separator !== -1) {
			handleFrame(buffer.slice(0, separator))
			buffer = buffer.slice(separator + 2)
			separator = buffer.indexOf("\n\n")
		}
	}
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
	input: { query: string; conversationId?: string; intent?: "scam" },
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
		const payload = (await response.json()) as
			| CustomerAnswer
			| { agentMode: true; conversationId: string; messageId: string }
		if ("agentMode" in payload && payload.agentMode) handlers.onAgentMode?.(payload)
		else handlers.onFinal(payload as CustomerAnswer)
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
			const payload = JSON.parse(data) as
				| CustomerAnswer
				| {
						agentMode: true
						conversationId: string
						messageId: string
						status?: "queued" | "claimed" | "contact_captured"
				  }
			if ("agentMode" in payload && payload.agentMode) handlers.onAgentMode?.(payload)
			else handlers.onFinal(payload as CustomerAnswer)
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

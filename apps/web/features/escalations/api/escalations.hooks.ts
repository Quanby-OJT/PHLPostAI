"use client"

import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

export interface EscalationQueueItem {
	id: string
	conversationId: string
	reason: string
	createdAt: string
	language: string
	category: string
	waitingSeconds: number
}

export interface EscalationMessage {
	id: string
	sender: string
	content: string
	citations: Array<{ source?: string | null; page?: number | null; section?: string | null }>
	confidence: number | null
	createdAt: string
}

export interface EscalationDetail extends EscalationQueueItem {
	conversationCreatedAt: string
	messages: EscalationMessage[]
}

async function fetchJson<T>(path: string): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, { credentials: "include" })
	if (!response.ok) {
		let message = `Request failed (${response.status})`
		try {
			const body = (await response.json()) as { message?: string }
			message = body.message ?? message
		} catch {
			// Keep the status-based message for non-JSON errors.
		}
		throw new ApiError(response.status, message)
	}
	return (await response.json()) as T
}

export function useEscalationQueueQuery() {
	return useQuery({
		queryKey: ["escalations", "queue"],
		queryFn: () => fetchJson<EscalationQueueItem[]>("/escalations"),
		refetchInterval: 15_000,
		retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
	})
}

export function useEscalationDetailQuery(id: string | null) {
	return useQuery({
		queryKey: ["escalations", "detail", id],
		queryFn: () => fetchJson<EscalationDetail>(`/escalations/${id}`),
		enabled: id !== null,
		retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
	})
}

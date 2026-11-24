"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

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
	turnIndex: number
	agentId: string | null
}

export interface EscalationDetail extends EscalationQueueItem {
	conversationCreatedAt: string
	status: "queued" | "claimed" | "resolved"
	assignedAgentId: string | null
	outcomeNote: string | null
	canHandle: boolean
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

async function postJson<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	if (!response.ok) {
		let message = `Request failed (${response.status})`
		try {
			const body = (await response.json()) as { message?: string; error?: { message?: string } }
			message = body?.error?.message ?? body?.message ?? message
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
		refetchInterval: query => (query.state.data?.status === "claimed" ? 1000 : false),
		retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
	})
}

export function useClaimEscalationMutation() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (id: string) => postJson(`/escalations/${id}/claim`),
		onSettled: async (_data, error, id) => {
			if (error && !(error instanceof ApiError && error.status === 409)) return
			await Promise.all([
				client.invalidateQueries({ queryKey: ["escalations", "queue"] }),
				client.invalidateQueries({ queryKey: ["escalations", "detail", id] }),
			])
		},
	})
}

export function useReplyEscalationMutation(id: string) {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (content: string) => postJson(`/escalations/${id}/replies`, { content }),
		onSuccess: async () => client.invalidateQueries({ queryKey: ["escalations", "detail", id] }),
	})
}

export function useResolveEscalationMutation(id: string) {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (outcomeNote: string) => postJson(`/escalations/${id}/resolve`, { outcomeNote }),
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: ["escalations", "queue"] }),
				client.invalidateQueries({ queryKey: ["escalations", "detail", id] }),
			])
		},
	})
}

export function useEscalationLiveEvents(id: string | null, enabled: boolean) {
	const client = useQueryClient()
	useEffect(() => {
		if (!id || !enabled) return
		const abort = new AbortController()
		void (async () => {
			try {
				const response = await fetch(`${API_BASE}/escalations/${id}/events`, {
					credentials: "include",
					signal: abort.signal,
				})
				if (!response.ok || !response.body) return
				const reader = response.body.getReader()
				const decoder = new TextDecoder()
				let buffer = ""
				while (!abort.signal.aborted) {
					const { done, value } = await reader.read()
					if (done) break
					buffer += decoder.decode(value, { stream: true })
					let split = buffer.indexOf("\n\n")
					while (split >= 0) {
						buffer = buffer.slice(split + 2)
						split = buffer.indexOf("\n\n")
						void client.invalidateQueries({ queryKey: ["escalations", "detail", id] })
					}
				}
			} catch {
				// Closing the inbox or a transient disconnect ends this listener.
			}
		})()
		return () => abort.abort()
	}, [client, enabled, id])
}

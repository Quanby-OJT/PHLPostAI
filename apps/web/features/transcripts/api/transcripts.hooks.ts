"use client"

import { useQuery } from "@tanstack/react-query"

import type { TranscriptDetail, TranscriptPage, TranscriptSearch } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

export function isTranscriptPermissionError(error: unknown): boolean {
	return error instanceof ApiError && error.status === 403
}

async function parseError(response: Response): Promise<ApiError> {
	let message = `Request failed (${response.status})`
	try {
		const body = (await response.json()) as { message?: string; error?: { message?: string } }
		message = body?.message ?? body?.error?.message ?? message
	} catch {
		// ignore non-JSON error bodies
	}
	return new ApiError(response.status, message)
}

async function searchTranscripts(input: TranscriptSearch): Promise<TranscriptPage> {
	const response = await fetch(`${API_BASE}/conversations/transcripts/search`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as TranscriptPage
}

async function fetchTranscript(id: string): Promise<TranscriptDetail> {
	const response = await fetch(`${API_BASE}/conversations/transcripts/${id}`, {
		credentials: "include",
		headers: { "Content-Type": "application/json" },
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as TranscriptDetail
}

/** Runs one search. Disabled until the reviewer applies filters (`input` set). */
export function useTranscriptSearch(input: TranscriptSearch | null) {
	return useQuery({
		queryKey: ["transcripts", "search", input],
		queryFn: () => searchTranscripts(input as TranscriptSearch),
		enabled: input !== null,
		retry: false,
	})
}

export function useTranscript(id: string | null) {
	return useQuery({
		queryKey: ["transcripts", "detail", id],
		queryFn: () => fetchTranscript(id as string),
		enabled: id !== null,
		retry: false,
	})
}

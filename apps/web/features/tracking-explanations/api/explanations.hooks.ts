"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { ExplanationLanguage, SaveStatusExplanationRequest } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

export interface StatusExplanationUi {
	id: string
	statusCode: string
	language: ExplanationLanguage
	explanation: string
	nextSteps: string | null
	isActive: boolean
	createdAt: string
	updatedAt: string
}

export interface NeededExplanationUi {
	statusCode: string
	language: ExplanationLanguage
	lookups: number
	lastSeenAt: string
}

export const explanationKeys = {
	all: ["tracking-explanations"] as const,
	list: ["tracking-explanations", "list"] as const,
	needed: ["tracking-explanations", "needed"] as const,
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, {
		...init,
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
	})
	if (!response.ok) {
		let message = `Request failed (${response.status})`
		try {
			const body = (await response.json()) as { message?: string }
			message = body?.message ?? message
		} catch {
			// non-JSON error body
		}
		throw new ApiError(response.status, message)
	}
	return (await response.json()) as T
}

const noRetryOn403 = (failureCount: number, error: unknown) =>
	!(error instanceof ApiError && error.status === 403) && failureCount < 3

export function useExplanationsQuery() {
	return useQuery<StatusExplanationUi[], Error>({
		queryKey: explanationKeys.list,
		queryFn: () => apiFetch<StatusExplanationUi[]>("/tracking/explanations"),
		retry: noRetryOn403,
	})
}

export function useNeededExplanationsQuery() {
	return useQuery<NeededExplanationUi[], Error>({
		queryKey: explanationKeys.needed,
		queryFn: () => apiFetch<NeededExplanationUi[]>("/tracking/explanations/needed"),
		retry: noRetryOn403,
	})
}

export function useSaveExplanationMutation() {
	const queryClient = useQueryClient()
	return useMutation<StatusExplanationUi, Error, SaveStatusExplanationRequest>({
		mutationFn: input =>
			apiFetch<StatusExplanationUi>("/tracking/explanations", {
				method: "PUT",
				body: JSON.stringify(input),
			}),
		onSettled: () => queryClient.invalidateQueries({ queryKey: explanationKeys.all }),
	})
}

export function useDeactivateExplanationMutation() {
	const queryClient = useQueryClient()
	return useMutation<StatusExplanationUi, Error, string>({
		mutationFn: id =>
			apiFetch<StatusExplanationUi>(`/tracking/explanations/${id}/deactivate`, { method: "POST" }),
		onSettled: () => queryClient.invalidateQueries({ queryKey: explanationKeys.all }),
	})
}

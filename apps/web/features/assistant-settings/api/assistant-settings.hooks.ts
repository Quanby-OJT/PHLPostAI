"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { AssistantSettings, UpdateAssistantSettingsRequest } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`
const settingsKey = ["assistant-settings"] as const

async function fetchSettings<T>(init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE}/assistant/settings`, {
		...init,
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
	})
	if (!response.ok) {
		let message = `Request failed (${response.status})`
		try {
			const body = (await response.json()) as { message?: string }
			message = body.message ?? message
		} catch {
			// Keep the status-based error when the response has no JSON body.
		}
		throw new ApiError(response.status, message)
	}
	return (await response.json()) as T
}

export function useAssistantSettingsQuery() {
	return useQuery<AssistantSettings, Error>({
		queryKey: settingsKey,
		queryFn: () => fetchSettings<AssistantSettings>(),
		retry: (failureCount, error) =>
			!(error instanceof ApiError && error.status === 403) && failureCount < 3,
	})
}

export function useUpdateAssistantSettingsMutation() {
	const queryClient = useQueryClient()
	return useMutation<AssistantSettings, Error, UpdateAssistantSettingsRequest>({
		mutationFn: input =>
			fetchSettings<AssistantSettings>({ method: "PUT", body: JSON.stringify(input) }),
		onSuccess: settings => queryClient.setQueryData(settingsKey, settings),
	})
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { EscalationSettings, UpdateEscalationSettingsRequest } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`
const settingsKey = ["escalation-settings"] as const

async function requestSettings<T>(init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE}/assistant/escalation-settings`, {
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
			// Retain the status message when the response body is not JSON.
		}
		throw new ApiError(response.status, message)
	}
	return (await response.json()) as T
}

export function useEscalationSettingsQuery() {
	return useQuery<EscalationSettings, Error>({
		queryKey: settingsKey,
		queryFn: () => requestSettings<EscalationSettings>(),
		retry: (failureCount, error) =>
			!(error instanceof ApiError && error.status === 403) && failureCount < 3,
	})
}

export function useUpdateEscalationSettingsMutation() {
	const queryClient = useQueryClient()
	return useMutation<EscalationSettings, Error, UpdateEscalationSettingsRequest>({
		mutationFn: input =>
			requestSettings<EscalationSettings>({ method: "PUT", body: JSON.stringify(input) }),
		onSuccess: settings => queryClient.setQueryData(settingsKey, settings),
	})
}

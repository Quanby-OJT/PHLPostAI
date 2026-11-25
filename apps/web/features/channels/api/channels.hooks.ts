"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Channel, UpdateChannel } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`
type ChannelUi = Omit<Channel, "updatedAt"> & { updatedAt: string }
export const channelKeys = { all: ["channels"] as const }

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, {
		...init,
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
	})
	if (!response.ok) {
		let message = `Request failed (${response.status})`
		try {
			const body = (await response.json()) as { message?: string; error?: { message?: string } }
			message = body.message ?? body.error?.message ?? message
		} catch {
			// Keep the HTTP status as a useful fallback.
		}
		throw new ApiError(response.status, message)
	}
	return (await response.json()) as T
}

export function useChannelsQuery() {
	return useQuery({ queryKey: channelKeys.all, queryFn: () => apiFetch<ChannelUi[]>("/channels") })
}

export function useUpdateChannelMutation() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: UpdateChannel) =>
			apiFetch<ChannelUi>("/channels", { method: "PATCH", body: JSON.stringify(input) }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: channelKeys.all }),
	})
}

"use client"

import { useQuery } from "@tanstack/react-query"

import type { AnalyticsOverview } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

export function useAnalyticsOverviewQuery(enabled: boolean) {
	return useQuery({
		queryKey: ["analytics", "overview"] as const,
		enabled,
		staleTime: 15_000,
		refetchInterval: 30_000,
		queryFn: async () => {
			const response = await fetch(`${API_BASE}/analytics/overview`, {
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			})
			if (!response.ok) {
				let message = `Request failed (${response.status})`
				try {
					const body = (await response.json()) as { message?: string }
					message = body.message ?? message
				} catch {
					// Keep the HTTP status when the response has no JSON body.
				}
				throw new ApiError(response.status, message)
			}
			return (await response.json()) as AnalyticsOverview
		},
	})
}

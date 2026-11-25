"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type {
	AnalyticsDashboard,
	AnalyticsDashboardFilters,
	AnalyticsOverview,
	DashboardLayout,
} from "@repo/contracts"

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, {
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
		...init,
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
	return (await response.json()) as T
}

export function useAnalyticsDashboardQuery(filters: AnalyticsDashboardFilters, enabled: boolean) {
	return useQuery({
		queryKey: ["analytics", "dashboard", filters] as const,
		enabled,
		queryFn: () => {
			const params = new URLSearchParams({
				startDate: filters.startDate,
				endDate: filters.endDate,
				...(filters.category ? { category: filters.category } : {}),
				...(filters.language ? { language: filters.language } : {}),
				...(filters.channel ? { channel: filters.channel } : {}),
			})
			return request<AnalyticsDashboard>(`/analytics/dashboard?${params.toString()}`)
		},
	})
}

export function useDashboardLayoutQuery(enabled: boolean) {
	return useQuery({
		queryKey: ["analytics", "dashboard-layout"] as const,
		enabled,
		queryFn: () => request<DashboardLayout>("/analytics/dashboard/layout"),
	})
}

export function useSaveDashboardLayoutMutation() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (layout: DashboardLayout) =>
			request<DashboardLayout>("/analytics/dashboard/layout", {
				method: "PUT",
				body: JSON.stringify(layout),
			}),
		onSuccess: layout => {
			queryClient.setQueryData(["analytics", "dashboard-layout"], layout)
		},
	})
}

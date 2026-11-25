"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type {
	DeflectionDrilldown,
	DeflectionMethod,
	DeflectionReport,
	KpiBaseline,
	KpiDefinitionList,
} from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, {
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
		...init,
	})
	if (!response.ok) {
		let message = `Request failed (${response.status})`
		try {
			message = ((await response.json()) as { message?: string }).message ?? message
		} catch {
			/* retain status */
		}
		throw new ApiError(response.status, message)
	}
	return response.json() as Promise<T>
}

export function useDeflectionReportQuery(
	from: string,
	to: string,
	version?: number,
	enabled = true
) {
	return useQuery({
		queryKey: ["analytics", "deflection", from, to, version] as const,
		enabled,
		queryFn: () =>
			requestJson<DeflectionReport>(
				`/analytics/deflection?from=${from}&to=${to}${version ? `&version=${version}` : ""}`
			),
		retry: false,
	})
}

export function useDeflectionDrilldownQuery(
	from: string,
	to: string,
	version: number | undefined,
	enabled: boolean
) {
	return useQuery({
		queryKey: ["analytics", "deflection", "conversations", from, to, version] as const,
		enabled,
		queryFn: () =>
			requestJson<DeflectionDrilldown>(
				`/analytics/deflection/conversations?from=${from}&to=${to}${version ? `&version=${version}` : ""}`
			),
	})
}

export function useSaveKpiDefinitionMutation() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: {
			method: DeflectionMethod
			baseline: KpiBaseline | null
			target: number
			effectiveFrom: string
		}) =>
			requestJson("/analytics/kpi-definitions", { method: "POST", body: JSON.stringify(input) }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["analytics", "deflection"] })
			await queryClient.invalidateQueries({ queryKey: ["analytics", "kpi-definitions"] })
		},
	})
}

export function useKpiDefinitionsQuery() {
	return useQuery({
		queryKey: ["analytics", "kpi-definitions"] as const,
		queryFn: () => requestJson<KpiDefinitionList>("/analytics/kpi-definitions"),
	})
}

export function getManilaToday() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date())
}

export function getManilaDateTimeInput() {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date(Date.now() + 120_000))
	const part = (type: string) => parts.find(value => value.type === type)?.value ?? "00"
	return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type {
	CreateOfficialContact,
	CreateRiskIndicator,
	OfficialContact,
	RiskIndicator,
	TestScamAssessment,
	UpdateRiskIndicator,
} from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const base = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}/scam`
const indicatorsKey = ["scam", "risk-indicators"] as const
const contactsKey = ["scam", "official-contacts"] as const
const retry = (count: number, error: Error) =>
	count < 2 && !(error instanceof ApiError && [401, 403].includes(error.status))

async function request<T>(path: string, method = "GET", input?: unknown): Promise<T> {
	const response = await fetch(`${base}/${path}`, {
		method,
		cache: "no-store",
		credentials: "include",
		...(input === undefined
			? {}
			: { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
	})
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			message?: string
			error?: { message?: string }
		} | null
		throw new ApiError(
			response.status,
			body?.message ?? body?.error?.message ?? `Request failed (${response.status})`
		)
	}
	return response.json() as Promise<T>
}

export function useRiskIndicators() {
	const cache = useQueryClient()
	const refresh = () => cache.invalidateQueries({ queryKey: indicatorsKey })
	return {
		list: useQuery({
			queryKey: indicatorsKey,
			queryFn: () => request<RiskIndicator[]>("risk-indicators"),
			staleTime: 0,
			retry,
		}),
		create: useMutation({
			mutationFn: (input: CreateRiskIndicator) =>
				request<RiskIndicator>("risk-indicators", "POST", input),
			onSuccess: refresh,
		}),
		update: useMutation({
			mutationFn: (input: UpdateRiskIndicator) =>
				request<RiskIndicator>("risk-indicators", "PUT", input),
			onSuccess: refresh,
		}),
	}
}

export function useOfficialContacts() {
	const cache = useQueryClient()
	return {
		list: useQuery({
			queryKey: contactsKey,
			queryFn: () => request<OfficialContact[]>("official-contacts"),
			staleTime: 0,
			retry,
		}),
		create: useMutation({
			mutationFn: (input: CreateOfficialContact) =>
				request<OfficialContact>("official-contacts", "POST", input),
			onSuccess: () => cache.invalidateQueries({ queryKey: contactsKey }),
		}),
	}
}

export function useTestScamAssessment() {
	return useMutation({
		gcTime: 0,
		networkMode: "always",
		mutationFn: (query: string) =>
			request<TestScamAssessment>("test-assessment", "POST", { query }),
	})
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { RateCsvRequest, RatePreview, RateStatus } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

export interface RateEntryUi {
	id: string
	batchId: string
	serviceCode: string
	serviceName: string
	zone: string
	weightMinG: number
	weightMaxG: number
	priceCentavos: number
	effectiveFrom: string
	effectiveTo: string | null
	status: RateStatus
}

export interface RateBatchUi {
	id: string
	fileName: string
	rowCount: number
	status: RateStatus
	submittedBy: string | null
	reviewedBy: string | null
	reviewedAt: string | null
	reviewNote: string | null
	createdAt: string
}

export type RateBatchDetailUi = RateBatchUi & { entries: RateEntryUi[] }

export const rateKeys = {
	all: ["rates"] as const,
	entries: ["rates", "entries"] as const,
	batches: ["rates", "batches"] as const,
	queue: ["rates", "review-queue"] as const,
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

export function useRateEntriesQuery() {
	return useQuery<RateEntryUi[], Error>({
		queryKey: rateKeys.entries,
		queryFn: () => apiFetch<RateEntryUi[]>("/rates"),
		retry: noRetryOn403,
	})
}

export function useRateBatchesQuery() {
	return useQuery<RateBatchUi[], Error>({
		queryKey: rateKeys.batches,
		queryFn: () => apiFetch<RateBatchUi[]>("/rates/batches"),
		retry: noRetryOn403,
	})
}

export function useRateReviewQueueQuery() {
	return useQuery<RateBatchDetailUi[], Error>({
		queryKey: rateKeys.queue,
		queryFn: () => apiFetch<RateBatchDetailUi[]>("/rates/review-queue"),
		retry: noRetryOn403,
	})
}

export function usePreviewRatesMutation() {
	return useMutation<RatePreview, Error, RateCsvRequest>({
		mutationFn: input =>
			apiFetch<RatePreview>("/rates/batches/preview", {
				method: "POST",
				body: JSON.stringify(input),
			}),
	})
}

export function useSubmitRatesMutation() {
	const queryClient = useQueryClient()
	return useMutation<RateBatchDetailUi, Error, RateCsvRequest>({
		mutationFn: input =>
			apiFetch<RateBatchDetailUi>("/rates/batches", {
				method: "POST",
				body: JSON.stringify(input),
			}),
		onSettled: () => queryClient.invalidateQueries({ queryKey: rateKeys.all }),
	})
}

export function useApproveRateBatchMutation() {
	const queryClient = useQueryClient()
	return useMutation<RateBatchUi, Error, string>({
		mutationFn: id => apiFetch<RateBatchUi>(`/rates/batches/${id}/approve`, { method: "POST" }),
		onSettled: () => queryClient.invalidateQueries({ queryKey: rateKeys.all }),
	})
}

export function useRejectRateBatchMutation() {
	const queryClient = useQueryClient()
	return useMutation<RateBatchUi, Error, { id: string; note: string }>({
		mutationFn: ({ id, note }) =>
			apiFetch<RateBatchUi>(`/rates/batches/${id}/reject`, {
				method: "POST",
				body: JSON.stringify({ note }),
			}),
		onSettled: () => queryClient.invalidateQueries({ queryKey: rateKeys.all }),
	})
}

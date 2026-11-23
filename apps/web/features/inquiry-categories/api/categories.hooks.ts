"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { CreateInquiryCategoryRequest, UpdateInquiryCategoryRequest } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

export interface InquiryCategoryUi {
	code: string
	name: string
	isEligible: boolean
	isActive: boolean
	createdAt: string
	updatedAt: string
}

export const inquiryCategoryKeys = {
	all: ["inquiry-categories"] as const,
	list: ["inquiry-categories", "list"] as const,
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

export function useInquiryCategoriesQuery() {
	return useQuery<InquiryCategoryUi[], Error>({
		queryKey: inquiryCategoryKeys.list,
		queryFn: () => apiFetch<InquiryCategoryUi[]>("/assistant/categories"),
		retry: noRetryOn403,
	})
}

export function useCreateInquiryCategoryMutation() {
	const queryClient = useQueryClient()
	return useMutation<InquiryCategoryUi, Error, CreateInquiryCategoryRequest>({
		mutationFn: input =>
			apiFetch<InquiryCategoryUi>("/assistant/categories", {
				method: "POST",
				body: JSON.stringify(input),
			}),
		onSettled: () => queryClient.invalidateQueries({ queryKey: inquiryCategoryKeys.all }),
	})
}

export function useUpdateInquiryCategoryMutation() {
	const queryClient = useQueryClient()
	return useMutation<InquiryCategoryUi, Error, UpdateInquiryCategoryRequest>({
		mutationFn: input =>
			apiFetch<InquiryCategoryUi>("/assistant/categories", {
				method: "PUT",
				body: JSON.stringify(input),
			}),
		onSettled: () => queryClient.invalidateQueries({ queryKey: inquiryCategoryKeys.all }),
	})
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ZodType } from "zod"

import {
	ScamReportDetailSchema,
	ScamReportPageResultSchema,
	ScamReportReviewSchema,
	type ScamReportChange,
} from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}/scam/reports`
const root = ["scam-reports"] as const

async function request<T>(path: string, schema: ZodType<T>, body?: object): Promise<T> {
	const response = await fetch(BASE + path, {
		cache: "no-store",
		credentials: "include",
		...(body && {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	})
	const data: unknown = await response.json().catch(() => null)
	if (!response.ok) {
		const failure = data as { message?: string; error?: { message?: string } } | null
		throw new ApiError(
			response.status,
			failure?.message ?? failure?.error?.message ?? `Request failed (${response.status})`
		)
	}
	return schema.parse(data)
}

const retry = (count: number, error: Error) =>
	count < 2 && !(error instanceof ApiError && error.status < 500)

export function useScamReportQueue(page: number) {
	return useQuery({
		queryKey: [...root, "queue", page],
		queryFn: () => request(`?page=${page}`, ScamReportPageResultSchema),
		staleTime: 0,
		retry,
	})
}

export function useScamReportDetail(id: string) {
	return useQuery({
		queryKey: [...root, "detail", id],
		queryFn: () => request(`/${id}`, ScamReportDetailSchema),
		staleTime: 0,
		retry,
	})
}

export function useChangeScamReport() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: ({ id, ...body }: ScamReportChange) =>
			request(`/${id}/review`, ScamReportReviewSchema, body),
		gcTime: 0,
		onSettled: async (_data, error) => {
			if (error && !(error instanceof ApiError && error.status === 409)) return
			await client.invalidateQueries({ queryKey: root })
		},
	})
}

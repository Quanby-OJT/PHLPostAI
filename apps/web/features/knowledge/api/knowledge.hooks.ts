"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type {
	CreateKnowledgeArticleRequest,
	KnowledgeArticleStatus,
	KnowledgeExtractResponse,
	KnowledgeLanguage,
	KnowledgeTransitionResponse,
	KnowledgeVersionStatus,
	SaveKnowledgeDraftRequest,
	UpdateKnowledgeArticleRequest,
} from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"
import { env } from "@/env"

const API_BASE = `${env.NEXT_PUBLIC_API_BASE_URL}/${env.NEXT_PUBLIC_API_VERSION}`

/** Mirrors the gateway limit (25 MB) for a friendly client-side hint. */
export const MAX_EXTRACT_BYTES = 25 * 1024 * 1024

/** DOCX, PDF, or HTML seeds a draft (KB-1). Extensions cover empty File.type. */
export const EXTRACT_ACCEPT = [
	"application/pdf",
	"text/html",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".pdf",
	".html",
	".htm",
	".docx",
].join(",")

// UI-facing shapes: dates arrive as ISO strings over JSON.
export interface KnowledgeVersionUi {
	id: string
	articleId: string
	version: number
	body: string
	language: KnowledgeLanguage
	status: KnowledgeVersionStatus
	submittedBy: string | null
	approvedBy: string | null
	approvedAt: string | null
	documentId: string | null
	reviewNote: string | null
	indexing: boolean
	indexError: string | null
	createdAt: string
	updatedAt: string
}

interface VersionRefUi {
	id: string
	version: number
	status: KnowledgeVersionStatus
}

export interface KnowledgeArticleSummaryUi {
	id: string
	title: string
	category: string
	languages: KnowledgeLanguage[]
	status: KnowledgeArticleStatus
	currentVersion: VersionRefUi | null
	latestVersion: VersionRefUi | null
	updatedAt: string
}

export interface KnowledgeArticleDetailUi extends KnowledgeArticleSummaryUi {
	createdAt: string
	versions: KnowledgeVersionUi[]
}

export interface KnowledgeReviewItemUi {
	version: KnowledgeVersionUi
	article: {
		id: string
		title: string
		category: string
		languages: KnowledgeLanguage[]
		status: KnowledgeArticleStatus
	}
	currentApproved: KnowledgeVersionUi | null
}

export const knowledgeKeys = {
	all: ["knowledge"] as const,
	articles: ["knowledge", "articles"] as const,
	article: (id: string) => ["knowledge", "articles", id] as const,
	reviewQueue: ["knowledge", "review-queue"] as const,
}

export function isPermissionError(error: unknown): boolean {
	return error instanceof ApiError && error.status === 403
}

async function parseError(response: Response): Promise<ApiError> {
	let message = `Request failed (${response.status})`
	try {
		const body = (await response.json()) as { message?: string; error?: { message?: string } }
		message = body?.message ?? body?.error?.message ?? message
	} catch {
		// ignore non-JSON error bodies
	}
	return new ApiError(response.status, message)
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, {
		...init,
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as T
}

const noRetryOn403 = (failureCount: number, error: unknown) =>
	!isPermissionError(error) && failureCount < 3

export function useKnowledgeArticlesQuery(enabled = true) {
	return useQuery({
		queryKey: knowledgeKeys.articles,
		queryFn: () => apiFetch<KnowledgeArticleSummaryUi[]>("/knowledge/articles"),
		enabled,
		retry: noRetryOn403,
	})
}

export function useKnowledgeArticleQuery(id: string | null) {
	return useQuery({
		queryKey: knowledgeKeys.article(id ?? "none"),
		queryFn: () => apiFetch<KnowledgeArticleDetailUi>(`/knowledge/articles/${id}`),
		enabled: id !== null,
		retry: noRetryOn403,
		// Approval indexes in the background: poll until indexing settles.
		refetchInterval: query =>
			query.state.data?.versions.some(version => version.indexing) ? 3000 : false,
	})
}

export function useKnowledgeReviewQueueQuery(enabled = true) {
	return useQuery({
		queryKey: knowledgeKeys.reviewQueue,
		queryFn: () => apiFetch<KnowledgeReviewItemUi[]>("/knowledge/review-queue"),
		enabled,
		retry: noRetryOn403,
		refetchInterval: query =>
			query.state.data?.some(item => item.version.indexing) ? 3000 : false,
	})
}

/** Every knowledge mutation refreshes all knowledge screens. */
function useKnowledgeMutation<TInput, TOutput>(
	key: string,
	mutationFn: (input: TInput) => Promise<TOutput>
) {
	const queryClient = useQueryClient()
	return useMutation<TOutput, Error, TInput>({
		mutationKey: ["knowledge", key],
		mutationFn,
		onSettled: () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.all }),
	})
}

export function useCreateArticleMutation() {
	return useKnowledgeMutation("create", (input: CreateKnowledgeArticleRequest) =>
		apiFetch<KnowledgeArticleDetailUi>("/knowledge/articles", {
			method: "POST",
			body: JSON.stringify(input),
		})
	)
}

export function useUpdateArticleMutation() {
	return useKnowledgeMutation("update", ({ id, ...changes }: UpdateKnowledgeArticleRequest) =>
		apiFetch<KnowledgeArticleDetailUi>(`/knowledge/articles/${id}`, {
			method: "PATCH",
			body: JSON.stringify(changes),
		})
	)
}

export function useSaveDraftMutation() {
	return useKnowledgeMutation("save-draft", ({ id, ...draft }: SaveKnowledgeDraftRequest) =>
		apiFetch<KnowledgeArticleDetailUi>(`/knowledge/articles/${id}/draft`, {
			method: "PUT",
			body: JSON.stringify(draft),
		})
	)
}

export function useSubmitVersionMutation() {
	return useKnowledgeMutation("submit", (versionId: string) =>
		apiFetch<KnowledgeTransitionResponse>(`/knowledge/versions/${versionId}/submit`, {
			method: "POST",
		})
	)
}

export function useApproveVersionMutation() {
	return useKnowledgeMutation("approve", (versionId: string) =>
		apiFetch<KnowledgeTransitionResponse>(`/knowledge/versions/${versionId}/approve`, {
			method: "POST",
		})
	)
}

export function useReturnVersionMutation() {
	return useKnowledgeMutation("return", ({ id, note }: { id: string; note: string }) =>
		apiFetch<KnowledgeTransitionResponse>(`/knowledge/versions/${id}/return`, {
			method: "POST",
			body: JSON.stringify({ note }),
		})
	)
}

export function useDeactivateArticleMutation() {
	return useKnowledgeMutation("deactivate", (articleId: string) =>
		apiFetch<{ id: string; status: "deactivated"; cacheCleared: boolean }>(
			`/knowledge/articles/${articleId}/deactivate`,
			{ method: "POST" }
		)
	)
}

// Multipart POST: the browser sets the multipart boundary itself.
async function extractText(file: File): Promise<KnowledgeExtractResponse> {
	const form = new FormData()
	form.append("file", file)
	const response = await fetch(`${API_BASE}/knowledge/extract`, {
		method: "POST",
		credentials: "include",
		body: form,
	})
	if (!response.ok) throw await parseError(response)
	return (await response.json()) as KnowledgeExtractResponse
}

export function useExtractTextMutation() {
	return useMutation<KnowledgeExtractResponse, Error, File>({
		mutationKey: ["knowledge", "extract"],
		mutationFn: extractText,
	})
}

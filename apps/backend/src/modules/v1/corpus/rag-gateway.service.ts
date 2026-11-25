import {
	BadGatewayException,
	GatewayTimeoutException,
	HttpException,
	Injectable,
} from "@nestjs/common"
import { createHmac } from "node:crypto"
import { ORPCError } from "@orpc/server"

import { env } from "@/config/env.config"

/**
 * Map an upstream HttpException onto the oRPC error vocabulary so oRPC
 * handlers return the real status instead of a generic 500. Plain Nest
 * routes keep throwing HttpException directly.
 */
export function toORPCError(error: unknown): never {
	if (error instanceof HttpException) {
		const status = error.getStatus()
		const code =
			status === 401
				? ("UNAUTHORIZED" as const)
				: status === 403
					? ("FORBIDDEN" as const)
					: status === 404
						? ("NOT_FOUND" as const)
						: status === 409
							? ("CONFLICT" as const)
							: status === 429
								? ("TOO_MANY_REQUESTS" as const)
								: status >= 400 && status < 500
									? ("BAD_REQUEST" as const)
									: ("INTERNAL_SERVER_ERROR" as const)
		throw new ORPCError(code, { message: error.message })
	}
	throw error
}

/** Principal + correlation context carried by the service JWT (Tech Plan §5, D4). */
export interface ServiceTokenClaims {
	sub: string
	permissions: readonly string[]
	requestId: string
	traceId: string
	/**
	 * The audit actorType the RAG service records for this principal. Defaults
	 * to "user"; CNV-1 passes "customer" so a public turn is never attributed
	 * to a staff account in the audit spine.
	 */
	actorType?: "user" | "customer"
}

export interface IngestForwardInput {
	buffer: Buffer
	filename: string
	contentType: string
	userId: string
	permissions: readonly string[]
	requestId: string
	traceId: string
}

export interface ChatForwardInput {
	query: string
	k?: number
	/** CH-3: continue an existing conversation the caller owns. */
	conversationId?: string
	/** RT-4: metadata filter forwarded verbatim to the RAG service. */
	filters?: Record<string, unknown>
	userId: string
	permissions: readonly string[]
	requestId: string
	traceId: string
	/** See ServiceTokenClaims.actorType. */
	actorType?: "user" | "customer"
	/**
	 * CNV-1: when false the RAG service answers WITHOUT writing
	 * conversations/messages, because the public path's rows are owned by
	 * `ConversationService` (and a customer has no `users` row to key them to).
	 * Omitted means the template behaviour: the RAG service persists.
	 */
	persist?: boolean
	/** CNV-4: the reply language, the detected question language and the untranslated terms. */
	language?: string
	queryLanguage?: string
	glossary?: readonly string[]
	/** CNV-3: the routine-answer limit for an eligible category. */
	maxOutputTokens?: number
}

function base64UrlJson(value: unknown): string {
	return Buffer.from(JSON.stringify(value)).toString("base64url")
}

/**
 * Gateway -> Python RAG service transport (Tech Plan §5, D4).
 *
 * Mints a short-lived HS256 service JWT (shared RAG_SERVICE_TOKEN_SECRET)
 * carrying the acting user + permissions + correlation ids, and forwards the
 * uploaded PDF as multipart via undici's fetch/FormData (Node's built-ins).
 * Every call is wrapped in AbortSignal.timeout(...) — the gateway mirror of
 * the Python service's hard-timeout helper.
 */
@Injectable()
export class RagGatewayService {
	/**
	 * HS256 JWT signed with RAG_SERVICE_TOKEN_SECRET. Hand-rolled signing (no
	 * verification/parsing on this side) keeps the gateway dependency-free; the
	 * Python service verifies signature + expiry with PyJWT.
	 */
	mintServiceToken(claims: ServiceTokenClaims): string {
		const nowSeconds = Math.floor(Date.now() / 1000)
		const header = base64UrlJson({ alg: "HS256", typ: "JWT" })
		const payload = base64UrlJson({
			sub: claims.sub,
			permissions: claims.permissions,
			requestId: claims.requestId,
			traceId: claims.traceId,
			// The audit actorType the RAG service records for this principal.
			actorType: claims.actorType ?? "user",
			iat: nowSeconds,
			exp: nowSeconds + env.RAG_SERVICE_TOKEN_TTL_SECONDS,
		})
		const signature = createHmac("sha256", env.RAG_SERVICE_TOKEN_SECRET)
			.update(`${header}.${payload}`)
			.digest("base64url")
		return `${header}.${payload}.${signature}`
	}

	/** Forward one validated PDF to POST {RAG_SERVICE_URL}/internal/ingest. */
	async ingestDocument(input: IngestForwardInput): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
		})

		const form = new FormData()
		form.append(
			"file",
			new Blob([new Uint8Array(input.buffer)], { type: input.contentType }),
			input.filename
		)

		return this.forward("/internal/ingest", {
			headers: {
				"authorization": `Bearer ${token}`,
				"x-request-id": input.requestId,
			},
			body: form,
			failureMessage: "RAG ingest failed",
		})
	}

	/**
	 * Forward one chat query (JSON, non-streamed — Tech Plan §5 D3; streaming
	 * is GN-3) to POST {RAG_SERVICE_URL}/internal/chat with the caller's
	 * principal + permissions in the service JWT.
	 */
	async submitChatQuery(input: ChatForwardInput): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
			actorType: input.actorType,
		})

		return this.forward("/internal/chat", {
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({
				query: input.query,
				...(input.k !== undefined && { k: input.k }),
				...(input.conversationId !== undefined && { conversationId: input.conversationId }),
				...(input.filters !== undefined && { filters: input.filters }),
				...(input.persist !== undefined && { persist: input.persist }),
				...(input.language !== undefined && { language: input.language }),
				...(input.queryLanguage !== undefined && { queryLanguage: input.queryLanguage }),
				...(input.glossary !== undefined && { glossary: input.glossary }),
				...(input.maxOutputTokens !== undefined && { maxOutputTokens: input.maxOutputTokens }),
			}),
			failureMessage: "RAG chat failed",
		})
	}

	/** TRK-1: screen a question without answering it. A blocked question is a 400. */
	async screenQuery(input: {
		query: string
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
		actorType?: "user" | "customer"
	}): Promise<{ screenedQuery: string }> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
			actorType: input.actorType,
		})
		const body = (await this.forward("/internal/chat/screen", {
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({ query: input.query }),
			failureMessage: "Question screening failed",
		})) as { screenedQuery?: unknown } | null
		if (typeof body?.screenedQuery !== "string") {
			throw new BadGatewayException("Question screening failed")
		}
		return { screenedQuery: body.screenedQuery }
	}

	/**
	 * Re-run a finished ingestion job (IN-7): POST
	 * {RAG_SERVICE_URL}/internal/jobs/{id}/rerun. The Python side requeues the
	 * job (409 when it isn't re-runnable) and enqueues the arq task.
	 */
	async rerunJob(input: {
		jobId: string
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
	}): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
		})

		return this.forward(`/internal/jobs/${input.jobId}/rerun`, {
			headers: {
				"authorization": `Bearer ${token}`,
				"x-request-id": input.requestId,
			},
			body: "",
			failureMessage: "RAG job re-run failed",
		})
	}

	/**
	 * Run the REAL hybrid retrieval pipeline (EV-1 chunk picker, EV-2 harness):
	 * POST {RAG_SERVICE_URL}/internal/retrieve. Returns fused top-k chunks
	 * including each chunk's content hash (the golden-set binding key).
	 */
	async retrieveChunks(input: {
		query: string
		k?: number
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
	}): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
		})

		return this.forward("/internal/retrieve", {
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({
				query: input.query,
				...(input.k !== undefined && { k: input.k }),
			}),
			failureMessage: "RAG retrieval failed",
		})
	}

	/**
	 * Execute a retrieval eval run (EV-2): POST
	 * {RAG_SERVICE_URL}/internal/eval/retrieval. The Python runner scores the
	 * REAL retrieval pipeline against the golden set and persists eval_runs;
	 * an empty/fully-stale set surfaces as 409 (fail loud).
	 */
	async executeRetrievalEval(input: {
		k?: number
		vectorWeight?: number
		keywordWeight?: number
		rerank?: boolean
		generation?: boolean
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
	}): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
		})

		return this.forward("/internal/eval/retrieval", {
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({
				...(input.k !== undefined && { k: input.k }),
				...(input.vectorWeight !== undefined && { vectorWeight: input.vectorWeight }),
				...(input.keywordWeight !== undefined && { keywordWeight: input.keywordWeight }),
				...(input.rerank !== undefined && { rerank: input.rerank }),
				...(input.generation !== undefined && { generation: input.generation }),
			}),
			failureMessage: "RAG eval run failed",
		})
	}

	/**
	 * OB-5: effective configuration (read-only; secrets masked SERVER-side
	 * in the Python service): GET {RAG_SERVICE_URL}/internal/config.
	 */
	async fetchConfig(input: {
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
	}): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
		})
		return this.forward("/internal/config", {
			method: "GET",
			headers: {
				"authorization": `Bearer ${token}`,
				"x-request-id": input.requestId,
			},
			failureMessage: "RAG config fetch failed",
		})
	}

	/** RP-6: render already-computed report rows as xlsx/pdf (openpyxl /
	 * reportlab live in the Python service; the framework stays here). */
	async renderReport(input: {
		title: string
		columns: { key: string; label: string }[]
		rows: Record<string, unknown>[]
		format: string
		userId: string
		requestId: string
	}): Promise<{ contentBase64: string; contentType: string }> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: [],
			requestId: input.requestId,
			traceId: input.requestId,
		})
		return (await this.forward("/internal/reports/render", {
			method: "POST",
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({
				title: input.title,
				columns: input.columns,
				rows: input.rows,
				format: input.format,
			}),
			failureMessage: "Report rendering failed",
		})) as { contentBase64: string; contentType: string }
	}

	/** IN-8 (Flow D): re-embed lifecycle forwards. */
	async reembed(input: {
		action: "start" | "status" | "cutover" | "abort"
		targetModel?: string
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
	}): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
		})
		const path =
			input.action === "start" || input.action === "status"
				? "/internal/reembed"
				: `/internal/reembed/${input.action}`
		return this.forward(path, {
			method: input.action === "status" ? "GET" : "POST",
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body:
				input.action === "start"
					? JSON.stringify({ targetModel: input.targetModel })
					: input.action === "status"
						? undefined
						: "{}",
			failureMessage: "RAG re-embed call failed",
		})
	}

	/**
	 * CE-8: fetch a stored page image (binary) from
	 * GET {RAG_SERVICE_URL}/internal/page-images/{id}. Returns the bytes +
	 * content type for the controller to stream to the browser.
	 */
	async fetchPageImage(input: {
		imageId: string
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
	}): Promise<{ body: Buffer; contentType: string }> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
		})
		let response: Response
		try {
			response = await fetch(
				`${env.RAG_SERVICE_URL}/internal/page-images/${encodeURIComponent(input.imageId)}`,
				{
					method: "GET",
					headers: {
						"authorization": `Bearer ${token}`,
						"x-request-id": input.requestId,
					},
					signal: AbortSignal.timeout(env.RAG_SERVICE_TIMEOUT_MS),
				}
			)
		} catch (error) {
			if ((error as { name?: string } | null)?.name === "TimeoutError") {
				throw new GatewayTimeoutException(
					`RAG service did not respond within ${env.RAG_SERVICE_TIMEOUT_MS}ms`
				)
			}
			throw new BadGatewayException("RAG service is unreachable")
		}
		if (!response.ok) {
			if (response.status >= 400 && response.status < 500) {
				throw new HttpException("Page image not found", response.status)
			}
			throw new BadGatewayException("RAG page-image fetch failed")
		}
		return {
			body: Buffer.from(await response.arrayBuffer()),
			contentType: response.headers.get("content-type") ?? "image/png",
		}
	}

	/**
	 * KB-1: normalize an uploaded DOCX/PDF/HTML file with the template loaders
	 * and return its text, WITHOUT ingesting it (it seeds a draft only):
	 * POST {RAG_SERVICE_URL}/internal/knowledge/extract.
	 */
	async extractText(input: IngestForwardInput): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
		})
		const form = new FormData()
		form.append(
			"file",
			new Blob([new Uint8Array(input.buffer)], { type: input.contentType }),
			input.filename
		)
		return this.forward("/internal/knowledge/extract", {
			headers: { "authorization": `Bearer ${token}`, "x-request-id": input.requestId },
			body: form,
			failureMessage: "Text extraction failed",
		})
	}

	/**
	 * KB-1 (Flow E): clear the response cache by bumping the corpus generation
	 * (CP-2): POST {RAG_SERVICE_URL}/internal/cache/invalidate. Throws when the
	 * cache could not be cleared, so callers can refuse to commit.
	 */
	async invalidateResponseCache(input: {
		userId: string
		permissions: readonly string[]
		requestId: string
		reason: string
	}): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.requestId,
		})
		return this.forward("/internal/cache/invalidate", {
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({ reason: input.reason }),
			failureMessage: "Response cache invalidation failed",
		})
	}

	/**
	 * KB-1: de-index a retired document through the ingestion service (its
	 * chunks are deleted there; this module never writes chunks):
	 * POST {RAG_SERVICE_URL}/internal/documents/{id}/deindex.
	 */
	async deindexDocument(input: {
		documentId: string
		userId: string
		permissions: readonly string[]
		requestId: string
	}): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.requestId,
		})
		return this.forward(`/internal/documents/${encodeURIComponent(input.documentId)}/deindex`, {
			headers: { "authorization": `Bearer ${token}`, "x-request-id": input.requestId },
			body: "",
			failureMessage: "Document de-index failed",
		})
	}

	/**
	 * CNV-2: screen the question and classify the screened text in one call.
	 * A blocked question is a 400; a model failure comes back as `fallbackUsed`.
	 */
	async classifyInquiry(input: {
		query: string
		modelQuery?: string
		categories: readonly { code: string; name: string }[]
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
		actorType?: "user" | "customer"
	}): Promise<{
		screenedQuery: string
		category: string
		language: string | null
		fallbackUsed: boolean
	}> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
			actorType: input.actorType,
		})
		const body = (await this.forward("/internal/chat/classify", {
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({
				query: input.query,
				modelQuery: input.modelQuery,
				categories: input.categories,
			}),
			failureMessage: "Inquiry classification failed",
		})) as {
			screenedQuery?: unknown
			category?: unknown
			language?: unknown
			fallbackUsed?: unknown
		} | null
		if (typeof body?.screenedQuery !== "string") {
			throw new BadGatewayException("Inquiry classification failed")
		}
		return {
			screenedQuery: body.screenedQuery,
			category: typeof body.category === "string" ? body.category : "other",
			language: typeof body.language === "string" ? body.language : null,
			fallbackUsed: body.fallbackUsed === true,
		}
	}

	/** SCM-1: assess a link-redacted submission using the internal provider. */
	async assessScam(input: {
		query: string
		approvedIndicators: readonly string[]
		deterministicIndicators: readonly string[]
		userId: string
		permissions: readonly string[]
		requestId: string
	}): Promise<unknown> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.requestId,
			actorType: "customer",
		})
		return this.forward("/internal/scam/assess", {
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({
				query: input.query,
				approvedIndicators: input.approvedIndicators,
				deterministicIndicators: input.deterministicIndicators,
			}),
			failureMessage: "Scam assessment failed",
		})
	}

	/** KB-2: read service, zone and weight from a screened rates question. */
	async extractRateQuery(input: {
		text: string
		services: readonly { code: string; name: string }[]
		zones: readonly string[]
		userId: string
		permissions: readonly string[]
		requestId: string
		traceId: string
	}): Promise<{ serviceCode: string | null; zone: string | null; weightG: number | null }> {
		const token = this.mintServiceToken({
			sub: input.userId,
			permissions: input.permissions,
			requestId: input.requestId,
			traceId: input.traceId,
			actorType: "customer",
		})
		const body = (await this.forward("/internal/rates/extract", {
			headers: {
				"authorization": `Bearer ${token}`,
				"content-type": "application/json",
				"x-request-id": input.requestId,
			},
			body: JSON.stringify({ text: input.text, services: input.services, zones: input.zones }),
			failureMessage: "Rate question extraction failed",
		})) as { serviceCode?: unknown; zone?: unknown; weightG?: unknown } | null
		return {
			serviceCode: typeof body?.serviceCode === "string" ? body.serviceCode : null,
			zone: typeof body?.zone === "string" ? body.zone : null,
			weightG: typeof body?.weightG === "number" ? body.weightG : null,
		}
	}

	/** Shared transport: hard timeout + uniform error mapping. */
	private async forward(
		path: string,
		options: {
			headers: Record<string, string>
			body?: FormData | string
			method?: "GET" | "POST"
			failureMessage: string
		}
	): Promise<unknown> {
		let response: Response
		try {
			response = await fetch(`${env.RAG_SERVICE_URL}${path}`, {
				method: options.method ?? "POST",
				headers: options.headers,
				body: options.body,
				signal: AbortSignal.timeout(env.RAG_SERVICE_TIMEOUT_MS),
			})
		} catch (error) {
			// AbortSignal.timeout rejects with a DOMException named "TimeoutError"
			// (DOMException does NOT extend Error, so match on the name only).
			if ((error as { name?: string } | null)?.name === "TimeoutError") {
				throw new GatewayTimeoutException(
					`RAG service did not respond within ${env.RAG_SERVICE_TIMEOUT_MS}ms`
				)
			}
			throw new BadGatewayException("RAG service is unreachable")
		}

		const body = (await response.json().catch(() => null)) as {
			detail?: unknown
			message?: unknown
		} | null

		if (!response.ok) {
			const detail = body?.detail ?? body?.message
			const message = typeof detail === "string" ? detail : options.failureMessage
			// Client-class errors from the Python defensive re-checks pass through;
			// service failures surface as 502.
			if (response.status >= 400 && response.status < 500) {
				throw new HttpException(message, response.status)
			}
			throw new BadGatewayException(message)
		}

		return body
	}
}

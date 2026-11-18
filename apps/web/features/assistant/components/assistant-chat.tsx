"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { CustomerAnswer, CustomerAnswerSource } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"

import {
	SESSION_STORAGE_KEY,
	startSession,
	streamQuestion,
	type StoredSession,
} from "../api/assistant.client"

interface Turn {
	sender: "customer" | "assistant"
	content: string
	sources?: CustomerAnswerSource[]
	/** Set once the final frame lands; `uncertain` and `refusal` are not failures. */
	answerKind?: CustomerAnswer["answerKind"]
	streaming?: boolean
}

function readStoredSession(): StoredSession | null {
	try {
		const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
		if (!raw) return null
		const stored = JSON.parse(raw) as StoredSession
		// Don't bother sending a token we already know has lapsed.
		if (new Date(stored.idleExpiresAt).getTime() <= Date.now()) return null
		return stored
	} catch {
		return null
	}
}

function storeSession(session: StoredSession): void {
	window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

/**
 * The plain public chat page (CNV-1 in scope: "a plain chat page at
 * /assistant to exercise it end to end"). Deliberately unstyled beyond the
 * basics — the presentable widget is CHN-1.
 *
 * Two behaviours here are acceptance criteria rather than polish: the answer
 * renders as it streams, and the articles behind it are named underneath
 * (AC1). A grounded "I don't have that information" (AC2) and a screening
 * refusal (AC4) are shown as ordinary assistant replies, because to the
 * customer they are answers, not errors.
 */
export function AssistantChat() {
	const [turns, setTurns] = useState<Turn[]>([])
	const [question, setQuestion] = useState("")
	const [conversationId, setConversationId] = useState<string | undefined>()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const endRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [turns])

	/** The stored session, or a freshly opened one. */
	const ensureSession = useCallback(async (forceNew = false): Promise<string> => {
		if (!forceNew) {
			const stored = readStoredSession()
			if (stored) return stored.sessionToken
		}
		const session = await startSession()
		storeSession({ sessionToken: session.sessionToken, idleExpiresAt: session.idleExpiresAt })
		return session.sessionToken
	}, [])

	const appendFinal = useCallback((final: CustomerAnswer) => {
		setConversationId(final.conversationId)
		setTurns(previous => {
			const next = [...previous]
			next[next.length - 1] = {
				sender: "assistant",
				content: final.answer,
				sources: final.sources,
				answerKind: final.answerKind,
				streaming: false,
			}
			return next
		})
	}, [])

	const ask = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault()
			const asked = question.trim()
			if (!asked || busy) return

			setQuestion("")
			setError(null)
			setBusy(true)
			setTurns(previous => [
				...previous,
				{ sender: "customer", content: asked },
				{ sender: "assistant", content: "", streaming: true },
			])

			const handlers = {
				onToken: (delta: string) =>
					setTurns(previous => {
						const next = [...previous]
						const last = next[next.length - 1]
						if (last) next[next.length - 1] = { ...last, content: last.content + delta }
						return next
					}),
				onFinal: appendFinal,
			}

			try {
				const token = await ensureSession()
				try {
					await streamQuestion({ query: asked, conversationId }, token, handlers)
				} catch (streamError) {
					// An idle-expired or unknown session is recoverable exactly once:
					// open a new session and ask again. A second 401 is a real error.
					if (streamError instanceof ApiError && streamError.status === 401) {
						const freshToken = await ensureSession(true)
						setConversationId(undefined)
						await streamQuestion({ query: asked }, freshToken, handlers)
					} else {
						throw streamError
					}
				}
			} catch (caught) {
				setError(
					caught instanceof ApiError
						? caught.message
						: "The assistant is unavailable. Please try again."
				)
				setTurns(previous => previous.slice(0, -1))
			} finally {
				setBusy(false)
			}
		},
		[appendFinal, busy, conversationId, ensureSession, question]
	)

	return (
		<div className="mx-auto flex h-screen max-w-3xl flex-col gap-4 p-4">
			<header className="border-b pb-3">
				<h1 className="text-xl font-semibold">PHLPost Assistant</h1>
				<p className="text-muted-foreground text-sm">
					Answers come from PHLPost&apos;s approved information.
				</p>
			</header>

			<div className="flex-1 space-y-4 overflow-y-auto" aria-live="polite">
				{turns.length === 0 ? (
					<p className="text-muted-foreground mt-16 text-center text-sm">
						Ask a question about PHLPost services.
					</p>
				) : (
					turns.map((turn, index) => (
						<div
							key={index}
							className={`flex ${turn.sender === "customer" ? "justify-end" : "justify-start"}`}
						>
							<div
								className={`max-w-prose rounded-lg px-4 py-2 text-sm ${
									turn.sender === "customer"
										? "bg-primary text-primary-foreground"
										: "bg-muted border"
								}`}
							>
								<p className="whitespace-pre-wrap">
									{turn.content}
									{turn.streaming && turn.content === "" ? "…" : null}
								</p>

								{turn.sources && turn.sources.length > 0 ? (
									<div className="mt-3 border-t pt-2">
										<p className="text-muted-foreground text-xs font-medium">
											From these PHLPost articles:
										</p>
										<ul className="mt-1 list-inside list-disc text-xs">
											{turn.sources.map(source => (
												<li key={source.articleId}>{source.title}</li>
											))}
										</ul>
									</div>
								) : null}
							</div>
						</div>
					))
				)}
				<div ref={endRef} />
			</div>

			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}

			<form onSubmit={ask} className="flex gap-2 border-t pt-3">
				<label className="sr-only" htmlFor="assistant-question">
					Your question
				</label>
				<input
					id="assistant-question"
					value={question}
					onChange={event => setQuestion(event.target.value)}
					placeholder="How much does Express Mail cost?"
					className="flex-1 rounded-lg border px-4 py-2 text-sm"
					disabled={busy}
				/>
				<button
					type="submit"
					className="bg-primary text-primary-foreground rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50"
					disabled={busy || question.trim() === ""}
				>
					{busy ? "Asking…" : "Ask"}
				</button>
			</form>
		</div>
	)
}

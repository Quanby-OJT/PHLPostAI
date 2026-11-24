"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { CUSTOMER_LANGUAGES, type CustomerAnswer, type CustomerAnswerSource, type CustomerLanguage } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"

import {
	RateLimitedError,
	requestHumanHandoff,
	SESSION_STORAGE_KEY,
	startSession,
	streamQuestion,
	type StoredSession,
} from "../api/assistant.client"

/** TODO(CHN-1): replace with PHLPost's real privacy notice URL. */
const PRIVACY_NOTICE_URL = "/privacy"

/** Per-tab chat state (CHN-1: the Conversation continues across page loads in one tab). */
const CHAT_STORAGE_KEY = "phlpost.assistant.chat"

const LANGUAGE_LABELS: Record<CustomerLanguage, string> = {
  en: "English",
  fil: "Filipino",
  ceb: "Cebuano",
  ilo: "Ilocano",
}

interface Turn {
	sender: "customer" | "assistant"
	content: string
	sources?: CustomerAnswerSource[]
	/** Set once the final frame lands; `uncertain` and `refusal` are not failures. */
	answerKind?: CustomerAnswer["answerKind"]
	streaming?: boolean
}

interface StoredChat {
	accepted: boolean
	conversationId?: string
	turns: Turn[]
	handoffDone?: boolean
}

function readStoredSession(): StoredSession | null {
	try {
		const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
		if (!raw) return null
		const stored = JSON.parse(raw) as StoredSession
		return stored
	} catch {
		return null
	}
}

function storeSession(session: StoredSession): void {
	try {
		window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
	} catch {
		// Storage can be unavailable; the chat still works, it just won't survive a reload.
	}
}

function readStoredChat(): StoredChat | null {
	try {
		const raw = window.sessionStorage.getItem(CHAT_STORAGE_KEY)
		return raw ? (JSON.parse(raw) as StoredChat) : null
	} catch {
		return null
	}
}

function storeChat(chat: StoredChat): void {
	try {
		window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chat))
	} catch {
		// See storeSession.
	}
}

/**
 * The public customer chat widget (CHN-1).
 *
 * Acceptance criteria handled here: the AI notice and privacy link come before
 * the first message can be sent; the answer renders as it streams; the
 * conversation survives a reload in the same tab; a 429 becomes a "please
 * wait" notice with a countdown. A grounded "I don't have that information"
 * and a screening refusal are shown as ordinary assistant replies.
 */
export function AssistantChat() {
	const [ready, setReady] = useState(false)
	const [accepted, setAccepted] = useState(false)
	const [turns, setTurns] = useState<Turn[]>([])
	const [question, setQuestion] = useState("")
	const [conversationId, setConversationId] = useState<string | undefined>()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [waitSeconds, setWaitSeconds] = useState(0)
	const [handoffDone, setHandoffDone] = useState(false)
	const [handoffReason, setHandoffReason] = useState("I want to speak with a person")
	const [handoffBusy, setHandoffBusy] = useState(false)
	const [language, setLanguage] = useState<CustomerLanguage>("en")
	const endRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	// Restore this tab's chat after mount (not during render, to avoid a hydration mismatch).
	useEffect(() => {
		const stored = readStoredChat()
		if (stored) {
			setAccepted(stored.accepted)
			setConversationId(stored.conversationId)
			setTurns(stored.turns.filter(turn => !turn.streaming))
			setHandoffDone(stored.handoffDone ?? false)
		}
		const saved = readStoredSession()
		if (saved?.language) setLanguage(saved.language)
		setReady(true)
	}, [])

	// Save the chat whenever a turn settles.
	useEffect(() => {
		if (!ready || busy) return
		storeChat({ accepted, conversationId, turns, handoffDone })
	}, [accepted, busy, conversationId, handoffDone, ready, turns])

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
	}, [turns])

	// "Please wait" countdown.
	useEffect(() => {
		if (waitSeconds <= 0) return
		const timer = window.setInterval(() => {
			setWaitSeconds(seconds => Math.max(0, seconds - 1))
		}, 1000)
		return () => window.clearInterval(timer)
	}, [waitSeconds > 0]) // eslint-disable-line react-hooks/exhaustive-deps

	// Keep keyboard focus in the box: after accepting, and after each answer.
	useEffect(() => {
		if (accepted && !busy && waitSeconds === 0) inputRef.current?.focus()
	}, [accepted, busy, waitSeconds])

	/** The stored session, or a freshly opened one. */
		const ensureSession = useCallback(
			async (forceNew = false, targetLanguage: CustomerLanguage = language): Promise<string> => {
				if (!forceNew) {
					const stored = readStoredSession()
					if (stored && (!stored.language || stored.language === targetLanguage)) return stored.sessionToken
				}
				const session = await startSession(targetLanguage)
				storeSession({ sessionToken: session.sessionToken, idleExpiresAt: session.idleExpiresAt, language: targetLanguage })
				return session.sessionToken
			},
			[language]
		)

		const handleLanguageChange = useCallback(
			async (nextLanguage: CustomerLanguage) => {
				setLanguage(nextLanguage)
				setError(null)
				const stored = readStoredSession()
				if (stored) storeSession({ ...stored, language: nextLanguage })
				if (accepted && !busy) {
					try {
						await ensureSession(true, nextLanguage)
						setConversationId(undefined)
					} catch {}
				}
			},
			[accepted, busy, ensureSession]
		)

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
			if (!accepted || !asked || busy || waitSeconds > 0 || handoffDone) return

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
				const hadSession = readStoredSession() !== null
				const token = await ensureSession()
				if (!hadSession) setConversationId(undefined)
				try {
					await streamQuestion(
						{ query: asked, conversationId: hadSession ? conversationId : undefined },
						token,
						handlers
					)
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
				if (caught instanceof RateLimitedError) {
					// Drop both bubbles and give the question back so nothing is lost.
					setTurns(previous => previous.slice(0, -2))
					setQuestion(asked)
					setWaitSeconds(caught.retryAfterSeconds)
				} else {
					setTurns(previous => previous.slice(0, -1))
					setError(
						caught instanceof ApiError
							? caught.message
							: "The assistant is unavailable. Please try again."
					)
				}
			} finally {
				setBusy(false)
			}
		},
		[accepted, appendFinal, busy, conversationId, ensureSession, handoffDone, question, waitSeconds]
	)

	const requestAgent = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault()
			if (!conversationId || handoffBusy || handoffDone) return
			setHandoffBusy(true)
			setError(null)
			try {
				const sessionToken = await ensureSession()
				await requestHumanHandoff({ conversationId, reason: handoffReason, sessionToken })
				setHandoffDone(true)
			} catch (caught) {
				setError(
					caught instanceof ApiError
						? caught.message
						: "We couldn't request an agent. Please try again."
				)
			} finally {
				setHandoffBusy(false)
			}
		},
		[conversationId, ensureSession, handoffBusy, handoffDone, handoffReason]
	)

	// Embedded in the widget iframe: Esc is delivered here, not to the host page, so ask the parent to close.
	useEffect(() => {
		if (window.parent === window) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") window.parent.postMessage({ type: "phlpost-widget-close" }, "*")
		}
		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [])

	if (!ready) return null

	return (
		<div className="fixed inset-0 mx-auto flex max-w-3xl flex-col gap-3 overflow-hidden p-3 sm:p-4">
			<header className="flex items-start justify-between gap-3 border-b pb-3">
				<div>
					<h1 className="text-xl font-semibold">PHLPost Assistant</h1>
				<p className="text-sm">
					You are chatting with an AI assistant, not a person.{" "}
					<a
						href={PRIVACY_NOTICE_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary underline underline-offset-2"
					>
						Privacy notice
					</a>
				</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1">
					<label htmlFor="assistant-language" className="text-muted-foreground text-xs font-medium">
						Language
					</label>
					<select
						id="assistant-language"
						aria-label="Language"
						value={language}
						onChange={e => void handleLanguageChange(e.target.value as CustomerLanguage)}
						className="bg-background rounded-md border px-2.5 py-1.5 text-xs font-medium"
					>
						{CUSTOMER_LANGUAGES.map(code => (
							<option key={code} value={code}>
								{LANGUAGE_LABELS[code]}
							</option>
						))}
					</select>
				</div>
			</header>

			{!accepted ? (
				<section
					aria-labelledby="ai-notice-title"
					className="bg-muted space-y-4 overflow-y-auto rounded-lg border p-4 text-sm"
				>
					<h2 id="ai-notice-title" className="text-base font-semibold">
						Before you start
					</h2>
					<p>
						This chat is answered by an AI assistant. It replies using information PHLPost has
						approved, and it can make mistakes. Do not share passwords or payment details.
					</p>
					<p>
						Read how your chat is handled in the{" "}
						<a
							href={PRIVACY_NOTICE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary underline underline-offset-2"
						>
							privacy notice
						</a>
						.
					</p>
					<button
						type="button"
						onClick={() => setAccepted(true)}
						className="bg-primary text-primary-foreground focus-visible:ring-ring min-h-11 rounded-lg px-5 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
					>
						I understand, start chat
					</button>
				</section>
			) : (
				<>
					<div
						role="log"
						aria-label="Conversation"
						aria-live="polite"
						aria-relevant="additions text"
						className="flex-1 space-y-4 overflow-y-auto"
					>
						{turns.length === 0 ? (
							<p className="mt-16 text-center text-sm">Ask a question about PHLPost services.</p>
						) : (
							turns.map((turn, index) => (
								<div
									key={index}
									className={`flex ${turn.sender === "customer" ? "justify-end" : "justify-start"}`}
								>
									<div
										className={`max-w-[90%] rounded-lg px-4 py-2 text-sm sm:max-w-prose ${
											turn.sender === "customer"
												? "bg-primary text-primary-foreground"
												: "bg-muted border"
										}`}
									>
										<span className="sr-only">
											{turn.sender === "customer" ? "You said: " : "Assistant said: "}
										</span>
										<p className="whitespace-pre-wrap">
											{turn.content}
											{turn.streaming && turn.content === "" ? "…" : null}
										</p>

										{turn.sources && turn.sources.length > 0 ? (
											<div className="mt-3 border-t pt-2">
												<p className="text-xs font-medium">From these PHLPost articles:</p>
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

					{handoffDone ? (
						<p role="status" className="rounded-lg border p-3 text-sm">
							Your request is in the queue. A PHLPost agent will join when available.
						</p>
					) : conversationId && turns.length > 0 ? (
						<form onSubmit={requestAgent} className="flex flex-wrap items-end gap-2 border-t pt-3">
							<label className="min-w-0 flex-1 text-sm">
								<span className="mb-1 block">Need a person?</span>
								<select
									value={handoffReason}
									onChange={event => setHandoffReason(event.target.value)}
									className="bg-background min-h-11 w-full rounded-lg border px-3"
								>
									<option>I want to speak with a person</option>
									<option>I still need help</option>
									<option>The answer did not solve my question</option>
								</select>
							</label>
							<button
								type="submit"
								className="bg-secondary text-secondary-foreground min-h-11 rounded-lg px-4 text-sm font-medium disabled:opacity-50"
								disabled={handoffBusy || busy}
							>
								{handoffBusy ? "Requesting…" : "Confirm human handoff"}
							</button>
						</form>
					) : null}

					{waitSeconds > 0 ? (
						<p role="status" className="rounded-lg border p-3 text-sm">
							You&apos;re sending messages too quickly. Please wait {waitSeconds} second
							{waitSeconds === 1 ? "" : "s"} before sending another.
						</p>
					) : null}

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
							ref={inputRef}
							id="assistant-question"
							value={question}
							onChange={event => setQuestion(event.target.value)}
							placeholder="How do I send Express Mail?"
							autoComplete="off"
							maxLength={1000}
							className="focus-visible:ring-ring min-h-11 min-w-0 flex-1 rounded-lg border px-4 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
							disabled={busy || waitSeconds > 0 || handoffDone}
						/>
						<button
							type="submit"
							className="bg-primary text-primary-foreground focus-visible:ring-ring min-h-11 rounded-lg px-5 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50"
							disabled={busy || waitSeconds > 0 || handoffDone || question.trim() === ""}
						>
							{busy ? "Asking…" : "Ask"}
						</button>
					</form>
				</>
			)}
		</div>
	)
}

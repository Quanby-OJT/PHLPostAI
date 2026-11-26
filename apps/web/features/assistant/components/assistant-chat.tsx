"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
	CUSTOMER_LANGUAGES,
	type CustomerAnswer,
	type CustomerAnswerSource,
	type CustomerLanguage,
} from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"

import {
	endConversation,
	getChannelStatus,
	RateLimitedError,
	requestHumanHandoff,
	SESSION_STORAGE_KEY,
	setSessionLanguage,
	startSession,
	streamQuestion,
	watchAgentConversation,
	type AgentMessageEvent,
	type AssistantStreamHandlers,
	type StoredSession,
} from "../api/assistant.client"
import {
	ASSISTANT_COPY,
	HANDOFF_REASONS,
	LANGUAGE_LABELS,
	type HandoffReason,
} from "../lib/assistant-copy"

/** TODO(CHN-1): replace with PHLPost's real privacy notice URL. */
const PRIVACY_NOTICE_URL = "/privacy"

/** Per-tab chat state (CHN-1: the Conversation continues across page loads in one tab). */
const CHAT_STORAGE_KEY = "phlpost.assistant.chat"

function isCustomerLanguage(value: unknown): value is CustomerLanguage {
	return typeof value === "string" && (CUSTOMER_LANGUAGES as readonly string[]).includes(value)
}

interface Turn {
	id?: string
	sender: "customer" | "assistant" | "agent"
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
	agentJoined?: boolean
	agentResolved?: boolean
	language?: CustomerLanguage
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

function clearStoredSession(): void {
	try {
		window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
	} catch {
		// See storeSession.
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
	const [scamMode, setScamMode] = useState(false)
	const [conversationId, setConversationId] = useState<string | undefined>()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [waitSeconds, setWaitSeconds] = useState(0)
	const [handoffDone, setHandoffDone] = useState(false)
	const [agentJoined, setAgentJoined] = useState(false)
	const [agentResolved, setAgentResolved] = useState(false)
	const [handoffReason, setHandoffReason] = useState<HandoffReason>(HANDOFF_REASONS[0])
	const [handoffBusy, setHandoffBusy] = useState(false)
	const [ending, setEnding] = useState(false)
	const [endNotice, setEndNotice] = useState<string | null>(null)
	const [channelEnabled, setChannelEnabled] = useState(true)
	const [welcomeText, setWelcomeText] = useState("")
	const [language, setLanguage] = useState<CustomerLanguage>("en")
	const endRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const scamInputRef = useRef<HTMLTextAreaElement>(null)

	// Restore this tab's chat after mount (not during render, to avoid a hydration mismatch).
	useEffect(() => {
		const stored = readStoredChat()
		const storedSession = readStoredSession()
		if (storedSession?.welcomeText) setWelcomeText(storedSession.welcomeText)
		if (stored) {
			setAccepted(stored.accepted)
			setConversationId(stored.conversationId)
			setTurns(stored.turns.filter(turn => !turn.streaming))
			setHandoffDone(stored.handoffDone ?? false)
			setAgentJoined(stored.agentJoined ?? false)
			setAgentResolved(stored.agentResolved ?? false)
			if (isCustomerLanguage(stored.language)) setLanguage(stored.language)
		}
		setReady(true)
	}, [])

	useEffect(() => {
		let alive = true
		const refresh = async () => {
			try {
				const status = await getChannelStatus()
				if (alive) {
					setChannelEnabled(status.enabled)
					setWelcomeText(status.welcomeText)
				}
			} catch (cause) {
				if (alive && cause instanceof ApiError && cause.status === 503) setChannelEnabled(false)
			}
		}
		void refresh()
		const timer = window.setInterval(() => void refresh(), 30_000)
		return () => {
			alive = false
			window.clearInterval(timer)
		}
	}, [])

	// Save the chat whenever a turn settles.
	useEffect(() => {
		if (!ready || busy) return
		storeChat({
			accepted,
			conversationId,
			turns,
			handoffDone,
			agentJoined,
			agentResolved,
			language,
		})
	}, [
		accepted,
		agentJoined,
		agentResolved,
		busy,
		conversationId,
		handoffDone,
		language,
		ready,
		turns,
	])

	useEffect(() => {
		if (!ready || !handoffDone || !conversationId) return
		const session = readStoredSession()
		if (!session) return
		const abort = new AbortController()
		let resolved = false
		void (async () => {
			while (!abort.signal.aborted && !resolved) {
				try {
					await watchAgentConversation(
						conversationId,
						session.sessionToken,
						{
							onMessage: message => {
								setTurns(previous =>
									previous.some(turn => turn.id === message.id)
										? previous
										: [...previous, { id: message.id, sender: "agent", content: message.content }]
								)
							},
							onStatus: status => {
								if (status === "agent_active") setAgentJoined(true)
								if (status === "resolved_by_agent") {
									resolved = true
									setAgentJoined(true)
									setAgentResolved(true)
								}
							},
						},
						abort.signal
					)
				} catch {
					if (abort.signal.aborted) break
				}
				if (!resolved && !abort.signal.aborted) {
					await new Promise(resolve => window.setTimeout(resolve, 1000))
				}
			}
		})()
		return () => abort.abort()
	}, [conversationId, handoffDone, ready])

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
		if (accepted && !busy && waitSeconds === 0 && !agentResolved && channelEnabled) {
			const composer = scamMode ? scamInputRef : inputRef
			composer.current?.focus()
		}
	}, [accepted, agentResolved, busy, channelEnabled, scamMode, waitSeconds])

	/** The stored session, or a freshly opened one in the chosen language. */
	const ensureSession = useCallback(
		async (forceNew = false): Promise<string> => {
			if (!forceNew) {
				const stored = readStoredSession()
				if (stored) return stored.sessionToken
			}
			const session = await startSession(language)
			storeSession({
				sessionToken: session.sessionToken,
				idleExpiresAt: session.idleExpiresAt,
				welcomeText: session.welcomeText,
			})
			if (session.welcomeText) setWelcomeText(session.welcomeText)
			return session.sessionToken
		},
		[language]
	)

	/** CNV-4: switch the fixed text now, and store the choice on the session for later replies. */
	const changeLanguage = useCallback(async (next: CustomerLanguage) => {
		setLanguage(next)
		setError(null)
		const stored = readStoredSession()
		if (!stored) return
		try {
			await setSessionLanguage(next, stored.sessionToken)
		} catch (caught) {
			if (caught instanceof ApiError && caught.status === 401) {
				clearStoredSession()
				return
			}
			setError(ASSISTANT_COPY[next].languageFailed)
		}
	}, [])

	const appendFinal = useCallback(
		(final: CustomerAnswer) => {
			setConversationId(final.conversationId)
			setTurns(previous => {
				const next = [...previous]
				const questionIndex = next.length - 2
				if (final.scamAssessment && next[questionIndex]?.sender === "customer") {
					next[questionIndex] = {
						sender: "customer",
						content: ASSISTANT_COPY[language].scamSubmitted,
					}
				}
				next[next.length - 1] = {
					sender: "assistant",
					content: final.answer,
					sources: final.sources,
					answerKind: final.answerKind,
					streaming: false,
				}
				return next
			})
		},
		[language]
	)

	const ask = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault()
			const asked = question.trim()
			if (
				!accepted ||
				!asked ||
				busy ||
				handoffBusy ||
				waitSeconds > 0 ||
				agentResolved ||
				!channelEnabled
			)
				return

			setQuestion("")
			setError(null)
			setEndNotice(null)
			setBusy(true)
			setTurns(previous => [
				...previous,
				{ sender: "customer", content: scamMode ? ASSISTANT_COPY[language].scamSubmitted : asked },
				{ sender: "assistant", content: "", streaming: true },
			])
			const input = { query: asked, ...(scamMode && { intent: "scam" as const }) }

			const handlers: AssistantStreamHandlers = {
				onToken: (delta: string) =>
					setTurns(previous => {
						const next = [...previous]
						const last = next[next.length - 1]
						if (last) next[next.length - 1] = { ...last, content: last.content + delta }
						return next
					}),
				onFinal: appendFinal,
				onAgentMode: result => {
					setConversationId(result.conversationId)
					setHandoffDone(true)
					setTurns(previous => previous.filter(turn => !turn.streaming))
				},
			}

			try {
				const hadSession = readStoredSession() !== null
				const token = await ensureSession()
				if (!hadSession) setConversationId(undefined)
				try {
					await streamQuestion(
						{ ...input, conversationId: hadSession ? conversationId : undefined },
						token,
						handlers
					)
				} catch (streamError) {
					// An idle-expired or unknown session is recoverable exactly once:
					// open a new session and ask again. A second 401 is a real error.
					if (streamError instanceof ApiError && streamError.status === 401) {
						const freshToken = await ensureSession(true)
						setConversationId(undefined)
						await streamQuestion(input, freshToken, handlers)
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
						caught instanceof ApiError ? caught.message : ASSISTANT_COPY[language].unavailable
					)
				}
			} finally {
				setBusy(false)
			}
		},
		[
			accepted,
			agentResolved,
			appendFinal,
			busy,
			channelEnabled,
			conversationId,
			ensureSession,
			handoffBusy,
			language,
			question,
			scamMode,
			waitSeconds,
		]
	)

	const requestAgent = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault()
			if (!conversationId || busy || handoffBusy || handoffDone) return
			setHandoffBusy(true)
			setError(null)
			try {
				const sessionToken = await ensureSession()
				await requestHumanHandoff({ conversationId, reason: handoffReason, sessionToken })
				if (scamMode) {
					setQuestion("")
					setScamMode(false)
				}
				setHandoffDone(true)
			} catch (caught) {
				setError(
					caught instanceof ApiError ? caught.message : ASSISTANT_COPY[language].handoffFailed
				)
			} finally {
				setHandoffBusy(false)
			}
		},
		[
			busy,
			conversationId,
			ensureSession,
			handoffBusy,
			handoffDone,
			handoffReason,
			language,
			scamMode,
		]
	)

	const endChat = useCallback(async () => {
		if (!conversationId || busy || ending || handoffDone) return
		setEnding(true)
		setError(null)
		try {
			const sessionToken = await ensureSession()
			await endConversation({ conversationId, sessionToken })
			setConversationId(undefined)
			setEndNotice("Chat ended. You can start a new chat any time.")
		} catch (caught) {
			setError(
				caught instanceof ApiError ? caught.message : "We couldn't end this chat. Please try again."
			)
		} finally {
			setEnding(false)
		}
	}, [busy, conversationId, ending, ensureSession, handoffDone])

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

	const copy = ASSISTANT_COPY[language]

	return (
		<div
			lang={language}
			className="fixed inset-0 mx-auto flex max-w-3xl flex-col gap-3 overflow-hidden p-3 sm:p-4"
		>
			<header className="flex items-start justify-between gap-3 border-b pb-3">
				<div>
					<h1 className="text-xl font-semibold">PHLPost Assistant</h1>
					<p className="text-sm">
						{copy.aiNotice}{" "}
						<a
							href={PRIVACY_NOTICE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary underline underline-offset-2"
						>
							{copy.privacyNotice}
						</a>
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1">
					<label htmlFor="assistant-language" className="text-muted-foreground text-xs font-medium">
						{copy.language}
					</label>
					<select
						id="assistant-language"
						value={language}
						onChange={event => {
							if (isCustomerLanguage(event.target.value)) void changeLanguage(event.target.value)
						}}
						disabled={busy}
						className="bg-background min-h-9 rounded-md border px-2.5 text-xs font-medium"
					>
						{CUSTOMER_LANGUAGES.map(code => (
							<option key={code} value={code} lang={code}>
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
						{copy.beforeStartTitle}
					</h2>
					<p>{copy.beforeStartBody}</p>
					<p>
						{copy.privacyPrefix}
						<a
							href={PRIVACY_NOTICE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary underline underline-offset-2"
						>
							{copy.privacyLink}
						</a>
						.
					</p>
					<button
						type="button"
						onClick={() => setAccepted(true)}
						className="bg-primary text-primary-foreground focus-visible:ring-ring min-h-11 rounded-lg px-5 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
					>
						{copy.accept}
					</button>
				</section>
			) : (
				<>
					<div
						role="log"
						aria-label={copy.conversation}
						aria-live="polite"
						aria-relevant="additions text"
						className="flex-1 space-y-4 overflow-y-auto"
					>
						{turns.length === 0 ? (
							<p className="mt-16 text-center text-sm">{welcomeText || copy.emptyPrompt}</p>
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
										<span
											className={
												turn.sender === "agent"
													? "text-muted-foreground text-xs font-medium"
													: "sr-only"
											}
										>
											{turn.sender === "customer"
												? copy.youSaid
												: turn.sender === "agent"
													? copy.agentLabel
													: copy.assistantSaid}
										</span>
										<p className="whitespace-pre-wrap">
											{turn.content}
											{turn.streaming && turn.content === "" ? "…" : null}
										</p>

										{turn.sources && turn.sources.length > 0 ? (
											<div className="mt-3 border-t pt-2">
												<p className="text-xs font-medium">{copy.sources}</p>
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
							{agentResolved
								? copy.handoffResolved
								: agentJoined
									? copy.handoffJoined
									: copy.handoffQueued}
						</p>
					) : conversationId && turns.length > 0 ? (
						<form onSubmit={requestAgent} className="flex flex-wrap items-end gap-2 border-t pt-3">
							<label className="min-w-0 flex-1 text-sm">
								<span className="mb-1 block">{copy.needPerson}</span>
								<select
									value={handoffReason}
									onChange={event => setHandoffReason(event.target.value as HandoffReason)}
									className="bg-background min-h-11 w-full rounded-lg border px-3"
								>
									{HANDOFF_REASONS.map(reason => (
										<option key={reason} value={reason}>
											{copy.handoffReasons[reason]}
										</option>
									))}
								</select>
							</label>
							<button
								type="submit"
								className="bg-secondary text-secondary-foreground min-h-11 rounded-lg px-4 text-sm font-medium disabled:opacity-50"
								disabled={handoffBusy || busy}
							>
								{handoffBusy ? copy.requestingHandoff : copy.confirmHandoff}
							</button>
						</form>
					) : null}

					{conversationId && turns.length > 0 && !handoffDone ? (
						<div className="flex justify-end">
							<button
								type="button"
								onClick={endChat}
								className="text-muted-foreground min-h-9 px-3 text-sm underline underline-offset-2 disabled:opacity-50"
								disabled={ending || busy || handoffBusy}
							>
								{ending ? "Ending chat…" : "End chat"}
							</button>
						</div>
					) : null}

					{endNotice ? (
						<p role="status" className="rounded-lg border p-3 text-sm">
							{endNotice}
						</p>
					) : null}

					{waitSeconds > 0 ? (
						<p role="status" className="rounded-lg border p-3 text-sm">
							{copy.tooQuick(waitSeconds)}
						</p>
					) : null}

					{error ? (
						<p role="alert" className="text-destructive text-sm">
							{error}
						</p>
					) : null}
					{!channelEnabled ? (
						<p role="status" className="rounded-lg border p-3 text-sm">
							The assistant is unavailable right now. Please try again later.
						</p>
					) : null}

					<div className="space-y-2 border-t pt-2">
						<button
							type="button"
							aria-pressed={scamMode}
							onClick={() => {
								setQuestion("")
								setScamMode(mode => !mode)
							}}
							disabled={busy || handoffBusy || waitSeconds > 0 || handoffDone || !channelEnabled}
							className="focus-visible:ring-ring aria-pressed:bg-secondary min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
						>
							{copy.scamEntry}
						</button>
						<form onSubmit={ask} className="flex items-end gap-2">
							<label className="sr-only" htmlFor="assistant-question">
								{scamMode ? copy.scamPlaceholder : copy.questionLabel}
							</label>
							{scamMode ? (
								<textarea
									ref={scamInputRef}
									id="assistant-question"
									value={question}
									onChange={event => setQuestion(event.target.value)}
									placeholder={copy.scamPlaceholder}
									maxLength={4000}
									rows={3}
									className="focus-visible:ring-ring min-h-11 min-w-0 flex-1 resize-none rounded-lg border px-4 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
									disabled={
										busy || handoffBusy || waitSeconds > 0 || agentResolved || !channelEnabled
									}
								/>
							) : (
								<input
									ref={inputRef}
									id="assistant-question"
									value={question}
									onChange={event => setQuestion(event.target.value)}
									placeholder={copy.questionPlaceholder}
									autoComplete="off"
									maxLength={1000}
									className="focus-visible:ring-ring min-h-11 min-w-0 flex-1 rounded-lg border px-4 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
									disabled={
										busy || handoffBusy || waitSeconds > 0 || agentResolved || !channelEnabled
									}
								/>
							)}
							<button
								type="submit"
								className="bg-primary text-primary-foreground focus-visible:ring-ring min-h-11 rounded-lg px-5 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50"
								disabled={
									busy ||
									handoffBusy ||
									waitSeconds > 0 ||
									agentResolved ||
									!channelEnabled ||
									question.trim() === ""
								}
							>
								{busy ? copy.asking : scamMode ? copy.scamAsk : copy.ask}
							</button>
						</form>
					</div>
				</>
			)}
		</div>
	)
}

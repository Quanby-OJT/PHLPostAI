"use client"

import { useState } from "react"

import { Button } from "@/core/components/ui/button"

import {
	useClaimEscalationMutation,
	useEscalationDetailQuery,
	useEscalationLiveEvents,
	useEscalationQueueQuery,
	useReplyEscalationMutation,
	useResolveEscalationMutation,
} from "../api/escalations.hooks"

function waitingLabel(seconds: number): string {
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function pretty(value: string): string {
	return value.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase())
}

export function EscalationInbox() {
	const queue = useEscalationQueueQuery()
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const selected = selectedId ?? queue.data?.[0]?.id ?? null
	const detail = useEscalationDetailQuery(selected)
	const claim = useClaimEscalationMutation()
	const reply = useReplyEscalationMutation(selected ?? "")
	const resolve = useResolveEscalationMutation(selected ?? "")
	const [replyText, setReplyText] = useState("")
	const [outcomeNote, setOutcomeNote] = useState("")
	useEscalationLiveEvents(
		selected,
		Boolean(detail.data?.canHandle && detail.data.status === "claimed")
	)
	const claimError = claim.variables === selected ? claim.error : null
	const actionError = reply.error ?? resolve.error

	return (
		<section className="grid min-h-[34rem] gap-4 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.5fr)]">
			<div className="rounded-xl border">
				<div className="flex items-center justify-between border-b p-4">
					<div>
						<h2 className="font-semibold">Waiting for an agent</h2>
						<p className="text-muted-foreground text-sm">Oldest requests appear first.</p>
					</div>
					<Button type="button" variant="outline" size="sm" onClick={() => void queue.refetch()}>
						Refresh
					</Button>
				</div>
				{queue.isPending ? <p className="p-4 text-sm">Loading queue…</p> : null}
				{queue.error ? (
					<p role="alert" className="p-4 text-sm">
						{queue.error.message}
					</p>
				) : null}
				{queue.data?.length === 0 ? (
					<p className="text-muted-foreground p-6 text-center text-sm">No queued chats.</p>
				) : null}
				<ul className="divide-y">
					{queue.data?.map(item => (
						<li key={item.id}>
							<button
								type="button"
								aria-pressed={selected === item.id}
								onClick={() => setSelectedId(item.id)}
								className={`hover:bg-muted/50 w-full p-4 text-left ${selected === item.id ? "bg-muted" : ""}`}
							>
								<span className="flex items-center justify-between gap-3">
									<strong className="truncate text-sm">{item.reason}</strong>
									<span className="shrink-0 text-xs tabular-nums">
										{waitingLabel(item.waitingSeconds)}
									</span>
								</span>
								<span className="text-muted-foreground mt-1 block text-xs">
									{pretty(item.category)} · {pretty(item.language)} ·{" "}
									{new Date(item.createdAt).toLocaleTimeString()}
								</span>
							</button>
						</li>
					))}
				</ul>
			</div>

			<div className="rounded-xl border">
				{claimError ? (
					<p role="alert" className="text-destructive border-b p-4 text-sm">
						{claimError.message}
					</p>
				) : null}
				{!selected ? (
					<div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
						Select a queued chat to view its history.
					</div>
				) : detail.isPending ? (
					<p className="p-6 text-sm">Loading conversation…</p>
				) : detail.error ? (
					<p role="alert" className="p-6 text-sm">
						{detail.error.message}
					</p>
				) : detail.data ? (
					<>
						<header className="border-b p-4">
							<p className="text-muted-foreground text-xs">
								{pretty(detail.data.category)} · {pretty(detail.data.language)}
							</p>
							<h2 className="mt-1 font-semibold">{detail.data.reason}</h2>
							<p role="status" className="mt-1 text-sm">
								{detail.data.status === "queued"
									? "Waiting for an agent"
									: detail.data.status === "claimed"
										? "An agent has joined this chat"
										: "This conversation is resolved"}
							</p>
							<p className="text-muted-foreground mt-1 text-xs">
								Waiting{" "}
								{waitingLabel(
									Math.max(
										0,
										Math.floor(
											(detail.dataUpdatedAt - new Date(detail.data.createdAt).getTime()) / 1000
										)
									)
								)}
							</p>
							{selected && detail.data.status === "queued" ? (
								<Button
									type="button"
									className="mt-3"
									disabled={claim.isPending}
									onClick={() => {
										setSelectedId(selected)
										claim.mutate(selected)
									}}
								>
									{claim.isPending ? "Claiming…" : "Claim conversation"}
								</Button>
							) : null}
						</header>
						<div
							className="max-h-[32rem] space-y-4 overflow-y-auto p-4"
							aria-label="Conversation history"
						>
							{detail.data.messages.map(message => (
								<article key={message.id} className="rounded-lg border p-3">
									<div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
										<strong>{pretty(message.sender)}</strong>
										<time dateTime={message.createdAt}>
											{new Date(message.createdAt).toLocaleString()}
										</time>
									</div>
									<p className="mt-2 whitespace-pre-wrap text-sm">{message.content}</p>
									{message.sender === "assistant" ? (
										<div className="mt-3 border-t pt-2 text-xs">
											<p>
												Confidence:{" "}
												{message.confidence === null
													? "Not available"
													: `${Math.round(message.confidence * 100)}%`}
											</p>
											<p>
												Retrieval score: {message.retrievalScore === null
													? "Not available"
													: `${Math.round(message.retrievalScore * 100)}%`}
											</p>
											<p>
												Groundedness: {message.groundednessResult?.grounded === true
													? "Passed"
													: message.groundednessResult?.grounded === false
														? "Failed"
														: "Not available"}
											</p>
											<p>Output tokens: {message.outputTokens ?? "Not available"}</p>
											{message.citations.length ? (
												<div className="mt-2">
													<p className="font-medium">Sources</p>
													<ul className="mt-1 list-inside list-disc">
														{message.citations.map((citation, index) => (
															<li key={`${message.id}-${index}`}>
																{citation.source ?? "Source unavailable"}
																{citation.page ? ` · page ${citation.page}` : ""}
																{citation.section ? ` · ${citation.section}` : ""}
															</li>
														))}
													</ul>
												</div>
											) : (
												<p className="mt-2">No citations recorded.</p>
											)}
										</div>
									) : null}
								</article>
							))}
						</div>
						{detail.data.status === "claimed" && detail.data.canHandle ? (
							<div className="space-y-3 border-t p-4">
								{actionError ? (
									<p role="alert" className="text-destructive text-sm">
										{actionError.message}
									</p>
								) : null}
								<form
									className="flex gap-2"
									onSubmit={event => {
										event.preventDefault()
										const content = replyText.trim()
										if (!content) return
										reply.mutate(content, { onSuccess: () => setReplyText("") })
									}}
								>
									<label className="sr-only" htmlFor="agent-reply">
										Reply to customer
									</label>
									<textarea
										id="agent-reply"
										value={replyText}
										onChange={event => setReplyText(event.target.value)}
										maxLength={4000}
										rows={2}
										className="min-w-0 flex-1 rounded-md border p-2 text-sm"
										placeholder="Write a reply as a PHLPost agent"
									/>
									<Button type="submit" disabled={reply.isPending || !replyText.trim()}>
										{reply.isPending ? "Sending…" : "Send reply"}
									</Button>
								</form>
								<form
									className="flex flex-wrap gap-2"
									onSubmit={event => {
										event.preventDefault()
										if (outcomeNote.trim()) resolve.mutate(outcomeNote.trim())
									}}
								>
									<label className="sr-only" htmlFor="escalation-outcome">
										Outcome note
									</label>
									<input
										id="escalation-outcome"
										value={outcomeNote}
										onChange={event => setOutcomeNote(event.target.value)}
										maxLength={2000}
										className="min-w-0 flex-1 rounded-md border p-2 text-sm"
										placeholder="Outcome note required to close"
									/>
									<Button
										type="submit"
										variant="outline"
										disabled={resolve.isPending || !outcomeNote.trim()}
									>
										{resolve.isPending ? "Closing…" : "Resolve conversation"}
									</Button>
								</form>
							</div>
						) : null}
					</>
				) : null}
			</div>
		</section>
	)
}

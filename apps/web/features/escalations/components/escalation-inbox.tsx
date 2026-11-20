"use client"

import { useState } from "react"

import { Button } from "@/core/components/ui/button"

import { useEscalationDetailQuery, useEscalationQueueQuery } from "../api/escalations.hooks"

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
							<p className="text-muted-foreground mt-1 text-xs">
								Waiting{" "}
								{waitingLabel(
									Math.max(
										0,
										Math.floor((Date.now() - new Date(detail.data.createdAt).getTime()) / 1000)
									)
								)}
							</p>
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
					</>
				) : null}
			</div>
		</section>
	)
}

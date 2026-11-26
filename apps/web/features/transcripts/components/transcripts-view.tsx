"use client"

import { useState, type FormEvent } from "react"
import { BubbleChatIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { AnswerProvenance, TranscriptMessage, TranscriptSearch } from "@repo/contracts"

import { PageHeader } from "@/core/components/page-header"
import { Button } from "@/core/components/ui/button"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/core/components/ui/empty"
import { Input } from "@/core/components/ui/input"
import { Skeleton } from "@/core/components/ui/skeleton"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/core/components/ui/table"
import {
	isTranscriptPermissionError,
	useTranscript,
	useTranscriptSearch,
} from "@/features/transcripts/api/transcripts.hooks"
import {
	EMPTY_TRANSCRIPT_FILTERS,
	formatConfidence,
	shortId,
	toTranscriptSearch,
	TRANSCRIPT_PAGE_SIZE,
	type TranscriptFilterForm,
} from "@/features/transcripts/lib/transcript-filters"

const OUTCOMES = [
	"ai_active",
	"resolved_by_ai",
	"escalation_requested",
	"agent_active",
	"resolved_by_agent",
	"contact_captured",
	"abandoned",
] as const

const LANGUAGES = ["en", "fil", "ceb", "ilo", "unsupported"] as const

const selectClass =
	"border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2"

function NoAccess() {
	return (
		<section className="flex w-full max-w-6xl flex-col gap-6">
			<PageHeader
				icon={BubbleChatIcon}
				title="Transcripts"
				description="Review conversations and how each answer was produced."
			/>
			<Empty className="border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} />
					</EmptyMedia>
					<EmptyTitle>No access</EmptyTitle>
					<EmptyDescription>
						You do not have permission to view transcripts (requires
						conversations.transcripts.view). Ask an administrator for access.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</section>
	)
}

function ProvenancePanel({ provenance }: Readonly<{ provenance: AnswerProvenance }>) {
	const grounded = provenance.groundednessResult?.grounded
	return (
		<dl className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
			<div>
				<dt className="text-muted-foreground">Confidence</dt>
				<dd className="font-medium">{formatConfidence(provenance.confidence)}</dd>
			</div>
			<div>
				<dt className="text-muted-foreground">Grounded</dt>
				<dd className="font-medium">
					{typeof grounded === "boolean" ? (grounded ? "Yes" : "No") : "Not recorded"}
				</dd>
			</div>
			<div>
				<dt className="text-muted-foreground">Model</dt>
				<dd className="font-medium">{provenance.modelUsed ?? "Not recorded"}</dd>
			</div>
			<div>
				<dt className="text-muted-foreground">Provider</dt>
				<dd className="font-medium">{provenance.provider ?? "Not recorded"}</dd>
			</div>
			<div className="sm:col-span-2">
				<dt className="text-muted-foreground">Trace</dt>
				<dd className="break-all font-medium">
					{provenance.traceId === null ? (
						"No trace recorded"
					) : provenance.traceUrl ? (
						<a
							href={provenance.traceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary underline-offset-4 hover:underline"
						>
							Open trace {shortId(provenance.traceId)}
						</a>
					) : (
						<span>
							{provenance.traceId}{" "}
							<span className="text-muted-foreground">(no trace viewer configured)</span>
						</span>
					)}
				</dd>
			</div>
			<div className="sm:col-span-2">
				<dt className="text-muted-foreground">Sources used</dt>
				<dd>
					{provenance.sources.length === 0 ? (
						<span className="text-muted-foreground">No sources</span>
					) : (
						<ul className="list-inside list-disc">
							{provenance.sources.map(source => (
								<li key={source.chunkId}>
									{source.source ?? "Unknown source"}
									{source.section ? `, ${source.section}` : ""}
									{source.page ? ` (page ${source.page})` : ""}
								</li>
							))}
						</ul>
					)}
				</dd>
			</div>
			<div className="sm:col-span-2">
				<dt className="text-muted-foreground">Tool result</dt>
				<dd>
					{provenance.toolResults.length === 0 ? (
						<span className="text-muted-foreground">No tool used</span>
					) : (
						<ul className="list-inside list-disc">
							{provenance.toolResults.map((result, index) => (
								<li key={`${result.connectorCode}-${index}`}>
									{result.connectorCode}: {result.outcome}
									{result.statusCode ? ` (${result.statusCode})` : ""}, {result.latencyMs} ms
								</li>
							))}
						</ul>
					)}
				</dd>
			</div>
		</dl>
	)
}

function MessageView({ message }: Readonly<{ message: TranscriptMessage }>) {
	return (
		<li className="flex flex-col gap-2 rounded-md border p-4">
			<div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
				<span className="font-medium capitalize">{message.sender}</span>
				<span>
					{new Date(message.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
				</span>
				{message.answerKind ? <span>Answer: {message.answerKind}</span> : null}
				{message.inquiryCategory ? <span>Category: {message.inquiryCategory}</span> : null}
				{message.language ? <span>Language: {message.language}</span> : null}
			</div>
			<p className="whitespace-pre-wrap text-sm">{message.content}</p>
			{message.provenance ? <ProvenancePanel provenance={message.provenance} /> : null}
		</li>
	)
}

export function TranscriptsView({ hasAccess }: Readonly<{ hasAccess: boolean }>) {
	const [form, setForm] = useState<TranscriptFilterForm>(EMPTY_TRANSCRIPT_FILTERS)
	const [applied, setApplied] = useState<TranscriptSearch | null>(null)
	const [formError, setFormError] = useState<string | null>(null)
	const [selectedId, setSelectedId] = useState<string | null>(null)

	const search = useTranscriptSearch(hasAccess ? applied : null)
	const detail = useTranscript(hasAccess ? selectedId : null)

	if (!hasAccess || (search.isError && isTranscriptPermissionError(search.error))) {
		return <NoAccess />
	}

	function apply(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const result = toTranscriptSearch(form, 1)
		if (!result.ok) {
			setFormError(result.error)
			return
		}
		setFormError(null)
		setApplied(result.input)
	}

	function changePage(page: number) {
		if (!applied) return
		setApplied({ ...applied, page })
	}

	const pageCount = search.data
		? Math.max(1, Math.ceil(search.data.total / TRANSCRIPT_PAGE_SIZE))
		: 1
	const currentPage = applied?.page ?? 1

	return (
		<section className="flex w-full max-w-6xl flex-col gap-6">
			<PageHeader
				icon={BubbleChatIcon}
				title="Transcripts"
				description="Search conversations and see how each answer was produced. Personal data is masked."
			/>

			<form
				onSubmit={apply}
				className="grid gap-3 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-6"
				aria-label="Transcript filters"
			>
				<label className="flex flex-col gap-1 text-sm">
					From
					<Input
						type="date"
						value={form.from}
						onChange={event => setForm({ ...form, from: event.target.value })}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					To
					<Input
						type="date"
						value={form.to}
						onChange={event => setForm({ ...form, to: event.target.value })}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					Category
					<Input
						placeholder="e.g. rates"
						value={form.category}
						onChange={event => setForm({ ...form, category: event.target.value })}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					Language
					<select
						className={selectClass}
						value={form.language}
						onChange={event => setForm({ ...form, language: event.target.value })}
					>
						<option value="">Any</option>
						{LANGUAGES.map(code => (
							<option key={code} value={code}>
								{code}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					Outcome
					<select
						className={selectClass}
						value={form.outcome}
						onChange={event => setForm({ ...form, outcome: event.target.value })}
					>
						<option value="">Any</option>
						{OUTCOMES.map(code => (
							<option key={code} value={code}>
								{code}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					Reference
					<Input
						placeholder="Conversation or trace id"
						value={form.reference}
						onChange={event => setForm({ ...form, reference: event.target.value })}
					/>
				</label>
				<div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
					<Button type="submit">Search</Button>
					{formError ? (
						<p role="alert" className="text-destructive text-sm">
							{formError}
						</p>
					) : null}
				</div>
			</form>

			{applied === null ? (
				<p className="text-muted-foreground text-sm">
					Set filters and search to list conversations.
				</p>
			) : search.isPending ? (
				<Skeleton className="h-40 w-full" />
			) : search.isError ? (
				<p role="alert" className="text-destructive text-sm">
					{search.error.message}
				</p>
			) : search.data.rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">No conversations match these filters.</p>
			) : (
				<div className="flex flex-col gap-3">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>When (Manila)</TableHead>
								<TableHead>Outcome</TableHead>
								<TableHead>Category</TableHead>
								<TableHead>Language</TableHead>
								<TableHead>Messages</TableHead>
								<TableHead>First question (masked)</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{search.data.rows.map(row => (
								<TableRow
									key={row.id}
									data-state={selectedId === row.id ? "selected" : undefined}
									className="cursor-pointer"
									onClick={() => setSelectedId(row.id)}
								>
									<TableCell>
										{new Date(row.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
									</TableCell>
									<TableCell>{row.status}</TableCell>
									<TableCell>{row.category ?? "—"}</TableCell>
									<TableCell>{row.language ?? "—"}</TableCell>
									<TableCell>{row.messageCount}</TableCell>
									<TableCell className="max-w-md truncate">{row.preview}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							Page {currentPage} of {pageCount} ({search.data.total} conversations)
						</span>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage <= 1}
								onClick={() => changePage(currentPage - 1)}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage >= pageCount}
								onClick={() => changePage(currentPage + 1)}
							>
								Next
							</Button>
						</div>
					</div>
				</div>
			)}

			{selectedId ? (
				<div className="flex flex-col gap-3">
					<h2 className="text-lg font-semibold">Transcript</h2>
					{detail.isPending ? (
						<Skeleton className="h-40 w-full" />
					) : detail.isError ? (
						<p role="alert" className="text-destructive text-sm">
							{detail.error.message}
						</p>
					) : (
						<ol className="flex flex-col gap-3">
							{detail.data.messages.map(message => (
								<MessageView key={message.id} message={message} />
							))}
						</ol>
					)}
				</div>
			) : null}
		</section>
	)
}

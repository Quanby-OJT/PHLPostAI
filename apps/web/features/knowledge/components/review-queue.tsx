"use client"

import { useState } from "react"

import { Button } from "@/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/core/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/core/components/ui/field"
import { Skeleton } from "@/core/components/ui/skeleton"
import { Textarea } from "@/core/components/ui/textarea"
import {
	useApproveVersionMutation,
	useKnowledgeReviewQueueQuery,
	useReturnVersionMutation,
	type KnowledgeReviewItemUi,
} from "@/features/knowledge/api/knowledge.hooks"
import { VersionStatusBadge } from "@/features/knowledge/components/version-status-badge"
import {
	categoryLabel,
	formatDate,
	indexErrorReason,
	LANGUAGE_LABELS,
} from "@/features/knowledge/lib/labels"

/** Versions waiting for a decision (knowledge.articles.approve). */
export function ReviewQueue() {
	const { data: items, isPending, isError, error } = useKnowledgeReviewQueueQuery()

	if (isPending) return <Skeleton className="h-40 w-full" />
	if (isError) {
		return (
			<p className="text-destructive text-sm" role="alert">
				{error instanceof Error ? error.message : "Could not load the review queue."}
			</p>
		)
	}
	if (!items?.length) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyTitle>Nothing to review</EmptyTitle>
					<EmptyDescription>Submitted versions appear here.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}
	return (
		<ul className="flex flex-col gap-4" aria-label="Versions waiting for review">
			{items.map(item => (
				<li key={item.version.id}>
					<ReviewCard item={item} />
				</li>
			))}
		</ul>
	)
}

function ReviewCard({ item }: { item: KnowledgeReviewItemUi }) {
	const approve = useApproveVersionMutation()
	const returnVersion = useReturnVersionMutation()
	const [returning, setReturning] = useState(false)
	const [note, setNote] = useState("")
	const [noteError, setNoteError] = useState<string | null>(null)
	const [actionError, setActionError] = useState<string | null>(null)
	const { version, article, currentApproved } = item
	const busy = approve.isPending || returnVersion.isPending || version.indexing

	function handleApprove() {
		setActionError(null)
		approve.mutate(version.id, {
			onError: err => setActionError(err.message),
		})
	}

	function handleReturn(event: React.FormEvent) {
		event.preventDefault()
		if (!note.trim()) {
			setNoteError("Say what needs to change")
			return
		}
		setNoteError(null)
		setActionError(null)
		returnVersion.mutate(
			{ id: version.id, note: note.trim() },
			{
				onSuccess: () => {
					setReturning(false)
					setNote("")
				},
				onError: err => setActionError(err.message),
			}
		)
	}

	const headingId = `review-${version.id}`
	return (
		<Card aria-labelledby={headingId}>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<CardTitle id={headingId} className="wrap-anywhere">
							{article.title} · version {version.version}
						</CardTitle>
						<CardDescription>
							{categoryLabel(article.category)} · {LANGUAGE_LABELS[version.language]} · submitted{" "}
							{formatDate(version.updatedAt)}
						</CardDescription>
					</div>
					<VersionStatusBadge status={version.status} indexing={version.indexing} />
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div>
					<p className="mb-1 text-sm font-medium">Proposed text</p>
					<p className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap">{version.body}</p>
				</div>
				{currentApproved ? (
					<details>
						<summary className="cursor-pointer text-sm">
							Compare with the serving version {currentApproved.version}
						</summary>
						<p className="mt-2 rounded-lg border p-3 text-sm whitespace-pre-wrap">
							{currentApproved.body}
						</p>
					</details>
				) : (
					<p className="text-muted-foreground text-sm">New article: nothing is serving yet.</p>
				)}

				{version.indexing ? (
					<p className="text-muted-foreground text-sm" role="status">
						Approved. Indexing is running; it starts serving when indexing finishes.
					</p>
				) : null}
				{version.indexError ? (
					<p className="text-destructive text-sm" role="alert">
						Indexing failed: {indexErrorReason(version.indexError)}.{" "}
						{currentApproved
							? `Version ${currentApproved.version} keeps serving.`
							: "Nothing is serving for this article yet."}{" "}
						You can approve again.
					</p>
				) : null}
				{actionError ? (
					<p className="text-destructive text-sm" role="alert">
						{actionError}
					</p>
				) : null}

				{returning ? (
					<form className="flex flex-col gap-3" onSubmit={handleReturn} noValidate>
						<Field data-invalid={Boolean(noteError)}>
							<FieldLabel htmlFor={`note-${version.id}`}>What needs to change?</FieldLabel>
							<Textarea
								id={`note-${version.id}`}
								value={note}
								onChange={e => setNote(e.target.value)}
								rows={3}
								aria-invalid={Boolean(noteError)}
							/>
							{noteError ? <FieldError>{noteError}</FieldError> : null}
						</Field>
						<div className="flex gap-2">
							<Button type="button" variant="outline" onClick={() => setReturning(false)}>
								Cancel
							</Button>
							<Button type="submit" variant="destructive" disabled={returnVersion.isPending}>
								{returnVersion.isPending ? "Returning..." : "Return to author"}
							</Button>
						</div>
					</form>
				) : (
					<div className="flex flex-wrap gap-2">
						<Button onClick={handleApprove} disabled={busy}>
							{approve.isPending ? "Approving..." : "Approve"}
						</Button>
						<Button variant="outline" onClick={() => setReturning(true)} disabled={busy}>
							Return
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

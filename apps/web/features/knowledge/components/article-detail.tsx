"use client"

import { useState } from "react"

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/core/components/ui/alert-dialog"
import { Badge } from "@/core/components/ui/badge"
import { Button } from "@/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card"
import { Skeleton } from "@/core/components/ui/skeleton"
import {
	useDeactivateArticleMutation,
	useKnowledgeArticleQuery,
	useSubmitVersionMutation,
} from "@/features/knowledge/api/knowledge.hooks"
import { ArticleEditor } from "@/features/knowledge/components/article-editor"
import { VersionStatusBadge } from "@/features/knowledge/components/version-status-badge"
import {
	categoryLabel,
	formatDate,
	indexErrorReason,
	LANGUAGE_LABELS,
} from "@/features/knowledge/lib/labels"

interface ArticleDetailProps {
	articleId: string
	onBack: () => void
}

/** One article: what is serving, the open draft, actions, and the version history. */
export function ArticleDetail({ articleId, onBack }: ArticleDetailProps) {
	const { data: article, isPending, isError, error } = useKnowledgeArticleQuery(articleId)
	const submit = useSubmitVersionMutation()
	const deactivate = useDeactivateArticleMutation()
	const [editing, setEditing] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [actionError, setActionError] = useState<string | null>(null)

	if (isPending) return <Skeleton className="h-64 w-full" />
	if (isError || !article) {
		return (
			<p className="text-destructive text-sm" role="alert">
				{error instanceof Error ? error.message : "Could not load the article."}
			</p>
		)
	}

	const latest = article.versions[0]
	const serving = article.versions.find(version => version.id === article.currentVersion?.id)
	const isActive = article.status === "active"
	const canEdit = isActive && latest?.status !== "in_review"
	const canSubmit = isActive && latest?.status === "draft"

	if (editing) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Edit “{article.title}”</CardTitle>
				</CardHeader>
				<CardContent>
					<ArticleEditor
						article={article}
						onDone={() => setEditing(false)}
						onCancel={() => setEditing(false)}
					/>
				</CardContent>
			</Card>
		)
	}

	function run(action: Promise<unknown>) {
		setActionError(null)
		action.catch(err => setActionError(err instanceof Error ? err.message : "Something went wrong"))
	}

	return (
		<div className="flex flex-col gap-4">
			<div>
				<Button variant="ghost" size="sm" onClick={onBack}>
					← All articles
				</Button>
			</div>

			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="min-w-0">
							<CardTitle className="wrap-anywhere">{article.title}</CardTitle>
							<CardDescription>
								{categoryLabel(article.category)} ·{" "}
								{article.languages.map(code => LANGUAGE_LABELS[code]).join(", ")}
							</CardDescription>
						</div>
						{isActive ? (
							<Badge variant="default">Active</Badge>
						) : (
							<Badge variant="secondary">Deactivated</Badge>
						)}
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<p className="text-sm">
						{serving
							? `Serving version ${serving.version}, approved ${formatDate(serving.approvedAt)}.`
							: isActive
								? "No approved version yet: the assistant does not answer from this article."
								: "Retired: the assistant no longer answers from this article."}
					</p>

					{latest && latest.id !== serving?.id ? (
						<div className="flex flex-col gap-2 rounded-lg border p-3">
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-sm font-medium">Version {latest.version}</span>
								<VersionStatusBadge status={latest.status} indexing={latest.indexing} />
							</div>
							{latest.reviewNote && latest.status === "returned" ? (
								<p className="text-destructive text-sm whitespace-pre-wrap">
									Returned: {latest.reviewNote}
								</p>
							) : null}
							{latest.indexError ? (
								<p className="text-destructive text-sm" role="alert">
									Indexing failed: {indexErrorReason(latest.indexError)}
								</p>
							) : null}
							{latest.indexing ? (
								<p className="text-muted-foreground text-sm">
									Approved and being indexed. It starts serving when indexing finishes.
								</p>
							) : null}
						</div>
					) : null}

					{actionError ? (
						<p className="text-destructive text-sm" role="alert">
							{actionError}
						</p>
					) : null}

					{isActive ? (
						<div className="flex flex-wrap gap-2">
							{canEdit ? (
								<Button variant="outline" onClick={() => setEditing(true)}>
									{latest?.status === "draft" || latest?.status === "returned"
										? "Edit draft"
										: "Edit (new version)"}
								</Button>
							) : null}
							{canSubmit && latest ? (
								<Button
									onClick={() => run(submit.mutateAsync(latest.id))}
									disabled={submit.isPending}
								>
									{submit.isPending ? "Submitting..." : "Submit for review"}
								</Button>
							) : null}
							<Button
								variant="destructive"
								onClick={() => setConfirmOpen(true)}
								disabled={deactivate.isPending}
							>
								Deactivate
							</Button>
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Version history</CardTitle>
					<CardDescription>Newest first. Every change is audited.</CardDescription>
				</CardHeader>
				<CardContent>
					<ol className="flex flex-col gap-3" aria-label="Version history">
						{article.versions.map(version => (
							<li key={version.id} className="rounded-lg border p-3">
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-sm font-medium">Version {version.version}</span>
									<VersionStatusBadge status={version.status} indexing={version.indexing} />
									<span className="text-muted-foreground text-xs">
										{LANGUAGE_LABELS[version.language]} · updated {formatDate(version.updatedAt)}
										{version.approvedAt ? ` · approved ${formatDate(version.approvedAt)}` : ""}
									</span>
								</div>
								<details className="mt-2">
									<summary className="cursor-pointer text-sm">Show text</summary>
									<p className="mt-2 text-sm whitespace-pre-wrap">{version.body}</p>
								</details>
							</li>
						))}
					</ol>
				</CardContent>
			</Card>

			<AlertDialog open={confirmOpen} onOpenChange={open => !deactivate.isPending && setConfirmOpen(open)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Deactivate this article?</AlertDialogTitle>
						<AlertDialogDescription>
							The assistant stops using “{article.title}” immediately and cached answers built
							on it are cleared. This cannot be undone here.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deactivate.isPending}
							onClick={() =>
								deactivate.mutate(article.id, {
									onSuccess: () => setConfirmOpen(false),
									onError: err => {
										setConfirmOpen(false)
										setActionError(err.message)
									},
								})
							}
						>
							{deactivate.isPending ? "Deactivating..." : "Deactivate"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

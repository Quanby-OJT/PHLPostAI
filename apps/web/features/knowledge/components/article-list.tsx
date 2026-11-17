"use client"

import { useState } from "react"

import { Button } from "@/core/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/core/components/ui/empty"
import { Skeleton } from "@/core/components/ui/skeleton"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/core/components/ui/table"
import { useKnowledgeArticlesQuery } from "@/features/knowledge/api/knowledge.hooks"
import { ArticleDetail } from "@/features/knowledge/components/article-detail"
import { ArticleEditor } from "@/features/knowledge/components/article-editor"
import { VersionStatusBadge } from "@/features/knowledge/components/version-status-badge"
import { categoryLabel, formatDate } from "@/features/knowledge/lib/labels"

type View = { kind: "list" } | { kind: "create" } | { kind: "detail"; id: string }

/** Article list -> detail (with history) -> editor (KB-1 authoring screens). */
export function ArticleList() {
	const [view, setView] = useState<View>({ kind: "list" })
	const { data: articles, isPending, isError, error } = useKnowledgeArticlesQuery()

	if (view.kind === "create") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>New article</CardTitle>
				</CardHeader>
				<CardContent>
					<ArticleEditor
						onDone={id => setView({ kind: "detail", id })}
						onCancel={() => setView({ kind: "list" })}
					/>
				</CardContent>
			</Card>
		)
	}
	if (view.kind === "detail") {
		return <ArticleDetail articleId={view.id} onBack={() => setView({ kind: "list" })} />
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex justify-end">
				<Button onClick={() => setView({ kind: "create" })}>New article</Button>
			</div>
			{isPending ? (
				<Skeleton className="h-40 w-full" />
			) : isError ? (
				<p className="text-destructive text-sm" role="alert">
					{error instanceof Error ? error.message : "Could not load articles."}
				</p>
			) : !articles?.length ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>No articles yet</EmptyTitle>
						<EmptyDescription>
							Write the first article. It reaches customers only after a second person approves it.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Title</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Serving</TableHead>
							<TableHead>Latest version</TableHead>
							<TableHead>Updated</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{articles.map(article => (
							<TableRow key={article.id}>
								<TableCell>
									<Button
										variant="link"
										className="h-auto p-0 text-left wrap-anywhere whitespace-normal"
										onClick={() => setView({ kind: "detail", id: article.id })}
									>
										{article.title}
									</Button>
									{article.status === "deactivated" ? (
										<span className="text-muted-foreground ml-2 text-xs">(deactivated)</span>
									) : null}
								</TableCell>
								<TableCell>{categoryLabel(article.category)}</TableCell>
								<TableCell>
									{article.currentVersion ? `v${article.currentVersion.version}` : "—"}
								</TableCell>
								<TableCell>
									{article.latestVersion ? (
										<span className="flex items-center gap-2">
											v{article.latestVersion.version}
											<VersionStatusBadge status={article.latestVersion.status} />
										</span>
									) : (
										"—"
									)}
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{formatDate(article.updatedAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	)
}

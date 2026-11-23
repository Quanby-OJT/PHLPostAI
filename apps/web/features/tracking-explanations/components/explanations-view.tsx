"use client"

import { useState } from "react"
import { InformationCircleIcon } from "@hugeicons/core-free-icons"

import { PageHeader } from "@/core/components/page-header"
import { Badge } from "@/core/components/ui/badge"
import { Button } from "@/core/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/ui/tabs"
import { LANGUAGE_LABELS } from "@/features/knowledge/lib/labels"
import {
	useDeactivateExplanationMutation,
	useExplanationsQuery,
	useNeededExplanationsQuery,
} from "@/features/tracking-explanations/api/explanations.hooks"
import {
	ExplanationEditor,
	type ExplanationDraft,
} from "@/features/tracking-explanations/components/explanation-editor"

type EditorState = { draft?: ExplanationDraft; editing?: boolean } | null

/** Status Explanations (TRK-2): the wording customers see after each official status. */
export function ExplanationsView() {
	const [tab, setTab] = useState("explanations")
	const [editor, setEditor] = useState<EditorState>(null)

	function open(state: NonNullable<EditorState>) {
		setEditor(state)
		setTab("explanations")
	}

	return (
		<section className="flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
			<PageHeader
				icon={InformationCircleIcon}
				title="Status explanations"
				description="Plain-language wording and next steps shown after each official tracking status. The official status itself is never changed."
			/>
			<Tabs value={tab} onValueChange={value => setTab(String(value))}>
				<TabsList>
					<TabsTrigger value="explanations">Explanations</TabsTrigger>
					<TabsTrigger value="needed">Needs explanation</TabsTrigger>
				</TabsList>
				<TabsContent value="explanations" className="flex flex-col gap-4 pt-4">
					{editor ? (
						<Card>
							<CardHeader>
								<CardTitle>{editor.editing ? "Edit explanation" : "New explanation"}</CardTitle>
							</CardHeader>
							<CardContent>
								<ExplanationEditor
									initial={editor.draft}
									editing={editor.editing}
									onDone={() => setEditor(null)}
									onCancel={() => setEditor(null)}
								/>
							</CardContent>
						</Card>
					) : (
						<div className="flex justify-end">
							<Button onClick={() => open({})}>New explanation</Button>
						</div>
					)}
					<ExplanationList onEdit={draft => open({ draft, editing: true })} />
				</TabsContent>
				<TabsContent value="needed" className="pt-4">
					<NeededList onWrite={draft => open({ draft })} />
				</TabsContent>
			</Tabs>
		</section>
	)
}

function ExplanationList({ onEdit }: { onEdit: (draft: ExplanationDraft) => void }) {
	const query = useExplanationsQuery()
	const deactivate = useDeactivateExplanationMutation()

	if (query.isPending) return <p className="text-muted-foreground text-sm">Loading...</p>
	if (query.isError) {
		return (
			<p className="text-destructive text-sm" role="alert">
				{query.error.message}
			</p>
		)
	}
	if (query.data.length === 0) {
		return <p className="text-muted-foreground text-sm">No explanations yet.</p>
	}

	return (
		<ul aria-label="Status explanations" className="grid gap-3">
			{query.data.map(item => (
				<li key={item.id}>
					<Card>
						<CardContent className="flex flex-col gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-mono text-sm font-medium">{item.statusCode}</span>
								<Badge variant="outline">{LANGUAGE_LABELS[item.language]}</Badge>
								<Badge variant={item.isActive ? "default" : "secondary"}>
									{item.isActive ? "Active" : "Inactive"}
								</Badge>
							</div>
							<p className="text-sm whitespace-pre-wrap">{item.explanation}</p>
							{item.nextSteps ? (
								<p className="text-muted-foreground text-sm whitespace-pre-wrap">
									Next steps: {item.nextSteps}
								</p>
							) : null}
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									size="sm"
									aria-label={`Edit ${item.statusCode} (${LANGUAGE_LABELS[item.language]})`}
									onClick={() => onEdit(item)}
								>
									{item.isActive ? "Edit" : "Edit and reactivate"}
								</Button>
								{item.isActive ? (
									<Button
										variant="outline"
										size="sm"
										aria-label={`Deactivate ${item.statusCode} (${LANGUAGE_LABELS[item.language]})`}
										disabled={deactivate.isPending}
										onClick={() => deactivate.mutate(item.id)}
									>
										Deactivate
									</Button>
								) : null}
							</div>
						</CardContent>
					</Card>
				</li>
			))}
		</ul>
	)
}

function NeededList({ onWrite }: { onWrite: (draft: ExplanationDraft) => void }) {
	const query = useNeededExplanationsQuery()

	if (query.isPending) return <p className="text-muted-foreground text-sm">Loading...</p>
	if (query.isError) {
		return (
			<p className="text-destructive text-sm" role="alert">
				{query.error.message}
			</p>
		)
	}
	if (query.data.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Every status code returned by lookups has an explanation.
			</p>
		)
	}

	return (
		<ul aria-label="Status codes that need an explanation" className="grid gap-3">
			{query.data.map(item => (
				<li key={`${item.statusCode}-${item.language}`}>
					<Card>
						<CardContent className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-mono text-sm font-medium">{item.statusCode}</span>
									<Badge variant="outline">{LANGUAGE_LABELS[item.language]}</Badge>
								</div>
								<p className="text-muted-foreground text-xs">
									Returned {item.lookups} {item.lookups === 1 ? "time" : "times"}, last on{" "}
									{new Date(item.lastSeenAt).toLocaleString()}
								</p>
							</div>
							<Button
								size="sm"
								aria-label={`Write explanation for ${item.statusCode} (${LANGUAGE_LABELS[item.language]})`}
								onClick={() => onWrite({ statusCode: item.statusCode, language: item.language })}
							>
								Write explanation
							</Button>
						</CardContent>
					</Card>
				</li>
			))}
		</ul>
	)
}

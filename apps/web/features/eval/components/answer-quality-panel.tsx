"use client"

import { useState } from "react"

import { Button } from "@/core/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card"
import { Input } from "@/core/components/ui/input"

import {
	useApprovalOptions,
	useEvalBaselineQuery,
	useEvalRunDetail,
	useEvalRunsQuery,
	useExecuteEvalRunMutation,
	usePromoteBaselineMutation,
} from "../api/eval.hooks"

const slices = [
	"overall",
	"en",
	"fil",
	"ceb",
	"ilo",
	"tracking",
	"rates",
	"postal-id",
	"service-info",
]
const metrics = ["grounded", "behaviorCorrect", "languageCorrect"] as const
const percent = (value: number) => `${Math.round(value * 1000) / 10}%`

export function AnswerQualityPanel({ localFixtures }: { localFixtures: boolean }) {
	const { data: runs } = useEvalRunsQuery()
	const execute = useExecuteEvalRunMutation()
	const [selected, setSelected] = useState<string | null>(null)
	const [failuresOnly, setFailuresOnly] = useState(false)
	const { data: detail, error } = useEvalRunDetail(selected)
	const { data: baseline } = useEvalBaselineQuery("evl1")
	const { data: localBaseline } = useEvalBaselineQuery("evl1-local")
	const qualityRuns = runs?.filter(run => run.config.profile)
	const filteredItems = detail?.perItem?.filter(
		item =>
			!failuresOnly ||
			item.quality?.error ||
			metrics.some(metric => item.quality?.[metric] !== true) ||
			Math.max(item.quality?.visibleOutputTokens ?? 201, item.quality?.providerOutputTokens ?? 0) >
				200
	)
	const download = () => {
		if (!detail) return
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" })
		)
		const anchor = document.createElement("a")
		anchor.href = url
		anchor.download = `evl1-${detail.id}.json`
		anchor.click()
		setTimeout(() => URL.revokeObjectURL(url), 1000)
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Answer quality evaluation</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<p className="text-muted-foreground text-sm">
					Accepted EVL-1 baseline {baseline?.runId ?? "—"}
				</p>
				{localFixtures && (
					<p className="text-muted-foreground text-sm">
						Local fixture baseline {localBaseline?.runId ?? "—"}
					</p>
				)}
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={execute.isPending}
						onClick={() =>
							execute.mutate({ profile: "evl1" }, { onSuccess: run => setSelected(run.id) })
						}
					>
						Run approved set
					</Button>
					{localFixtures && (
						<Button
							variant="outline"
							disabled={execute.isPending}
							onClick={() =>
								execute.mutate({ profile: "evl1-local" }, { onSuccess: run => setSelected(run.id) })
							}
						>
							Run local fixtures
						</Button>
					)}
				</div>
				{execute.error && (
					<p role="alert" className="text-destructive text-sm">
						{execute.error.message}
					</p>
				)}
				{Boolean(qualityRuns?.length) && (
					<label className="grid gap-2 text-sm">
						Run
						<select
							value={selected ?? ""}
							onChange={event => setSelected(event.target.value || null)}
							className="border-input bg-background rounded-md border p-2"
						>
							<option value="">Choose a run</option>
							{qualityRuns?.map(run => (
								<option key={run.id} value={run.id}>
									{run.status} ·{" "}
									{run.config.profile === "evl1-local" ? "local simulation" : "approved set"} ·{" "}
									{run.id}
								</option>
							))}
						</select>
					</label>
				)}
				{error && (
					<p className="text-destructive text-sm" role="alert">
						{error.message}
					</p>
				)}
				{detail && (
					<>
						<div className="flex flex-wrap items-center gap-3">
							<p role="status" className="text-sm">
								{detail.status} ·{" "}
								{detail.config.profile === "evl1-local"
									? "Local simulated approvals"
									: "PHLPost approval references"}
							</p>
							<Button
								disabled={detail.status === "running"}
								size="sm"
								variant="outline"
								onClick={download}
							>
								Download report JSON
							</Button>
						</div>
						{detail.error && (
							<p role="alert" className="text-destructive text-sm">
								{detail.error}
							</p>
						)}
						{Array.isArray(detail.config.gateIssues) && detail.config.gateIssues.length > 0 && (
							<details>
								<summary className="cursor-pointer text-sm">
									Gate blockers ({detail.config.gateIssues.length})
								</summary>
								<ul className="list-disc pl-5 text-sm">
									{detail.config.gateIssues.map((issue, index) => (
										<li key={index}>{String(issue)}</li>
									))}
								</ul>
							</details>
						)}
						{detail.metrics && (
							<div className="overflow-x-auto">
								<table className="w-full text-left text-sm">
									<thead>
										<tr>
											{[
												"Coverage",
												"Items",
												"Code-switched",
												"Failed",
												"Grounding",
												"Behavior",
												"Reply language",
											].map(label => (
												<th className="p-2" key={label}>
													{label}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{[
											...slices,
											...slices
												.slice(1, 5)
												.flatMap(language =>
													slices.slice(5).map(useCase => `${language}.${useCase}`)
												),
										].map(slice => (
											<tr className="border-t" key={slice}>
												<th className="p-2 font-medium">{slice}</th>
												<td className="p-2">{detail.metrics?.[`${slice}.count`] ?? 0}</td>
												<td className="p-2">{detail.metrics?.[`${slice}.codeSwitched`] ?? 0}</td>
												<td className="p-2">{detail.metrics?.[`${slice}.failed`] ?? "—"}</td>
												{metrics.map(metric => (
													<td key={metric} className="p-2">
														{percent(detail.metrics?.[`${slice}.${metric}`] ?? 0)}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={failuresOnly}
								onChange={event => setFailuresOnly(event.target.checked)}
							/>{" "}
							Show failures only
						</label>
						{filteredItems?.map(
							item =>
								item.quality && (
									<details key={item.goldenItemId} className="rounded-md border p-2 text-sm">
										<summary className="cursor-pointer">
											{item.quality.expected.language} · {item.quality.expected.useCase} ·{" "}
											{item.question}
										</summary>
										<p className="mt-2 whitespace-pre-wrap">
											{item.answer ?? "No answer recorded"}
										</p>
										<p className="mt-2">
											Expected {item.quality.expected.expectedBehavior} · Actual{" "}
											{item.quality.actualBehavior ?? "unavailable"}
										</p>
										<p>
											Output tokens {item.quality.visibleOutputTokens ?? "unavailable"} · Provider
											completion {item.quality.providerOutputTokens ?? "unavailable"}
										</p>
										<p>{item.quality.error ?? item.quality.judgeReason}</p>
										<pre className="bg-muted mt-2 overflow-x-auto p-2 text-xs">
											{JSON.stringify(item.quality, null, 2)}
										</pre>
									</details>
								)
						)}
					</>
				)}
			</CardContent>
		</Card>
	)
}

export function QualityApprovalPanel() {
	const { data, error } = useApprovalOptions()
	const promote = usePromoteBaselineMutation()
	const [id, setId] = useState("")
	const [note, setNote] = useState("")
	const runs = data?.filter(
		run =>
			run.status === "completed" &&
			Array.isArray(run.config.gateIssues) &&
			!run.config.gateIssues.length
	)
	return (
		<Card>
			<CardHeader>
				<CardTitle>Accept an evaluation baseline</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3">
				<label className="grid gap-1 text-sm">
					Eligible run
					<select
						value={id}
						onChange={event => setId(event.target.value)}
						className="border-input bg-background rounded-md border p-2"
					>
						<option value="">Choose a run</option>
						{runs?.map(run => (
							<option key={run.id} value={run.id}>
								{String(run.config.profile)} · {run.id}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-1 text-sm">
					Reason for accepting
					<Input value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
				</label>
				<Button
					className="w-fit"
					disabled={!id || !note.trim() || promote.isPending}
					onClick={() => promote.mutate({ id, note })}
				>
					Accept baseline
				</Button>
				{(error || promote.error) && (
					<p role="alert" className="text-destructive text-sm">
						{error?.message ?? promote.error?.message}
					</p>
				)}
				{promote.data && (
					<p role="status" className="text-sm">
						Accepted run {promote.data.runId}
					</p>
				)}
			</CardContent>
		</Card>
	)
}

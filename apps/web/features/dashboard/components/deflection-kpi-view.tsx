"use client"

import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/core/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/core/components/ui/card"
import { Input } from "@/core/components/ui/input"
import {
	getManilaDateTimeInput,
	getManilaToday,
	useDeflectionDrilldownQuery,
	useDeflectionReportQuery,
	useKpiDefinitionsQuery,
	useSaveKpiDefinitionMutation,
} from "@/features/dashboard/api/deflection.hooks"

const DEFAULT_CATEGORIES = "tracking, rates, postal-id, service-info, scam"

export function DeflectionKpiView({ readOnly = false }: { readOnly?: boolean }) {
	const today = getManilaToday()
	const [from, setFrom] = useState(today)
	const [to, setTo] = useState(today)
	const [version, setVersion] = useState<number | undefined>(undefined)
	const definitions = useKpiDefinitionsQuery()
	const report = useDeflectionReportQuery(from, to, version)
	const save = useSaveKpiDefinitionMutation()
	const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
	const [includeAbandoned, setIncludeAbandoned] = useState(false)
	const [excludeTestSessions, setExcludeTestSessions] = useState(true)
	const [duplicateWindowMinutes, setDuplicateWindowMinutes] = useState("0")
	const [baselineEligible, setBaselineEligible] = useState("")
	const [baselineResolved, setBaselineResolved] = useState("")
	const [target, setTarget] = useState("70")
	const [effectiveFrom, setEffectiveFrom] = useState(getManilaDateTimeInput())
	const [showDrilldown, setShowDrilldown] = useState(false)
	const drilldown = useDeflectionDrilldownQuery(from, to, version, showDrilldown)

	useEffect(() => {
		const definition = report.data?.definition
		if (!definition) return
		setCategories(definition.method.eligibleCategories.join(", "))
		setIncludeAbandoned(definition.method.includeAbandoned)
		setExcludeTestSessions(definition.method.excludeTestSessions)
		setDuplicateWindowMinutes(String(definition.method.duplicateWindowMinutes))
		setBaselineEligible(definition.baseline ? String(definition.baseline.eligible) : "")
		setBaselineResolved(definition.baseline ? String(definition.baseline.resolved) : "")
		setTarget(String(Math.round(definition.target * 100)))
	}, [report.data?.definition.version])

	const onSave = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const eligible = baselineEligible.trim() ? Number(baselineEligible) : null
		const resolved = baselineResolved.trim() ? Number(baselineResolved) : null
		if ((eligible === null) !== (resolved === null)) return
		save.mutate({
			method: {
				eligibleCategories: categories
					.split(",")
					.map(value => value.trim())
					.filter(Boolean),
				includeAbandoned,
				duplicateWindowMinutes: Number(duplicateWindowMinutes),
				duplicateRule: "same_session_and_category",
				excludeTestSessions,
				excludeEscalated: true,
				excludeUncertainOrBlocked: true,
				failedInteractions: "included_unresolved",
				reportingPeriod: "selected_calendar_days",
				periodTimezone: "Asia/Manila",
			},
			baseline: eligible === null || resolved === null ? null : { eligible, resolved },
			target: Number(target) / 100,
			effectiveFrom: new Date(`${effectiveFrom}:00+08:00`).toISOString(),
		})
	}

	const rateLabel =
		report.data?.rate === null || report.data?.rate === undefined
			? "—"
			: `${(report.data.rate * 100).toFixed(1)}%`

	return (
		<div className="flex flex-col gap-6">
			<header>
				<h1 className="text-2xl font-bold tracking-tight">Deflection KPI</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					AI handling of eligible inquiries, measured against an approved, versioned method. This is
					not an answer accuracy score.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>Deflection rate</CardTitle>
					<CardDescription>Report periods use Asia/Manila calendar days.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-wrap gap-3">
						<label className="grid gap-1 text-sm">
							From{" "}
							<Input type="date" value={from} onChange={event => setFrom(event.target.value)} />
						</label>
						<label className="grid gap-1 text-sm">
							To <Input type="date" value={to} onChange={event => setTo(event.target.value)} />
						</label>
						<label className="grid gap-1 text-sm">
							Definition version{" "}
							<select
								className="border-input bg-background h-9 rounded-md border px-3 text-sm"
								value={version ?? "latest"}
								onChange={event =>
									setVersion(
										event.target.value === "latest" ? undefined : Number(event.target.value)
									)
								}
							>
								<option value="latest">Latest approved</option>
								{definitions.data?.definitions.map(definition => (
									<option key={definition.id} value={definition.version}>
										Version {definition.version}
									</option>
								))}
							</select>
						</label>
					</div>
					{report.isLoading ? (
						<p className="text-sm">Loading KPI…</p>
					) : report.data ? (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<Metric label="Deflection rate" value={rateLabel} />
							<Metric label="Resolved by AI" value={report.data.numerator.toLocaleString()} />
							<Metric label="Eligible inquiries" value={report.data.denominator.toLocaleString()} />
							<Metric
								label="Definition / target"
								value={`v${report.data.definition.version} · ${(report.data.target * 100).toFixed(0)}%`}
							/>
						</div>
					) : (
						<p className="text-muted-foreground text-sm" role="status">
							{report.error instanceof Error
								? report.error.message
								: "No approved KPI definition yet. Create one below."}
						</p>
					)}
					{report.data?.baselineRate !== null && report.data?.baselineRate !== undefined ? (
						<p className="text-muted-foreground text-sm">
							Baseline: {(report.data.baselineRate * 100).toFixed(1)}% (
							{report.data.definition.baseline?.resolved.toLocaleString()} of{" "}
							{report.data.definition.baseline?.eligible.toLocaleString()})
						</p>
					) : null}
					<div>
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowDrilldown(value => !value)}
						>
							{showDrilldown ? "Hide counted conversations" : "Show counted conversations"}
						</Button>
						{showDrilldown ? (
							<div className="mt-3 overflow-x-auto">
								{drilldown.isLoading ? (
									<p className="text-sm">Loading conversations…</p>
								) : drilldown.isError ? (
									<p className="text-destructive text-sm" role="alert">
										{drilldown.error instanceof Error
											? drilldown.error.message
											: "Could not load counted conversations. Please try again."}
									</p>
								) : drilldown.data?.conversations.length ? (
									<table className="w-full text-left text-sm">
										<thead>
											<tr>
												<th className="p-2">Conversation</th>
												<th className="p-2">Started (UTC)</th>
												<th className="p-2">Category</th>
												<th className="p-2">Resolved by AI</th>
											</tr>
										</thead>
										<tbody>
											{drilldown.data.conversations.map(row => (
												<tr key={row.conversationId} className="border-t">
													<td className="p-2 font-mono text-xs">{row.conversationId}</td>
													<td className="p-2">
														{new Date(row.startedAt).toLocaleString("en-US", { timeZone: "UTC" })}
													</td>
													<td className="p-2">{row.category ?? "—"}</td>
													<td className="p-2">{row.resolvedByAi ? "Yes" : "No"}</td>
												</tr>
											))}
										</tbody>
									</table>
								) : (
									<p className="text-muted-foreground mt-2 text-sm">
										No counted conversations for this period.
									</p>
								)}
							</div>
						) : null}
					</div>
				</CardContent>
			</Card>

			{!readOnly ? (
				<Card>
					<CardHeader>
						<CardTitle>Approved definition</CardTitle>
						<CardDescription>
							Saving creates a new immutable version and records an audit entry.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={onSave} className="grid gap-4 md:grid-cols-2">
							<p className="text-muted-foreground text-sm md:col-span-2">
								Fixed rules: escalated and uncertain or blocked sessions never count as AI-resolved;
								failed interactions stay in the denominator as unresolved; duplicate inquiries are
								matched by anonymous session and category within the selected window. Reports use
								the selected Manila calendar days.
							</p>
							<label className="grid gap-1 text-sm md:col-span-2">
								Eligible inquiry categories{" "}
								<Input
									value={categories}
									onChange={event => setCategories(event.target.value)}
									required
								/>
							</label>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={includeAbandoned}
									onChange={event => setIncludeAbandoned(event.target.checked)}
								/>{" "}
								Include abandoned sessions in the denominator
							</label>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={excludeTestSessions}
									onChange={event => setExcludeTestSessions(event.target.checked)}
								/>{" "}
								Exclude marked test sessions
							</label>
							<label className="grid gap-1 text-sm">
								Duplicate window (minutes; 0 disables){" "}
								<Input
									type="number"
									min="0"
									max="10080"
									value={duplicateWindowMinutes}
									onChange={event => setDuplicateWindowMinutes(event.target.value)}
								/>
							</label>
							<label className="grid gap-1 text-sm">
								Target (%){" "}
								<Input
									type="number"
									min="0"
									max="100"
									value={target}
									onChange={event => setTarget(event.target.value)}
								/>
							</label>
							<label className="grid gap-1 text-sm">
								Effective from (Manila){" "}
								<Input
									type="datetime-local"
									value={effectiveFrom}
									onChange={event => setEffectiveFrom(event.target.value)}
									required
								/>
							</label>
							<label className="grid gap-1 text-sm">
								Baseline eligible volume{" "}
								<Input
									type="number"
									min="0"
									value={baselineEligible}
									onChange={event => setBaselineEligible(event.target.value)}
								/>
							</label>
							<label className="grid gap-1 text-sm">
								Baseline resolved by AI{" "}
								<Input
									type="number"
									min="0"
									value={baselineResolved}
									onChange={event => setBaselineResolved(event.target.value)}
								/>
							</label>
							<div className="md:col-span-2">
								<Button
									type="submit"
									disabled={
										save.isPending ||
										!categories.trim() ||
										(baselineEligible === "") !== (baselineResolved === "")
									}
								>
									{save.isPending ? "Approving…" : "Approve new version"}
								</Button>
								{save.isError ? (
									<p className="text-destructive mt-2 text-sm" role="alert">
										{save.error.message}
									</p>
								) : null}
								{save.isSuccess ? (
									<p className="mt-2 text-sm" role="status">
										Definition approved. Reports will show its version.
									</p>
								) : null}
							</div>
						</form>
					</CardContent>
				</Card>
			) : null}
		</div>
	)
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border p-4">
			<p className="text-muted-foreground text-sm">{label}</p>
			<p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
		</div>
	)
}

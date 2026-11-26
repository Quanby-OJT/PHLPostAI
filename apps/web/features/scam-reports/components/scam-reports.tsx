"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"

import { ScamFindingSchema, type ScamFinding, type ScamReportStatus } from "@repo/contracts"

import { Badge } from "@/core/components/ui/badge"
import { Button } from "@/core/components/ui/button"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/core/components/ui/table"
import { Textarea } from "@/core/components/ui/textarea"

import {
	useChangeScamReport,
	useScamReportDetail,
	useScamReportQueue,
} from "../api/scam-reports.hooks"

const statusText: Record<ScamReportStatus, string> = {
	reported: "Reported",
	under_review: "Under review",
	confirmed_scam: "Confirmed scam",
	legitimate: "Legitimate",
	inconclusive: "Inconclusive",
	closed: "Closed",
}
const panel = "min-w-0 space-y-3 rounded-lg border p-4"

export function ScamReportQueue() {
	const [page, setPage] = useState(1)
	const query = useScamReportQueue(page)

	return (
		<section className="min-w-0 space-y-4">
			<h1 className="text-2xl font-semibold">Scam Reports</h1>
			{query.isPending && <p role="status">Loading scam reports…</p>}
			{query.error && <p role="alert">{query.error.message}</p>}
			{query.data?.reports.length === 0 && <p>No scam reports on this page.</p>}
			{query.data && query.data.reports.length > 0 && (
				<div className="min-w-0 rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Reference</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Assessed risk</TableHead>
								<TableHead>Reported</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{query.data.reports.map(report => (
								<TableRow key={report.id}>
									<TableCell>
										<Link
											className="text-primary font-medium underline"
											href={`/scam-reports/${report.id}`}
										>
											{report.id}
										</Link>
									</TableCell>
									<TableCell>
										<Badge variant="secondary">{statusText[report.status]}</Badge>
									</TableCell>
									<TableCell className="capitalize">{report.riskLevel}</TableCell>
									<TableCell>
										<time dateTime={report.createdAt}>
											{new Date(report.createdAt).toLocaleString()}
										</time>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
			{(page > 1 || query.data?.hasNextPage) && (
				<nav aria-label="Report queue pages" className="flex items-center gap-2">
					<Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
						Previous
					</Button>
					<span>Page {page}</span>
					<Button
						variant="outline"
						disabled={!query.data?.hasNextPage}
						onClick={() => setPage(page + 1)}
					>
						Next
					</Button>
				</nav>
			)}
		</section>
	)
}

export function ScamReportDetailView({ id, canValidate }: { id: string; canValidate: boolean }) {
	const query = useScamReportDetail(id)
	const change = useChangeScamReport()
	const [finding, setFinding] = useState<ScamFinding | "">("")
	const [notes, setNotes] = useState("")
	const report = query.data

	function recordFinding(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!finding || !notes.trim() || change.isPending) return
		change.mutate({ id, action: "record_finding", finding, notes: notes.trim() })
	}

	return (
		<div className="min-w-0 space-y-4">
			<Link href="/scam-reports" className="text-primary underline">
				Back to Scam Reports
			</Link>
			<h1 className="text-2xl font-semibold">Scam Report</h1>
			{query.isPending && <p role="status">Loading scam report…</p>}
			{query.error && <p role="alert">{query.error.message}</p>}
			{report && (
				<>
					<section className={panel}>
						<p>
							Reference <strong className="break-all">{report.id}</strong>
						</p>
						<p>
							Status <Badge variant="secondary">{statusText[report.status]}</Badge>
						</p>
					</section>
					<section className={panel} aria-labelledby="scam-report-evidence">
						<h2 id="scam-report-evidence" className="font-semibold">
							Masked submission
						</h2>
						<p className="whitespace-pre-wrap break-words">{report.contentMasked}</p>
						<h3 className="font-medium">Extracted links</h3>
						{report.extractedUrls.length ? (
							<ul className="list-disc pl-5">
								{report.extractedUrls.map((url, index) => (
									<li key={index}>
										<code className="break-all">{url}</code>
									</li>
								))}
							</ul>
						) : (
							<p>No links extracted.</p>
						)}
					</section>
					<section className={panel}>
						<h2 className="font-semibold">Original assessment</h2>
						<p>The assessment is advisory.</p>
						<p>
							Risk level <strong className="capitalize">{report.riskLevel}</strong>
						</p>
						<p>
							Confidence {report.confidence.toLocaleString(undefined, { maximumFractionDigits: 2 })}
						</p>
						<h3 className="font-medium">Detected indicators</h3>
						{report.indicators.length ? (
							<ul className="list-disc pl-5">
								{report.indicators.map(indicator => (
									<li key={indicator}>{indicator.replaceAll("_", " ")}</li>
								))}
							</ul>
						) : (
							<p>No indicators detected.</p>
						)}
					</section>
					<section className={panel}>
						<h2 className="font-semibold">Review</h2>
						{report.reviewerId && (
							<p>
								Reviewer ID <span className="break-all">{report.reviewerId}</span>
							</p>
						)}
						{report.finding && (
							<p>
								Finding <strong>{statusText[report.finding]}</strong>
							</p>
						)}
						{report.notes && <p className="whitespace-pre-wrap break-words">{report.notes}</p>}
						{!canValidate && <p className="text-muted-foreground">You have read-only access.</p>}
						{canValidate && report.status === "reported" && (
							<Button
								disabled={change.isPending}
								onClick={() => change.mutate({ id, action: "start_review" })}
							>
								Start review
							</Button>
						)}
						{canValidate && report.status === "under_review" && (
							<form className="grid gap-3" onSubmit={recordFinding}>
								<div className="grid gap-1">
									<label htmlFor="scam-report-finding">Finding</label>
									<select
										id="scam-report-finding"
										className="bg-background min-h-10 rounded-md border p-2"
										required
										value={finding}
										disabled={change.isPending}
										onChange={event =>
											setFinding(ScamFindingSchema.safeParse(event.target.value).data ?? "")
										}
									>
										<option value="">Select a finding</option>
										{ScamFindingSchema.options.map(value => (
											<option key={value} value={value}>
												{statusText[value]}
											</option>
										))}
									</select>
								</div>
								<label className="grid gap-1">
									Reviewer notes
									<Textarea
										required
										value={notes}
										maxLength={2000}
										rows={4}
										disabled={change.isPending}
										onChange={event => setNotes(event.target.value)}
									/>
								</label>
								<Button
									className="justify-self-start"
									type="submit"
									disabled={change.isPending || !finding || !notes.trim()}
								>
									Save finding
								</Button>
							</form>
						)}
						{canValidate && report.finding && report.status !== "closed" && (
							<Button
								variant="outline"
								disabled={change.isPending}
								onClick={() => change.mutate({ id, action: "close" })}
							>
								Close report
							</Button>
						)}
						{change.isPending && <p role="status">Saving review…</p>}
						{change.isSuccess && <p role="status">Review saved.</p>}
						{change.error && <p role="alert">{change.error.message}</p>}
					</section>
				</>
			)}
		</div>
	)
}

export function ScamReportAccessDenied() {
	return (
		<section className="space-y-2">
			<h1 className="text-2xl font-semibold">Scam Reports</h1>
			<p role="alert">
				Ask an administrator for the <code>scam.reports.view</code> permission.
			</p>
		</section>
	)
}

"use client"

import Link from "next/link"

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/core/components/ui/card"
import { getManilaToday, useDeflectionReportQuery } from "@/features/dashboard/api/deflection.hooks"

export function DeflectionDashboardTile() {
	const today = getManilaToday()
	const report = useDeflectionReportQuery(today, today)
	return (
		<Card>
			<CardHeader>
				<CardDescription>Today’s deflection rate</CardDescription>
				<CardTitle className="text-2xl tabular-nums">
					{report.isLoading
						? "…"
						: report.data?.rate === null || report.data?.rate === undefined
							? "—"
							: `${(report.data.rate * 100).toFixed(1)}%`}
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<p className="text-muted-foreground text-xs">
					{report.data
						? `${report.data.numerator} of ${report.data.denominator} eligible · v${report.data.definition.version} · baseline ${report.data.baselineRate === null ? "not set" : `${(report.data.baselineRate * 100).toFixed(1)}%`} · target ${(report.data.target * 100).toFixed(0)}%`
						: report.error
							? "No approved definition or report unavailable"
							: "Today (Manila)"}
				</p>
				<Link
					href="/analytics/deflection"
					className="text-primary text-xs underline underline-offset-4"
				>
					View KPI details
				</Link>
			</CardContent>
		</Card>
	)
}

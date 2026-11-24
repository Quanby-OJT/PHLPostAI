"use client"

import { Coins01Icon } from "@hugeicons/core-free-icons"

import { PageHeader } from "@/core/components/page-header"
import { Badge } from "@/core/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/ui/tabs"
import { useRateBatchesQuery, useRateEntriesQuery } from "@/features/rates/api/rates.hooks"
import { RateImport } from "@/features/rates/components/rate-import"
import { RateReview } from "@/features/rates/components/rate-review"
import { RateTable } from "@/features/rates/components/rate-table"

interface RatesViewProps {
	canManage: boolean
	canApprove: boolean
}

/** Postal rates (KB-2): the only prices the assistant may quote (PRD D4). */
export function RatesView({ canManage, canApprove }: RatesViewProps) {
	return (
		<section className="flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
			<PageHeader
				icon={Coins01Icon}
				title="Postal rates"
				description="The published rates the assistant quotes. A new rate file goes live only after a second person approves it."
			/>
			<Tabs defaultValue={canManage ? "rates" : "review"}>
				<TabsList>
					{canManage ? <TabsTrigger value="rates">Current rates</TabsTrigger> : null}
					{canManage ? <TabsTrigger value="import">Import CSV</TabsTrigger> : null}
					{canApprove ? <TabsTrigger value="review">Review queue</TabsTrigger> : null}
				</TabsList>
				{canManage ? (
					<TabsContent value="rates" className="flex flex-col gap-6 pt-4">
						<CurrentRates />
						<BatchHistory />
					</TabsContent>
				) : null}
				{canManage ? (
					<TabsContent value="import" className="pt-4">
						<RateImport />
					</TabsContent>
				) : null}
				{canApprove ? (
					<TabsContent value="review" className="pt-4">
						<RateReview />
					</TabsContent>
				) : null}
			</Tabs>
		</section>
	)
}

function CurrentRates() {
	const entries = useRateEntriesQuery()
	if (entries.isPending) return <p className="text-muted-foreground text-sm">Loading...</p>
	if (entries.isError) {
		return (
			<p className="text-destructive text-sm" role="alert">
				{entries.error.message}
			</p>
		)
	}
	if (entries.data.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No approved rates yet. Until there are, the assistant says it has no published rate.
			</p>
		)
	}
	return (
		<RateTable
			label="Approved rates"
			rows={entries.data.map(entry => ({ ...entry, key: entry.id }))}
		/>
	)
}

const STATUS_VARIANT = { pending: "secondary", approved: "default", rejected: "outline" } as const

function BatchHistory() {
	const batches = useRateBatchesQuery()
	if (!batches.data || batches.data.length === 0) return null
	return (
		<div className="flex flex-col gap-2">
			<h2 className="text-sm font-semibold">Imports</h2>
			<ul aria-label="Rate imports" className="grid gap-2">
				{batches.data.map(batch => (
					<li key={batch.id} className="flex flex-wrap items-center gap-2 text-sm">
						<span className="font-medium">{batch.fileName}</span>
						<span className="text-muted-foreground">{batch.rowCount} rate(s)</span>
						<Badge variant={STATUS_VARIANT[batch.status]}>{batch.status}</Badge>
						{batch.reviewNote ? (
							<span className="text-muted-foreground">Note: {batch.reviewNote}</span>
						) : null}
					</li>
				))}
			</ul>
		</div>
	)
}

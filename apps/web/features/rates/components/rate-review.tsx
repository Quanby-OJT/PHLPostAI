"use client"

import { useState } from "react"

import { Button } from "@/core/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card"
import { Textarea } from "@/core/components/ui/textarea"
import {
	useApproveRateBatchMutation,
	useRateReviewQueueQuery,
	useRejectRateBatchMutation,
	type RateBatchDetailUi,
} from "@/features/rates/api/rates.hooks"
import { RateTable } from "@/features/rates/components/rate-table"

/** KB-2 AC4 / Flow E: a second user approves or rejects each submitted batch. */
export function RateReview() {
	const queue = useRateReviewQueueQuery()

	if (queue.isPending) return <p className="text-muted-foreground text-sm">Loading...</p>
	if (queue.isError) {
		return (
			<p className="text-destructive text-sm" role="alert">
				{queue.error.message}
			</p>
		)
	}
	if (queue.data.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No rate batches are waiting for approval.</p>
		)
	}
	return (
		<ul aria-label="Rate batches waiting for approval" className="grid gap-4">
			{queue.data.map(batch => (
				<li key={batch.id}>
					<BatchCard batch={batch} />
				</li>
			))}
		</ul>
	)
}

function BatchCard({ batch }: { batch: RateBatchDetailUi }) {
	const approve = useApproveRateBatchMutation()
	const reject = useRejectRateBatchMutation()
	const [rejecting, setRejecting] = useState(false)
	const [note, setNote] = useState("")
	const [error, setError] = useState<string | null>(null)
	const busy = approve.isPending || reject.isPending

	async function run(action: () => Promise<unknown>) {
		setError(null)
		try {
			await action()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Something went wrong")
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					{batch.fileName} · {batch.rowCount} rate(s)
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					Submitted {new Date(batch.createdAt).toLocaleString()}
				</p>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<RateTable
					label={`Rates in ${batch.fileName}`}
					rows={batch.entries.map(entry => ({ ...entry, key: entry.id }))}
				/>
				{error ? (
					<p className="text-destructive text-sm" role="alert">
						{error}
					</p>
				) : null}
				{rejecting ? (
					<div className="flex flex-col gap-2">
						<Textarea
							aria-label="Why is this batch rejected?"
							value={note}
							onChange={e => setNote(e.target.value)}
							rows={2}
							disabled={busy}
						/>
						<div className="flex gap-2">
							<Button
								variant="destructive"
								disabled={busy || !note.trim()}
								onClick={() => run(() => reject.mutateAsync({ id: batch.id, note: note.trim() }))}
							>
								Reject batch
							</Button>
							<Button variant="outline" disabled={busy} onClick={() => setRejecting(false)}>
								Cancel
							</Button>
						</div>
					</div>
				) : (
					<div className="flex gap-2">
						<Button disabled={busy} onClick={() => run(() => approve.mutateAsync(batch.id))}>
							{approve.isPending ? "Approving..." : "Approve"}
						</Button>
						<Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
							Reject
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

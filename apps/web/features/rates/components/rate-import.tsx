"use client"

import { useState } from "react"

import type { RatePreview } from "@repo/contracts"

import { Button } from "@/core/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/core/components/ui/field"
import { Input } from "@/core/components/ui/input"
import { usePreviewRatesMutation, useSubmitRatesMutation } from "@/features/rates/api/rates.hooks"
import { RateTable } from "@/features/rates/components/rate-table"

function readText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
		reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"))
		reader.readAsText(file)
	})
}

/** KB-2 AC4: upload a CSV, preview rows and errors, then submit it for a second user's approval. */
export function RateImport() {
	const [file, setFile] = useState<{ name: string; text: string } | null>(null)
	const [preview, setPreview] = useState<RatePreview | null>(null)
	const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null)
	const previewRates = usePreviewRatesMutation()
	const submitRates = useSubmitRatesMutation()
	const busy = previewRates.isPending || submitRates.isPending

	async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
		const chosen = event.target.files?.[0]
		setPreview(null)
		setMessage(null)
		if (!chosen) {
			setFile(null)
			return
		}
		setFile({ name: chosen.name, text: await readText(chosen) })
	}

	async function runPreview() {
		if (!file) return
		setMessage(null)
		try {
			setPreview(await previewRates.mutateAsync({ fileName: file.name, csv: file.text }))
		} catch (error) {
			setMessage({ kind: "error", text: error instanceof Error ? error.message : "Preview failed" })
		}
	}

	async function submit() {
		if (!file) return
		try {
			const batch = await submitRates.mutateAsync({ fileName: file.name, csv: file.text })
			setMessage({
				kind: "success",
				text: `Submitted ${batch.rowCount} rate(s) for approval. They go live when a second user approves the batch.`,
			})
			setPreview(null)
			setFile(null)
		} catch (error) {
			setMessage({ kind: "error", text: error instanceof Error ? error.message : "Submit failed" })
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<Field>
				<FieldLabel htmlFor="rates-csv">Rates CSV file</FieldLabel>
				<Input
					id="rates-csv"
					type="file"
					accept=".csv,text/csv"
					onChange={chooseFile}
					disabled={busy}
				/>
				<FieldDescription>
					Columns: service_code, service_name, zone, weight_min_g, weight_max_g, price_php,
					effective_from, effective_to (optional). Dates as YYYY-MM-DD.
				</FieldDescription>
			</Field>
			<div className="flex flex-wrap gap-2">
				<Button variant="outline" onClick={runPreview} disabled={!file || busy}>
					{previewRates.isPending ? "Checking..." : "Preview"}
				</Button>
				<Button onClick={submit} disabled={!preview?.valid || busy}>
					{submitRates.isPending ? "Submitting..." : "Submit for approval"}
				</Button>
			</div>

			{message ? (
				<p
					className={message.kind === "error" ? "text-destructive text-sm" : "text-sm"}
					role={message.kind === "error" ? "alert" : "status"}
				>
					{message.text}
				</p>
			) : null}

			{preview ? (
				<div className="flex flex-col gap-3">
					<p className="text-sm" role="status">
						{preview.valid
							? `${preview.rows.length} valid row(s). Nothing is live until the batch is approved.`
							: `${preview.errors.length} error(s) found. Fix the file and preview it again.`}
					</p>
					{preview.errors.length > 0 ? (
						<ul aria-label="Errors" className="text-destructive list-disc pl-5 text-sm">
							{preview.errors.map((error, index) => (
								<li key={`${error.line}-${index}`}>
									Line {error.line}: {error.message}
								</li>
							))}
						</ul>
					) : null}
					{preview.rows.length > 0 ? (
						<RateTable
							label="Preview"
							rows={preview.rows.map(row => ({ ...row, key: String(row.line) }))}
						/>
					) : null}
				</div>
			) : null}
		</div>
	)
}

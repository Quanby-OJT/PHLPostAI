"use client"

import { useState, type FormEvent } from "react"

import {
	CreateOfficialContactSchema,
	CreateRiskIndicatorSchema,
	TestScamAssessmentRequestSchema,
	UpdateRiskIndicatorSchema,
	type OfficialContact,
} from "@repo/contracts"

import { Badge } from "@/core/components/ui/badge"
import { Button } from "@/core/components/ui/button"
import { Field, FieldLabel } from "@/core/components/ui/field"
import { Input } from "@/core/components/ui/input"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/core/components/ui/table"
import { Textarea } from "@/core/components/ui/textarea"

import { useOfficialContacts, useRiskIndicators, useTestScamAssessment } from "../api/scam.hooks"

const panel = "space-y-4 rounded-md border p-4"

function Feedback({ error, success }: { error?: string | null; success?: string }) {
	if (error)
		return (
			<p role="alert" className="text-destructive text-sm">
				{error}
			</p>
		)
	return success ? (
		<p role="status" className="text-sm">
			{success}
		</p>
	) : null
}

function TestAssessment() {
	const [query, setQuery] = useState("")
	const test = useTestScamAssessment()
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const parsed = TestScamAssessmentRequestSchema.safeParse({ query })
		if (parsed.success) test.mutate(parsed.data.query)
	}
	return (
		<section className={panel} aria-labelledby="test-scam-heading">
			<h2 id="test-scam-heading" className="text-base font-semibold">
				Test assessment
			</h2>
			<form onSubmit={submit} className="space-y-3">
				<Field>
					<FieldLabel htmlFor="scam-sample">Sample suspicious message</FieldLabel>
					<Textarea
						id="scam-sample"
						value={query}
						required
						maxLength={4000}
						rows={4}
						autoComplete="off"
						spellCheck={false}
						disabled={test.isPending}
						onChange={event => {
							test.reset()
							setQuery(event.target.value)
						}}
					/>
				</Field>
				<Button type="submit" disabled={!query.trim() || test.isPending}>
					{test.isPending ? "Assessing…" : "Run test assessment"}
				</Button>
			</form>
			<Feedback error={test.error?.message} />
			{test.data && (
				<div role="status" className="space-y-2 text-sm">
					<p>
						<strong>Assessed risk</strong> <span className="capitalize">{test.data.riskLevel}</span>
					</p>
					<p>Confidence {test.data.confidence}</p>
					{test.data.indicators.length ? (
						<ul aria-label="Indicators found" className="list-disc space-y-1 pl-5">
							{test.data.indicators.map(indicator => (
								<li key={indicator.code}>
									{indicator.name} <code>{indicator.code}</code> (weight {indicator.weight})
								</li>
							))}
						</ul>
					) : (
						<p>No indicators fired.</p>
					)}
				</div>
			)}
		</section>
	)
}

export function RiskIndicatorsView() {
	const { list, create, update } = useRiskIndicators()
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState("")
	const busy = create.isPending || update.isPending

	function addIndicator(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = event.currentTarget
		const fields = new FormData(form)
		setError(null)
		setNotice("")
		const parsed = CreateRiskIndicatorSchema.safeParse({
			code: fields.get("code"),
			name: fields.get("name"),
			weight: Number(fields.get("weight")),
		})
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Enter a valid indicator.")
			return
		}
		create.mutate(parsed.data, {
			onError: failure => setError(failure.message),
			onSuccess: row => {
				form.reset()
				setNotice(`Added ${row.name}.`)
			},
		})
	}

	function saveIndicator(input: { code: string; weight?: number; isActive?: boolean }) {
		setError(null)
		setNotice("")
		const parsed = UpdateRiskIndicatorSchema.safeParse(input)
		if (!parsed.success) {
			setError("Enter a whole-number weight from 1 through 10.")
			return
		}
		update.mutate(parsed.data, {
			onError: failure => setError(failure.message),
			onSuccess: row => setNotice(`Saved ${row.name}.`),
		})
	}

	return (
		<div className="space-y-6 p-4 sm:p-6">
			<div>
				<h1 className="text-lg font-semibold">Risk Indicators</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Active indicators contribute their weight to each new scam assessment.
				</p>
			</div>
			<Feedback error={list.error?.message ?? error} success={notice} />
			<form className={panel} onSubmit={addIndicator} aria-label="Add a risk indicator">
				<h2 className="text-base font-semibold">Add a risk indicator</h2>
				<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_6rem]">
					<Field>
						<FieldLabel htmlFor="indicator-code">Code</FieldLabel>
						<Input
							id="indicator-code"
							name="code"
							placeholder="gift_card_request"
							required
							maxLength={60}
							disabled={busy}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="indicator-name">Signal description</FieldLabel>
						<Input
							id="indicator-name"
							name="name"
							placeholder="Request to pay with gift cards"
							required
							maxLength={100}
							disabled={busy}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="indicator-weight">Weight</FieldLabel>
						<Input
							id="indicator-weight"
							name="weight"
							type="number"
							min={1}
							max={10}
							defaultValue={1}
							required
							disabled={busy}
						/>
					</Field>
				</div>
				<Button type="submit" disabled={busy}>
					{create.isPending ? "Adding…" : "Add indicator"}
				</Button>
			</form>
			{list.isPending ? (
				<p role="status" className="text-sm">
					Loading risk indicators…
				</p>
			) : list.data?.length === 0 ? (
				<p className="text-sm">There are no risk indicators yet.</p>
			) : (
				list.data && (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Indicator</TableHead>
									<TableHead>Weight</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{list.data.map(row => (
									<TableRow key={row.code}>
										<TableCell>
											<p className="font-medium">{row.name}</p>
											<code className="text-muted-foreground text-xs">{row.code}</code>
										</TableCell>
										<TableCell>
											<form
												key={row.weight}
												className="flex items-center gap-2"
												onSubmit={event => {
													event.preventDefault()
													saveIndicator({
														code: row.code,
														weight: Number(new FormData(event.currentTarget).get("weight")),
													})
												}}
											>
												<Input
													aria-label={`Weight for ${row.name}`}
													name="weight"
													type="number"
													min={1}
													max={10}
													defaultValue={row.weight}
													required
													className="w-16"
													disabled={busy}
												/>
												<Button type="submit" variant="outline" size="sm" disabled={busy}>
													Save weight
												</Button>
											</form>
										</TableCell>
										<TableCell>
											<Badge variant={row.isActive ? "default" : "secondary"}>
												{row.isActive ? "Active" : "Inactive"}
											</Badge>
										</TableCell>
										<TableCell>
											<Button
												variant="outline"
												size="sm"
												disabled={busy}
												aria-label={`${row.isActive ? "Deactivate" : "Reactivate"} ${row.name}`}
												onClick={() => saveIndicator({ code: row.code, isActive: !row.isActive })}
											>
												{row.isActive ? "Deactivate" : "Reactivate"}
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)
			)}
			<TestAssessment />
		</div>
	)
}

const contactLabel: Record<OfficialContact["kind"], string> = {
	"domain": "Domain",
	"sender": "Sender name",
	"payment-channel": "Payment channel",
}

export function OfficialContactsView() {
	const { list, create } = useOfficialContacts()
	const [validation, setValidation] = useState<string | null>(null)
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = event.currentTarget
		const fields = new FormData(form)
		const parsed = CreateOfficialContactSchema.safeParse({
			kind: fields.get("kind"),
			value: fields.get("value"),
		})
		if (!parsed.success) {
			setValidation(parsed.error.issues[0]?.message ?? "Enter a valid official contact.")
			return
		}
		setValidation(null)
		create.mutate(parsed.data, { onSuccess: () => form.reset() })
	}
	return (
		<div className="space-y-6 p-4 sm:p-6">
			<div>
				<h1 className="text-lg font-semibold">Official Contacts</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Maintain genuine PHLPost domains, sender names, and payment channels. Sender names can be
					spoofed.
				</p>
			</div>
			<form className={panel} onSubmit={submit} aria-label="Add an official contact">
				<h2 className="text-base font-semibold">Add an official contact</h2>
				<div className="grid gap-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)]">
					<Field>
						<FieldLabel htmlFor="scam-contact-kind">Contact type</FieldLabel>
						<select
							id="scam-contact-kind"
							name="kind"
							disabled={create.isPending}
							className="border-input bg-background min-h-9 rounded-md border px-3 text-sm"
						>
							{Object.entries(contactLabel).map(([kind, label]) => (
								<option key={kind} value={kind}>
									{label}
								</option>
							))}
						</select>
					</Field>
					<Field>
						<FieldLabel htmlFor="scam-contact-value">Hostname or contact name</FieldLabel>
						<Input
							id="scam-contact-value"
							name="value"
							required
							maxLength={253}
							disabled={create.isPending}
						/>
					</Field>
				</div>
				<Button type="submit" disabled={create.isPending}>
					{create.isPending ? "Adding…" : "Add contact"}
				</Button>
			</form>
			<Feedback
				error={list.error?.message ?? validation ?? create.error?.message}
				success={create.data ? "Official contact added." : undefined}
			/>
			{list.isPending ? (
				<p role="status" className="text-sm">
					Loading official contacts…
				</p>
			) : list.data?.length === 0 ? (
				<p className="text-sm">There are no official contacts yet.</p>
			) : (
				list.data && (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Type</TableHead>
									<TableHead>Value</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{list.data.map(contact => (
									<TableRow key={contact.id}>
										<TableCell>{contactLabel[contact.kind]}</TableCell>
										<TableCell className="wrap-anywhere max-w-72 whitespace-normal">
											{contact.value}
										</TableCell>
										<TableCell>
											<Badge variant={contact.isActive ? "default" : "secondary"}>
												{contact.isActive ? "Active" : "Inactive"}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)
			)}
		</div>
	)
}

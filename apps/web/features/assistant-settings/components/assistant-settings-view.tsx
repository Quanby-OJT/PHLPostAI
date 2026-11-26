"use client"

import { useState } from "react"

import type { AssistantSettings } from "@repo/contracts"

import {
	useAssistantSettingsQuery,
	useUpdateAssistantSettingsMutation,
} from "../api/assistant-settings.hooks"

export function AssistantSettingsView() {
	const { data, isLoading, error } = useAssistantSettingsQuery()
	const update = useUpdateAssistantSettingsMutation()

	return (
		<div className="max-w-3xl space-y-6 p-6">
			<header>
				<h1 className="text-lg font-semibold">Assistant Settings</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Choose when the assistant should answer on its own and the maximum length of routine
					answers. Changes apply to the next customer message.
				</p>
			</header>

			{(error || update.error) && (
				<p
					role="alert"
					className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
				>
					{(error ?? update.error)?.message}
				</p>
			)}
			{update.isSuccess && (
				<p role="status" className="text-sm">
					Assistant settings saved.
				</p>
			)}

			{isLoading || !data ? (
				<p className="text-muted-foreground text-sm">Loading assistant settings…</p>
			) : (
				<SettingsForm
					key={`${data.confidenceThreshold}:${data.maxOutputTokens}:${data.blockedTopics.join("|")}`}
					initial={data}
					saving={update.isPending}
					onSave={values => update.mutate(values)}
				/>
			)}
		</div>
	)
}

/** Keyed on the saved values, so a reload starts the form from them without an effect. */
function SettingsForm({
	initial,
	saving,
	onSave,
}: {
	initial: AssistantSettings
	saving: boolean
	onSave: (values: AssistantSettings) => void
}) {
	const [threshold, setThreshold] = useState(String(initial.confidenceThreshold))
	const [maxOutputTokens, setMaxOutputTokens] = useState(String(initial.maxOutputTokens))
	const [blockedTopics, setBlockedTopics] = useState(initial.blockedTopics.join("\n"))

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		onSave({
			confidenceThreshold: Number(threshold),
			maxOutputTokens: Number(maxOutputTokens),
			blockedTopics: blockedTopics
				.split("\n")
				.map(topic => topic.trim())
				.filter(Boolean),
		})
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-6 rounded-md border p-5">
			<div className="space-y-2">
				<label htmlFor="confidence-threshold" className="block text-sm font-medium">
					Confidence threshold
				</label>
				<p className="text-muted-foreground text-sm">
					Answers below this score are replaced with an uncertainty message and an offer to speak
					with a person.
				</p>
				<div className="flex items-center gap-4">
					<input
						id="confidence-threshold"
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={threshold}
						onChange={event => setThreshold(event.target.value)}
						className="w-full"
					/>
					<output htmlFor="confidence-threshold" className="w-12 text-right font-mono text-sm">
						{Number(threshold).toFixed(2)}
					</output>
				</div>
			</div>

			<div className="space-y-2">
				<label htmlFor="blocked-topics" className="block text-sm font-medium">
					Blocked topics and phrases
				</label>
				<p className="text-muted-foreground text-sm">
					One topic or phrase per line. Matching answers are replaced with the uncertainty reply.
				</p>
				<textarea
					id="blocked-topics"
					rows={5}
					maxLength={12000}
					value={blockedTopics}
					onChange={event => setBlockedTopics(event.target.value)}
					className="border-input bg-background w-full rounded-md border p-3 text-sm"
				/>
			</div>

			<div className="space-y-2">
				<label htmlFor="max-output-tokens" className="block text-sm font-medium">
					Routine answer limit
				</label>
				<p className="text-muted-foreground text-sm">
					Set from 1 to 200 tokens. If an answer is shortened, it ends at a complete sentence and
					offers more detail when the limit allows.
				</p>
				<input
					id="max-output-tokens"
					type="number"
					min="1"
					max="200"
					step="1"
					value={maxOutputTokens}
					onChange={event => setMaxOutputTokens(event.target.value)}
					className="border-input bg-background h-9 w-32 rounded-md border px-3 text-sm"
				/>
			</div>

			<button
				type="submit"
				disabled={saving || !threshold || !maxOutputTokens}
				className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
			>
				{saving ? "Saving…" : "Save settings"}
			</button>
		</form>
	)
}

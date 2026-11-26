"use client"

import { useState } from "react"

import type { EscalationSettings } from "@repo/contracts"

import {
	useAgentCapacitiesQuery,
	useSetAgentChatLimitMutation,
	type AgentCapacity,
} from "../../escalations/api/escalations.hooks"
import {
	useEscalationSettingsQuery,
	useUpdateEscalationSettingsMutation,
} from "../api/escalation-settings.hooks"

const CATEGORIES = [
	"tracking",
	"rates",
	"postal-id",
	"service-info",
	"scam",
	"complaint",
	"other",
] as const

const DAY_LABELS = {
	monday: "Monday",
	tuesday: "Tuesday",
	wednesday: "Wednesday",
	thursday: "Thursday",
	friday: "Friday",
	saturday: "Saturday",
	sunday: "Sunday",
} as const

export function EscalationSettingsView() {
	const { data, isLoading, error } = useEscalationSettingsQuery()
	const update = useUpdateEscalationSettingsMutation()
	const agents = useAgentCapacitiesQuery()
	const setAgentLimit = useSetAgentChatLimitMutation()
	return (
		<div className="max-w-4xl space-y-6 p-6">
			<header>
				<h1 className="text-lg font-semibold">Escalation Rules</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Choose which customer messages go directly to a person and set agent availability. Hours
					use Asia/Manila time.
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
					Escalation settings saved.
				</p>
			)}
			{isLoading || !data ? (
				<p className="text-muted-foreground text-sm">Loading escalation settings…</p>
			) : (
				<SettingsForm
					key={JSON.stringify(data)}
					initial={data}
					saving={update.isPending}
					onSave={values => update.mutate(values)}
				/>
			)}
			<section className="space-y-4 rounded-md border p-5">
				<div>
					<h2 className="font-medium">Per-agent chat limits</h2>
					<p className="text-muted-foreground mt-1 text-sm">
						Set individual concurrency limits for agents who have opened the inbox.
					</p>
				</div>
				{agents.error ? (
					<p role="alert" className="text-destructive text-sm">
						{agents.error.message}
					</p>
				) : null}
				{agents.isPending ? <p className="text-sm">Loading agent capacities…</p> : null}
				{agents.data?.length === 0 ? (
					<p className="text-muted-foreground text-sm">No agent presence records yet.</p>
				) : null}
				<ul className="divide-y">
					{agents.data?.map(agent => (
						<AgentCapacityRow
							key={`${agent.agentId}-${agent.maxOpenChats}`}
							agent={agent}
							saving={setAgentLimit.isPending && setAgentLimit.variables?.agentId === agent.agentId}
							onSave={maxOpenChats =>
								setAgentLimit.mutate({ agentId: agent.agentId, maxOpenChats })
							}
						/>
					))}
				</ul>
			</section>
		</div>
	)
}

function AgentCapacityRow({
	agent,
	saving,
	onSave,
}: {
	agent: AgentCapacity
	saving: boolean
	onSave: (maxOpenChats: number) => void
}) {
	const [limit, setLimit] = useState(String(agent.maxOpenChats))
	return (
		<li className="flex flex-wrap items-center justify-between gap-3 py-3">
			<div>
				<p className="text-sm font-medium">{agent.name}</p>
				<p className="text-muted-foreground text-xs">
					{agent.available ? "Available" : "Unavailable"} · {agent.openChats} open chats
				</p>
			</div>
			<form
				className="flex items-center gap-2"
				onSubmit={event => {
					event.preventDefault()
					const parsed = Number(limit)
					if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 30) onSave(parsed)
				}}
			>
				<label className="text-sm">
					<span className="sr-only">Maximum open chats for {agent.name}</span>
					<input
						type="number"
						min="1"
						max="30"
						value={limit}
						onChange={event => setLimit(event.target.value)}
						className="bg-background h-9 w-20 rounded-md border px-2"
					/>
				</label>
				<button type="submit" disabled={saving} className="rounded-md border px-3 py-2 text-sm">
					{saving ? "Saving…" : "Save"}
				</button>
			</form>
		</li>
	)
}

function SettingsForm({
	initial,
	saving,
	onSave,
}: {
	initial: EscalationSettings
	saving: boolean
	onSave: (values: EscalationSettings) => void
}) {
	const [topics, setTopics] = useState(initial.rules.topics.join("\n"))
	const [keywords, setKeywords] = useState(initial.rules.keywords.join("\n"))
	const [categories, setCategories] = useState<string[]>(initial.rules.categories)
	const [repeatCount, setRepeatCount] = useState(String(initial.rules.repeatedLowConfidenceCount))
	const [routingMode, setRoutingMode] = useState(initial.routing.mode)
	const [maxOpenChatsPerAgent, setMaxOpenChatsPerAgent] = useState(
		String(initial.routing.maxOpenChatsPerAgent)
	)
	const [days, setDays] = useState(initial.businessHours.days)
	const [holidays, setHolidays] = useState(initial.businessHours.holidays.join("\n"))
	const [waitLimit, setWaitLimit] = useState(String(initial.businessHours.waitLimitSeconds))

	const submit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		onSave({
			rules: {
				topics: splitLines(topics),
				keywords: splitLines(keywords),
				categories: categories as EscalationSettings["rules"]["categories"],
				repeatedLowConfidenceCount: Number(repeatCount),
			},
			businessHours: {
				timezone: "Asia/Manila",
				days,
				holidays: splitLines(holidays),
				waitLimitSeconds: Number(waitLimit),
			},
			routing: {
				mode: routingMode,
				maxOpenChatsPerAgent: Number(maxOpenChatsPerAgent),
			},
		})
	}

	const toggleCategory = (category: string) =>
		setCategories(current =>
			current.includes(category)
				? current.filter(value => value !== category)
				: [...current, category]
		)

	return (
		<form onSubmit={submit} className="space-y-6">
			<section className="space-y-4 rounded-md border p-5">
				<div>
					<h2 className="font-medium">Automatic handoff rules</h2>
					<p className="text-muted-foreground mt-1 text-sm">
						A matching topic or keyword is screened, then sent to the agent queue without generating
						an AI answer.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="font-medium">Sensitive topics</span>
						<textarea
							value={topics}
							onChange={event => setTopics(event.target.value)}
							rows={5}
							placeholder="One topic or phrase per line"
							className="bg-background w-full rounded-md border p-3"
						/>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium">Keywords</span>
						<textarea
							value={keywords}
							onChange={event => setKeywords(event.target.value)}
							rows={5}
							placeholder="One keyword or phrase per line"
							className="bg-background w-full rounded-md border p-3"
						/>
					</label>
				</div>
				<fieldset className="space-y-2">
					<legend className="text-sm font-medium">Always hand off these categories</legend>
					<div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
						{CATEGORIES.map(category => (
							<label key={category} className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={categories.includes(category)}
									onChange={() => toggleCategory(category)}
								/>
								{category}
							</label>
						))}
					</div>
				</fieldset>
				<label className="block max-w-sm space-y-1 text-sm">
					<span className="font-medium">Consecutive low-confidence answers before handoff</span>
					<input
						type="number"
						min="1"
						max="5"
						value={repeatCount}
						onChange={event => setRepeatCount(event.target.value)}
						className="bg-background h-10 w-24 rounded-md border px-3"
					/>
				</label>
			</section>

			<section className="space-y-4 rounded-md border p-5">
				<div>
					<h2 className="font-medium">Agent availability</h2>
					<p className="text-muted-foreground mt-1 text-sm">Timezone: Asia/Manila</p>
				</div>
				<div className="space-y-2">
					{days.map((day, index) => (
						<div
							key={day.day}
							className="grid grid-cols-[1fr_auto_7rem_7rem] items-center gap-3 text-sm"
						>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={day.open}
									onChange={event =>
										setDays(current =>
											current.map((value, itemIndex) =>
												itemIndex === index ? { ...value, open: event.target.checked } : value
											)
										)
									}
								/>
								{DAY_LABELS[day.day]}
							</label>
							<span className="text-muted-foreground">Open</span>
							<input
								aria-label={`${DAY_LABELS[day.day]} start`}
								type="time"
								value={day.start}
								disabled={!day.open}
								onChange={event =>
									setDays(current =>
										current.map((value, itemIndex) =>
											itemIndex === index ? { ...value, start: event.target.value } : value
										)
									)
								}
								className="bg-background h-9 rounded-md border px-2 disabled:opacity-50"
							/>
							<input
								aria-label={`${DAY_LABELS[day.day]} end`}
								type="time"
								value={day.end}
								disabled={!day.open}
								onChange={event =>
									setDays(current =>
										current.map((value, itemIndex) =>
											itemIndex === index ? { ...value, end: event.target.value } : value
										)
									)
								}
								className="bg-background h-9 rounded-md border px-2 disabled:opacity-50"
							/>
						</div>
					))}
				</div>
				<label className="block max-w-lg space-y-1 text-sm">
					<span className="font-medium">Holidays</span>
					<textarea
						value={holidays}
						onChange={event => setHolidays(event.target.value)}
						rows={3}
						placeholder="One date per line, YYYY-MM-DD"
						className="bg-background w-full rounded-md border p-3"
					/>
				</label>
				<label className="block space-y-1 text-sm">
					<span className="font-medium">Wait limit before offering the offline path (seconds)</span>
					<input
						type="number"
						min="30"
						max="3600"
						value={waitLimit}
						onChange={event => setWaitLimit(event.target.value)}
						className="bg-background h-10 w-32 rounded-md border px-3"
					/>
				</label>
			</section>

			<section className="space-y-4 rounded-md border p-5">
				<div>
					<h2 className="font-medium">Agent routing</h2>
					<p className="text-muted-foreground mt-1 text-sm">
						Choose whether new escalations are assigned to the least busy available agent or remain
						in the queue for an agent to claim.
					</p>
				</div>
				<label className="block max-w-sm space-y-1 text-sm">
					<span className="font-medium">Routing mode</span>
					<select
						value={routingMode}
						onChange={event => setRoutingMode(event.target.value as typeof routingMode)}
						className="bg-background h-10 w-full rounded-md border px-3"
					>
						<option value="least_busy">Least busy available agent</option>
						<option value="manual">Manual claim from queue</option>
					</select>
				</label>
				<label className="block max-w-sm space-y-1 text-sm">
					<span className="font-medium">Maximum open chats per agent</span>
					<input
						type="number"
						min="1"
						max="30"
						value={maxOpenChatsPerAgent}
						onChange={event => setMaxOpenChatsPerAgent(event.target.value)}
						className="bg-background h-10 w-32 rounded-md border px-3"
					/>
				</label>
			</section>
			<button
				type="submit"
				disabled={saving}
				className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
			>
				{saving ? "Saving…" : "Save escalation settings"}
			</button>
		</form>
	)
}

function splitLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean)
}

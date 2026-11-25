"use client"

import { useState } from "react"
import { Globe02Icon } from "@hugeicons/core-free-icons"

import { PageHeader } from "@/core/components/page-header"
import { Alert, AlertDescription } from "@/core/components/ui/alert"
import { Button } from "@/core/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/core/components/ui/card"
import { Input } from "@/core/components/ui/input"
import { Label } from "@/core/components/ui/label"
import { Switch } from "@/core/components/ui/switch"
import { Textarea } from "@/core/components/ui/textarea"
import { useChannelsQuery, useUpdateChannelMutation } from "@/features/channels/api/channels.hooks"

export function ChannelsView() {
	const channels = useChannelsQuery()
	const update = useUpdateChannelMutation()
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState<string | null>(null)

	return (
		<section className="flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
			<PageHeader
				icon={Globe02Icon}
				title="Channels"
				description="Control where the assistant is available and configure each channel. Changes take effect immediately."
			/>
			{error ? (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}
			{saved ? (
				<p className="text-muted-foreground text-sm" role="status">
					{saved}
				</p>
			) : null}
			{channels.isLoading ? (
				<p className="text-muted-foreground text-sm">Loading channels…</p>
			) : null}
			{channels.isError ? (
				<Alert variant="destructive">
					<AlertDescription>
						Could not load channel settings. Refresh to try again.
					</AlertDescription>
				</Alert>
			) : null}
			{channels.data?.map(channel => (
				<ChannelCard
					key={channel.code}
					channel={channel}
					saving={update.isPending && update.variables?.code === channel.code}
					onSave={async patch => {
						setError(null)
						setSaved(null)
						try {
							await update.mutateAsync({ code: channel.code, ...patch })
							setSaved(`${channel.name} settings saved.`)
						} catch (cause) {
							setError(cause instanceof Error ? cause.message : "Could not save channel settings.")
						}
					}}
				/>
			))}
		</section>
	)
}

function ChannelCard({
	channel,
	saving,
	onSave,
}: {
	channel: NonNullable<ReturnType<typeof useChannelsQuery>["data"]>[number]
	saving: boolean
	onSave: (patch: {
		isEnabled?: boolean
		allowedOrigins?: string[]
		welcomeText?: string
	}) => Promise<void>
}) {
	const [origins, setOrigins] = useState(channel.config.allowedOrigins.join("\n"))
	const [welcomeText, setWelcomeText] = useState(channel.config.welcomeText)
	return (
		<Card>
			<CardHeader className="flex-row items-start justify-between gap-4">
				<div>
					<CardTitle>{channel.name}</CardTitle>
					<CardDescription className="mt-1">{channel.code}</CardDescription>
				</div>
				<div className="flex items-center gap-3">
					<Label htmlFor={`enabled-${channel.code}`}>
						{channel.isEnabled ? "Enabled" : "Disabled"}
					</Label>
					<Switch
						id={`enabled-${channel.code}`}
						checked={channel.isEnabled}
						disabled={saving}
						onCheckedChange={enabled => void onSave({ isEnabled: enabled })}
					/>
				</div>
			</CardHeader>
			<CardContent className="grid gap-5">
				<div className="grid gap-2">
					<Label htmlFor={`origins-${channel.code}`}>Allowed website origins</Label>
					<Textarea
						id={`origins-${channel.code}`}
						value={origins}
						onChange={event => setOrigins(event.target.value)}
						placeholder="https://www.phlpost.gov.ph"
						rows={3}
					/>
					<p className="text-muted-foreground text-xs">
						One origin per line, including https:// and any non-default port.
					</p>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`welcome-${channel.code}`}>Welcome text</Label>
					<Input
						id={`welcome-${channel.code}`}
						value={welcomeText}
						onChange={event => setWelcomeText(event.target.value)}
						maxLength={1000}
					/>
				</div>
				<div>
					<Button
						disabled={saving}
						onClick={() =>
							void onSave({
								allowedOrigins: origins
									.split(/\r?\n/)
									.map(origin => origin.trim())
									.filter(Boolean),
								welcomeText,
							})
						}
					>
						{saving ? "Saving…" : "Save settings"}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}

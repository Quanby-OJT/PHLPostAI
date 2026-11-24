"use client"

import { useEffect, useState, type ReactNode } from "react"

import type { AnalyticsDashboardFilters, DashboardTile } from "@repo/contracts"

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/core/components/ui/card"
import {
	useAnalyticsDashboardQuery,
	useDashboardLayoutQuery,
	useSaveDashboardLayoutMutation,
} from "@/features/dashboard/api/analytics.hooks"
import { canAccess, type AccessProfile } from "@/features/dashboard/lib/access"

const DEFAULT_TILES: DashboardTile[] = [
	"inquiry-volume",
	"by-category",
	"by-language",
	"by-channel",
	"escalations",
	"response-time",
]

const TILE_LABELS: Record<DashboardTile, string> = {
	"inquiry-volume": "Inquiry volume over time",
	"by-category": "Inquiries by category",
	"by-language": "Inquiries by language",
	"by-channel": "Inquiries by channel",
	"escalations": "Escalation rate",
	"response-time": "Response time",
}

const CATEGORIES = ["tracking", "rates", "postal-id", "service-info", "scam", "complaint", "other"]

function manilaDate(date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date)
}

function shiftDate(value: string, days: number): string {
	const date = new Date(`${value}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function initialFilters(): AnalyticsDashboardFilters {
	const endDate = manilaDate()
	return { startDate: shiftDate(endDate, -29), endDate }
}

function MiniBarChart({
	items,
	label,
	compact = false,
}: {
	items: { label: string; value: number }[]
	label: string
	compact?: boolean
}) {
	const maximum = Math.max(...items.map(item => item.value), 0)
	if (!items.length) {
		return (
			<p className="text-muted-foreground py-8 text-center text-sm">
				No event data for these filters.
			</p>
		)
	}
	if (compact) {
		return (
			<div role="img" aria-label={label} className="space-y-3">
				{items.map(item => (
					<div
						key={item.label}
						className="grid grid-cols-[minmax(5rem,7rem)_1fr_3rem] items-center gap-3 text-xs"
					>
						<span className="text-muted-foreground truncate" title={item.label}>
							{item.label}
						</span>
						<div className="bg-muted h-2 overflow-hidden rounded-full">
							<div
								className="bg-primary h-full rounded-full"
								style={{ width: `${maximum ? (item.value / maximum) * 100 : 0}%` }}
							/>
						</div>
						<span className="text-right font-medium tabular-nums">
							{item.value.toLocaleString()}
						</span>
					</div>
				))}
			</div>
		)
	}

	return (
		<div
			role="img"
			aria-label={label}
			className="border-border flex h-48 items-end gap-1 border-b px-1"
		>
			{items.map((item, index) => (
				<div
					key={item.label}
					className="group relative flex h-full min-w-0 flex-1 items-end"
					title={`${item.label}: ${item.value.toLocaleString()}`}
				>
					<div
						className="bg-primary/75 group-hover:bg-primary w-full rounded-t-sm transition-colors"
						style={{
							height: `${maximum ? Math.max(item.value ? 3 : 0, (item.value / maximum) * 100) : 0}%`,
						}}
					/>
					{(index === 0 ||
						index === items.length - 1 ||
						(items.length <= 12 && index % 3 === 0)) && (
						<span className="text-muted-foreground absolute top-full mt-2 w-max -translate-x-1/2 text-[10px]">
							{item.label}
						</span>
					)}
				</div>
			))}
		</div>
	)
}

function ChartTile({ title, children }: { title: string; children: ReactNode }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{title}</CardTitle>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	)
}

export function ManagementDashboard({ access }: { access: AccessProfile }) {
	const canView = canAccess(access, { requiredPermission: "analytics.dashboard.view" })
	const [filters, setFilters] = useState<AnalyticsDashboardFilters>(initialFilters)
	const [tiles, setTiles] = useState<DashboardTile[]>(DEFAULT_TILES)
	const [layoutLoaded, setLayoutLoaded] = useState(false)
	const dashboard = useAnalyticsDashboardQuery(filters, canView)
	const savedLayout = useDashboardLayoutQuery(canView)
	const saveLayout = useSaveDashboardLayoutMutation()

	useEffect(() => {
		if (savedLayout.data && !layoutLoaded) {
			setTiles(savedLayout.data.tiles)
			setLayoutLoaded(true)
		}
	}, [layoutLoaded, savedLayout.data])

	if (!canView) return null

	const setFilter = (key: "category" | "language" | "channel", value: string) => {
		setFilters(current => ({ ...current, [key]: value || undefined }))
	}
	const moveTile = (index: number, direction: -1 | 1) => {
		setTiles(current => {
			const target = index + direction
			if (target < 0 || target >= current.length) return current
			const reordered = [...current]
			;[reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!]
			return reordered
		})
	}
	const toggleTile = (tile: DashboardTile, visible: boolean) => {
		setTiles(current => {
			if (visible) return [...current, tile]
			return current.filter(value => value !== tile)
		})
	}
	const data = dashboard.data
	const chartDimensions = {
		"by-category": data?.byCategory.map(item => ({ label: item.code, value: item.count })) ?? [],
		"by-language": data?.byLanguage.map(item => ({ label: item.code, value: item.count })) ?? [],
		"by-channel": data?.byChannel.map(item => ({ label: item.code, value: item.count })) ?? [],
	}
	const categoryOptions = data?.availableFilters.categories.length
		? data.availableFilters.categories
		: CATEGORIES

	return (
		<section className="space-y-4" aria-labelledby="management-dashboard-title">
			<div>
				<h2 id="management-dashboard-title" className="text-xl font-semibold tracking-tight">
					Management dashboard
				</h2>
				<p className="text-muted-foreground text-sm">
					Interaction events, grouped by Asia/Manila calendar day.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Filters</CardTitle>
					<CardDescription>
						Every chart and metric uses the selected period and filters.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-end gap-3">
					<label className="grid gap-1 text-xs font-medium">
						<span>Date from</span>
						<input
							className="border-input bg-background h-9 rounded-md border px-2 text-sm"
							type="date"
							value={filters.startDate}
							max={filters.endDate}
							onChange={event =>
								setFilters(current => ({ ...current, startDate: event.target.value }))
							}
						/>
					</label>
					<label className="grid gap-1 text-xs font-medium">
						<span>Date to</span>
						<input
							className="border-input bg-background h-9 rounded-md border px-2 text-sm"
							type="date"
							value={filters.endDate}
							min={filters.startDate}
							onChange={event =>
								setFilters(current => ({ ...current, endDate: event.target.value }))
							}
						/>
					</label>
					<label className="grid gap-1 text-xs font-medium">
						<span>Category</span>
						<select
							className="border-input bg-background h-9 min-w-36 rounded-md border px-2 text-sm"
							value={filters.category ?? ""}
							onChange={event => setFilter("category", event.target.value)}
						>
							<option value="">All categories</option>
							{[
								...new Set(
									[...categoryOptions, filters.category].filter((value): value is string =>
										Boolean(value)
									)
								),
							].map(category => (
								<option key={category} value={category}>
									{category}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-1 text-xs font-medium">
						<span>Language</span>
						<select
							className="border-input bg-background h-9 min-w-32 rounded-md border px-2 text-sm"
							value={filters.language ?? ""}
							onChange={event => setFilter("language", event.target.value)}
						>
							<option value="">All languages</option>
							{[
								...new Set(
									[...(data?.availableFilters.languages ?? []), filters.language].filter(
										(value): value is string => Boolean(value)
									)
								),
							].map(language => (
								<option key={language} value={language}>
									{language}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-1 text-xs font-medium">
						<span>Channel</span>
						<select
							className="border-input bg-background h-9 min-w-32 rounded-md border px-2 text-sm"
							value={filters.channel ?? ""}
							onChange={event => setFilter("channel", event.target.value)}
						>
							<option value="">All channels</option>
							{[
								...new Set(
									[...(data?.availableFilters.channels ?? []), filters.channel].filter(
										(value): value is string => Boolean(value)
									)
								),
							].map(channel => (
								<option key={channel} value={channel}>
									{channel}
								</option>
							))}
						</select>
					</label>
					{dashboard.isFetching ? (
						<span className="text-muted-foreground text-xs" aria-live="polite">
							Updating…
						</span>
					) : null}
					{dashboard.isError ? (
						<span className="text-destructive text-xs" role="alert">
							Dashboard data could not be loaded.
						</span>
					) : null}
				</CardContent>
			</Card>

			<details className="group border-border bg-card rounded-xl border px-4 py-3">
				<summary className="cursor-pointer text-sm font-medium">Customize dashboard tiles</summary>
				<div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{DEFAULT_TILES.map(tile => {
						const index = tiles.indexOf(tile)
						return (
							<div
								key={tile}
								className="border-border flex items-center gap-2 rounded-md border px-3 py-2"
							>
								<label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={index >= 0}
										onChange={event => toggleTile(tile, event.target.checked)}
									/>
									<span className="truncate">{TILE_LABELS[tile]}</span>
								</label>
								{index >= 0 ? (
									<>
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground text-xs disabled:opacity-40"
											aria-label={`Move ${TILE_LABELS[tile]} up`}
											disabled={index === 0}
											onClick={() => moveTile(index, -1)}
										>
											↑
										</button>
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground text-xs disabled:opacity-40"
											aria-label={`Move ${TILE_LABELS[tile]} down`}
											disabled={index === tiles.length - 1}
											onClick={() => moveTile(index, 1)}
										>
											↓
										</button>
									</>
								) : null}
							</div>
						)
					})}
				</div>
				<div className="mt-3 flex items-center gap-3">
					<button
						type="button"
						className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 rounded-md px-3 text-xs font-medium disabled:opacity-50"
						disabled={saveLayout.isPending}
						onClick={() => saveLayout.mutate({ tiles })}
					>
						{saveLayout.isPending ? "Saving…" : "Save layout"}
					</button>
					{saveLayout.isSuccess ? (
						<span className="text-muted-foreground text-xs" role="status">
							Layout saved for your account.
						</span>
					) : null}
					{saveLayout.isError ? (
						<span className="text-destructive text-xs" role="alert">
							Layout could not be saved.
						</span>
					) : null}
					{savedLayout.isError ? (
						<span className="text-destructive text-xs" role="alert">
							Saved layout could not be loaded.
						</span>
					) : null}
				</div>
			</details>

			{dashboard.isLoading ? (
				<div className="text-muted-foreground border-border rounded-xl border py-12 text-center text-sm">
					Loading dashboard…
				</div>
			) : null}
			<div className="grid gap-4 md:grid-cols-2">
				{tiles.map(tile => {
					if (tile === "inquiry-volume")
						return (
							<ChartTile key={tile} title={TILE_LABELS[tile]}>
								<p className="text-muted-foreground mb-3 text-xs">
									{data?.inquiries.toLocaleString() ?? 0} inquiries in the selected period
								</p>
								<MiniBarChart
									label="Inquiry volume by Manila calendar day"
									items={
										data?.daily.map(item => ({ label: item.date.slice(5), value: item.count })) ??
										[]
									}
								/>
							</ChartTile>
						)
					if (tile === "by-category" || tile === "by-language" || tile === "by-channel")
						return (
							<ChartTile key={tile} title={TILE_LABELS[tile]}>
								<MiniBarChart
									compact
									label={TILE_LABELS[tile]}
									items={chartDimensions[tile].map(item => ({
										label: item.label,
										value: item.value,
									}))}
								/>
							</ChartTile>
						)
					if (tile === "escalations")
						return (
							<ChartTile key={tile} title={TILE_LABELS[tile]}>
								<p className="text-3xl font-semibold tabular-nums">
									{data?.escalationRate === null || data?.escalationRate === undefined
										? "—"
										: `${(data.escalationRate * 100).toFixed(1)}%`}
								</p>
								<p className="text-muted-foreground mt-2 text-xs">
									{data?.escalations ?? 0} escalated conversations from {data?.inquiries ?? 0}{" "}
									inquiries.
								</p>
							</ChartTile>
						)
					return (
						<ChartTile key={tile} title={TILE_LABELS[tile]}>
							<div className="grid gap-4 sm:grid-cols-2">
								<div>
									<p className="text-muted-foreground text-xs">Median</p>
									<p className="text-2xl font-semibold tabular-nums">
										{data?.medianResponseTimeMs == null
											? "—"
											: `${(data.medianResponseTimeMs / 1000).toFixed(1)} s`}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs">95th percentile</p>
									<p className="text-2xl font-semibold tabular-nums">
										{data?.p95ResponseTimeMs == null
											? "—"
											: `${(data.p95ResponseTimeMs / 1000).toFixed(1)} s`}
									</p>
								</div>
							</div>
							<p className="text-muted-foreground mt-3 text-xs">
								Time from chat request to recorded answer.
							</p>
						</ChartTile>
					)
				})}
			</div>
		</section>
	)
}

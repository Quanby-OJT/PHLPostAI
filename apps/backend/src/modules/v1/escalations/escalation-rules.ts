import type { EscalationBusinessHours, EscalationSettings } from "@repo/contracts"

function manilaParts(date: Date) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		weekday: "long",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date)
	return Object.fromEntries(parts.map(part => [part.type, part.value])) as Record<string, string>
}

export function isWithinBusinessHours(date: Date, schedule: EscalationBusinessHours): boolean {
	const parts = manilaParts(date)
	const localDate = `${parts.year}-${parts.month}-${parts.day}`
	if (schedule.holidays.includes(localDate)) return false
	const weekday = parts.weekday?.toLowerCase()
	const day = schedule.days.find(item => item.day === weekday)
	if (!day?.open) return false
	const current = Number(parts.hour) * 60 + Number(parts.minute)
	const start = Number(day.start.slice(0, 2)) * 60 + Number(day.start.slice(3))
	const end = Number(day.end.slice(0, 2)) * 60 + Number(day.end.slice(3))
	return current >= start && current < end
}

export function matchesEscalationRule(
	query: string,
	category: string | undefined,
	settings: EscalationSettings
): boolean {
	const normalized = query.toLocaleLowerCase("en-PH")
	if (category && settings.rules.categories.some(value => value === category)) return true
	return [...settings.rules.topics, ...settings.rules.keywords].some(value =>
		normalized.includes(value.toLocaleLowerCase("en-PH"))
	)
}

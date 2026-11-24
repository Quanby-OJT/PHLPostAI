const PESOS = new Intl.NumberFormat("en-PH", {
	style: "currency",
	currency: "PHP",
	minimumFractionDigits: 2,
})
const DATE = new Intl.DateTimeFormat("en-PH", {
	day: "numeric",
	month: "long",
	year: "numeric",
	timeZone: "UTC",
})

/** Opening words of a follow-up question, so the next customer message can complete it. */
export const RATE_FOLLOW_UP_PREFIX = "To quote a published rate, I need"

export function formatPrice(centavos: number): string {
	return PESOS.format(centavos / 100)
}

export function formatWeight(grams: number): string {
	if (grams < 1000) return `${grams} g`
	const kg = grams / 1000
	return `${Number.isInteger(kg) ? kg : kg.toFixed(2).replace(/0$/, "")} kg`
}

export function formatDate(isoDate: string): string {
	return DATE.format(new Date(`${isoDate}T00:00:00Z`))
}

export function quoteReply(input: {
	serviceName: string
	zone: string
	weightG: number
	priceCentavos: number
	effectiveFrom: string
}): string {
	return (
		`The published ${input.serviceName} rate to ${input.zone} for an item of ` +
		`${formatWeight(input.weightG)} is ${formatPrice(input.priceCentavos)}, ` +
		`effective ${formatDate(input.effectiveFrom)}.`
	)
}

export function missingDetailsReply(input: {
	missing: ("service" | "destination" | "weight")[]
	services: string[]
	zones: string[]
}): string {
	const labels = {
		service: "which service you want",
		destination: "where you're sending it",
		weight: "the weight of your item",
	}
	const needs = input.missing.map(item => labels[item])
	const list =
		needs.length > 1 ? `${needs.slice(0, -1).join(", ")} and ${needs.at(-1)}` : (needs[0] ?? "")
	const hints = [
		input.missing.includes("service") && input.services.length > 0
			? `Services: ${input.services.join(", ")}.`
			: null,
		input.missing.includes("destination") && input.zones.length > 0
			? `Destinations: ${input.zones.join(", ")}.`
			: null,
	].filter(Boolean)
	return [`${RATE_FOLLOW_UP_PREFIX} ${list}.`, ...hints].join(" ")
}

export function noRateReply(input?: {
	serviceName: string
	zone: string
	weightG: number
}): string {
	const which = input
		? ` for ${input.serviceName} to ${input.zone} at ${formatWeight(input.weightG)}`
		: " for that"
	return `I don't have a published rate${which}, so I can't quote a price. Please check with your nearest post office.`
}

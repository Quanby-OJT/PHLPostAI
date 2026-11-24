const PESOS = new Intl.NumberFormat("en-PH", {
	style: "currency",
	currency: "PHP",
	minimumFractionDigits: 2,
})

export function formatPrice(centavos: number): string {
	return PESOS.format(centavos / 100)
}

export function formatWeightBand(minG: number, maxG: number): string {
	return `${minG.toLocaleString("en-PH")}–${maxG.toLocaleString("en-PH")} g`
}

export function formatDates(from: string, to: string | null): string {
	return to ? `${from} to ${to}` : `from ${from}`
}

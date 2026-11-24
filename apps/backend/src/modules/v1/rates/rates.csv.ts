import type { RatePreview, RatePreviewError, RatePreviewRow } from "@repo/contracts"

/** CSV columns for a rate import. `effective_to` may be left empty. */
export const RATE_CSV_COLUMNS = [
	"service_code",
	"service_name",
	"zone",
	"weight_min_g",
	"weight_max_g",
	"price_php",
	"effective_from",
	"effective_to",
] as const

const REQUIRED_COLUMNS = RATE_CSV_COLUMNS.filter(column => column !== "effective_to")
export const MAX_RATE_ROWS = 2000
const MAX_WEIGHT_G = 1_000_000

const SERVICE_CODE = /^[a-z0-9][a-z0-9-]{1,59}$/
const PRICE = /^\d{1,7}(\.\d{1,2})?$/
const WHOLE_NUMBER = /^\d{1,7}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** RFC 4180-style parsing: quoted fields, doubled quotes, commas and line breaks in quotes. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let field = ""
	let quoted = false
	const input = text.replace(/^﻿/, "")

	for (let i = 0; i < input.length; i++) {
		const char = input[i]
		if (quoted) {
			if (char === '"' && input[i + 1] === '"') {
				field += '"'
				i++
			} else if (char === '"') {
				quoted = false
			} else {
				field += char
			}
		} else if (char === '"') {
			quoted = true
		} else if (char === ",") {
			row.push(field)
			field = ""
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && input[i + 1] === "\n") i++
			row.push(field)
			rows.push(row)
			row = []
			field = ""
		} else {
			field += char
		}
	}
	if (field !== "" || row.length > 0) {
		row.push(field)
		rows.push(row)
	}
	return rows.filter(cells => cells.some(cell => cell.trim() !== ""))
}

function isRealDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false
	const date = new Date(`${value}T00:00:00Z`)
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function toCentavos(price: string): number {
	const [pesos, cents = ""] = price.split(".")
	return Number(pesos) * 100 + Number(cents.padEnd(2, "0"))
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
	return aMin <= bMax && bMin <= aMax
}

function datesOverlap(a: RatePreviewRow, b: RatePreviewRow): boolean {
	const aEnd = a.effectiveTo ?? "9999-12-31"
	const bEnd = b.effectiveTo ?? "9999-12-31"
	return a.effectiveFrom <= bEnd && b.effectiveFrom <= aEnd
}

/** Validates a rates CSV. Every problem is reported with its line number; nothing is stored. */
export function validateRateCsv(text: string): RatePreview {
	const errors: RatePreviewError[] = []
	const rows: RatePreviewRow[] = []
	const table = parseCsv(text)

	if (table.length === 0) {
		return { rows, errors: [{ line: 1, message: "The file is empty" }], valid: false }
	}

	const header = (table[0] ?? []).map(cell => cell.trim().toLowerCase())
	const missing = REQUIRED_COLUMNS.filter(column => !header.includes(column))
	if (missing.length > 0) {
		return {
			rows,
			errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}` }],
			valid: false,
		}
	}
	if (table.length - 1 > MAX_RATE_ROWS) {
		return {
			rows,
			errors: [{ line: 1, message: `A file can have at most ${MAX_RATE_ROWS} rows` }],
			valid: false,
		}
	}
	if (table.length === 1) {
		return { rows, errors: [{ line: 1, message: "The file has no rate rows" }], valid: false }
	}

	const index = (column: string) => header.indexOf(column)
	table.slice(1).forEach((cells, offset) => {
		const line = offset + 2
		const value = (column: (typeof RATE_CSV_COLUMNS)[number]) =>
			(index(column) >= 0 ? (cells[index(column)] ?? "") : "").trim()
		const problems: string[] = []

		const serviceCode = value("service_code").toLowerCase()
		const serviceName = value("service_name")
		const zone = value("zone")
		const weightMin = value("weight_min_g")
		const weightMax = value("weight_max_g")
		const price = value("price_php")
		const effectiveFrom = value("effective_from")
		const effectiveTo = value("effective_to")

		if (!SERVICE_CODE.test(serviceCode)) {
			problems.push("service_code must use lowercase letters, numbers and hyphens")
		}
		if (!serviceName || serviceName.length > 120) problems.push("service_name is required")
		if (!zone || zone.length > 80) problems.push("zone is required")
		if (!WHOLE_NUMBER.test(weightMin)) problems.push("weight_min_g must be a whole number")
		if (!WHOLE_NUMBER.test(weightMax)) problems.push("weight_max_g must be a whole number")
		if (
			WHOLE_NUMBER.test(weightMin) &&
			WHOLE_NUMBER.test(weightMax) &&
			Number(weightMin) > Number(weightMax)
		) {
			problems.push("weight_min_g must not be more than weight_max_g")
		}
		if (WHOLE_NUMBER.test(weightMax) && Number(weightMax) > MAX_WEIGHT_G) {
			problems.push(`weight_max_g must be at most ${MAX_WEIGHT_G}`)
		}
		if (!PRICE.test(price) || toCentavos(price) <= 0) {
			problems.push("price_php must be a positive amount such as 165.00")
		}
		if (!isRealDate(effectiveFrom)) problems.push("effective_from must be a date like 2026-12-01")
		if (effectiveTo && !isRealDate(effectiveTo)) {
			problems.push("effective_to must be empty or a date like 2026-12-31")
		}
		if (isRealDate(effectiveFrom) && isRealDate(effectiveTo) && effectiveTo < effectiveFrom) {
			problems.push("effective_to must not be before effective_from")
		}

		if (problems.length > 0) {
			for (const message of problems) errors.push({ line, message })
			return
		}

		const row: RatePreviewRow = {
			line,
			serviceCode,
			serviceName,
			zone,
			weightMinG: Number(weightMin),
			weightMaxG: Number(weightMax),
			priceCentavos: toCentavos(price),
			effectiveFrom,
			effectiveTo: effectiveTo || null,
		}
		const clash = rows.find(
			other =>
				other.serviceCode === row.serviceCode &&
				other.zone.toLowerCase() === row.zone.toLowerCase() &&
				rangesOverlap(other.weightMinG, other.weightMaxG, row.weightMinG, row.weightMaxG) &&
				datesOverlap(other, row)
		)
		if (clash) {
			errors.push({
				line,
				message: `Overlaps line ${clash.line} (same service, zone, weight and dates)`,
			})
			return
		}
		rows.push(row)
	})

	return { rows, errors, valid: errors.length === 0 }
}

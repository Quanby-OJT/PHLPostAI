import { parseCsv, validateRateCsv } from "./rates.csv"

const HEADER =
	"service_code,service_name,zone,weight_min_g,weight_max_g,price_php,effective_from,effective_to"

describe("rates CSV (KB-2 AC4)", () => {
	it("parses quoted fields with commas, doubled quotes and Windows line endings", () => {
		expect(parseCsv('a,"b, ""c"""\r\n1,2\r\n')).toEqual([
			["a", 'b, "c"'],
			["1", "2"],
		])
	})

	it("turns valid rows into entries, with prices in centavos", () => {
		const preview = validateRateCsv(
			[
				HEADER,
				"Express-Mail,Express Mail,Metro Manila,0,500,165,2026-12-01,",
				'registered-mail,"Registered Mail, Domestic",Visayas,0,250,60.5,2026-12-01,2027-06-30',
			].join("\n")
		)

		expect(preview.valid).toBe(true)
		expect(preview.errors).toEqual([])
		expect(preview.rows).toEqual([
			{
				line: 2,
				serviceCode: "express-mail",
				serviceName: "Express Mail",
				zone: "Metro Manila",
				weightMinG: 0,
				weightMaxG: 500,
				priceCentavos: 16500,
				effectiveFrom: "2026-12-01",
				effectiveTo: null,
			},
			expect.objectContaining({
				line: 3,
				serviceName: "Registered Mail, Domestic",
				priceCentavos: 6050,
				effectiveTo: "2027-06-30",
			}),
		])
	})

	it("reports every problem on a row with its line number", () => {
		const preview = validateRateCsv(
			[HEADER, "Express Mail,,Metro Manila,600,500,abc,2026-02-30,2026-01-01"].join("\n")
		)

		expect(preview.valid).toBe(false)
		expect(preview.rows).toEqual([])
		expect(preview.errors.map(error => error.line)).toEqual([2, 2, 2, 2, 2])
		expect(preview.errors.map(error => error.message)).toEqual([
			"service_code must use lowercase letters, numbers and hyphens",
			"service_name is required",
			"weight_min_g must not be more than weight_max_g",
			"price_php must be a positive amount such as 165.00",
			"effective_from must be a date like 2026-12-01",
		])
	})

	it("rejects overlapping weight bands for the same service, zone and dates", () => {
		const preview = validateRateCsv(
			[
				HEADER,
				"express-mail,Express Mail,Metro Manila,0,500,165,2026-12-01,",
				"express-mail,Express Mail,metro manila,400,800,170,2026-12-15,",
				"express-mail,Express Mail,Visayas,400,800,190,2026-12-15,",
			].join("\n")
		)

		expect(preview.errors).toEqual([
			{ line: 3, message: "Overlaps line 2 (same service, zone, weight and dates)" },
		])
		expect(preview.rows).toHaveLength(2)
	})

	it("allows the same band again when the dates do not overlap", () => {
		const preview = validateRateCsv(
			[
				HEADER,
				"express-mail,Express Mail,Metro Manila,0,500,165,2026-01-01,2026-11-30",
				"express-mail,Express Mail,Metro Manila,0,500,175,2026-12-01,",
			].join("\n")
		)

		expect(preview.valid).toBe(true)
	})

	it.each([
		["", "The file is empty"],
		["service_code,zone\nexpress-mail,Visayas", "Missing column(s): service_name"],
		[HEADER, "The file has no rate rows"],
	])("rejects an unusable file (%#)", (csv, message) => {
		const preview = validateRateCsv(csv)

		expect(preview.valid).toBe(false)
		expect(preview.errors[0]?.message).toContain(message)
	})
})

import {
	hashTrackingNumber,
	maskTrackingNumber,
	mentionsTracking,
	scanForTrackingNumber,
} from "./tracking-number"

const S10 = /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/
const KEYWORDS = ["track", "tracking", "where is my", "nasaan ang"]

describe("tracking numbers (TRK-1)", () => {
	describe("scanForTrackingNumber", () => {
		it("finds a valid number and normalizes its case and hyphens", () => {
			expect(scanForTrackingNumber("where is rr-123456789-ph?", S10)).toEqual({
				kind: "number",
				trackingNumber: "RR123456789PH",
				raw: "rr-123456789-ph",
			})
		})

		it("reports a number-like token that does not match the format as malformed", () => {
			expect(scanForTrackingNumber("track RR12345PH678", S10)).toEqual({
				kind: "malformed",
				raw: "RR12345PH678",
			})
		})

		it("prefers a valid number over an earlier malformed token", () => {
			const scan = scanForTrackingNumber("ref 12345678, item EE987654321PH", S10)
			expect(scan).toEqual(
				expect.objectContaining({ kind: "number", trackingNumber: "EE987654321PH" })
			)
		})

		it("reports a missing number when there is nothing number-like", () => {
			expect(scanForTrackingNumber("where is my parcel?", S10)).toEqual({ kind: "missing" })
		})

		it("uses the configured format rule", () => {
			expect(scanForTrackingNumber("track 1234567890123", /^[0-9]{13}$/)).toEqual(
				expect.objectContaining({ kind: "number", trackingNumber: "1234567890123" })
			)
		})
	})

	describe("mentionsTracking", () => {
		it.each(["How do I track my parcel?", "Where is my package", "Nasaan ang padala ko?"])(
			"recognizes %s",
			text => expect(mentionsTracking(text, KEYWORDS)).toBe(true)
		)

		it("matches whole words only", () => {
			expect(mentionsTracking("Is there a racetrack near the post office?", KEYWORDS)).toBe(false)
		})

		it("ignores questions without a tracking keyword", () => {
			expect(mentionsTracking("How much is Express Mail to Cebu?", KEYWORDS)).toBe(false)
		})
	})

	it("removes the number from the text that is stored", () => {
		const scan = scanForTrackingNumber("where is RR123456789PH", S10)
		expect(maskTrackingNumber("where is RR123456789PH", scan)).toBe("where is [TRACKING_NUMBER]")
	})

	it("hashes with a secret so the stored value is not the number", () => {
		const hash = hashTrackingNumber("RR123456789PH", "secret-one-secret-one")
		expect(hash).toMatch(/^[0-9a-f]{64}$/)
		expect(hash).not.toContain("RR123456789PH")
		expect(hashTrackingNumber("RR123456789PH", "secret-two-secret-two")).not.toBe(hash)
	})
})

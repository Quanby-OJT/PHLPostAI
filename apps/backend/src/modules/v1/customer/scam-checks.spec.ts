import dns from "node:dns"
import net from "node:net"

import { hasPaymentRequest, inspectScamLinks, isScamSubmission } from "./scam-checks"
import { inspectScamContactFields, normalizeOfficialContact } from "./scam-contacts"
import { formatScamAssessment, SCAM_COPY } from "./scam-copy"

const official = ["phlpost.gov.ph", "www.phlpost.gov.ph", "tracking.phlpost.gov.ph"]

describe("SCM-1 local link and fee checks", () => {
	it.each([
		["https://phlpost.gov.ph", "https://phlpost.gov.ph", false, false],
		["HTTPS://PHLPOST.GOV.PH./parcel", "https://phlpost.gov.ph", false, false],
		["tracking.phlpost.gov.ph/parcel", "https://tracking.phlpost.gov.ph", false, false],
		["https://phlpost.gov.ph.example/claim", "[UNOFFICIAL_URL]", true, false],
		["https://unlisted.phlpost.gov.ph/claim", "[UNOFFICIAL_URL]", true, false],
		["https://phlpоst.gov.ph/claim", "[UNOFFICIAL_URL]", true, false], // Cyrillic о
		["https://phlpost.gov.ph@payment.example/claim", "[UNOFFICIAL_URL]", true, true],
		["https://payment.example@phlpost.gov.ph/claim", "https://phlpost.gov.ph", false, true],
		["https://phlpost.gov.ph:8443/claim", "https://phlpost.gov.ph", false, true],
		["https://[broken", "[UNPARSEABLE_URL]", false, true],
		["https:///phlpost.gov.ph", "[UNPARSEABLE_URL]", false, true],
		["ftp://phlpost.gov.ph/claim", "[UNPARSEABLE_URL]", false, true],
		["data:text/plain,ignored", "[UNPARSEABLE_URL]", false, true],
		["192.0.2.11/claim", "[UNOFFICIAL_URL]", true, false],
	])(
		"parses %s by hostname without network, redirect, or preview",
		(input, evidence, unofficial, suspicious) => {
			const denyNetwork = () => {
				throw new Error("SCM-1 must parse links without network access")
			}
			const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(denyNetwork)
			const lookup = jest.spyOn(dns, "lookup").mockImplementation(denyNetwork)
			const resolve = jest.spyOn(dns, "resolve").mockImplementation(denyNetwork)
			const lookupAsync = jest.spyOn(dns.promises, "lookup").mockImplementation(denyNetwork)
			const connect = jest.spyOn(net, "connect").mockImplementation(denyNetwork)
			try {
				expect(inspectScamLinks(input, official)).toMatchObject({
					textWithoutLinks: "[LINK]",
					extractedUrls: [evidence],
					unofficialDomain: unofficial,
					suspiciousLink: suspicious,
					kind: "link",
				})
				expect(fetch).not.toHaveBeenCalled()
				expect(lookup).not.toHaveBeenCalled()
				expect(resolve).not.toHaveBeenCalled()
				expect(lookupAsync).not.toHaveBeenCalled()
				expect(connect).not.toHaveBeenCalled()
			} finally {
				jest.restoreAllMocks()
			}
		}
	)

	it("handles multiple links and keeps an email address for the personal-data masker", () => {
		const result = inspectScamLinks(
			"From: first.middle.last@example.com\nPay ₱25 at (https://parcel.example/a?token=private) or https://phlpost.gov.ph/help#private.",
			official
		)
		expect(result.extractedUrls).toEqual(["[UNOFFICIAL_URL]", "https://phlpost.gov.ph"])
		expect(result.kind).toBe("email")
		expect(result.textWithoutLinks).toContain("first.middle.last@example.com")
		expect(result.textWithoutLinks).not.toContain("private")
		expect(hasPaymentRequest(result.textWithoutLinks)).toBe(true)
	})

	it("checks both the visible URL and the target of a pasted Markdown link", () => {
		const result = inspectScamLinks(
			"Pay ₱25 at [https://phlpost.gov.ph](https://parcel.example/claim).",
			official
		)
		expect(result.extractedUrls).toEqual(["https://phlpost.gov.ph", "[UNOFFICIAL_URL]"])
		expect(result.unofficialDomain).toBe(true)
		expect(result.textWithoutLinks).not.toContain("parcel.example")
	})

	it.each([
		"Pay ₱25 to release your parcel",
		"Please pay the fee",
		"We received a parcel payment request",
		"Magbayad ng ₱25",
		"Mobayad og ₱25",
		"Agbayad iti ₱25",
	])("identifies a fee request in %s", text => expect(hasPaymentRequest(text)).toBe(true))

	it("keeps a routine price question on the existing route", () => {
		expect(hasPaymentRequest("How much is it to send a parcel?")).toBe(false)
		expect(isScamSubmission("What are PHLPost's postage rates?")).toBe(false)
		expect(isScamSubmission("Your parcel is held. Pay ₱25 at https://parcel.example.")).toBe(true)
	})
})

describe("SCM-2 configured contacts", () => {
	it.each([
		["https://phlpost.gov.ph", false, false],
		["https://phlpot.gov.ph", true, true],
		["https://phlp\u043Est.gov.ph", true, true],
		["https://phlpost.gov.ph.example", true, true],
		["https://login.phlpost.gov.ph.example", true, true],
		["https://different.example", true, false],
	])("compares the parsed hostname for %s", (url, unofficialDomain, lookalikeDomain) => {
		expect(inspectScamLinks(url, official)).toMatchObject({ unofficialDomain, lookalikeDomain })
	})

	it("uses newly approved contacts and masks pasted contact fields", () => {
		const message =
			'From: "Example Parcel Desk" <private@example.com>\nPayment method: Test Counter\nPay a fee.'
		expect(inspectScamContactFields(message, [])).toEqual({
			unofficialSender: true,
			unofficialPaymentChannel: true,
			textWithoutContactValues: "From: [CONTACT]\nPayment method: [CONTACT]\nPay a fee.",
		})
		const result = inspectScamContactFields(message, [
			{ kind: "sender", value: "example parcel desk" },
			{ kind: "payment-channel", value: "test counter" },
		])
		expect(result).toMatchObject({ unofficialSender: false, unofficialPaymentChannel: false })
		expect(hasPaymentRequest(result.textWithoutContactValues)).toBe(true)
	})

	it("checks a dotted sender against the configured name before redacting URL-shaped text", () => {
		const text = "From: PHLPost.Example\nVisit https://other.example"
		expect(
			inspectScamContactFields(
				text,
				[{ kind: "sender", value: "phlpost.example" }],
				inspectScamLinks(text, official).textWithoutLinks
			)
		).toMatchObject({
			unofficialSender: false,
			textWithoutContactValues: "From: [CONTACT]\nVisit [LINK]",
		})
	})

	it("accepts normalized hostnames and rejects URLs as official domain records", () => {
		expect(normalizeOfficialContact("domain", " POSTAL-QA.EXAMPLE. ")).toBe("postal-qa.example")
		expect(normalizeOfficialContact("domain", "https://postal-qa.example/claim")).toBeNull()
		const domain = "https://postal-qa.example/claim"
		expect(inspectScamLinks(domain, official).unofficialDomain).toBe(true)
		expect(inspectScamLinks(domain, [...official, "postal-qa.example"]).unofficialDomain).toBe(
			false
		)
	})
})

describe("SCM-1 localized replies", () => {
	it.each(Object.keys(SCAM_COPY) as (keyof typeof SCAM_COPY)[])(
		"renders fixed guidance, findings, reporting, and advisory for %s",
		language => {
			const copy = SCAM_COPY[language]
			const reply = formatScamAssessment("high", ["unofficial_domain"], language)
			for (const part of [
				copy.risk.high,
				copy.signals.unofficial_domain,
				copy.protect,
				copy.verify,
				copy.report,
				copy.advisory,
				SCAM_COPY.en.advisory,
			])
				expect(reply).toContain(part)
			expect(reply).not.toContain("https://")
			expect(formatScamAssessment("uncertain", [], language)).toContain(copy.report)
		}
	)
})

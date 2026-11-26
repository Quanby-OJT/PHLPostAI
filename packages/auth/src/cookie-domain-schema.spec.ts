import { describe, expect, it } from "vitest"

import { cookieDomainSchema, isValidCookieDomain } from "./cookie-domain-schema.js"

describe("cookie domain validation", () => {
	it.each(["example.com", ".example.com", "localhost", ".localhost"])("accepts %s", domain =>
		expect(isValidCookieDomain(domain)).toBe(true)
	)

	it.each([
		"",
		" example.com",
		"example.com ",
		"https://example.com",
		"example.com:443",
		"-bad.com",
	])("rejects %s", domain => expect(isValidCookieDomain(domain)).toBe(false))

	it("allows the setting to remain unset and rejects malformed values", () => {
		expect(cookieDomainSchema.parse(undefined)).toBeUndefined()
		expect(cookieDomainSchema.safeParse(".phlpost.gov.ph").success).toBe(true)
		expect(cookieDomainSchema.safeParse("https://phlpost.gov.ph").success).toBe(false)
	})
})

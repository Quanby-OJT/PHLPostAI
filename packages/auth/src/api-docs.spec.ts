import { describe, expect, it } from "vitest"

import { isApiDocsEnabled } from "./api-docs.js"

describe("isApiDocsEnabled", () => {
	it("uses an explicit flag when configured", () => {
		expect(isApiDocsEnabled("production", true)).toBe(true)
		expect(isApiDocsEnabled("development", false)).toBe(false)
	})

	it("defaults to enabled only in development", () => {
		expect(isApiDocsEnabled(undefined, undefined)).toBe(true)
		expect(isApiDocsEnabled("production", undefined)).toBe(false)
	})
})

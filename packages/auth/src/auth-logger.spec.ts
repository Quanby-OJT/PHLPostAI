import { afterEach, describe, expect, it, vi } from "vitest"

import { authLogger } from "./auth-logger.js"

afterEach(() => vi.restoreAllMocks())

describe("auth logger", () => {
	it("routes levels to their matching console methods and redacts SQL parameters", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
		const query = "Failed query: select 1\nparams: reset-password:secret-token"

		authLogger.log?.("info", query, "params: private-value")
		authLogger.log?.("warn", "warning")
		authLogger.log?.("error", "failure", new Error("outer", { cause: new Error(query) }))

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("[Better Auth]: Failed query"),
			expect.any(String)
		)
		expect(log.mock.calls[0]?.[0]).not.toContain("secret-token")
		expect(log.mock.calls[0]?.[1]).not.toContain("private-value")
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("WARN [Better Auth]: warning"))
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("ERROR [Better Auth]: failure"),
			expect.stringContaining("Caused by:")
		)
	})
})

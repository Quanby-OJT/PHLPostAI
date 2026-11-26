import { afterEach, describe, expect, it, vi } from "vitest"

import {
	createMemoryRateLimitStorage,
	rateLimitStorage,
	setAuthRateLimitStorage,
} from "./rate-limit-storage.js"

afterEach(() => setAuthRateLimitStorage(null))

describe("rate-limit storage", () => {
	it("allows up to the limit, then reports a retry time and expires the window", async () => {
		let now = 1_000
		const storage = createMemoryRateLimitStorage({ now: () => now })
		const rule = { window: 2, max: 1 }

		expect(await storage.consume("client", rule)).toEqual({ allowed: true, retryAfter: null })
		now += 100
		expect(await storage.consume("client", rule)).toEqual({ allowed: false, retryAfter: 2 })
		now += 1_900
		expect(await storage.consume("client", rule)).toEqual({ allowed: true, retryAfter: null })
	})

	it("keeps the retry time at one second near expiry", async () => {
		let now = 0
		const storage = createMemoryRateLimitStorage({ now: () => now })
		const rule = { window: 1, max: 1 }

		await storage.consume("client", rule)
		now = 999
		expect(await storage.consume("client", rule)).toEqual({ allowed: false, retryAfter: 1 })
	})

	it("prunes expired entries and evicts the oldest entry at capacity", async () => {
		let now = 0
		const storage = createMemoryRateLimitStorage({ maxEntries: 2, now: () => now })
		const rule = { window: 1, max: 1 }

		await storage.consume("first", rule)
		await storage.consume("second", rule)
		await storage.consume("third", rule)
		expect(await storage.consume("first", rule)).toEqual({ allowed: true, retryAfter: null })
		now = 1_000
		expect(await storage.consume("second", rule)).toEqual({ allowed: true, retryAfter: null })
	})

	it("forwards to registered shared storage and returns to its fallback", async () => {
		const shared = { consume: vi.fn().mockResolvedValue({ allowed: false, retryAfter: 7 }) }
		setAuthRateLimitStorage(shared)
		expect(await rateLimitStorage.consume("client", { window: 60, max: 1 })).toEqual({
			allowed: false,
			retryAfter: 7,
		})
		expect(shared.consume).toHaveBeenCalledWith("client", { window: 60, max: 1 })

		setAuthRateLimitStorage(null)
		expect(await rateLimitStorage.consume("fallback", { window: 60, max: 1 })).toEqual({
			allowed: true,
			retryAfter: null,
		})
	})
})

import { sessionTracker } from "./session-throttle.decorator"

describe("sessionTracker", () => {
	it("hashes the session token and never returns it raw", () => {
		const key = sessionTracker({ headers: { "x-customer-session": "secret-token" }, ip: "1.1.1.1" })
		expect(key).toMatch(/^session:[0-9a-f]{64}$/)
		expect(key).not.toContain("secret-token")
	})

	it("gives the same key for the same token and different keys for different tokens", () => {
		const a = sessionTracker({ headers: { "x-customer-session": "a" } })
		expect(sessionTracker({ headers: { "x-customer-session": "a" } })).toBe(a)
		expect(sessionTracker({ headers: { "x-customer-session": "b" } })).not.toBe(a)
	})

	it("falls back to the rightmost proxy address when there is no token", () => {
		expect(sessionTracker({ headers: {}, ips: ["9.9.9.9", "2.2.2.2"], ip: "3.3.3.3" })).toBe(
			"ip:2.2.2.2"
		)
	})

	it("falls back to req.ip when ips is empty", () => {
		expect(sessionTracker({ headers: {}, ip: "3.3.3.3" })).toBe("ip:3.3.3.3")
	})
})

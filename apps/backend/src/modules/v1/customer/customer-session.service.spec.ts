import { CustomerSessionService } from "./customer-session.service"

const IDLE_MINUTES = 30

jest.mock("@/config/env.config", () => ({
	env: { CUSTOMER_SESSION_IDLE_MINUTES: 30 },
}))

// The real schema module is ESM; only the table handles are needed, and the
// mocked db below never looks at them.
jest.mock("@repo/db/schema", () => ({
	customerSessions: { tokenHash: "token_hash", id: "id", lastSeenAt: "last_seen_at" },
}))

const selected: { rows: unknown[] } = { rows: [] }
const inserted: { values: unknown[] } = { values: [] }
const updates: { values: unknown[] } = { values: [] }

jest.mock("@/common/database/database.client", () => ({
	db: {
		insert: () => ({
			values: (values: unknown) => {
				inserted.values.push(values)
				return {
					returning: async () => [
						{
							id: "session-1",
							tokenHash: (values as { tokenHash: string }).tokenHash,
							channelCode: (values as { channelCode: string }).channelCode,
							language: (values as { language: string }).language,
							consentedAt: new Date(),
							lastSeenAt: (values as { lastSeenAt: Date }).lastSeenAt,
							createdAt: new Date(),
						},
					],
				}
			},
		}),
		select: () => ({
			from: () => ({ where: () => ({ limit: async () => selected.rows }) }),
		}),
		update: () => ({
			set: (values: unknown) => {
				updates.values.push(values)
				return { where: async () => undefined }
			},
		}),
	},
}))

function sessionRow(lastSeenAt: Date) {
	return {
		id: "session-1",
		tokenHash: "hash",
		channelCode: "web",
		language: "en",
		consentedAt: new Date(),
		lastSeenAt,
		createdAt: new Date(),
	}
}

describe("CustomerSessionService (CNV-1)", () => {
	let service: CustomerSessionService

	beforeEach(() => {
		service = new CustomerSessionService()
		selected.rows = []
		inserted.values = []
		updates.values = []
	})

	describe("token handling", () => {
		it("stores only a hash of the token it hands out", async () => {
			const { sessionToken } = await service.start({ channelCode: "web", language: "en" })

			const stored = inserted.values[0] as { tokenHash: string }
			expect(sessionToken).toMatch(/^[0-9a-f]{64}$/)
			expect(stored.tokenHash).toBe(service.hashToken(sessionToken))
			// The raw token must not be recoverable from what was written.
			expect(JSON.stringify(inserted.values)).not.toContain(sessionToken)
		})

		it("never records identity on the session row", async () => {
			await service.start({ channelCode: "web", language: "en" })

			// Exact key list: a future column that could carry a name, email, or
			// phone number has to fail this test before it can ship.
			expect(Object.keys(inserted.values[0] as object).sort()).toEqual([
				"channelCode",
				"consentedAt",
				"language",
				"lastSeenAt",
				"tokenHash",
			])
		})

		it("issues a different token every time", async () => {
			const first = await service.start({ channelCode: "web", language: "en" })
			const second = await service.start({ channelCode: "web", language: "en" })

			expect(first.sessionToken).not.toBe(second.sessionToken)
		})
	})

	describe("idle expiry (DOMAIN-MODEL: expire after inactivity)", () => {
		it("resolves an active session and pushes its idle clock forward", async () => {
			const lastSeen = new Date(Date.now() - 60_000)
			selected.rows = [sessionRow(lastSeen)]

			const resolved = await service.resolve("a-token")

			expect(resolved?.id).toBe("session-1")
			expect(resolved?.lastSeenAt.getTime()).toBeGreaterThan(lastSeen.getTime())
			expect(updates.values).toHaveLength(1)
		})

		it("refuses a session idle past the window", async () => {
			selected.rows = [sessionRow(new Date(Date.now() - (IDLE_MINUTES + 1) * 60_000))]

			expect(await service.resolve("a-token")).toBeNull()
			// A lapsed session is not touched — it stays expired.
			expect(updates.values).toHaveLength(0)
		})

		it("refuses an unknown token", async () => {
			selected.rows = []

			expect(await service.resolve("not-a-real-token")).toBeNull()
		})

		it("refuses an empty token without querying", async () => {
			expect(await service.resolve("")).toBeNull()
		})

		it("reports the deadline the window implies", () => {
			const lastSeen = new Date("2026-11-18T10:00:00.000Z")

			expect(service.idleExpiresAt(lastSeen).toISOString()).toBe("2026-11-18T10:30:00.000Z")
		})
	})
})

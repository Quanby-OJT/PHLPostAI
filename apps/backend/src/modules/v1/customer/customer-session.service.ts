import { Injectable } from "@nestjs/common"
import { createHash, randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"

import type { CustomerChannelCode, CustomerLanguage } from "@repo/contracts"
import { customerSessions } from "@repo/db/schema"

import { db } from "@/common/database/database.client"
import { env } from "@/config/env.config"

export type CustomerSessionRow = typeof customerSessions.$inferSelect

/** Bytes of entropy in a session token. 32 bytes = 256 bits, hex-encoded. */
const TOKEN_BYTES = 32

/**
 * Customer Session lifecycle (CNV-1, DOMAIN-MODEL `customer_sessions`).
 *
 * The token the customer holds is random and is returned exactly once; only
 * its SHA-256 hash is stored, so the table cannot be read to impersonate a
 * live session. Lookups hash the presented token and match on `token_hash`,
 * which means a constant-length index probe and no plaintext comparison.
 *
 * A session is valid only while it is ACTIVE: `last_seen_at` within
 * CUSTOMER_SESSION_IDLE_MINUTES. Expiry is enforced on read rather than by a
 * sweep, so a lapsed session is rejected the moment it is used even if no
 * cleanup job has run.
 */
@Injectable()
export class CustomerSessionService {
	/** SHA-256 of the presented token — the only form that touches the database. */
	hashToken(rawToken: string): string {
		return createHash("sha256").update(rawToken).digest("hex")
	}

	/** Idle deadline for a session last seen at `lastSeenAt`. */
	idleExpiresAt(lastSeenAt: Date): Date {
		return new Date(lastSeenAt.getTime() + env.CUSTOMER_SESSION_IDLE_MINUTES * 60_000)
	}

	/**
	 * Open a session. `consentedAt` records that the customer started the chat
	 * themselves; the row still carries no name, email, or phone.
	 */
	async start(input: {
		channelCode: CustomerChannelCode
		language: CustomerLanguage
	}): Promise<{ sessionToken: string; row: CustomerSessionRow }> {
		const sessionToken = randomBytes(TOKEN_BYTES).toString("hex")
		const now = new Date()
		const [row] = await db
			.insert(customerSessions)
			.values({
				tokenHash: this.hashToken(sessionToken),
				channelCode: input.channelCode,
				language: input.language,
				consentedAt: now,
				lastSeenAt: now,
			})
			.returning()

		// `.returning()` on a single-row insert always yields the row; the guard
		// keeps the type honest rather than asserting non-null.
		if (!row) throw new Error("Failed to open customer session")
		return { sessionToken, row }
	}

	/**
	 * Resolve a presented token to its session, or null when it is unknown or
	 * has gone idle. A resolved session's `last_seen_at` is pushed forward, so
	 * an active conversation never lapses mid-chat.
	 */
	async resolve(rawToken: string): Promise<CustomerSessionRow | null> {
		if (!rawToken) return null

		const [row] = await db
			.select()
			.from(customerSessions)
			.where(eq(customerSessions.tokenHash, this.hashToken(rawToken)))
			.limit(1)
		if (!row) return null

		if (this.idleExpiresAt(row.lastSeenAt).getTime() <= Date.now()) return null

		const touched = new Date()
		await db
			.update(customerSessions)
			.set({ lastSeenAt: touched })
			.where(eq(customerSessions.id, row.id))
		return { ...row, lastSeenAt: touched }
	}

	/** CNV-4: the language the customer picked in the widget menu. */
	async setLanguage(sessionId: string, language: CustomerLanguage): Promise<void> {
		await db
			.update(customerSessions)
			.set({ language })
			.where(eq(customerSessions.id, sessionId))
	}
}

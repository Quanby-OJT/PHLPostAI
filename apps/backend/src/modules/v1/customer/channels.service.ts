import { Injectable } from "@nestjs/common"
import { eq } from "drizzle-orm"

import { channels } from "@repo/db/schema"

import { db } from "@/common/database/database.client"

/** The channel code the embeddable widget registers under (CHN-1). */
export const WEB_WIDGET_CHANNEL = "web-widget"

/** Origins compare case-insensitively and without a trailing slash. */
export function normalizeOrigin(value: string): string {
	return value.trim().replace(/\/+$/, "").toLowerCase()
}

/**
 * Reads channel configuration (`channels` table, CHN-1).
 * A missing channel or a malformed config yields no allowed origins,
 * so callers fail closed.
 */
@Injectable()
export class ChannelsService {
	async getAllowedOrigins(code: string): Promise<string[]> {
		const [row] = await db
			.select({ config: channels.config })
			.from(channels)
			.where(eq(channels.code, code))
			.limit(1)

		const raw = (row?.config as { allowedOrigins?: unknown } | undefined)?.allowedOrigins
		if (!Array.isArray(raw)) return []
		return raw.filter((v): v is string => typeof v === "string").map(normalizeOrigin)
	}
}

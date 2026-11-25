import { Injectable, NotFoundException } from "@nestjs/common"
import { eq } from "drizzle-orm"

import type { Channel, UpdateChannel } from "@repo/contracts"
import { channels } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { db } from "@/common/database/database.client"

const asConfig = (config: unknown) => {
	const value = config && typeof config === "object" ? (config as Record<string, unknown>) : {}
	return {
		allowedOrigins: Array.isArray(value.allowedOrigins)
			? value.allowedOrigins.filter((origin): origin is string => typeof origin === "string")
			: [],
		welcomeText:
			typeof value.welcomeText === "string" ? value.welcomeText : "How can I help you today?",
	}
}

@Injectable()
export class ChannelsAdminService {
	constructor(private readonly auditService: AuditService) {}

	async list(): Promise<Channel[]> {
		const rows = await db.select().from(channels).orderBy(channels.name)
		return rows.map(row => ({
			code: row.code,
			name: row.name,
			isEnabled: row.isEnabled,
			config: asConfig(row.config),
			updatedAt: row.updatedAt,
		}))
	}

	async update(input: UpdateChannel, actorId: string): Promise<Channel> {
		const [row] = await db.select().from(channels).where(eq(channels.code, input.code)).limit(1)
		if (!row) throw new NotFoundException("Channel not found")
		const before = {
			isEnabled: row.isEnabled,
			...asConfig(row.config),
		}
		const config = asConfig(row.config)
		const after = {
			isEnabled: input.isEnabled ?? row.isEnabled,
			allowedOrigins: input.allowedOrigins ?? config.allowedOrigins,
			welcomeText: input.welcomeText ?? config.welcomeText,
		}
		const originalConfig =
			row.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {}
		const [updated] = await db
			.update(channels)
			.set({
				isEnabled: after.isEnabled,
				config: {
					...originalConfig,
					allowedOrigins: after.allowedOrigins,
					welcomeText: after.welcomeText,
				},
				updatedAt: new Date(),
			})
			.where(eq(channels.id, row.id))
			.returning()
		if (!updated) throw new Error("Channel update returned no row")

		await this.auditService.writeAudit({
			actorId,
			actorType: "user",
			action: "channel.updated",
			resourceType: "channel",
			resourceId: row.code,
			before,
			after,
		})
		return {
			code: updated.code,
			name: updated.name,
			isEnabled: updated.isEnabled,
			config: asConfig(updated.config),
			updatedAt: updated.updatedAt,
		}
	}
}

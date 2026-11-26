import { Injectable } from "@nestjs/common"
import { eq } from "drizzle-orm"

import { agentPresence, assistantSettings } from "@repo/db/schema"

import { db } from "@/common/database/database.client"

@Injectable()
export class AssistantSettingsRepository {
	async list(): Promise<Array<typeof assistantSettings.$inferSelect>> {
		return db.select().from(assistantSettings)
	}

	/** Saves several settings in one transaction, so a save never applies halfway. */
	async setMany(
		entries: ReadonlyArray<{ key: string; value: unknown }>,
		updatedBy: string,
		presenceDefaultChange?: { from: number; to: number }
	) {
		await db.transaction(async tx => {
			for (const { key, value } of entries) {
				await tx.insert(assistantSettings).values({ key, value, updatedBy }).onConflictDoUpdate({
					target: assistantSettings.key,
					set: { value, updatedBy },
				})
			}
			if (presenceDefaultChange) {
				await tx
					.update(agentPresence)
					.set({ maxOpenChats: presenceDefaultChange.to, updatedAt: new Date() })
					.where(eq(agentPresence.maxOpenChats, presenceDefaultChange.from))
			}
		})
	}
}

import { Injectable } from "@nestjs/common"

import { assistantSettings } from "@repo/db/schema"

import { db, type DbTransaction } from "@/common/database/database.client"

@Injectable()
export class AssistantSettingsRepository {
	async list(transaction?: DbTransaction): Promise<Array<typeof assistantSettings.$inferSelect>> {
		return (transaction ?? db).select().from(assistantSettings)
	}

	/** Saves several settings in one transaction, so a save never applies halfway. */
	async setMany(entries: ReadonlyArray<{ key: string; value: unknown }>, updatedBy: string) {
		await db.transaction(async tx => {
			for (const { key, value } of entries) {
				await tx.insert(assistantSettings).values({ key, value, updatedBy }).onConflictDoUpdate({
					target: assistantSettings.key,
					set: { value, updatedBy },
				})
			}
		})
	}
}

import { Injectable } from "@nestjs/common"

import { assistantSettings } from "@repo/db/schema"

import { db } from "@/common/database/database.client"

@Injectable()
export class AssistantSettingsRepository {
	async list(): Promise<Array<typeof assistantSettings.$inferSelect>> {
		return db.select().from(assistantSettings)
	}

	async set(key: string, value: number, updatedBy: string): Promise<void> {
		await db
			.insert(assistantSettings)
			.values({ key, value, updatedBy })
			.onConflictDoUpdate({
				target: assistantSettings.key,
				set: { value, updatedBy },
			})
	}
}

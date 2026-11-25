import { Injectable } from "@nestjs/common"
import { asc, eq } from "drizzle-orm"

import { inquiryCategories } from "@repo/db/schema"

import { db } from "@/common/database/database.client"

export interface InquiryCategoryRow {
	code: string
	name: string
	isEligible: boolean
	isActive: boolean
	createdAt: Date
	updatedAt: Date
}

@Injectable()
export class AssistantRepository {
	async listCategories(): Promise<InquiryCategoryRow[]> {
		return db.select().from(inquiryCategories).orderBy(asc(inquiryCategories.code))
	}

	async listActiveCategories(): Promise<{ code: string; name: string; isEligible: boolean }[]> {
		return db
			.select({
				code: inquiryCategories.code,
				name: inquiryCategories.name,
				isEligible: inquiryCategories.isEligible,
			})
			.from(inquiryCategories)
			.where(eq(inquiryCategories.isActive, true))
			.orderBy(asc(inquiryCategories.code))
	}

	async findCategoryByCode(code: string): Promise<InquiryCategoryRow | null> {
		const [row] = await db
			.select()
			.from(inquiryCategories)
			.where(eq(inquiryCategories.code, code))
			.limit(1)
		return row ?? null
	}

	async createCategory(input: {
		code: string
		name: string
		isEligible: boolean
	}): Promise<InquiryCategoryRow | null> {
		const [row] = await db
			.insert(inquiryCategories)
			.values({ ...input, isActive: true })
			.onConflictDoNothing({ target: inquiryCategories.code })
			.returning()
		return row ?? null
	}

	async updateCategory(
		code: string,
		patch: { isEligible: boolean; isActive?: boolean }
	): Promise<InquiryCategoryRow | null> {
		const values: { isEligible: boolean; isActive?: boolean; updatedAt: Date } = {
			isEligible: patch.isEligible,
			updatedAt: new Date(),
		}
		if (patch.isActive !== undefined) {
			values.isActive = patch.isActive
		}
		const [row] = await db
			.update(inquiryCategories)
			.set(values)
			.where(eq(inquiryCategories.code, code))
			.returning()
		return row ?? null
	}
}

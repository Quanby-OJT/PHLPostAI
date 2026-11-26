import { Injectable } from "@nestjs/common"

import {
	type AssistantSettings,
	type EscalationSettings,
	type UpdateAssistantSettingsRequest,
	type UpdateEscalationSettingsRequest,
} from "@repo/contracts"

import { AuditService } from "@/common/audit/audit.service"
import type { DbTransaction } from "@/common/database/database.client"

import { AssistantSettingsRepository } from "./assistant-settings.repository"

/** Defaults are deliberately conservative and can be changed by an administrator. */
export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
	confidenceThreshold: 0.7,
	maxOutputTokens: 200,
	blockedTopics: [],
}

export const DEFAULT_ESCALATION_SETTINGS: EscalationSettings = {
	rules: { topics: [], keywords: [], categories: [], repeatedLowConfidenceCount: 2 },
	routing: { mode: "least_busy", maxOpenChatsPerAgent: 3 },
	businessHours: {
		timezone: "Asia/Manila",
		days: [
			{ day: "monday", open: true, start: "08:00", end: "17:00" },
			{ day: "tuesday", open: true, start: "08:00", end: "17:00" },
			{ day: "wednesday", open: true, start: "08:00", end: "17:00" },
			{ day: "thursday", open: true, start: "08:00", end: "17:00" },
			{ day: "friday", open: true, start: "08:00", end: "17:00" },
			{ day: "saturday", open: false, start: "08:00", end: "17:00" },
			{ day: "sunday", open: false, start: "08:00", end: "17:00" },
		],
		holidays: [],
		waitLimitSeconds: 180,
	},
}

const ESCALATION_DAYS = new Set([
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
])
const ESCALATION_CATEGORIES = new Set([
	"tracking",
	"rates",
	"postal-id",
	"service-info",
	"scam",
	"complaint",
	"other",
])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseEscalationSettings(value: unknown): EscalationSettings | null {
	if (!isRecord(value) || !isRecord(value.rules) || !isRecord(value.businessHours)) return null
	const rules = value.rules
	const hours = value.businessHours
	const routing = isRecord(value.routing) ? value.routing : DEFAULT_ESCALATION_SETTINGS.routing
	if (
		!Array.isArray(rules.topics) ||
		!rules.topics.every(item => typeof item === "string") ||
		!Array.isArray(rules.keywords) ||
		!rules.keywords.every(item => typeof item === "string") ||
		!Array.isArray(rules.categories) ||
		!rules.categories.every(item => typeof item === "string" && ESCALATION_CATEGORIES.has(item)) ||
		!Number.isInteger(rules.repeatedLowConfidenceCount) ||
		Number(rules.repeatedLowConfidenceCount) < 1 ||
		Number(rules.repeatedLowConfidenceCount) > 5 ||
		hours.timezone !== "Asia/Manila" ||
		!Array.isArray(hours.days) ||
		hours.days.length !== 7 ||
		!hours.days.every(
			day =>
				isRecord(day) &&
				typeof day.day === "string" &&
				ESCALATION_DAYS.has(day.day) &&
				typeof day.open === "boolean" &&
				typeof day.start === "string" &&
				/^([01]\d|2[0-3]):[0-5]\d$/.test(day.start) &&
				typeof day.end === "string" &&
				/^([01]\d|2[0-3]):[0-5]\d$/.test(day.end) &&
				(!day.open || day.start < day.end)
		) ||
		new Set(hours.days.map(day => (day as Record<string, unknown>).day)).size !== 7 ||
		!Array.isArray(hours.holidays) ||
		!hours.holidays.every(item => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item)) ||
		!Number.isInteger(hours.waitLimitSeconds) ||
		Number(hours.waitLimitSeconds) < 30 ||
		Number(hours.waitLimitSeconds) > 3600 ||
		!(routing.mode === "least_busy" || routing.mode === "manual") ||
		!Number.isInteger(routing.maxOpenChatsPerAgent) ||
		Number(routing.maxOpenChatsPerAgent) < 1 ||
		Number(routing.maxOpenChatsPerAgent) > 30
	) {
		return null
	}
	return { ...value, routing } as unknown as EscalationSettings
}

@Injectable()
export class AssistantSettingsService {
	constructor(
		private readonly repository: AssistantSettingsRepository,
		private readonly auditService: AuditService
	) {}

	/** The only reader of `assistant_settings` for CNV-3 consumers. */
	async get(): Promise<AssistantSettings> {
		const rows = await this.repository.list()
		const values = new Map(rows.map(row => [row.key, row.value]))
		const confidenceThreshold = values.get("confidence_threshold")
		const maxOutputTokens = values.get("max_output_tokens")
		const blockedTopics = values.get("blocked_topics")
		return {
			confidenceThreshold:
				typeof confidenceThreshold === "number"
					? Math.max(0, Math.min(1, confidenceThreshold))
					: DEFAULT_ASSISTANT_SETTINGS.confidenceThreshold,
			maxOutputTokens:
				typeof maxOutputTokens === "number"
					? Math.max(1, Math.min(200, Math.trunc(maxOutputTokens)))
					: DEFAULT_ASSISTANT_SETTINGS.maxOutputTokens,
			blockedTopics: Array.isArray(blockedTopics)
				? blockedTopics.filter((topic): topic is string => typeof topic === "string")
				: DEFAULT_ASSISTANT_SETTINGS.blockedTopics,
		}
	}

	async getEscalationSettings(transaction?: DbTransaction): Promise<EscalationSettings> {
		const rows = await this.repository.list(transaction)
		const values = new Map(rows.map(row => [row.key, row.value]))
		const parsed = parseEscalationSettings({
			rules: values.get("escalation_rules"),
			businessHours: values.get("escalation_business_hours"),
			routing: values.get("escalation_routing"),
		})
		return parsed ?? DEFAULT_ESCALATION_SETTINGS
	}

	async updateEscalationSettings(
		input: UpdateEscalationSettingsRequest,
		actor: { userId: string }
	): Promise<EscalationSettings> {
		const before = await this.getEscalationSettings()
		const after = input
		await this.repository.setMany(
			[
				{ key: "escalation_rules", value: after.rules },
				{ key: "escalation_business_hours", value: after.businessHours },
				{ key: "escalation_routing", value: after.routing },
			],
			actor.userId,
			before.routing.maxOpenChatsPerAgent === after.routing.maxOpenChatsPerAgent
				? undefined
				: {
						from: before.routing.maxOpenChatsPerAgent,
						to: after.routing.maxOpenChatsPerAgent,
					}
		)
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: "user",
			action: "escalation.settings.update",
			resourceType: "assistant_settings",
			resourceId: "escalation",
			before,
			after,
		})
		return after
	}

	/** Writes through this service and audits the complete old/new settings snapshot. */
	async update(
		input: UpdateAssistantSettingsRequest,
		actor: { userId: string }
	): Promise<AssistantSettings> {
		const before = await this.get()
		const normalizedInput = {
			...input,
			...(input.blockedTopics !== undefined && {
				blockedTopics: [...new Set(input.blockedTopics.map(topic => topic.trim()).filter(Boolean))],
			}),
		}
		const after: AssistantSettings = { ...before, ...normalizedInput }
		const entries: { key: string; value: number | string[] }[] = []
		if (input.confidenceThreshold !== undefined) {
			entries.push({ key: "confidence_threshold", value: input.confidenceThreshold })
		}
		if (input.maxOutputTokens !== undefined) {
			entries.push({ key: "max_output_tokens", value: input.maxOutputTokens })
		}
		if (normalizedInput.blockedTopics !== undefined) {
			entries.push({ key: "blocked_topics", value: normalizedInput.blockedTopics })
		}
		await this.repository.setMany(entries, actor.userId)
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: "user",
			action: "assistant.settings.update",
			resourceType: "assistant_settings",
			resourceId: "customer-support",
			before,
			after,
		})
		return after
	}
}

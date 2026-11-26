import { oc } from "@orpc/contract"
import { z } from "zod"

import {
	AssistantSettingsSchema,
	CreateInquiryCategoryRequestSchema,
	EscalationSettingsSchema,
	InquiryCategorySchema,
	UpdateAssistantSettingsRequestSchema,
	UpdateEscalationSettingsRequestSchema,
	UpdateInquiryCategoryRequestSchema,
} from "./assistant.schema.js"

/** Assistant configuration (CNV-2). Requires settings.assistant.manage. */
export const assistantContract = {
	settings: {
		get: oc
			.route({
				method: "GET",
				path: "/assistant/settings",
				summary: "Get assistant settings",
				tags: ["Assistant"],
			})
			.output(AssistantSettingsSchema),
		update: oc
			.route({
				method: "PUT",
				path: "/assistant/settings",
				summary: "Update assistant settings",
				tags: ["Assistant"],
			})
			.input(UpdateAssistantSettingsRequestSchema)
			.output(AssistantSettingsSchema),
	},
	escalationSettings: {
		get: oc
			.route({
				method: "GET",
				path: "/assistant/escalation-settings",
				summary: "Get escalation rules and hours",
				tags: ["Assistant"],
			})
			.output(EscalationSettingsSchema),
		update: oc
			.route({
				method: "PUT",
				path: "/assistant/escalation-settings",
				summary: "Update escalation rules and hours",
				tags: ["Assistant"],
			})
			.input(UpdateEscalationSettingsRequestSchema)
			.output(EscalationSettingsSchema),
	},
	categories: {
		list: oc
			.route({
				method: "GET",
				path: "/assistant/categories",
				summary: "List inquiry categories and eligibility settings",
				tags: ["Assistant"],
			})
			.output(z.array(InquiryCategorySchema)),
		create: oc
			.route({
				method: "POST",
				path: "/assistant/categories",
				summary: "Add an inquiry category",
				description: "New messages can be classified into it from the next turn.",
				tags: ["Assistant"],
			})
			.input(CreateInquiryCategoryRequestSchema)
			.output(InquiryCategorySchema),
		update: oc
			.route({
				method: "PUT",
				path: "/assistant/categories",
				summary: "Update inquiry category eligibility and active state",
				tags: ["Assistant"],
			})
			.input(UpdateInquiryCategoryRequestSchema)
			.output(InquiryCategorySchema),
	},
}

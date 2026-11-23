import { oc } from "@orpc/contract"
import { z } from "zod"

import {
	InquiryCategorySchema,
	UpdateInquiryCategoryRequestSchema,
} from "./assistant.schema.js"

/** Assistant configuration (CNV-2). Requires settings.assistant.manage. */
export const assistantContract = {
	categories: {
		list: oc
			.route({
				method: "GET",
				path: "/assistant/categories",
				summary: "List inquiry categories and eligibility settings",
				tags: ["Assistant"],
			})
			.output(z.array(InquiryCategorySchema)),
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

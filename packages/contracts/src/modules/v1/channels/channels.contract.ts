import { oc } from "@orpc/contract"

import { ChannelSchema, UpdateChannelSchema } from "./channels.schema.js"

export const channelsContract = {
	list: oc
		.route({
			method: "GET",
			path: "/channels",
			summary: "List assistant channels",
			tags: ["Channels"],
		})
		.output(ChannelSchema.array()),
	update: oc
		.route({ method: "PATCH", path: "/channels", summary: "Update a channel", tags: ["Channels"] })
		.input(UpdateChannelSchema)
		.output(ChannelSchema),
}

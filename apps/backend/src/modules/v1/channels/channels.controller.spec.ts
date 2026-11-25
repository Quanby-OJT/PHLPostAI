import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { ChannelsController } from "./channels.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({ implement: () => ({ handler: (fn: unknown) => fn }) }))
jest.mock("@/config/api-versions.config", () => ({
	v1: { channels: { list: {}, update: {} } },
}))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))

describe("ChannelsController permissions", () => {
	it.each(["list", "update"] as const)("requires channel management permission for %s", method => {
		expect(
			Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, ChannelsController.prototype[method])
		).toEqual(["channels.channels.manage"])
	})
})

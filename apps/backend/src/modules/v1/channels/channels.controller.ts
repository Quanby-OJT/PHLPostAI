import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"

import { ChannelsAdminService } from "./channels.service"

@Controller()
export class ChannelsController {
	constructor(private readonly channelsService: ChannelsAdminService) {}

	@RequirePermissions("channels.channels.manage")
	@Implement(v1.channels.list)
	async list() {
		return implement(v1.channels.list).handler(() => this.channelsService.list())
	}

	@RequirePermissions("channels.channels.manage")
	@Implement(v1.channels.update)
	async update(@Session() session: UserSession) {
		return implement(v1.channels.update).handler(({ input }) =>
			this.channelsService.update(input, session.user.id)
		)
	}
}

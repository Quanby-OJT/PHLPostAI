import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { AssistantService } from "./assistant.service"

@Controller()
export class AssistantController {
	constructor(private readonly service: AssistantService) {}

	@RequirePermissions("settings.assistant.manage")
	@Implement(v1.assistant.categories.list)
	async listCategories() {
		return implement(v1.assistant.categories.list).handler(async () =>
			this.service.listCategories()
		)
	}

	@StrictThrottle()
	@RequirePermissions("settings.assistant.manage")
	@Implement(v1.assistant.categories.update)
	async updateCategory(@Session() session: UserSession) {
		return implement(v1.assistant.categories.update).handler(async ({ input }) =>
			this.service.updateCategory(input, { userId: session.user.id })
		)
	}
}

import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { AssistantSettingsService } from "./assistant-settings.service"
import { AssistantService } from "./assistant.service"

@Controller()
export class AssistantController {
	constructor(
		private readonly service: AssistantService,
		private readonly settingsService: AssistantSettingsService
	) {}

	@RequirePermissions("settings.assistant.manage")
	@Implement(v1.assistant.settings.get)
	async getSettings() {
		return implement(v1.assistant.settings.get).handler(async () => this.settingsService.get())
	}

	@StrictThrottle()
	@RequirePermissions("settings.assistant.manage")
	@Implement(v1.assistant.settings.update)
	async updateSettings(@Session() session: UserSession) {
		return implement(v1.assistant.settings.update).handler(async ({ input }) =>
			this.settingsService.update(input, { userId: session.user.id })
		)
	}

	@RequirePermissions("settings.escalation.manage")
	@Implement(v1.assistant.escalationSettings.get)
	async getEscalationSettings() {
		return implement(v1.assistant.escalationSettings.get).handler(() =>
			this.settingsService.getEscalationSettings()
		)
	}

	@StrictThrottle()
	@RequirePermissions("settings.escalation.manage")
	@Implement(v1.assistant.escalationSettings.update)
	async updateEscalationSettings(@Session() session: UserSession) {
		return implement(v1.assistant.escalationSettings.update).handler(async ({ input }) =>
			this.settingsService.updateEscalationSettings(input, { userId: session.user.id })
		)
	}

	@RequirePermissions("settings.assistant.manage")
	@Implement(v1.assistant.categories.list)
	async listCategories() {
		return implement(v1.assistant.categories.list).handler(async () =>
			this.service.listCategories()
		)
	}

	@StrictThrottle()
	@RequirePermissions("settings.assistant.manage")
	@Implement(v1.assistant.categories.create)
	async createCategory(@Session() session: UserSession) {
		return implement(v1.assistant.categories.create).handler(async ({ input }) =>
			this.service.createCategory(input, { userId: session.user.id })
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

import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { ScamAssessmentService } from "../customer/scam-assessment.service"
import { ScamConfigurationService } from "./scam-configuration.service"

const permission = "scam.indicators.manage"

@Controller()
@RequirePermissions(permission)
export class ScamController {
	constructor(
		private readonly configuration: ScamConfigurationService,
		private readonly assessments: ScamAssessmentService
	) {}

	@Implement(v1.scam.riskIndicators.list)
	async listIndicators() {
		return implement(v1.scam.riskIndicators.list).handler(() => this.configuration.listIndicators())
	}

	@StrictThrottle()
	@Implement(v1.scam.riskIndicators.create)
	async createIndicator(@Session() session: UserSession) {
		return implement(v1.scam.riskIndicators.create).handler(({ input }) =>
			this.configuration.createIndicator(input, session.user.id)
		)
	}

	@StrictThrottle()
	@Implement(v1.scam.riskIndicators.update)
	async updateIndicator(@Session() session: UserSession) {
		return implement(v1.scam.riskIndicators.update).handler(({ input }) =>
			this.configuration.updateIndicator(input, session.user.id)
		)
	}

	@Implement(v1.scam.officialContacts.list)
	async listContacts() {
		return implement(v1.scam.officialContacts.list).handler(() => this.configuration.listContacts())
	}

	@StrictThrottle()
	@Implement(v1.scam.officialContacts.create)
	async createContact(@Session() session: UserSession) {
		return implement(v1.scam.officialContacts.create).handler(({ input }) =>
			this.configuration.createContact(input, session.user.id)
		)
	}

	@StrictThrottle()
	@Implement(v1.scam.testAssessment)
	async testAssessment(@Session() session: UserSession) {
		return implement(v1.scam.testAssessment).handler(async ({ input }) => {
			const { assessment, findings } = await this.assessments.evaluate({
				query: input.query,
				actorType: "user",
				principal: session.user.id,
				permissions: [permission],
				correlationId: crypto.randomUUID(),
			})
			return { ...assessment, indicators: findings }
		})
	}
}

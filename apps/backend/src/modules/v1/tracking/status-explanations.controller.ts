import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { StatusExplanationsService } from "./status-explanations.service"

/** TRK-2. The RbacGuard answers 403 and audits the denial for a caller without the key. */
@Controller()
export class StatusExplanationsController {
	constructor(private readonly service: StatusExplanationsService) {}

	@RequirePermissions("tracking.explanations.manage")
	@Implement(v1.tracking.explanations.list)
	async list() {
		return implement(v1.tracking.explanations.list).handler(async () => this.service.list())
	}

	@RequirePermissions("tracking.explanations.manage")
	@Implement(v1.tracking.explanations.needed)
	async needed() {
		return implement(v1.tracking.explanations.needed).handler(async () => this.service.needed())
	}

	@StrictThrottle()
	@RequirePermissions("tracking.explanations.manage")
	@Implement(v1.tracking.explanations.save)
	async save(@Session() session: UserSession) {
		return implement(v1.tracking.explanations.save).handler(async ({ input }) =>
			this.service.save(input, { userId: session.user.id })
		)
	}

	@StrictThrottle()
	@RequirePermissions("tracking.explanations.manage")
	@Implement(v1.tracking.explanations.deactivate)
	async deactivate(@Session() session: UserSession) {
		return implement(v1.tracking.explanations.deactivate).handler(async ({ input }) =>
			this.service.deactivate(input.id, { userId: session.user.id })
		)
	}
}

import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { RatesService } from "./rates.service"

/**
 * Postal rates (KB-2). Maintenance needs `knowledge.rates.manage`; review needs
 * `knowledge.articles.approve`. The RbacGuard answers 403 and audits the denial.
 */
@Controller()
export class RatesController {
	constructor(private readonly service: RatesService) {}

	@RequirePermissions("knowledge.rates.manage")
	@Implement(v1.rates.entries.list)
	async listEntries() {
		return implement(v1.rates.entries.list).handler(async () => this.service.listEntries())
	}

	@RequirePermissions("knowledge.rates.manage")
	@Implement(v1.rates.batches.list)
	async listBatches() {
		return implement(v1.rates.batches.list).handler(async () => this.service.listBatches())
	}

	@RequirePermissions("knowledge.rates.manage")
	@Implement(v1.rates.batches.preview)
	async preview() {
		return implement(v1.rates.batches.preview).handler(async ({ input }) =>
			this.service.preview(input)
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.rates.manage")
	@Implement(v1.rates.batches.submit)
	async submit(@Session() session: UserSession) {
		return implement(v1.rates.batches.submit).handler(async ({ input }) =>
			this.service.submit(input, { userId: session.user.id })
		)
	}

	@RequirePermissions("knowledge.articles.approve")
	@Implement(v1.rates.review.queue)
	async reviewQueue() {
		return implement(v1.rates.review.queue).handler(async () => this.service.reviewQueue())
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.approve")
	@Implement(v1.rates.review.approve)
	async approve(@Session() session: UserSession) {
		return implement(v1.rates.review.approve).handler(async ({ input }) =>
			this.service.approve(input.id, { userId: session.user.id })
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.approve")
	@Implement(v1.rates.review.reject)
	async reject(@Session() session: UserSession) {
		return implement(v1.rates.review.reject).handler(async ({ input }) =>
			this.service.reject(input.id, input.note, { userId: session.user.id })
		)
	}
}

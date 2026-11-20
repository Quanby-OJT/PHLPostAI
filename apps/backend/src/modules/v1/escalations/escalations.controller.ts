import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Headers,
	Param,
	Post,
	UnauthorizedException,
	UseGuards,
} from "@nestjs/common"
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth"
import { z } from "zod"

import { AuditService } from "@/common/audit/audit.service"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { SessionThrottle } from "@/shared/decorators/session-throttle.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { AllowedOriginGuard } from "../customer/allowed-origin.guard"
import { CustomerSessionService } from "../customer/customer-session.service"
import { EscalationService } from "./escalation.service"

const RequestEscalationSchema = z.object({
	conversationId: z.string().uuid(),
	reason: z.enum([
		"I still need help",
		"I want to speak with a person",
		"The answer did not solve my question",
	]),
})

@Controller()
export class EscalationsController {
	constructor(
		private readonly escalationService: EscalationService,
		private readonly customerSessionService: CustomerSessionService,
		private readonly auditService: AuditService
	) {}

	@Post("v1/customer/escalations")
	@AllowAnonymous()
	@StrictThrottle()
	@SessionThrottle()
	@UseGuards(AllowedOriginGuard)
	async request(
		@Headers("x-customer-session") sessionToken: string | undefined,
		@Body() body: unknown
	) {
		const session = sessionToken ? await this.customerSessionService.resolve(sessionToken) : null
		if (!session) throw new UnauthorizedException("Invalid or expired customer session")
		const parsed = RequestEscalationSchema.safeParse(body)
		if (!parsed.success) {
			throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid escalation request")
		}
		const escalation = await this.escalationService.request({
			...parsed.data,
			customerSessionId: session.id,
		})
		await this.auditService.writeAudit({
			actorId: `customer-session:${session.id}`,
			actorType: "system",
			action: "escalations.requested",
			resourceType: "escalation",
			resourceId: escalation.id,
			before: null,
			after: { conversationId: parsed.data.conversationId, reason: parsed.data.reason },
		})
		return escalation
	}

	@Get("v1/escalations")
	@RequirePermissions("escalations.queue.view")
	async listQueued() {
		return this.escalationService.listQueued()
	}

	@Get("v1/escalations/:id")
	@RequirePermissions("escalations.queue.view")
	async getQueued(@Param("id") id: string, @Session() session: UserSession) {
		if (!z.string().uuid().safeParse(id).success) {
			throw new BadRequestException("Invalid escalation id")
		}
		return this.escalationService.getQueued(id, session.user.id)
	}
}

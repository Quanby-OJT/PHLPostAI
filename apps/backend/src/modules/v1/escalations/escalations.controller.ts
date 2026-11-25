import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Headers,
	Param,
	Post,
	Query,
	Res,
	UnauthorizedException,
	UseGuards,
} from "@nestjs/common"
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth"
import type { Response } from "express"
import { z } from "zod"

import { AuditService } from "@/common/audit/audit.service"
import { ConversationLiveService } from "@/common/conversation-live/conversation-live.service"
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
		private readonly auditService: AuditService,
		private readonly conversationLiveService: ConversationLiveService
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
		this.requireEscalationId(id)
		const detail = await this.escalationService.getQueued(id, session.user.id)
		return { ...detail, canHandle: detail.assignedAgentId === session.user.id }
	}

	@Post("v1/escalations/:id/claim")
	@StrictThrottle()
	@RequirePermissions("escalations.conversations.handle")
	async claim(@Param("id") id: string, @Session() session: UserSession) {
		this.requireEscalationId(id)
		return this.escalationService.claim(id, session.user.id)
	}

	@Post("v1/escalations/:id/replies")
	@StrictThrottle()
	@RequirePermissions("escalations.conversations.handle")
	async reply(@Param("id") id: string, @Session() session: UserSession, @Body() body: unknown) {
		this.requireEscalationId(id)
		const parsed = z.object({ content: z.string().trim().min(1).max(4000) }).safeParse(body)
		if (!parsed.success)
			throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid reply")
		return this.escalationService.reply(id, session.user.id, parsed.data.content)
	}

	@Post("v1/escalations/:id/resolve")
	@StrictThrottle()
	@RequirePermissions("escalations.conversations.handle")
	async resolve(@Param("id") id: string, @Session() session: UserSession, @Body() body: unknown) {
		this.requireEscalationId(id)
		const parsed = z.object({ outcomeNote: z.string().trim().min(1).max(2000) }).safeParse(body)
		if (!parsed.success)
			throw new BadRequestException(
				parsed.error.issues[0]?.message ?? "An outcome note is required"
			)
		return this.escalationService.resolve(id, session.user.id, parsed.data.outcomeNote)
	}

	@Get("v1/escalations/:id/events")
	@RequirePermissions("escalations.conversations.handle")
	async agentEvents(
		@Param("id") id: string,
		@Query("after") after: string | undefined,
		@Session() session: UserSession,
		@Res() response: Response
	) {
		this.requireEscalationId(id)
		const detail = await this.escalationService.getQueued(id, session.user.id)
		if (detail.assignedAgentId !== session.user.id) {
			throw new BadRequestException("This escalation is assigned to another agent")
		}
		const afterIndex =
			after === undefined
				? Math.max(-1, ...detail.messages.map(message => message.turnIndex))
				: Number(after)
		await this.conversationLiveService.stream(detail.conversationId, response, {
			afterTurnIndex: Number.isSafeInteger(afterIndex) && afterIndex >= -1 ? afterIndex : -1,
		})
	}

	private requireEscalationId(id: string): void {
		if (!z.string().uuid().safeParse(id).success)
			throw new BadRequestException("Invalid escalation id")
	}
}

import { Controller } from "@nestjs/common"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"

import { v1 } from "@/config/api-versions.config"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"

import { ConversationTranscriptsService } from "./conversation-transcripts.service"

/**
 * Conversation transcripts (ADM-3). Both routes require
 * `conversations.transcripts.view`. RbacGuard fails closed and writes the
 * `rbac.denied` Audit Entry for a caller without it (403).
 */
@Controller()
export class ConversationTranscriptsController {
	constructor(private readonly transcriptsService: ConversationTranscriptsService) {}

	@RequirePermissions("conversations.transcripts.view")
	@Implement(v1.conversations.transcripts.search)
	async search() {
		return implement(v1.conversations.transcripts.search).handler(async ({ input }) => {
			return this.transcriptsService.search(input)
		})
	}

	@RequirePermissions("conversations.transcripts.view")
	@Implement(v1.conversations.transcripts.get)
	async get(@Session() session: UserSession) {
		return implement(v1.conversations.transcripts.get).handler(async ({ input }) => {
			return this.transcriptsService.get(input.id, session.user.id)
		})
	}
}

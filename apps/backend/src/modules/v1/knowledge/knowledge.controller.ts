import {
	BadGatewayException,
	BadRequestException,
	Controller,
	Post,
	Req,
	UnsupportedMediaTypeException,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface"
import { Implement } from "@orpc/nest"
import { implement } from "@orpc/server"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"
import type { Request } from "express"
import { memoryStorage } from "multer"

import { KnowledgeExtractResponseSchema } from "@repo/contracts"

import { RbacService } from "@/common/rbac/rbac.service"
import { v1 } from "@/config/api-versions.config"
import { MAX_UPLOAD_BYTES } from "@/modules/v1/corpus/corpus.upload-options"
import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"
import { RequirePermissions } from "@/shared/decorators/require-permissions.decorator"
import { StrictThrottle } from "@/shared/decorators/strict-throttle.decorator"

import { KnowledgeService, type KnowledgeActor } from "./knowledge.service"

/** File types accepted as a draft's starting text (KB-1 in scope: DOCX, PDF, HTML). */
export const KNOWLEDGE_UPLOAD_MIME_TYPES = [
	"application/pdf",
	"text/html",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const

const knowledgeMimeSet: ReadonlySet<string> = new Set(KNOWLEDGE_UPLOAD_MIME_TYPES)

export const knowledgeUploadOptions: MulterOptions = {
	storage: memoryStorage(),
	limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
	fileFilter: (_req, file, callback) => {
		const mime = (file.mimetype ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
		if (!knowledgeMimeSet.has(mime)) {
			callback(
				new UnsupportedMediaTypeException(
					`Unsupported file type "${file.mimetype}". Upload a DOCX, PDF, or HTML file.`
				),
				false
			)
			return
		}
		callback(null, true)
	},
}

type RequestWithId = Request & { id?: string | number }

/**
 * Knowledge base (KB-1, Flow E). Authoring requires `knowledge.articles.manage`;
 * the review queue and decisions require `knowledge.articles.approve`. The
 * RbacGuard answers 403 and audits the denial for a caller without the key.
 */
@Controller()
export class KnowledgeController {
	constructor(
		private readonly knowledgeService: KnowledgeService,
		private readonly ragGatewayService: RagGatewayService,
		private readonly rbacService: RbacService
	) {}

	private async actor(session: UserSession, request: RequestWithId): Promise<KnowledgeActor> {
		const access = await this.rbacService.getUserAccess(session.user.id)
		return {
			userId: session.user.id,
			permissions: access.permissions,
			requestId: String(request.id ?? crypto.randomUUID()),
		}
	}

	// ── Authoring ────────────────────────────────────────────────────────────

	@RequirePermissions("knowledge.articles.manage")
	@Implement(v1.knowledge.articles.list)
	async listArticles() {
		return implement(v1.knowledge.articles.list).handler(async () => this.knowledgeService.list())
	}

	@RequirePermissions("knowledge.articles.manage")
	@Implement(v1.knowledge.articles.get)
	async getArticle() {
		return implement(v1.knowledge.articles.get).handler(async ({ input }) =>
			this.knowledgeService.get(input.id)
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.manage")
	@Implement(v1.knowledge.articles.create)
	async createArticle(@Session() session: UserSession, @Req() request: RequestWithId) {
		return implement(v1.knowledge.articles.create).handler(async ({ input }) =>
			this.knowledgeService.create(input, await this.actor(session, request))
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.manage")
	@Implement(v1.knowledge.articles.update)
	async updateArticle(@Session() session: UserSession, @Req() request: RequestWithId) {
		return implement(v1.knowledge.articles.update).handler(async ({ input }) =>
			this.knowledgeService.update(input, await this.actor(session, request))
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.manage")
	@Implement(v1.knowledge.articles.saveDraft)
	async saveDraft(@Session() session: UserSession, @Req() request: RequestWithId) {
		return implement(v1.knowledge.articles.saveDraft).handler(async ({ input }) =>
			this.knowledgeService.saveDraft(input, await this.actor(session, request))
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.manage")
	@Implement(v1.knowledge.articles.deactivate)
	async deactivateArticle(@Session() session: UserSession, @Req() request: RequestWithId) {
		return implement(v1.knowledge.articles.deactivate).handler(async ({ input }) =>
			this.knowledgeService.deactivate(input.id, await this.actor(session, request))
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.manage")
	@Implement(v1.knowledge.versions.submit)
	async submitVersion(@Session() session: UserSession, @Req() request: RequestWithId) {
		return implement(v1.knowledge.versions.submit).handler(async ({ input }) =>
			this.knowledgeService.submit(input.id, await this.actor(session, request))
		)
	}

	/**
	 * Starting text for a draft from a DOCX/PDF/HTML file. Plain Nest + Multer
	 * route (oRPC is JSON-only). The file is normalized by the template loaders
	 * in the RAG service and NOT ingested: only approval indexes content.
	 */
	@Post("v1/knowledge/extract")
	@StrictThrottle()
	@RequirePermissions("knowledge.articles.manage")
	@UseInterceptors(FileInterceptor("file", knowledgeUploadOptions))
	async extract(
		@UploadedFile() file: Express.Multer.File | undefined,
		@Session() session: UserSession,
		@Req() request: RequestWithId
	) {
		if (!file) {
			throw new BadRequestException(
				'A file is required: send multipart/form-data with a single "file" field.'
			)
		}
		const actor = await this.actor(session, request)
		const result = await this.ragGatewayService.extractText({
			buffer: file.buffer,
			filename: file.originalname,
			contentType: file.mimetype,
			userId: actor.userId,
			permissions: actor.permissions,
			requestId: actor.requestId,
			traceId: actor.requestId,
		})
		const parsed = KnowledgeExtractResponseSchema.safeParse(result)
		if (!parsed.success) {
			throw new BadGatewayException("The text extraction service returned an unexpected response")
		}
		return parsed.data
	}

	// ── Review ───────────────────────────────────────────────────────────────

	@RequirePermissions("knowledge.articles.approve")
	@Implement(v1.knowledge.review.queue)
	async reviewQueue() {
		return implement(v1.knowledge.review.queue).handler(async () =>
			this.knowledgeService.reviewQueue()
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.approve")
	@Implement(v1.knowledge.versions.approve)
	async approveVersion(@Session() session: UserSession, @Req() request: RequestWithId) {
		return implement(v1.knowledge.versions.approve).handler(async ({ input }) =>
			this.knowledgeService.approve(input.id, await this.actor(session, request))
		)
	}

	@StrictThrottle()
	@RequirePermissions("knowledge.articles.approve")
	@Implement(v1.knowledge.versions.return)
	async returnVersion(@Session() session: UserSession, @Req() request: RequestWithId) {
		return implement(v1.knowledge.versions.return).handler(async ({ input }) =>
			this.knowledgeService.returnVersion(input.id, input.note, await this.actor(session, request))
		)
	}
}

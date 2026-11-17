import { z } from "zod"

/**
 * Knowledge base (KB-1, DOMAIN-MODEL `knowledge_articles` /
 * `knowledge_article_versions`, state machine §5.2, Flow E).
 */

const DateSchema = z
	.union([z.date(), z.string()])
	.transform(val => (typeof val === "string" ? new Date(val) : val))

/** Languages the assistant serves (PRD non-functional requirements). */
export const KNOWLEDGE_LANGUAGES = ["en", "fil", "ceb", "ilo"] as const
export const KnowledgeLanguageSchema = z.enum(KNOWLEDGE_LANGUAGES)

/**
 * Default Inquiry Category codes (DOMAIN-MODEL glossary). The list becomes
 * admin-editable with `inquiry_categories` (CNV-2), so the API accepts any
 * well-formed code and the UI offers these as choices.
 */
export const DEFAULT_INQUIRY_CATEGORIES = [
	"tracking",
	"rates",
	"postal-id",
	"service-info",
	"scam",
	"complaint",
	"other",
] as const
export const CategoryCodeSchema = z
	.string()
	.trim()
	.regex(/^[a-z][a-z0-9-]{1,39}$/, "Use a lowercase category code such as postal-id")

export const KnowledgeArticleStatusSchema = z.enum(["active", "deactivated"])
export const KnowledgeVersionStatusSchema = z.enum([
	"draft",
	"in_review",
	"returned",
	"approved",
	"superseded",
	"deactivated",
])

const TitleSchema = z.string().trim().min(1, "Title is required").max(200, "Title too long")
const BodySchema = z
	.string()
	.trim()
	.min(1, "Article text is required")
	.max(50_000, "Article text is too long")

export const KnowledgeVersionSchema = z.object({
	id: z.string().uuid(),
	articleId: z.string().uuid(),
	version: z.number().int().positive(),
	body: z.string(),
	language: KnowledgeLanguageSchema,
	status: KnowledgeVersionStatusSchema,
	submittedBy: z.string().nullable(),
	approvedBy: z.string().nullable(),
	approvedAt: DateSchema.nullable(),
	documentId: z.string().uuid().nullable(),
	reviewNote: z.string().nullable(),
	/** True while the ingestion job started on approval is still running. */
	indexing: z.boolean(),
	indexError: z.string().nullable(),
	createdAt: DateSchema,
	updatedAt: DateSchema,
})

const VersionRefSchema = z.object({
	id: z.string().uuid(),
	version: z.number().int().positive(),
	status: KnowledgeVersionStatusSchema,
})

export const KnowledgeArticleSummarySchema = z.object({
	id: z.string().uuid(),
	title: z.string(),
	category: z.string(),
	languages: z.array(KnowledgeLanguageSchema),
	status: KnowledgeArticleStatusSchema,
	/** The serving approved version, if any. */
	currentVersion: VersionRefSchema.nullable(),
	/** The newest version (may be a draft or in review). */
	latestVersion: VersionRefSchema.nullable(),
	updatedAt: DateSchema,
})

export const KnowledgeArticleDetailSchema = KnowledgeArticleSummarySchema.extend({
	createdAt: DateSchema,
	/** Version history, newest first. */
	versions: z.array(KnowledgeVersionSchema),
})

/** One version waiting for a decision, with what an approver needs to judge it. */
export const KnowledgeReviewItemSchema = z.object({
	version: KnowledgeVersionSchema,
	article: z.object({
		id: z.string().uuid(),
		title: z.string(),
		category: z.string(),
		languages: z.array(KnowledgeLanguageSchema),
		status: KnowledgeArticleStatusSchema,
	}),
	/** The version currently serving, for comparison. Null for a new article. */
	currentApproved: KnowledgeVersionSchema.nullable(),
})

export const KnowledgeIdSchema = z.object({ id: z.string().uuid() })

export const CreateKnowledgeArticleRequestSchema = z.object({
	title: TitleSchema,
	category: CategoryCodeSchema,
	languages: z.array(KnowledgeLanguageSchema).min(1, "Choose at least one language"),
	body: BodySchema,
	language: KnowledgeLanguageSchema,
})

export const UpdateKnowledgeArticleRequestSchema = KnowledgeIdSchema.extend({
	title: TitleSchema.optional(),
	category: CategoryCodeSchema.optional(),
	languages: z.array(KnowledgeLanguageSchema).min(1).optional(),
})

export const SaveKnowledgeDraftRequestSchema = KnowledgeIdSchema.extend({
	body: BodySchema,
	language: KnowledgeLanguageSchema,
})

export const ReturnKnowledgeVersionRequestSchema = KnowledgeIdSchema.extend({
	note: z.string().trim().min(1, "Say what needs to change").max(2000),
})

export const KnowledgeTransitionResponseSchema = z.object({
	versionId: z.string().uuid(),
	status: KnowledgeVersionStatusSchema,
	indexing: z.boolean(),
	indexError: z.string().nullable(),
})

export const DeactivateKnowledgeArticleResponseSchema = z.object({
	id: z.string().uuid(),
	status: z.literal("deactivated"),
	cacheCleared: z.boolean(),
})

/** Text extracted from an uploaded DOCX/PDF/HTML file, used as a draft's starting text. */
export const KnowledgeExtractResponseSchema = z.object({
	filename: z.string(),
	docType: z.string(),
	text: z.string(),
})

export type KnowledgeLanguage = z.infer<typeof KnowledgeLanguageSchema>
export type KnowledgeArticleStatus = z.infer<typeof KnowledgeArticleStatusSchema>
export type KnowledgeVersionStatus = z.infer<typeof KnowledgeVersionStatusSchema>
export type KnowledgeVersion = z.infer<typeof KnowledgeVersionSchema>
export type KnowledgeArticleSummary = z.infer<typeof KnowledgeArticleSummarySchema>
export type KnowledgeArticleDetail = z.infer<typeof KnowledgeArticleDetailSchema>
export type KnowledgeReviewItem = z.infer<typeof KnowledgeReviewItemSchema>
export type CreateKnowledgeArticleRequest = z.infer<typeof CreateKnowledgeArticleRequestSchema>
export type UpdateKnowledgeArticleRequest = z.infer<typeof UpdateKnowledgeArticleRequestSchema>
export type SaveKnowledgeDraftRequest = z.infer<typeof SaveKnowledgeDraftRequestSchema>
export type ReturnKnowledgeVersionRequest = z.infer<typeof ReturnKnowledgeVersionRequestSchema>
export type KnowledgeTransitionResponse = z.infer<typeof KnowledgeTransitionResponseSchema>
export type DeactivateKnowledgeArticleResponse = z.infer<
	typeof DeactivateKnowledgeArticleResponseSchema
>
export type KnowledgeExtractResponse = z.infer<typeof KnowledgeExtractResponseSchema>

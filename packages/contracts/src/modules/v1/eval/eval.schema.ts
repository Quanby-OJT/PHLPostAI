import { z } from "zod"

/**
 * Golden evaluation set (EV-1, §5.7). Expected chunks bind by chunk CONTENT
 * HASH (stable across re-indexing); a re-chunking that orphans a hash flags
 * the item STALE rather than silently passing/failing downstream metrics.
 */

const isoDate = z
	.union([z.date(), z.string()])
	.transform(val => (typeof val === "string" ? new Date(val) : val))

export const GoldenItemStatusSchema = z.enum(["active", "retired"])
export const EvalLanguageSchema = z.enum(["en", "fil", "ceb", "ilo"])
export const EvalUseCaseSchema = z.enum(["tracking", "rates", "postal-id", "service-info"])
export const EvalBehaviorSchema = z.enum(["answer", "uncertain", "escalate"])
export const GoldenAnswerQualitySchema = z.object({
	language: EvalLanguageSchema,
	useCase: EvalUseCaseSchema,
	codeSwitched: z.boolean(),
	expectedBehavior: EvalBehaviorSchema,
	expectedTool: z
		.object({
			outcome: z.string().trim().min(1),
			facts: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
		})
		.optional(),
})
export type GoldenAnswerQuality = z.infer<typeof GoldenAnswerQualitySchema>

export const GoldenItemSchema = z.object({
	id: z.string().uuid(),
	question: z.string(),
	idealAnswer: z.string(),
	/** chunks.content_hash values expected in retrieval results. */
	expectedChunkHashes: z.array(z.string()),
	tags: z.array(z.string()),
	status: GoldenItemStatusSchema,
	answerQuality: GoldenAnswerQualitySchema.nullable().optional(),
	approvalReference: z.string().nullable().optional(),
	externalApprover: z.string().nullable().optional(),
	approvedAt: isoDate.nullable().optional(),
	/** Hashes no longer present in `chunks` (orphaned by re-chunking). */
	staleHashes: z.array(z.string()),
	createdBy: z.string(),
	createdAt: isoDate,
	updatedAt: isoDate,
})

const GoldenItemFieldsSchema = z.object({
	question: z.string().trim().min(1),
	idealAnswer: z.string().trim().min(1),
	expectedChunkHashes: z.array(z.string().min(1)),
	tags: z.array(z.string().trim().min(1)).default([]),
	answerQuality: GoldenAnswerQualitySchema.optional(),
})

function hasExpectedEvidence(item: z.infer<typeof GoldenItemFieldsSchema>) {
	return (
		item.expectedChunkHashes.length > 0 ||
		Boolean(item.answerQuality?.expectedTool) ||
		Boolean(item.answerQuality && item.answerQuality.expectedBehavior !== "answer")
	)
}

export const CreateGoldenItemRequestSchema = GoldenItemFieldsSchema.refine(hasExpectedEvidence, {
	path: ["expectedChunkHashes"],
	message: "Add an expected source or tool result for a grounded answer",
})

export const UpdateGoldenItemRequestSchema = z.object({
	id: z.string().uuid(),
	...GoldenItemFieldsSchema.partial().shape,
	tags: z.array(z.string().trim().min(1)).optional(),
	status: GoldenItemStatusSchema.optional(),
})

export const RecordGoldenApprovalRequestSchema = z.object({
	id: z.string().uuid(),
	externalApprover: z.string().trim().min(1).max(300),
	approvalReference: z.string().trim().min(1).max(500),
	revision: z.iso.datetime({ offset: true }),
})
export type RecordGoldenApprovalRequest = z.infer<typeof RecordGoldenApprovalRequestSchema>

/** Portable golden-set document (§XI portability). */
export const GoldenSetExportSchema = z.object({
	version: z.literal(1),
	items: z.array(
		GoldenItemFieldsSchema.extend({
			status: GoldenItemStatusSchema.default("active"),
		}).refine(hasExpectedEvidence, {
			path: ["expectedChunkHashes"],
			message: "Add expected evidence",
		})
	),
})

export const ImportGoldenSetResponseSchema = z.object({
	imported: z.number().int(),
})

/** Live-retrieval assist for picking expected chunks (EV-1 AC). */
export const GoldenChunkSearchRequestSchema = z.object({
	query: z.string().trim().min(1),
	k: z.number().int().min(1).max(50).default(10),
})

export const GoldenChunkCandidateSchema = z.object({
	contentHash: z.string(),
	documentId: z.string(),
	content: z.string(),
	score: z.number().nullable(),
})

export type GoldenItemStatus = z.infer<typeof GoldenItemStatusSchema>
export type GoldenItem = z.infer<typeof GoldenItemSchema>
export type CreateGoldenItemRequest = z.infer<typeof CreateGoldenItemRequestSchema>
export type UpdateGoldenItemRequest = z.infer<typeof UpdateGoldenItemRequestSchema>
export type GoldenSetExport = z.infer<typeof GoldenSetExportSchema>
export type GoldenChunkSearchRequest = z.infer<typeof GoldenChunkSearchRequestSchema>
export type GoldenChunkCandidate = z.infer<typeof GoldenChunkCandidateSchema>

// ---------------------------------------------------------------- EV-2: runs

export const EvalRunStatusSchema = z.enum(["running", "completed", "failed"])
export const EvalRunKindSchema = z.enum(["retrieval", "generation"])

/** Per-golden-item score entry; stale items appear with skipped=true. */
export const EvalRunItemSchema = z.object({
	goldenItemId: z.string(),
	question: z.string(),
	skipped: z.boolean(),
	staleHashes: z.array(z.string()).optional(),
	retrievedHashes: z.array(z.string()).optional(),
	hit: z.number().optional(),
	reciprocalRank: z.number().optional(),
	precisionAtK: z.number().optional(),
	recallAtK: z.number().optional(),
	// EV-3 generation metrics (null = unscorable, never silently perfect).
	answer: z.string().optional(),
	faithfulness: z.number().nullable().optional(),
	answerRelevancy: z.number().nullable().optional(),
	quality: z
		.object({
			expected: GoldenAnswerQualitySchema,
			idealAnswer: z.string(),
			approvalReference: z.string(),
			externalApprover: z.string().nullable(),
			approvedAt: z.string().nullable(),
			expectedHashes: z.array(z.string()),
			citedHashes: z.array(z.string()).optional(),
			actualBehavior: EvalBehaviorSchema.nullable(),
			actualRoute: z.string().nullable(),
			actualLanguage: EvalLanguageSchema.nullable(),
			toolResult: z.record(z.string(), z.unknown()).nullable(),
			providerOutputTokens: z.number().int().nonnegative().nullable(),
			visibleOutputTokens: z.number().int().nonnegative().nullable(),
			tokenLimitPassed: z.boolean().nullable().optional(),
			outcome: z.enum(["passed", "failed", "error"]).optional(),
			failureReasons: z.array(z.string()).optional(),
			tokenizer: z.string().nullable(),
			answerModel: z.string().optional(),
			judgeModel: z.string().optional(),
			grounded: z.boolean().nullable(),
			behaviorCorrect: z.boolean().nullable(),
			languageCorrect: z.boolean().nullable(),
			judgeReason: z.string().nullable(),
			traceId: z.string().optional(),
			error: z.string().nullable(),
		})
		.optional(),
})

export const EvalRunSchema = z.object({
	id: z.string().uuid(),
	kind: EvalRunKindSchema,
	status: EvalRunStatusSchema,
	gitSha: z.string(),
	/** Exact snapshot of what was evaluated (k, weights, toggles). */
	config: z.record(z.string(), z.unknown()),
	metrics: z.record(z.string(), z.number()).nullable(),
	perItem: z.array(EvalRunItemSchema).nullable(),
	error: z.string().nullable(),
	triggeredBy: z.string(),
	createdAt: isoDate,
	finishedAt: isoDate.nullable(),
})

export const EvalRunSummarySchema = EvalRunSchema.omit({ perItem: true })

export const ExecuteEvalRunRequestSchema = z.object({
	profile: z.enum(["evl1", "evl1-local"]).optional(),
	k: z.number().int().min(1).max(50).optional(),
	vectorWeight: z.number().min(0).optional(),
	keywordWeight: z.number().min(0).optional(),
	/** RT-3 A/B: omit = configured default; true requires a configured reranker. */
	rerank: z.boolean().optional(),
	/** EV-3: also generate answers and score faithfulness/answer relevancy. */
	generation: z.boolean().optional(),
})

/** Per-metric delta between two runs (candidate − base). */
export const EvalRunComparisonSchema = z.object({
	base: EvalRunSummarySchema,
	candidate: EvalRunSummarySchema,
	deltas: z.record(z.string(), z.number()),
})

export type EvalRunStatus = z.infer<typeof EvalRunStatusSchema>
export type EvalRunKind = z.infer<typeof EvalRunKindSchema>
export type EvalRunItem = z.infer<typeof EvalRunItemSchema>
export type EvalRun = z.infer<typeof EvalRunSchema>
export type EvalRunSummary = z.infer<typeof EvalRunSummarySchema>
export type ExecuteEvalRunRequest = z.infer<typeof ExecuteEvalRunRequestSchema>
export type EvalRunComparison = z.infer<typeof EvalRunComparisonSchema>

// ---------------------------------------------------------------- EV-4: gate

/** The currently approved baseline (Flow F): newest promotion wins. */
export const EvalBaselineSchema = z.object({
	id: z.string().uuid(),
	runId: z.string().uuid(),
	promotedBy: z.string(),
	note: z.string().nullable(),
	createdAt: isoDate,
	/** The baseline run's aggregate metrics (what the gate compares against). */
	metrics: z.record(z.string(), z.number()).nullable(),
	gitSha: z.string(),
})

export const PromoteBaselineRequestSchema = z.object({
	id: z.string().uuid(),
	note: z.string().trim().max(500).optional(),
})

export type EvalBaseline = z.infer<typeof EvalBaselineSchema>
export type PromoteBaselineRequest = z.infer<typeof PromoteBaselineRequestSchema>

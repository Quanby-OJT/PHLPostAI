/**
 * Central contract registry
 * Re-exports version routers
 */

// V1 contracts (routers)
export { v1Contract } from "./modules/v1/v1.contract.js"
export type { V1Contract } from "./modules/v1/v1.contract.js"

// RBAC catalog (shared constants, enums, types)
export * from "./modules/v1/rbac/rbac.catalog.js"

// RBAC administration contract + schemas
export { rbacContract } from "./modules/v1/rbac/rbac.contract.js"
export {
	RoleSchema,
	CreateRoleSchema,
	UpdateRoleRequestSchema,
	SetRolePermissionsRequestSchema,
	RoleIdSchema,
	DeleteRoleResponseSchema,
	PermissionSchema,
	UserWithRolesSchema,
	AssignRoleRequestSchema,
	RemoveRoleRequestSchema,
	UserRoleMutationResponseSchema,
} from "./modules/v1/rbac/rbac.schema.js"
export type {
	Role,
	CreateRoleInput,
	UpdateRoleRequest,
	SetRolePermissionsRequest,
	PermissionCatalogEntry,
	UserWithRoles,
	AssignRoleRequest,
	RemoveRoleRequest,
	CreateUserRequest,
	CreateUserResponse,
	SetUserDisabledRequest,
} from "./modules/v1/rbac/rbac.schema.js"

// Corpus (ingestion) contract + schemas
export { corpusContract } from "./modules/v1/corpus/corpus.contract.js"
export {
	DocumentSchema,
	DocumentStatusSchema,
	DocumentMetadataSchema,
	IngestionJobSchema,
	IngestionJobDetailSchema,
	IngestionJobStatsSchema,
	IngestionJobStatusSchema,
	JobDocumentSchema,
	InspectedChunkSchema,
	ChunkInspectionSchema,
	ReembedMigrationSchema,
	StartReembedRequestSchema,
} from "./modules/v1/corpus/corpus.schema.js"
export type {
	CorpusDocument,
	DocumentStatus,
	CorpusDocumentMetadata,
	IngestionJob,
	IngestionJobDetail,
	IngestionJobStats,
	IngestionJobStatus,
	JobDocument,
	InspectedChunk,
	ChunkInspection,
	ReembedMigration,
	StartReembedRequest,
} from "./modules/v1/corpus/corpus.schema.js"

export { chatContract } from "./modules/v1/chat/chat.contract.js"
export {
	ChatQueryInputSchema,
	ChatAnswerSchema,
	ChatCitationSchema,
	ChatTokenUsageSchema,
	ConversationSummarySchema,
	ConversationMessageSchema,
	ConversationDetailSchema,
} from "./modules/v1/chat/chat.schema.js"
export type {
	ChatQueryInput,
	ChatAnswer,
	ChatCitation,
	ChatTokenUsage,
	ConversationSummary,
	ConversationMessage,
	ConversationDetail,
} from "./modules/v1/chat/chat.schema.js"

export { RetrievalFiltersSchema } from "./modules/v1/chat/chat.schema.js"
export type { RetrievalFilters } from "./modules/v1/chat/chat.schema.js"

export { apiKeysContract } from "./modules/v1/apikeys/apikeys.contract.js"
export {
	ApiKeySchema,
	CreateApiKeyRequestSchema,
	CreateApiKeyResponseSchema,
} from "./modules/v1/apikeys/apikeys.schema.js"
export type {
	ApiKey,
	CreateApiKeyRequest,
	CreateApiKeyResponse,
} from "./modules/v1/apikeys/apikeys.schema.js"

export { evalContract } from "./modules/v1/eval/eval.contract.js"
export {
	GoldenItemSchema,
	GoldenItemStatusSchema,
	CreateGoldenItemRequestSchema,
	UpdateGoldenItemRequestSchema,
	GoldenSetExportSchema,
	GoldenChunkSearchRequestSchema,
	GoldenChunkCandidateSchema,
	EvalRunSchema,
	EvalRunSummarySchema,
	EvalRunItemSchema,
	EvalRunComparisonSchema,
	ExecuteEvalRunRequestSchema,
	EvalBaselineSchema,
	PromoteBaselineRequestSchema,
} from "./modules/v1/eval/eval.schema.js"
export type {
	GoldenItem,
	GoldenItemStatus,
	CreateGoldenItemRequest,
	UpdateGoldenItemRequest,
	GoldenSetExport,
	GoldenChunkSearchRequest,
	GoldenChunkCandidate,
	EvalRun,
	EvalRunSummary,
	EvalRunItem,
	EvalRunStatus,
	EvalRunKind,
	EvalRunComparison,
	ExecuteEvalRunRequest,
	EvalBaseline,
	PromoteBaselineRequest,
} from "./modules/v1/eval/eval.schema.js"

export {
	opsContract,
	ConfigEntrySchema,
	EffectiveConfigSchema,
} from "./modules/v1/ops/ops.contract.js"
export type { ConfigEntry, EffectiveConfig } from "./modules/v1/ops/ops.contract.js"

export {
	reportsContract,
	ReportDefinitionSchema,
	ReportResultSchema,
	ReportExportSchema,
	RunReportRequestSchema,
	ExportReportRequestSchema,
	ReportFormatSchema,
	ReportScheduleSchema,
	CreateReportScheduleSchema,
	UpdateReportScheduleSchema,
	ReportFileSummarySchema,
	ReportFileSchema,
} from "./modules/v1/reports/reports.contract.js"
export type {
	ReportDefinition,
	ReportFilterDef,
	ReportResult,
	ReportExport,
	RunReportRequest,
	ExportReportRequest,
	ReportFormat,
	ReportSchedule,
	CreateReportSchedule,
	UpdateReportSchedule,
	ReportFileSummary,
	ReportFile,
} from "./modules/v1/reports/reports.contract.js"

export { meContract } from "./modules/v1/me/me.contract.js"
export { MePermissionsSchema } from "./modules/v1/me/me.schema.js"
export type { MePermissions } from "./modules/v1/me/me.schema.js"

export { knowledgeContract } from "./modules/v1/knowledge/knowledge.contract.js"
export * from "./modules/v1/knowledge/knowledge.schema.js"

export { customerContract } from "./modules/v1/customer/customer.contract.js"
export { trackingContract } from "./modules/v1/tracking/tracking.contract.js"
export * from "./modules/v1/tracking/tracking.schema.js"
export { channelsContract } from "./modules/v1/channels/channels.contract.js"
export {
	ChannelSchema,
	ChannelConfigSchema,
	UpdateChannelSchema,
} from "./modules/v1/channels/channels.schema.js"
export type { Channel, UpdateChannel } from "./modules/v1/channels/channels.schema.js"
export { analyticsContract } from "./modules/v1/analytics/analytics.contract.js"
export {
	InteractionEventKindSchema,
	AnalyticsOverviewSchema,
	DeflectionMethodSchema,
	KpiBaselineSchema,
	KpiDefinitionSchema,
	KpiDefinitionListSchema,
	SaveKpiDefinitionRequestSchema,
	DeflectionReportRequestSchema,
	DeflectionReportSchema,
	DeflectionDrilldownRowSchema,
	DeflectionDrilldownSchema,
	DashboardTileSchema,
	AnalyticsDashboardFiltersSchema,
	AnalyticsDashboardSchema,
	DashboardLayoutSchema,
} from "./modules/v1/analytics/analytics.schema.js"
export type {
	InteractionEventKind,
	AnalyticsOverview,
	DeflectionMethod,
	KpiBaseline,
	KpiDefinition,
	KpiDefinitionList,
	SaveKpiDefinitionRequest,
	DeflectionReportRequest,
	DeflectionReport,
	DeflectionDrilldownRow,
	DeflectionDrilldown,
	DashboardTile,
	AnalyticsDashboardFilters,
	AnalyticsDashboard,
	DashboardLayout,
} from "./modules/v1/analytics/analytics.schema.js"
export {
	CUSTOMER_CHANNEL_CODES,
	CUSTOMER_LANGUAGES,
	CustomerChannelCodeSchema,
	CustomerLanguageSchema,
	CustomerAnswerKindSchema,
	StartCustomerSessionRequestSchema,
	EndCustomerConversationRequestSchema,
	EndCustomerConversationResponseSchema,
	CustomerSessionSchema,
	CustomerChatRequestSchema,
	SetCustomerLanguageRequestSchema,
	CustomerSessionLanguageSchema,
	CustomerAnswerSourceSchema,
	CustomerAnswerSchema,
	AgentModeResultSchema,
	CustomerChatResultSchema,
	CustomerChannelStatusSchema,
} from "./modules/v1/customer/customer.schema.js"
export type {
	CustomerChannelCode,
	CustomerLanguage,
	CustomerAnswerKind,
	StartCustomerSessionRequest,
	EndCustomerConversationRequest,
	EndCustomerConversationResponse,
	CustomerSession,
	CustomerChatRequest,
	SetCustomerLanguageRequest,
	CustomerSessionLanguage,
	CustomerAnswerSource,
	CustomerAnswer,
	CustomerChannelStatus,
} from "./modules/v1/customer/customer.schema.js"

export { assistantContract } from "./modules/v1/assistant/assistant.contract.js"
export {
	CreateOfficialContactSchema,
	CreateRiskIndicatorSchema,
	TestScamAssessmentRequestSchema,
	UpdateRiskIndicatorSchema,
	type CreateOfficialContact,
	type CreateRiskIndicator,
	type OfficialContact,
	type RiskIndicator,
	type TestScamAssessment,
	type UpdateRiskIndicator,
} from "./modules/v1/scam/scam.schema.js"
export {
	CreateInquiryCategoryRequestSchema,
	AssistantSettingsSchema,
	EscalationSettingsSchema,
	EscalationRulesSchema,
	EscalationBusinessHoursSchema,
	InquiryCategorySchema,
	UpdateEscalationSettingsRequestSchema,
	UpdateAssistantSettingsRequestSchema,
	UpdateInquiryCategoryRequestSchema,
} from "./modules/v1/assistant/assistant.schema.js"
export type {
	CreateInquiryCategoryRequest,
	AssistantSettings,
	EscalationSettings,
	EscalationBusinessHours,
	EscalationRules,
	UpdateEscalationSettingsRequest,
	InquiryCategory,
	UpdateAssistantSettingsRequest,
	UpdateInquiryCategoryRequest,
} from "./modules/v1/assistant/assistant.schema.js"

export { ratesContract } from "./modules/v1/rates/rates.contract.js"
export * from "./modules/v1/rates/rates.schema.js"

export {
	PHLPOST_GLOSSARY_SEED,
	UNTRANSLATED_POSTAL_TERMS,
} from "./modules/v1/customer/postal-glossary.seed.js"
export type { PostalGlossaryTerm } from "./modules/v1/customer/postal-glossary.seed.js"

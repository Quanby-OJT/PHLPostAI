import { Injectable, Logger } from "@nestjs/common"
import { ORPCError } from "@orpc/server"
import { and, desc, eq, sql } from "drizzle-orm"

import {
	DeflectionDrilldownSchema,
	type DeflectionDrilldown,
	type DeflectionReport,
	type DeflectionReportRequest,
	type KpiDefinition,
	type KpiDefinitionList,
	type SaveKpiDefinitionRequest,
} from "@repo/contracts"
import { kpiDefinitions } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { db } from "@/common/database/database.client"

const KPI_CODE = "deflection_rate"

interface Actor {
	userId: string
}

interface CountRow {
	numerator: number | string
	denominator: number | string
}

interface DrilldownRow {
	conversation_id: string
	started_at: Date | string
	category: string | null
	resolved_by_ai: boolean
}

@Injectable()
export class DeflectionKpiService {
	private readonly logger = new Logger(DeflectionKpiService.name)

	constructor(private readonly auditService: AuditService) {}

	async report(input: DeflectionReportRequest): Promise<DeflectionReport> {
		const definition = await this.findDefinition(input.version)
		if (!definition) {
			throw new ORPCError("NOT_FOUND", {
				message: "No approved deflection KPI definition exists yet",
			})
		}
		const result = await db.execute(sql`
			SELECT
				count(*) FILTER (WHERE is_denominator AND is_resolved_by_ai)::int AS numerator,
				count(*) FILTER (WHERE is_denominator)::int AS denominator
			FROM deflection_kpi_conversations
			WHERE definition_id = ${definition.id}::uuid
				AND started_at >= (${input.from}::date::timestamp AT TIME ZONE 'Asia/Manila')
				AND started_at < ((${input.to}::date + interval '1 day')::timestamp AT TIME ZONE 'Asia/Manila')
		`)
		const row = (result.rows as unknown as CountRow[])[0]
		const numerator = Number(row?.numerator ?? 0)
		const denominator = Number(row?.denominator ?? 0)
		const baselineRate =
			definition.baseline && definition.baseline.eligible > 0
				? definition.baseline.resolved / definition.baseline.eligible
				: null

		return {
			definition: this.toDefinition(definition),
			from: input.from,
			to: input.to,
			numerator,
			denominator,
			rate: denominator ? numerator / denominator : null,
			target: definition.target,
			baselineRate,
		}
	}

	async listDefinitions(): Promise<KpiDefinitionList> {
		const definitions = await db
			.select()
			.from(kpiDefinitions)
			.where(eq(kpiDefinitions.code, KPI_CODE))
			.orderBy(desc(kpiDefinitions.version))
		return { definitions: definitions.map(definition => this.toDefinition(definition)) }
	}

	async drilldown(input: DeflectionReportRequest): Promise<DeflectionDrilldown> {
		const definition = await this.findDefinition(input.version)
		if (!definition) {
			throw new ORPCError("NOT_FOUND", {
				message: "No approved deflection KPI definition exists yet",
			})
		}
		const result = await db.execute(sql`
			SELECT conversation_id, started_at, category, is_resolved_by_ai AS resolved_by_ai
			FROM deflection_kpi_conversations
			WHERE definition_id = ${definition.id}::uuid
				AND is_denominator
				AND started_at >= (${input.from}::date::timestamp AT TIME ZONE 'Asia/Manila')
				AND started_at < ((${input.to}::date + interval '1 day')::timestamp AT TIME ZONE 'Asia/Manila')
			ORDER BY started_at DESC, conversation_id
		`)
		const response: DeflectionDrilldown = {
			definitionVersion: definition.version,
			conversations: (result.rows as unknown as DrilldownRow[]).map(row => ({
				conversationId: String(row.conversation_id),
				startedAt: new Date(row.started_at).toISOString(),
				category: row.category ?? null,
				resolvedByAi: row.resolved_by_ai === true,
			})),
		}
		const validated = DeflectionDrilldownSchema.safeParse(response)
		if (!validated.success) {
			this.logger.error(
				`Deflection drilldown response failed validation: ${JSON.stringify(validated.error.issues)}`
			)
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Deflection drilldown response failed validation",
			})
		}
		return validated.data
	}

	async approveVersion(input: SaveKpiDefinitionRequest, actor: Actor): Promise<KpiDefinition> {
		const [previous] = await db
			.select()
			.from(kpiDefinitions)
			.where(eq(kpiDefinitions.code, KPI_CODE))
			.orderBy(desc(kpiDefinitions.version))
			.limit(1)
		const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date()
		if (previous && effectiveFrom <= previous.effectiveFrom) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A new KPI version must take effect after the previous version",
			})
		}
		const [definition] = await db
			.insert(kpiDefinitions)
			.values({
				code: KPI_CODE,
				version: (previous?.version ?? 0) + 1,
				method: input.method,
				baseline: input.baseline ?? previous?.baseline ?? null,
				target: input.target,
				approvedBy: actor.userId,
				effectiveFrom,
			})
			.returning()
		if (!definition)
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "KPI definition was not saved" })
		await this.auditService.writeAudit({
			actorId: actor.userId,
			actorType: "user",
			action: "analytics.kpi.definition.approve",
			resourceType: "kpi_definition",
			resourceId: definition.id,
			before: previous
				? {
						version: previous.version,
						method: previous.method,
						baseline: previous.baseline,
						target: previous.target,
					}
				: null,
			after: {
				version: definition.version,
				method: definition.method,
				baseline: definition.baseline,
				target: definition.target,
				effectiveFrom: definition.effectiveFrom,
			},
		})
		return this.toDefinition(definition)
	}

	private async findDefinition(version?: number) {
		const [definition] = version
			? await db
					.select()
					.from(kpiDefinitions)
					.where(and(eq(kpiDefinitions.code, KPI_CODE), eq(kpiDefinitions.version, version)))
					.limit(1)
			: await db
					.select()
					.from(kpiDefinitions)
					.where(eq(kpiDefinitions.code, KPI_CODE))
					.orderBy(desc(kpiDefinitions.version))
					.limit(1)
		return definition
	}

	private toDefinition(row: typeof kpiDefinitions.$inferSelect): KpiDefinition {
		return {
			id: row.id,
			code: row.code,
			version: row.version,
			method: row.method as KpiDefinition["method"],
			baseline: row.baseline,
			target: row.target,
			approvedBy: row.approvedBy,
			effectiveFrom: row.effectiveFrom.toISOString(),
		}
	}
}

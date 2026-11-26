import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { and, asc, eq } from "drizzle-orm"

import type { CreateScamReport, ScamReportChange, ScamReportReceipt } from "@repo/contracts"
import {
	conversations,
	escalations,
	scamAssessments,
	scamReports,
	scamSubmissions,
} from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { ConversationLiveService } from "@/common/conversation-live/conversation-live.service"
import { db, type DbTransaction } from "@/common/database/database.client"

import { EventService } from "../analytics/event.service"
import type { CustomerSessionRow } from "../customer/customer-session.service"
import { maskScamInput } from "../customer/scam-checks"
import { EscalationService } from "../escalations/escalation.service"

const PAGE_SIZE = 25
const HANDOFF_REASON = "I want to speak with a person"
const summary = {
	id: scamReports.id,
	status: scamReports.status,
	riskLevel: scamAssessments.riskLevel,
	createdAt: scamReports.createdAt,
}
const review = {
	id: scamReports.id,
	status: scamReports.status,
	reviewerId: scamReports.reviewerId,
	finding: scamReports.finding,
	notes: scamReports.notes,
}
type ReportReview = Pick<typeof scamReports.$inferSelect, keyof typeof review>

export function applyScamReportChange(
	current: ReportReview,
	change: ScamReportChange,
	actorId: string
): Omit<ReportReview, "id"> {
	if (change.action === "start_review" && current.status === "reported") {
		return { status: "under_review", reviewerId: actorId, finding: null, notes: null }
	}
	if (change.action === "record_finding" && current.status === "under_review") {
		return {
			status: change.finding,
			reviewerId: actorId,
			finding: change.finding,
			notes: maskScamInput(change.notes),
		}
	}
	if (change.action === "close" && current.status === current.finding) {
		return {
			status: "closed",
			reviewerId: current.reviewerId,
			finding: current.finding,
			notes: current.notes,
		}
	}
	throw new ConflictException("This action is unavailable in the report's current state")
}

@Injectable()
export class ScamReportsService {
	constructor(
		private readonly audit: AuditService,
		private readonly events: EventService,
		private readonly escalationsService: EscalationService,
		private readonly conversationLiveService: ConversationLiveService
	) {}

	async create(
		input: CreateScamReport,
		session: Pick<CustomerSessionRow, "id" | "language">
	): Promise<ScamReportReceipt> {
		const { receipt, notifyConversationId } = await db.transaction(async tx => {
			const [conversation] = await tx
				.select({
					id: conversations.id,
					channelCode: conversations.channelCode,
					status: conversations.status,
				})
				.from(conversations)
				.innerJoin(scamSubmissions, eq(scamSubmissions.conversationId, conversations.id))
				.innerJoin(scamAssessments, eq(scamAssessments.submissionId, scamSubmissions.id))
				.where(
					and(
						eq(scamSubmissions.id, input.submissionId),
						eq(conversations.customerSessionId, session.id)
					)
				)
				.for("update", { of: conversations })
			if (!conversation?.channelCode) throw new NotFoundException("Assessed submission not found")

			const [existing] = await tx
				.select({ id: scamReports.id })
				.from(scamReports)
				.where(eq(scamReports.submissionId, input.submissionId))
			let reference = existing?.id
			const actorId = `customer-session:${session.id}`
			if (!reference) {
				const [report] = await tx
					.insert(scamReports)
					.values({ submissionId: input.submissionId })
					.returning({ id: scamReports.id })
				if (!report) throw new Error("Could not create scam report")
				reference = report.id
				await this.events.record(
					{
						conversationId: conversation.id,
						category: "scam",
						kind: "scam_reported",
						language: session.language,
						channelCode: conversation.channelCode,
					},
					tx
				)
				await this.audit.writeAudit(
					{
						actorId,
						actorType: "system",
						action: "scam.report.created",
						resourceType: "scam_report",
						resourceId: reference,
						after: { status: "reported" },
					},
					tx
				)
			}

			// A delayed retry still returns the report after its conversation has closed.
			const canRequestHandoff =
				!existing ||
				conversation.status === "ai_active" ||
				conversation.status === "escalation_requested" ||
				conversation.status === "agent_active" ||
				conversation.status === "contact_captured"
			const handoff =
				input.requestAgent && canRequestHandoff
					? await this.requestHandoff(tx, conversation.id, session.id)
					: null
			return {
				receipt: { reference, handoff: handoff?.status ?? null },
				notifyConversationId: handoff?.notifyAfterCommit ? conversation.id : null,
			}
		})
		if (notifyConversationId) {
			await this.conversationLiveService.publish(notifyConversationId)
		}
		return receipt
	}

	private async requestHandoff(tx: DbTransaction, conversationId: string, sessionId: string) {
		const [existing] = await tx
			.select({ status: escalations.status })
			.from(escalations)
			.where(eq(escalations.conversationId, conversationId))
			.limit(1)
		if (
			existing?.status === "queued" ||
			existing?.status === "claimed" ||
			existing?.status === "contact_captured"
		) {
			return { status: existing.status, notifyAfterCommit: false }
		}
		const escalation = await this.escalationsService.request(
			{
				conversationId,
				customerSessionId: sessionId,
				reason: HANDOFF_REASON,
				category: "scam",
			},
			tx
		)
		return {
			status: escalation.status,
			notifyAfterCommit: escalation.status === "contact_captured",
		}
	}

	async list(page: number) {
		const rows = await db
			.select(summary)
			.from(scamReports)
			.innerJoin(scamAssessments, eq(scamAssessments.submissionId, scamReports.submissionId))
			.orderBy(asc(scamReports.createdAt), asc(scamReports.id))
			.limit(PAGE_SIZE + 1)
			.offset((page - 1) * PAGE_SIZE)
		return {
			reports: rows
				.slice(0, PAGE_SIZE)
				.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
			hasNextPage: rows.length > PAGE_SIZE,
		}
	}

	async detail(id: string) {
		const [row] = await db
			.select({
				...summary,
				...review,
				contentMasked: scamSubmissions.contentMasked,
				extractedUrls: scamSubmissions.extractedUrls,
				indicators: scamAssessments.indicators,
				confidence: scamAssessments.confidence,
				guidanceKey: scamAssessments.guidanceKey,
			})
			.from(scamReports)
			.innerJoin(scamSubmissions, eq(scamSubmissions.id, scamReports.submissionId))
			.innerJoin(scamAssessments, eq(scamAssessments.submissionId, scamReports.submissionId))
			.where(eq(scamReports.id, id))
		if (!row) throw new NotFoundException("Scam report not found")
		return {
			...row,
			createdAt: row.createdAt.toISOString(),
			contentMasked: maskScamInput(row.contentMasked),
		}
	}

	async change(input: ScamReportChange, actorId: string) {
		return db.transaction(async tx => {
			const [current] = await tx
				.select(review)
				.from(scamReports)
				.where(eq(scamReports.id, input.id))
				.for("update")
			if (!current) throw new NotFoundException("Scam report not found")
			const next = applyScamReportChange(current, input, actorId)
			const [updated] = await tx
				.update(scamReports)
				.set({ ...next, updatedAt: new Date() })
				.where(eq(scamReports.id, input.id))
				.returning(review)
			if (!updated) throw new Error("Could not update scam report")
			await this.audit.writeAudit(
				{
					actorId,
					actorType: "user",
					action: "scam.report.status_changed",
					resourceType: "scam_report",
					resourceId: input.id,
					before: {
						status: current.status,
						reviewerId: current.reviewerId,
						finding: current.finding,
					},
					after: {
						status: updated.status,
						reviewerId: updated.reviewerId,
						finding: updated.finding,
					},
				},
				tx
			)
			return updated
		})
	}
}

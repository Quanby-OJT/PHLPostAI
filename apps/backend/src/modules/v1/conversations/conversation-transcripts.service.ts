import { Injectable, NotFoundException } from "@nestjs/common"
import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm"

import type { TranscriptDetail, TranscriptPage, TranscriptSearch } from "@repo/contracts"
import { auditLog, conversations, messages, trackingLookups } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { db } from "@/common/database/database.client"
import { env } from "@/config/env.config"

import {
	isUuid,
	manilaDayEndExclusive,
	manilaDayStart,
	providerByMessageId,
	toTranscriptDetail,
	toTranscriptRow,
	type StoredToolResult,
	type StoredTranscriptMessage,
} from "./transcript-query"

/** Audit action written on every transcript open (DOMAIN-MODEL, ADM-3). */
export const TRANSCRIPT_VIEWED_ACTION = "conversations.transcript.viewed"

/**
 * Transcript review (ADM-3). READ-ONLY over `conversations` and `messages`
 * (cross-epic rule: only ConversationService writes them). The RAG chat audit
 * entries and tracking lookups are read for the provenance panel.
 *
 * Opening a transcript writes an Audit Entry first; if that write fails the
 * transcript is not returned, because a view that leaves no trace must not
 * succeed.
 */
@Injectable()
export class ConversationTranscriptsService {
	constructor(private readonly auditService: AuditService) {}

	async search(filters: TranscriptSearch): Promise<TranscriptPage> {
		const conditions: SQL[] = []
		if (filters.from) conditions.push(gte(conversations.createdAt, manilaDayStart(filters.from)))
		if (filters.to) {
			conditions.push(lt(conversations.createdAt, manilaDayEndExclusive(filters.to)))
		}
		if (filters.outcome) conditions.push(eq(conversations.status, filters.outcome))
		if (filters.category) {
			conditions.push(
				sql`exists (select 1 from ${messages} m where m.conversation_id = ${conversations.id} and m.inquiry_category = ${filters.category})`
			)
		}
		if (filters.language) {
			conditions.push(
				sql`exists (select 1 from ${messages} m where m.conversation_id = ${conversations.id} and m.language = ${filters.language})`
			)
		}
		if (filters.reference) {
			const reference = filters.reference
			const traceMatch = sql`exists (select 1 from ${messages} m where m.conversation_id = ${conversations.id} and m.trace_id = ${reference})`
			conditions.push(
				isUuid(reference)
					? (or(eq(conversations.id, reference), traceMatch) ?? traceMatch)
					: traceMatch
			)
		}
		const where = conditions.length > 0 ? and(...conditions) : undefined

		const [countRow] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(conversations)
			.where(where)
		const total = countRow?.total ?? 0

		const offset = (filters.page - 1) * filters.pageSize
		const pageRows = await db
			.select({
				id: conversations.id,
				createdAt: conversations.createdAt,
				status: conversations.status,
				channelCode: conversations.channelCode,
			})
			.from(conversations)
			.where(where)
			.orderBy(desc(conversations.createdAt), desc(conversations.id))
			.limit(filters.pageSize)
			.offset(offset)

		const ids = pageRows.map(row => row.id)
		const messageRows = ids.length
			? await db
					.select({
						conversationId: messages.conversationId,
						role: messages.role,
						turnIndex: messages.turnIndex,
						inquiryCategory: messages.inquiryCategory,
						language: messages.language,
						content: messages.content,
					})
					.from(messages)
					.where(inArray(messages.conversationId, ids))
					.orderBy(asc(messages.turnIndex))
			: []

		const byConversation = new Map<string, typeof messageRows>()
		for (const row of messageRows) {
			const list = byConversation.get(row.conversationId) ?? []
			list.push(row)
			byConversation.set(row.conversationId, list)
		}

		return {
			rows: pageRows.map(row =>
				toTranscriptRow({
					...row,
					messages: byConversation.get(row.id) ?? [],
				})
			),
			total,
			page: filters.page,
			pageSize: filters.pageSize,
		}
	}

	/** Full masked transcript with provenance; writes the view Audit Entry. */
	async get(conversationId: string, actorId: string): Promise<TranscriptDetail> {
		const [conversation] = await db
			.select({
				id: conversations.id,
				createdAt: conversations.createdAt,
				status: conversations.status,
				channelCode: conversations.channelCode,
			})
			.from(conversations)
			.where(eq(conversations.id, conversationId))
			.limit(1)
		if (!conversation) {
			throw new NotFoundException(`Conversation ${conversationId} not found`)
		}

		const rows = await db
			.select({
				id: messages.id,
				role: messages.role,
				sender: messages.sender,
				answerKind: messages.answerKind,
				turnIndex: messages.turnIndex,
				inquiryCategory: messages.inquiryCategory,
				language: messages.language,
				content: messages.content,
				citations: messages.citations,
				confidence: messages.confidence,
				retrievalScore: messages.retrievalScore,
				groundednessResult: messages.groundednessResult,
				modelUsed: messages.modelUsed,
				traceId: messages.traceId,
				createdAt: messages.createdAt,
			})
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(asc(messages.turnIndex))

		const assistantIds = rows.filter(row => row.role === "assistant").map(row => row.id)
		const lookups: StoredToolResult[] = assistantIds.length
			? await db
					.select({
						messageId: trackingLookups.messageId,
						connectorCode: trackingLookups.connectorCode,
						outcome: trackingLookups.outcome,
						statusCode: trackingLookups.statusCode,
						latencyMs: trackingLookups.latencyMs,
						createdAt: trackingLookups.createdAt,
					})
					.from(trackingLookups)
					.where(inArray(trackingLookups.messageId, assistantIds))
					.orderBy(asc(trackingLookups.createdAt))
			: []

		// The RAG service records the provider on its chat audit entry, keyed
		// by message id (the provider is not a `messages` column).
		const chatAudits = await db
			.select({ after: auditLog.after })
			.from(auditLog)
			.where(
				and(
					eq(auditLog.action, "chat.query.submit"),
					eq(auditLog.resourceType, "conversation"),
					eq(auditLog.resourceId, conversationId)
				)
			)

		// Audit first: no transcript leaves the API without its view recorded.
		await this.auditService.writeAudit({
			actorId,
			actorType: "user",
			action: TRANSCRIPT_VIEWED_ACTION,
			resourceType: "conversation",
			resourceId: conversationId,
			before: null,
			after: { messageCount: rows.length },
		})

		return toTranscriptDetail({
			id: conversation.id,
			createdAt: conversation.createdAt,
			status: conversation.status,
			channelCode: conversation.channelCode,
			messages: rows as StoredTranscriptMessage[],
			toolResults: lookups,
			providers: providerByMessageId(chatAudits),
			traceViewerUrl: env.TRACE_VIEWER_URL,
		})
	}
}

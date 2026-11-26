import { Injectable } from "@nestjs/common"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import type { CustomerAnswer } from "@repo/contracts"
import { officialContacts, riskIndicators, scamAssessments, scamSubmissions } from "@repo/db/schema"

import { db } from "@/common/database/database.client"
import { env } from "@/config/env.config"
import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"
import { maskTrackingNumber, scanForTrackingNumber } from "@/modules/v1/tracking/tracking-number"

import { ConversationService } from "./conversation.service"
import { type InquiryClassification } from "./customer-chat.service"
import { replyLanguageFor, withLanguageNotice } from "./customer-language"
import {
	hasPaymentRequest,
	inspectScamLinks,
	maskScamInput,
	resolveScamAssessment,
} from "./scam-checks"
import { formatScamAssessment, SCAM_INDICATORS, type ScamIndicator } from "./scam-copy"

const RagScamResultSchema = z.object({
	maskedQuery: z.string().max(12000),
	injection: z.boolean(),
	language: z.enum(["en", "fil", "ceb", "ilo", "unsupported"]).nullable(),
	assessment: z.unknown(),
})

const UNAVAILABLE_MASKED_QUERY = "[SUBMISSION REDACTED]"

@Injectable()
export class ScamAssessmentService {
	private readonly trackingPattern = new RegExp(env.TRACKING_NUMBER_PATTERN)

	constructor(
		private readonly conversationService: ConversationService,
		private readonly ragGateway: RagGatewayService
	) {}

	async answer(input: {
		conversationId: string
		query: string
		classification: InquiryClassification
		sessionLanguage: string
		principal: string
		permissions: readonly string[]
		correlationId: string
		requestStartedAt?: number
	}): Promise<CustomerAnswer> {
		const [contacts, indicators] = await Promise.all([
			db
				.select({ value: officialContacts.value })
				.from(officialContacts)
				.where(and(eq(officialContacts.kind, "domain"), eq(officialContacts.isActive, true))),
			db
				.select({ code: riskIndicators.code })
				.from(riskIndicators)
				.where(eq(riskIndicators.isActive, true)),
		])
		const active = new Set(indicators.map(row => row.code))
		const links = inspectScamLinks(
			input.query,
			contacts.map(row => row.value)
		)
		const deterministic: ScamIndicator[] = []
		if (hasPaymentRequest(links.textWithoutLinks)) deterministic.push("payment_request")
		if (links.unofficialDomain) deterministic.push("unofficial_domain")
		if (links.suspiciousLink) deterministic.push("suspicious_link")

		let query = links.textWithoutLinks
		for (
			let scan = scanForTrackingNumber(query, this.trackingPattern);
			scan.kind === "number";
			scan = scanForTrackingNumber(query, this.trackingPattern)
		) {
			query = maskTrackingNumber(query, scan)
		}
		const upstream = await this.ragGateway
			.assessScam({
				query: maskScamInput(query),
				approvedIndicators: SCAM_INDICATORS.filter(code => active.has(code)),
				deterministicIndicators: deterministic,
				userId: input.principal,
				permissions: input.permissions,
				requestId: input.correlationId,
			})
			.catch(() => null)
		const parsed = RagScamResultSchema.safeParse(upstream)
		const screened = parsed.success ? parsed.data : null
		if (screened?.injection) deterministic.push("prompt_injection")
		const assessment = resolveScamAssessment(deterministic, active, screened?.assessment)
		const isUncertain = assessment.riskLevel === "uncertain"
		const detected = input.classification.language ?? screened?.language ?? null
		const language = replyLanguageFor(detected, input.sessionLanguage)
		const reply = withLanguageNotice(
			formatScamAssessment(assessment.riskLevel, assessment.indicators, language),
			detected
		)
		const maskedQuery = screened?.maskedQuery || UNAVAILABLE_MASKED_QUERY
		const scamSubmissionId = crypto.randomUUID()
		const { assistantMessageId } = await this.conversationService.recordTurn({
			conversationId: input.conversationId,
			maskedQuery,
			inquiryCategory: "scam",
			language: detected ?? undefined,
			answer: reply,
			answerKind: isUncertain ? "uncertain" : "tool",
			confidence: assessment.confidence,
			traceId: input.correlationId,
			requestStartedAt: input.requestStartedAt,
			additionalEventKinds: ["scam_assessed"],
			onRecorded: async tx => {
				await tx.insert(scamSubmissions).values({
					id: scamSubmissionId,
					conversationId: input.conversationId,
					kind: links.kind,
					contentMasked: maskedQuery,
					extractedUrls: links.extractedUrls,
				})
				await tx.insert(scamAssessments).values({
					...assessment,
					submissionId: scamSubmissionId,
					guidanceKey: assessment.riskLevel,
				})
			},
		})
		return {
			answer: reply,
			conversationId: input.conversationId,
			messageId: assistantMessageId,
			sources: [],
			citations: [],
			answerKind: "tool",
			isIDontKnow: isUncertain,
			scamAssessment: assessment,
			scamSubmissionId,
		}
	}
}

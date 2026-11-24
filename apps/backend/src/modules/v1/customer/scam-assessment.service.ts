import { Injectable } from "@nestjs/common"
import { eq } from "drizzle-orm"
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
import { inspectScamContactFields } from "./scam-contacts"
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

	async evaluate(input: {
		query: string
		principal: string
		permissions: readonly string[]
		correlationId: string
		actorType: "user" | "customer"
	}) {
		const [contacts, indicators] = await Promise.all([
			db
				.select({ kind: officialContacts.kind, value: officialContacts.value })
				.from(officialContacts)
				.where(eq(officialContacts.isActive, true)),
			db
				.select({
					code: riskIndicators.code,
					name: riskIndicators.name,
					weight: riskIndicators.weight,
				})
				.from(riskIndicators)
				.where(eq(riskIndicators.isActive, true)),
		])
		const active = new Map(indicators.map(row => [row.code, row]))
		const links = inspectScamLinks(
			input.query,
			contacts.filter(row => row.kind === "domain").map(row => row.value)
		)
		const contactFields = inspectScamContactFields(input.query, contacts, links.textWithoutLinks)
		const deterministic: ScamIndicator[] = []
		if (hasPaymentRequest(links.textWithoutLinks)) deterministic.push("payment_request")
		if (links.unofficialDomain) deterministic.push("unofficial_domain")
		if (links.lookalikeDomain) deterministic.push("lookalike_domain")
		if (links.suspiciousLink) deterministic.push("suspicious_link")
		if (contactFields.unofficialSender) deterministic.push("unofficial_sender")
		if (contactFields.unofficialPaymentChannel) deterministic.push("unofficial_payment_channel")

		let query = contactFields.textWithoutContactValues
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
				approvedIndicators: indicators.map(row => row.code),
				customIndicators: indicators
					.filter(row => !(SCAM_INDICATORS as readonly string[]).includes(row.code))
					.map(({ code, name }) => ({ code, name })),
				deterministicIndicators: deterministic,
				userId: input.principal,
				permissions: input.permissions,
				requestId: input.correlationId,
				actorType: input.actorType,
			})
			.catch(() => null)
		const parsed = RagScamResultSchema.safeParse(upstream)
		const screened = parsed.success ? parsed.data : null
		if (screened?.injection) deterministic.push("prompt_injection")
		const assessment = resolveScamAssessment(
			deterministic,
			new Map(indicators.map(row => [row.code, row.weight])),
			screened?.assessment
		)
		return {
			assessment,
			findings: assessment.indicators.flatMap(code => {
				const indicator = active.get(code)
				return indicator ? [indicator] : []
			}),
			links,
			maskedQuery: screened?.maskedQuery || UNAVAILABLE_MASKED_QUERY,
			language: screened?.language ?? null,
		}
	}

	async answer(input: {
		conversationId: string
		query: string
		classification: InquiryClassification
		sessionLanguage: string
		principal: string
		permissions: readonly string[]
		correlationId: string
	}): Promise<CustomerAnswer> {
		const result = await this.evaluate({ ...input, actorType: "customer" })
		const { assessment, links, maskedQuery } = result
		const detected = input.classification.language ?? result.language
		const language = replyLanguageFor(detected, input.sessionLanguage)
		const reply = withLanguageNotice(
			formatScamAssessment(
				assessment.riskLevel,
				assessment.indicators,
				language,
				new Map(result.findings.map(row => [row.code, row.name]))
			),
			detected
		)
		const { assistantMessageId } = await this.conversationService.recordTurn({
			conversationId: input.conversationId,
			maskedQuery,
			inquiryCategory: "scam",
			language: detected ?? undefined,
			answer: reply,
			answerKind: "tool",
			confidence: assessment.confidence,
			traceId: input.correlationId,
			additionalEventKinds: ["scam_assessed"],
			onRecorded: async tx => {
				const [submission] = await tx
					.insert(scamSubmissions)
					.values({
						conversationId: input.conversationId,
						kind: links.kind,
						contentMasked: maskedQuery,
						extractedUrls: links.extractedUrls,
					})
					.returning({ id: scamSubmissions.id })
				if (!submission) throw new Error("Could not record scam submission")
				await tx.insert(scamAssessments).values({
					...assessment,
					submissionId: submission.id,
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
			isIDontKnow: assessment.riskLevel === "uncertain",
			scamAssessment: assessment,
		}
	}
}

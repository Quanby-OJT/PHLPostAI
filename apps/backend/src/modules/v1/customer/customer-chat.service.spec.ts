import type { AuditService } from "@/common/audit/audit.service"
import type { AssistantService } from "@/modules/v1/assistant/assistant.service"
import type { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"
import type { KnowledgeRepository } from "@/modules/v1/knowledge/knowledge.repository"
import type { TrackingRepository } from "@/modules/v1/tracking/tracking.repository"
import type { TrackingService } from "@/modules/v1/tracking/tracking.service"

import type { ConversationService } from "./conversation.service"
import {
	classifyInquiryCategory,
	CUSTOMER_REFUSAL_ANSWER,
	CustomerChatService,
} from "./customer-chat.service"

jest.mock("@/modules/v1/knowledge/knowledge.repository", () => ({
	KnowledgeRepository: class KnowledgeRepository {},
}))
jest.mock("@/common/audit/audit.service", () => ({ AuditService: class AuditService {} }))
jest.mock("./conversation.service", () => ({ ConversationService: class ConversationService {} }))
jest.mock("@/modules/v1/corpus/rag-gateway.service", () => ({
	RagGatewayService: class RagGatewayService {},
}))
jest.mock("@/modules/v1/tracking/tracking.service", () => ({
	TrackingService: class TrackingService {},
}))
jest.mock("@/modules/v1/tracking/tracking.repository", () => ({
	TrackingRepository: class TrackingRepository {},
}))
jest.mock("@/modules/v1/assistant/assistant.service", () => ({
	AssistantService: class AssistantService {},
}))

const SEEDED_CATEGORIES = [
	"tracking",
	"rates",
	"postal-id",
	"service-info",
	"scam",
	"complaint",
	"other",
].map(code => ({ code, name: code }))

const EXPRESS_ARTICLE = {
	articleId: "11111111-1111-4111-8111-111111111111",
	title: "Express Mail rates",
}
const POSTAL_ID_ARTICLE = {
	articleId: "22222222-2222-4222-8222-222222222222",
	title: "Postal ID requirements",
}

describe("CustomerChatService (CNV-1)", () => {
	let service: CustomerChatService
	let conversationService: { recordTurn: jest.Mock }
	let knowledgeRepository: { resolveArticleSources: jest.Mock }
	let auditService: { writeAudit: jest.Mock }
	let ragGatewayService: { classifyInquiry: jest.Mock }
	let trackingService: { isTrackingQuestion: jest.Mock; answer: jest.Mock }
	let trackingRepository: { insertLookup: jest.Mock }
	let assistantService: { listActiveCategories: jest.Mock }

	beforeEach(() => {
		conversationService = {
			recordTurn: jest.fn().mockResolvedValue({
				customerMessageId: "message-1",
				assistantMessageId: "message-2",
			}),
		}
		knowledgeRepository = { resolveArticleSources: jest.fn().mockResolvedValue(new Map()) }
		auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		ragGatewayService = {
			classifyInquiry: jest.fn().mockResolvedValue({
				screenedQuery: "where is RR123456789PH",
				category: "tracking",
				language: "en",
				fallbackUsed: false,
			}),
		}
		trackingService = { isTrackingQuestion: jest.fn().mockReturnValue(false), answer: jest.fn() }
		trackingRepository = { insertLookup: jest.fn().mockResolvedValue(undefined) }
		assistantService = { listActiveCategories: jest.fn().mockResolvedValue(SEEDED_CATEGORIES) }
		service = new CustomerChatService(
			conversationService as unknown as ConversationService,
			knowledgeRepository as unknown as KnowledgeRepository,
			auditService as unknown as AuditService,
			ragGatewayService as unknown as RagGatewayService,
			trackingService as unknown as TrackingService,
			trackingRepository as unknown as TrackingRepository,
			assistantService as unknown as AssistantService
		)
	})

	describe("AC1: the answer names the articles it used", () => {
		it("resolves cited documents to approved article titles", async () => {
			knowledgeRepository.resolveArticleSources.mockResolvedValue(
				new Map([["document-1", EXPRESS_ARTICLE]])
			)

			const sources = await service.resolveSources([
				{ chunkId: "chunk-1", documentId: "document-1" },
			])

			expect(sources).toEqual([EXPRESS_ARTICLE])
		})

		it("names each article once even when several chunks cite it", async () => {
			knowledgeRepository.resolveArticleSources.mockResolvedValue(
				new Map([
					["document-1", EXPRESS_ARTICLE],
					["document-2", EXPRESS_ARTICLE],
				])
			)

			const sources = await service.resolveSources([
				{ documentId: "document-1" },
				{ documentId: "document-2" },
			])

			expect(sources).toEqual([EXPRESS_ARTICLE])
		})

		it("keeps first-cited order across articles", async () => {
			knowledgeRepository.resolveArticleSources.mockResolvedValue(
				new Map([
					["document-1", POSTAL_ID_ARTICLE],
					["document-2", EXPRESS_ARTICLE],
				])
			)

			const sources = await service.resolveSources([
				{ documentId: "document-2" },
				{ documentId: "document-1" },
			])

			expect(sources).toEqual([EXPRESS_ARTICLE, POSTAL_ID_ARTICLE])
		})

		it("asks only about the documents that were cited, deduplicated", async () => {
			await service.resolveSources([
				{ documentId: "document-1" },
				{ documentId: "document-1" },
				{ documentId: "document-2" },
			])

			expect(knowledgeRepository.resolveArticleSources).toHaveBeenCalledWith([
				"document-1",
				"document-2",
			])
		})

		it("names nothing when a citation's document is not an approved article", async () => {
			knowledgeRepository.resolveArticleSources.mockResolvedValue(new Map())

			expect(await service.resolveSources([{ documentId: "document-1" }])).toEqual([])
		})

		it("survives a malformed citation list", async () => {
			expect(await service.resolveSources(undefined)).toEqual([])
			expect(await service.resolveSources("not-an-array")).toEqual([])
			expect(await service.resolveSources([null, 42, { documentId: 7 }])).toEqual([])
		})
	})

	describe("AC2: an uncovered question is answered, not invented", () => {
		it("marks the grounded I-don't-know as uncertain", () => {
			expect(service.answerKindFor({ isIDontKnow: true })).toBe("uncertain")
		})

		it("marks a grounded answer as answer", () => {
			expect(service.answerKindFor({ isIDontKnow: false })).toBe("answer")
		})

		it("carries the I-don't-know flag through to the customer", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "I don't know.",
					isIDontKnow: true,
					citations: [],
					screenedQuery: "who won the election",
				},
			})

			expect(turn).toMatchObject({
				answer: "I don't know.",
				answerKind: "uncertain",
				isIDontKnow: true,
				sources: [],
			})
		})
	})

	describe("AC3: only the masked question is stored", () => {
		it("stores the screened query the RAG service returned", async () => {
			await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "Here you go.",
					screenedQuery: "where is my parcel [PHONE]",
					citations: [],
					confidence: 0.83,
				},
			})

			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					maskedQuery: "where is my parcel [PHONE]",
					inquiryCategory: "tracking",
					confidence: 0.83,
				})
			)
		})

		it("stores no question at all rather than an unscreened one", async () => {
			await service.completeTurn({
				conversationId: "conversation-1",
				// No screenedQuery: the two services are out of step.
				envelope: { answer: "Here you go.", citations: [] },
			})

			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ maskedQuery: "" })
			)
		})
	})

	describe("AC4: a screened-out question is refused and recorded", () => {
		it("answers with the fixed refusal and stores it as a refusal", async () => {
			const turn = await service.recordRefusal({
				conversationId: "conversation-1",
				customerSessionId: "session-1",
				channelCode: "web",
				reason: "override-instructions",
				traceId: "trace-1",
			})

			expect(turn.answer).toBe(CUSTOMER_REFUSAL_ANSWER)
			expect(turn.answerKind).toBe("refusal")
			expect(turn.sources).toEqual([])
			expect(turn.citations).toEqual([])
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ answerKind: "refusal", answer: CUSTOMER_REFUSAL_ANSWER })
			)
		})

		it("records the attempt against the session and conversation", async () => {
			await service.recordRefusal({
				conversationId: "conversation-1",
				customerSessionId: "session-1",
				channelCode: "web",
				reason: "override-instructions",
				traceId: "trace-1",
			})

			expect(auditService.writeAudit).toHaveBeenCalledWith({
				actorId: "customer-session:session-1",
				actorType: "system",
				action: "chat.query.refused",
				resourceType: "conversation",
				resourceId: "conversation-1",
				before: null,
				after: {
					reason: "override-instructions",
					channelCode: "web",
					traceId: "trace-1",
				},
			})
		})

		it("does not repeat the refused question anywhere in the turn", async () => {
			const turn = await service.recordRefusal({
				conversationId: "conversation-1",
				customerSessionId: "session-1",
				channelCode: "web",
				reason: "override-instructions",
				traceId: "trace-1",
			})

			expect(turn.answer).not.toContain("override-instructions")
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ maskedQuery: "" })
			)
		})

		it("drops citations on a refusal even if some arrived", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: { citations: [{ documentId: "document-1" }], screenedQuery: "" },
				answerKind: "refusal",
				answerOverride: CUSTOMER_REFUSAL_ANSWER,
			})

			expect(turn.citations).toEqual([])
			expect(knowledgeRepository.resolveArticleSources).not.toHaveBeenCalled()
		})
	})

	describe("the stored turn is what the customer was shown", () => {
		it("returns the stored assistant message id", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: { answer: "a", screenedQuery: "q", citations: [] },
			})

			expect(turn.messageId).toBe("message-2")
		})

		it("passes the trace and model through to storage", async () => {
			await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "a",
					screenedQuery: "q",
					citations: [],
					traceId: "trace-9",
					model: "gpt-4o-mini",
					tokenUsage: { totalTokens: 7 },
				},
			})

			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					traceId: "trace-9",
					modelUsed: "gpt-4o-mini",
					tokenUsage: { totalTokens: 7 },
				})
			)
		})
	})

	describe("CNV-2: classify, then route by category", () => {
		const INPUT = {
			query: "where is RR123456789PH",
			principal: "customer-session:session-1",
			permissions: ["chat.query.submit"],
			correlationId: "req-1",
		}

		it("screens and classifies over the active categories in one RAG call", async () => {
			const result = await service.classify(INPUT)

			expect(ragGatewayService.classifyInquiry).toHaveBeenCalledWith(
				expect.objectContaining({
					query: INPUT.query,
					categories: SEEDED_CATEGORIES,
					actorType: "customer",
				})
			)
			expect(result).toEqual({
				screenedQuery: "where is RR123456789PH",
				category: "tracking",
				language: "en",
				route: "tracking",
			})
		})

		it.each([
			["rates", "retrieval"],
			["scam", "retrieval"],
			["postal-id", "retrieval"],
			["other", "retrieval"],
		])("routes %s to %s until its tool exists", async (category, route) => {
			ragGatewayService.classifyInquiry.mockResolvedValue({
				screenedQuery: "a question",
				category,
				language: "en",
				fallbackUsed: false,
			})

			await expect(service.classify(INPUT)).resolves.toEqual(
				expect.objectContaining({ category, route })
			)
		})

		it("labels a category that is no longer active as other", async () => {
			assistantService.listActiveCategories.mockResolvedValue(
				SEEDED_CATEGORIES.filter(category => category.code !== "rates")
			)
			ragGatewayService.classifyInquiry.mockResolvedValue({
				screenedQuery: "how much is postage",
				category: "rates",
				language: "en",
				fallbackUsed: false,
			})

			await expect(service.classify(INPUT)).resolves.toEqual(
				expect.objectContaining({ category: "other", route: "retrieval" })
			)
		})

		it("falls back on TRK-1's tracking check when the model is unavailable", async () => {
			ragGatewayService.classifyInquiry.mockResolvedValue({
				screenedQuery: "RR123456789PH",
				category: "other",
				language: null,
				fallbackUsed: true,
			})
			trackingService.isTrackingQuestion.mockReturnValue(true)

			await expect(service.classify(INPUT)).resolves.toEqual(
				expect.objectContaining({ category: "tracking", route: "tracking", language: null })
			)
			expect(trackingService.isTrackingQuestion).toHaveBeenCalledWith("RR123456789PH")
		})

		it("falls back on the keyword classifier for other questions", async () => {
			ragGatewayService.classifyInquiry.mockResolvedValue({
				screenedQuery: "How much is postage?",
				category: "other",
				language: null,
				fallbackUsed: true,
			})

			await expect(service.classify(INPUT)).resolves.toEqual(
				expect.objectContaining({ category: "rates", route: "retrieval" })
			)
		})

		it("lets a screening block through as the gateway's 400", async () => {
			ragGatewayService.classifyInquiry.mockRejectedValue(
				Object.assign(new Error("blocked"), { getStatus: () => 400 })
			)

			await expect(service.classify(INPUT)).rejects.toThrow("blocked")
		})

		it("stores the category and language with a retrieval turn", async () => {
			await service.completeTurn({
				conversationId: "conversation-1",
				envelope: { answer: "Bring a valid ID.", screenedQuery: "postal id requirements" },
				classification: { category: "postal-id", language: "ceb" },
			})

			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ inquiryCategory: "postal-id", language: "ceb" })
			)
		})
	})

	describe("TRK-1: a tracking turn", () => {
		const LOOKUP = {
			connectorCode: "mock",
			trackingNumberHash: "hash-of-number",
			outcome: "found" as const,
			statusCode: "IN_TRANSIT",
			latencyMs: 12,
		}
		const INPUT = {
			conversationId: "conversation-1",
			classification: {
				screenedQuery: "where is RR123456789PH",
				category: "tracking",
				language: "en",
				route: "tracking" as const,
			},
			correlationId: "req-1",
			explanationLanguage: "fil",
		}

		it("answers from the already screened question", async () => {
			trackingService.answer.mockResolvedValue({
				reply: "Status: In transit",
				storedQuery: "where is [TRACKING_NUMBER]",
				lookup: LOOKUP,
			})

			await service.answerTracking(INPUT)

			expect(trackingService.answer).toHaveBeenCalledWith("where is RR123456789PH", "fil")
			expect(ragGatewayService.classifyInquiry).not.toHaveBeenCalled()
		})

		it("stores a tool turn with its category, without the number, and the lookup row", async () => {
			trackingService.answer.mockResolvedValue({
				reply: "Status: In transit",
				storedQuery: "where is [TRACKING_NUMBER]",
				lookup: LOOKUP,
			})

			const turn = await service.answerTracking(INPUT)

			const recorded = conversationService.recordTurn.mock.calls[0][0]
			expect(recorded).toEqual(
				expect.objectContaining({
					conversationId: "conversation-1",
					maskedQuery: "where is [TRACKING_NUMBER]",
					inquiryCategory: "tracking",
					language: "en",
					answer: "Status: In transit",
					answerKind: "tool",
					category: "tracking",
					additionalEventKinds: ["tracking_lookup"],
				})
			)
			const tx = { insert: jest.fn() }
			await recorded.onRecorded(tx, {
				customerMessageId: "message-1",
				assistantMessageId: "message-2",
			})
			expect(trackingRepository.insertLookup).toHaveBeenCalledWith(tx, {
				...LOOKUP,
				messageId: "message-2",
			})
			expect(turn).toEqual({
				answer: "Status: In transit",
				messageId: "message-2",
				sources: [],
				citations: [],
				answerKind: "tool",
				isIDontKnow: false,
			})
		})

		it("writes no lookup row when no lookup was made", async () => {
			trackingService.answer.mockResolvedValue({
				reply: "Please send your tracking number.",
				storedQuery: "where is my parcel",
				lookup: null,
			})

			await service.answerTracking(INPUT)

			expect(conversationService.recordTurn.mock.calls[0][0].onRecorded).toBeUndefined()
		})
	})
})

describe("classifyInquiryCategory (ESC-1 queue metadata)", () => {
	it.each([
		["Where is my parcel?", "tracking"],
		["How much is postage?", "rates"],
		["How do I apply for a Postal ID?", "postal-id"],
		["Is this payment link a scam?", "scam"],
		["I want to file a complaint", "complaint"],
		["What time does the post office open?", "service-info"],
		["Please speak to a person", "other"],
	])("classifies %s as %s", (query, expected) => {
		expect(classifyInquiryCategory(query)).toBe(expected)
	})
})

import type { AuditService } from "@/common/audit/audit.service"
import type { AssistantService } from "@/modules/v1/assistant/assistant.service"
import type { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"
import type { KnowledgeRepository } from "@/modules/v1/knowledge/knowledge.repository"
import type { RateLookupService } from "@/modules/v1/rates/rate-lookup.service"
import type { TrackingRepository } from "@/modules/v1/tracking/tracking.repository"
import type { TrackingService } from "@/modules/v1/tracking/tracking.service"

import type { ConversationService } from "./conversation.service"
import {
	classifyInquiryCategory,
	CUSTOMER_REFUSAL_ANSWER,
	CustomerChatService,
} from "./customer-chat.service"
import { ragLanguageFields, SUPPORTED_LANGUAGES_NOTICE } from "./customer-language"

jest.mock("@repo/contracts", () => ({
	CUSTOMER_LANGUAGES: ["en", "fil", "ceb", "ilo"],
	UNTRANSLATED_POSTAL_TERMS: ["PHLPost", "Registered Mail"],
}))
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
jest.mock("@/modules/v1/rates/rate-lookup.service", () => ({
	RateLookupService: class RateLookupService {},
}))

const SEEDED_CATEGORIES = [
	"tracking",
	"rates",
	"postal-id",
	"service-info",
	"scam",
	"complaint",
	"other",
].map(code => ({
	code,
	name: code,
	isEligible: ["tracking", "rates", "postal-id", "service-info", "scam"].includes(code),
}))

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
	let conversationService: { recordTurn: jest.Mock; lastExchange: jest.Mock }
	let knowledgeRepository: { resolveArticleSources: jest.Mock }
	let auditService: { writeAudit: jest.Mock }
	let ragGatewayService: { classifyInquiry: jest.Mock }
	let trackingService: { isTrackingQuestion: jest.Mock; answer: jest.Mock }
	let trackingRepository: { insertLookup: jest.Mock }
	let assistantService: { listActiveCategories: jest.Mock }
	let rateLookupService: { answer: jest.Mock }

	beforeEach(() => {
		conversationService = {
			lastExchange: jest.fn().mockResolvedValue({ customer: null, assistant: null }),
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
		rateLookupService = {
			answer: jest.fn().mockResolvedValue({
				reply:
					"The published Express Mail rate to Visayas for an item of 2 kg is ₱320.00, effective December 1, 2026.",
				outcome: "quoted",
			}),
		}

		service = new CustomerChatService(
			conversationService as unknown as ConversationService,
			knowledgeRepository as unknown as KnowledgeRepository,
			auditService as unknown as AuditService,
			ragGatewayService as unknown as RagGatewayService,
			trackingService as unknown as TrackingService,
			trackingRepository as unknown as TrackingRepository,
			assistantService as unknown as AssistantService,
			rateLookupService as unknown as RateLookupService
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
		it("accepts official amounts and statuses only from cited source chunks", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "The fee is ₱320 and the parcel is in transit.",
					retrievedChunks: [{ id: "chunk-1", content: "Fee: ₱320. Parcel status: in transit." }],
					citations: [{ chunkId: "chunk-1", documentId: "document-1" }],
					confidence: 0.95,
					screenedQuery: "q",
				},
				classification: { category: "tracking", language: "en", replyLanguage: "en" },
			})

			expect(turn.answer).toContain("₱320")
			expect(turn.answerKind).toBe("answer")
		})

		it("withholds unsupported official claims and records answer_blocked", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "The package is delivered and the fee is ₱500.",
					retrievedChunks: [{ text: "The package status is in transit. The fee is ₱320." }],
					confidence: 0.95,
					screenedQuery: "q",
				},
				classification: { category: "service-info", language: "en", replyLanguage: "en" },
				blockedTopics: [],
			})

			expect(turn.answerKind).toBe("uncertain")
			expect(turn.answer).toContain("I'm not sure enough to answer")
			expect(turn.answer).not.toContain("delivered")
			expect(turn.answer).not.toContain("₱500")
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					answerKind: "uncertain",
					additionalEventKinds: ["answer_blocked"],
				})
			)
		})

		it("checks blocked topics in the draft even when confidence is below threshold", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "Customs clearance requires the customer to provide documents.",
					confidence: 0.42,
					screenedQuery: "What is customs clearance?",
				},
				classification: { category: "service-info", language: "en", replyLanguage: "en" },
				confidenceThreshold: 0.7,
				blockedTopics: ["customs clearance"],
			})

			expect(turn.answerKind).toBe("uncertain")
			expect(turn.answer).not.toContain("Customs clearance")
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ additionalEventKinds: ["answer_blocked"] })
			)
		})

		it("always blocks requests for payment or credentials even when cited", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "Please pay ₱320 now and share your password.",
					retrievedChunks: [{ text: "Please pay ₱320 now and share your password." }],
					confidence: 0.99,
					screenedQuery: "q",
				},
				classification: { category: "rates", language: "en", replyLanguage: "en" },
			})

			expect(turn.answerKind).toBe("uncertain")
			expect(turn.answer).not.toContain("password")
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ additionalEventKinds: ["answer_blocked"] })
			)
		})

		it("replaces a below-threshold draft with a localized uncertainty and handoff offer", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "The draft answer must not be shown.",
					isIDontKnow: false,
					confidence: 0.42,
					retrievalScore: 0.42,
					groundednessResult: { grounded: false, outcome: "idk" },
					outputTokens: 18,
					screenedQuery: "q",
				},
				classification: { category: "service-info", language: "fil", replyLanguage: "fil" },
				confidenceThreshold: 0.7,
			})

			expect(turn.answerKind).toBe("uncertain")
			expect(turn.isIDontKnow).toBe(true)
			expect(turn.answer).toContain("Hindi ako sapat na sigurado")
			expect(turn.answer).toContain("makipag-usap sa isang tao")
			expect(turn.answer).not.toContain("The draft answer must not be shown")
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					answerKind: "uncertain",
					confidence: 0.42,
					retrievalScore: 0.42,
					groundednessResult: { grounded: false, outcome: "idk" },
					outputTokens: 18,
				})
			)
		})

		it("names the articles it found when the uncertain answer cited none", async () => {
			knowledgeRepository.resolveArticleSources.mockResolvedValue(
				new Map([["document-1", EXPRESS_ARTICLE]])
			)

			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "I don't know.",
					isIDontKnow: true,
					confidence: 0,
					citations: [],
					retrievedChunks: [{ id: "chunk-1", documentId: "document-1", similarity: 0.4 }],
					screenedQuery: "q",
				},
				confidenceThreshold: 0.7,
			})

			expect(turn.answer).toContain(`I found information in: ${EXPRESS_ARTICLE.title}.`)
			expect(turn.sources).toEqual([])
		})

		it("sends an answer whose confidence equals the configured threshold normally", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "Grounded answer [1].",
					confidence: 0.7,
					citations: [],
					screenedQuery: "q",
				},
				confidenceThreshold: 0.7,
			})

			expect(turn.answer).toBe("Grounded answer [1].")
			expect(turn.answerKind).toBe("answer")
		})

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
					confidence: 0,
					citations: [],
					screenedQuery: "who won the election",
				},
			})

			expect(turn).toMatchObject({
				answer: expect.stringContaining("I'm not sure enough to answer"),
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
			sessionLanguage: "en",
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
				eligible: true,
				language: "en",
				replyLanguage: "en",
				route: "tracking",
			})
		})

		it.each([
			["rates", "rates"],
			["scam", "scam"],
			["postal-id", "retrieval"],
			["other", "retrieval"],
		])("routes %s to %s", async (category, route) => {
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
				expect.objectContaining({ category: "rates", route: "rates" })
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
				classification: { category: "postal-id", language: "ceb", replyLanguage: "ceb" },
			})

			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ inquiryCategory: "postal-id", language: "ceb" })
			)
		})
	})

	describe("KB-2: a rates turn", () => {
		const INPUT = {
			query: "2 kg",
			principal: "customer-session:session-1",
			permissions: ["chat.query.submit"],
			correlationId: "req-1",
			sessionLanguage: "en",
			conversationId: "conversation-1",
		}
		const ASKED = {
			customer: { content: "How much to send a parcel to Cebu?", inquiryCategory: "rates" },
			assistant: {
				content: "To quote a published rate, I need the weight of your item.",
				answerKind: "tool",
			},
		}

		beforeEach(() => {
			ragGatewayService.classifyInquiry.mockResolvedValue({
				screenedQuery: "2 kg",
				category: "other",
				language: "en",
				fallbackUsed: false,
			})
		})

		it("AC2: treats a reply to the assistant's rates question as completing it", async () => {
			conversationService.lastExchange.mockResolvedValue(ASKED)

			const result = await service.classify(INPUT)

			expect(conversationService.lastExchange).toHaveBeenCalledWith("conversation-1")
			expect(result).toEqual(
				expect.objectContaining({
					category: "rates",
					route: "rates",
					context: "How much to send a parcel to Cebu?",
				})
			)
		})

		it("leaves a new topic alone after a rates question", async () => {
			conversationService.lastExchange.mockResolvedValue(ASKED)
			ragGatewayService.classifyInquiry.mockResolvedValue({
				screenedQuery: "What time do you open?",
				category: "service-info",
				language: "en",
				fallbackUsed: false,
			})

			await expect(service.classify(INPUT)).resolves.toEqual(
				expect.objectContaining({ category: "service-info", route: "retrieval" })
			)
		})

		it("does not treat a reply as a follow-up when no detail was asked for", async () => {
			conversationService.lastExchange.mockResolvedValue({
				...ASKED,
				assistant: { content: "Bring a valid ID.", answerKind: "answer" },
			})

			await expect(service.classify(INPUT)).resolves.toEqual(
				expect.objectContaining({ category: "other", route: "retrieval" })
			)
		})

		it("asks the lookup tool with the earlier question and stores a tool turn", async () => {
			const turn = await service.answerRates({
				conversationId: "conversation-1",
				classification: {
					screenedQuery: "2 kg",
					category: "rates",
					language: "en",
					replyLanguage: "en",
					route: "rates",
					context: "How much to send a parcel to Cebu?",
				},
				principal: "customer-session:session-1",
				permissions: ["chat.query.submit"],
				correlationId: "req-1",
			})

			expect(rateLookupService.answer).toHaveBeenCalledWith(
				"How much to send a parcel to Cebu?\n2 kg",
				expect.objectContaining({ correlationId: "req-1" })
			)
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					maskedQuery: "2 kg",
					inquiryCategory: "rates",
					answerKind: "tool",
					category: "rates",
				})
			)
			expect(turn).toEqual(
				expect.objectContaining({ answerKind: "tool", sources: [], citations: [] })
			)
		})

		it("CNV-3: keeps 'no published rate' as a certain tool answer (KB-2 AC3)", async () => {
			rateLookupService.answer.mockResolvedValue({
				reply: "I don't have a published rate for that, so I can't quote a price.",
				outcome: "no_rate",
			})

			const turn = await service.answerRates({
				conversationId: "conversation-1",
				classification: {
					screenedQuery: "Express Mail to Visayas for 30 kg",
					category: "rates",
					language: "en",
					replyLanguage: "en",
					route: "rates",
				},
				principal: "customer-session:session-1",
				permissions: ["chat.query.submit"],
				correlationId: "req-1",
			})

			expect(turn).toMatchObject({
				answer: "I don't have a published rate for that, so I can't quote a price.",
				answerKind: "tool",
				isIDontKnow: false,
			})
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ answerKind: "tool", confidence: 1 })
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
				replyLanguage: "fil" as const,
				route: "tracking" as const,
			},
			correlationId: "req-1",
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

	describe("CNV-4: reply in the customer's language", () => {
		const INPUT = {
			query: "a question",
			principal: "customer-session:session-1",
			permissions: ["chat.query.submit"],
			correlationId: "req-1",
			sessionLanguage: "en",
		}

		function detected(language: string | null) {
			ragGatewayService.classifyInquiry.mockResolvedValue({
				screenedQuery: "a question",
				category: "service-info",
				language,
				fallbackUsed: language === null,
			})
		}

		it.each([
			["ceb", "en", "ceb"],
			["fil", "ilo", "fil"],
			["en", "fil", "fil"],
			[null, "ilo", "ilo"],
			["unsupported", "ceb", "en"],
		] as [string | null, string, string][])(
			"a %s message in a %s session is answered in %s",
			async (language, sessionLanguage, replyLanguage) => {
				detected(language)

				await expect(service.classify({ ...INPUT, sessionLanguage })).resolves.toEqual(
					expect.objectContaining({ language, replyLanguage })
				)
			}
		)

		it("sends the reply language, question language and glossary to the RAG service", () => {
			expect(ragLanguageFields({ language: "ceb", replyLanguage: "ceb" })).toEqual({
				language: "ceb",
				queryLanguage: "ceb",
				glossary: ["PHLPost", "Registered Mail"],
			})
			expect(ragLanguageFields({ language: null, replyLanguage: "fil" })).toEqual({
				language: "fil",
				glossary: ["PHLPost", "Registered Mail"],
			})
		})

		it("gives the grounded I-don't-know in the reply language", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: { answer: "I don't know.", isIDontKnow: true, confidence: 0, screenedQuery: "q" },
				classification: { category: "other", language: "fil", replyLanguage: "fil" },
			})

			expect(turn).toMatchObject({
				answer: expect.stringContaining("Hindi ako sapat na sigurado"),
				answerKind: "uncertain",
			})
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					answer: expect.stringContaining("Hindi ako sapat na sigurado"),
					language: "fil",
				})
			)
		})

		it("answers an unsupported language in English and names the supported ones", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "Express Mail is next-day [1].",
					confidence: 0.9,
					screenedQuery: "q",
					citations: [],
				},
				classification: { category: "service-info", language: "unsupported", replyLanguage: "en" },
			})

			expect(turn.answer).toBe(`Express Mail is next-day [1].\n\n${SUPPORTED_LANGUAGES_NOTICE}`)
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ language: "unsupported" })
			)
		})

		it("adds the notice to a tracking reply too", async () => {
			trackingService.answer.mockResolvedValue({
				reply: "Please send your tracking number.",
				storedQuery: "q",
				lookup: null,
			})

			const turn = await service.answerTracking({
				conversationId: "conversation-1",
				classification: {
					screenedQuery: "q",
					category: "tracking",
					language: "unsupported",
					replyLanguage: "en",
					route: "tracking",
				},
				correlationId: "req-1",
			})

			expect(trackingService.answer).toHaveBeenCalledWith("q", "en")
			expect(turn.answer).toContain(SUPPORTED_LANGUAGES_NOTICE)
		})

		it("leaves a supported-language answer untouched", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: { answer: "Oo, puwede [1].", confidence: 0.9, screenedQuery: "q", citations: [] },
				classification: { category: "service-info", language: "fil", replyLanguage: "fil" },
			})

			expect(turn.answer).toBe("Oo, puwede [1].")
		})
	})

	describe("CNV-6: Postal ID questions", () => {
		const INPUT = {
			query: "a Postal ID question",
			principal: "customer-session:session-1",
			permissions: ["chat.query.submit"],
			correlationId: "req-1",
			sessionLanguage: "en",
		}
		const ARTICLE_TEXT =
			"Bring one valid government-issued ID or your PSA birth certificate, plus proof of address."

		function classifiedAs(screenedQuery: string) {
			ragGatewayService.classifyInquiry.mockResolvedValue({
				screenedQuery,
				category: "postal-id",
				language: "en",
				fallbackUsed: false,
			})
		}

		it("routes a question about one application to the fixed no-records reply", async () => {
			classifiedAs("What is the status of my Postal ID application?")

			await expect(service.classify(INPUT)).resolves.toEqual(
				expect.objectContaining({ postalId: "status", route: "postal-id-status" })
			)
		})

		it("answers an eligibility question from the articles", async () => {
			classifiedAs("Am I eligible for a Postal ID?")

			await expect(service.classify(INPUT)).resolves.toEqual(
				expect.objectContaining({ postalId: "eligibility", route: "retrieval" })
			)
		})

		it("gives the requirements and says it can't decide the case (AC2)", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: `${ARTICLE_TEXT} [1]`,
					citations: [{ chunkId: "chunk-1", documentId: "document-1" }],
					retrievedChunks: [{ id: "chunk-1", content: ARTICLE_TEXT }],
					confidence: 0.9,
					screenedQuery: "Am I eligible for a Postal ID?",
				},
				classification: {
					category: "postal-id",
					language: "en",
					replyLanguage: "en",
					postalId: "eligibility",
				},
			})

			expect(turn.answer).toContain(ARTICLE_TEXT)
			expect(turn.answer).toContain("I can't decide individual cases")
			expect(turn.answer).toContain("capturing site")
		})

		it("withholds a draft that decides the customer's case", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: "Based on your documents, you are eligible and will be approved [1].",
					citations: [{ chunkId: "chunk-1", documentId: "document-1" }],
					retrievedChunks: [{ id: "chunk-1", content: ARTICLE_TEXT }],
					confidence: 0.9,
					screenedQuery: "Am I eligible for a Postal ID?",
				},
				classification: {
					category: "postal-id",
					language: "en",
					replyLanguage: "en",
					postalId: "eligibility",
				},
			})

			expect(turn.answer).not.toContain("you are eligible")
			expect(turn.answer).toContain("I can't decide individual cases")
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ additionalEventKinds: ["answer_blocked"] })
			)
		})

		it("reminds the customer not to share personal details (AC3)", async () => {
			const turn = await service.completeTurn({
				conversationId: "conversation-1",
				envelope: {
					answer: `${ARTICLE_TEXT} [1]`,
					citations: [{ chunkId: "chunk-1", documentId: "document-1" }],
					retrievedChunks: [{ id: "chunk-1", content: ARTICLE_TEXT }],
					confidence: 0.9,
					screenedQuery: "My Postal ID number is [ID_NUMBER], what do I bring to renew?",
				},
				classification: {
					category: "postal-id",
					language: "en",
					replyLanguage: "en",
					postalId: "guidance",
				},
			})

			expect(turn.answer).toContain("please don't share ID numbers")
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					maskedQuery: "My Postal ID number is [ID_NUMBER], what do I bring to renew?",
				})
			)
		})

		it("says it has no access to application records (AC4)", async () => {
			const turn = await service.answerPostalIdStatus({
				conversationId: "conversation-1",
				classification: {
					screenedQuery: "Nasaan na ang Postal ID ko?",
					category: "postal-id",
					language: "fil",
					replyLanguage: "fil",
					route: "postal-id-status",
					postalId: "status",
				},
				correlationId: "req-1",
			})

			expect(turn.answer).toContain("Wala akong access sa mga rekord ng aplikasyon")
			expect(turn).toMatchObject({ answerKind: "tool", sources: [], citations: [] })
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					maskedQuery: "Nasaan na ang Postal ID ko?",
					inquiryCategory: "postal-id",
					answerKind: "tool",
					confidence: 1,
					category: "postal-id",
					additionalEventKinds: [],
				})
			)
		})

		it("adds the personal-details reminder to the status reply", async () => {
			const turn = await service.answerPostalIdStatus({
				conversationId: "conversation-1",
				classification: {
					screenedQuery: "Where is my Postal ID? PRN: [ID_NUMBER]",
					category: "postal-id",
					language: "en",
					replyLanguage: "en",
					route: "postal-id-status",
					postalId: "status",
				},
				correlationId: "req-1",
			})

			expect(turn.answer).toContain("I don't have access to Postal ID application records")
			expect(turn.answer).toContain("please don't share ID numbers")
		})

		it("respects a blocked topic on the status reply", async () => {
			const turn = await service.answerPostalIdStatus({
				conversationId: "conversation-1",
				classification: {
					screenedQuery: "Where is my Postal ID?",
					category: "postal-id",
					language: "en",
					replyLanguage: "en",
					route: "postal-id-status",
					postalId: "status",
				},
				correlationId: "req-1",
				blockedTopics: ["Postal ID"],
			})

			expect(turn.answer).toContain("I'm not sure enough to answer")
			expect(turn.answerKind).toBe("uncertain")
			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ additionalEventKinds: ["answer_blocked"] })
			)
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

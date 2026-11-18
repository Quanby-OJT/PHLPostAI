import type { AuditService } from "@/common/audit/audit.service"
import type { KnowledgeRepository } from "@/modules/v1/knowledge/knowledge.repository"

import type { ConversationService } from "./conversation.service"
import { CUSTOMER_REFUSAL_ANSWER, CustomerChatService } from "./customer-chat.service"

jest.mock("@/modules/v1/knowledge/knowledge.repository", () => ({
	KnowledgeRepository: class KnowledgeRepository {},
}))
jest.mock("@/common/audit/audit.service", () => ({ AuditService: class AuditService {} }))
jest.mock("./conversation.service", () => ({ ConversationService: class ConversationService {} }))

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

	beforeEach(() => {
		conversationService = {
			recordTurn: jest.fn().mockResolvedValue({
				customerMessageId: "message-1",
				assistantMessageId: "message-2",
			}),
		}
		knowledgeRepository = { resolveArticleSources: jest.fn().mockResolvedValue(new Map()) }
		auditService = { writeAudit: jest.fn().mockResolvedValue(undefined) }
		service = new CustomerChatService(
			conversationService as unknown as ConversationService,
			knowledgeRepository as unknown as KnowledgeRepository,
			auditService as unknown as AuditService
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
					screenedQuery: "my number is [PHONE]",
					citations: [],
				},
			})

			expect(conversationService.recordTurn).toHaveBeenCalledWith(
				expect.objectContaining({ maskedQuery: "my number is [PHONE]" })
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
})

import { db } from "@/common/database/database.client"
import type { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"

import type { ConversationService } from "./conversation.service"
import { ScamAssessmentService } from "./scam-assessment.service"

jest.mock("@/common/database/database.client", () => ({
	db: { select: jest.fn(), transaction: jest.fn(), insert: jest.fn() },
}))
jest.mock("@/modules/v1/corpus/rag-gateway.service", () => ({ RagGatewayService: class {} }))
jest.mock("@repo/contracts", () => ({ CUSTOMER_LANGUAGES: ["en", "fil", "ceb", "ilo"] }))
jest.mock("./conversation.service", () => ({ ConversationService: class {} }))

describe("shared scam evaluation", () => {
	const indicator = { code: "qa_ribbon_request", name: "Request for a ribbon", weight: 3 }
	const input = { query: "Please send a ribbon.", principal: "qa", correlationId: "request-1" }
	const recordTurn = jest.fn().mockResolvedValue({ assistantMessageId: "message-1" })
	const assessScam = jest.fn()
	const service = new ScamAssessmentService(
		{ recordTurn } as unknown as ConversationService,
		{ assessScam } as unknown as RagGatewayService
	)

	beforeEach(() => {
		jest.clearAllMocks()
		const where = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([indicator])
		jest.mocked(db.select).mockReturnValue({
			from: () => ({ where }),
		} as unknown as ReturnType<typeof db.select>)
	})

	it("uses the live configuration in a staff preview without persisting a customer turn", async () => {
		assessScam.mockResolvedValue({
			maskedQuery: input.query,
			injection: false,
			language: "en",
			assessment: { riskLevel: "medium", indicators: [indicator.code], confidence: 0.8 },
		})
		const preview = await service.evaluate({
			...input,
			actorType: "user",
			permissions: ["scam.indicators.manage"],
		})

		expect(preview.findings).toEqual([indicator])
		expect(preview.assessment.riskLevel).toBe("high")
		expect(assessScam).toHaveBeenCalledWith(
			expect.objectContaining({
				actorType: "user",
				customIndicators: [{ code: indicator.code, name: indicator.name }],
			})
		)
		expect(recordTurn).not.toHaveBeenCalled()
		expect(db.transaction).not.toHaveBeenCalled()
		expect(db.insert).not.toHaveBeenCalled()
	})

	it("records an uncertain customer turn and keeps the tool response for the widget", async () => {
		assessScam.mockResolvedValue({
			maskedQuery: "Please send a ribbon.",
			injection: false,
			language: "en",
			assessment: null,
		})
		const answer = await service.answer({
			...input,
			conversationId: "conversation-1",
			classification: {
				screenedQuery: "",
				category: "scam",
				language: "en",
				replyLanguage: "en",
				route: "scam",
			},
			sessionLanguage: "en",
			permissions: [],
			requestStartedAt: 42,
		})

		expect(answer).toMatchObject({
			answerKind: "tool",
			isIDontKnow: true,
			scamAssessment: { riskLevel: "uncertain", indicators: [], confidence: 0 },
		})
		expect(recordTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				answerKind: "uncertain",
				requestStartedAt: 42,
				additionalEventKinds: ["scam_assessed"],
			})
		)
	})
})

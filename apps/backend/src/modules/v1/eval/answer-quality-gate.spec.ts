import type { EvalRun, EvalRunItem } from "@repo/contracts"

import { qualityFixtureItems } from "./answer-quality-fixtures"
import { compareQualityRuns, qualityMetrics } from "./answer-quality-gate"

function run(): EvalRun {
	const items = qualityFixtureItems().map(
		(item, index): EvalRunItem => ({
			goldenItemId: item.id,
			question: item.question,
			skipped: false,
			answer: item.idealAnswer,
			quality: {
				expected: item.answerQuality!,
				idealAnswer: item.idealAnswer,
				expectedHashes: item.expectedChunkHashes,
				approvalReference: item.approvalReference,
				externalApprover: null,
				approvedAt: null,
				actualRoute: item.answerQuality!.useCase,
				actualBehavior: item.answerQuality!.expectedBehavior,
				actualLanguage: item.answerQuality!.language,
				toolResult: null,
				providerOutputTokens: null,
				visibleOutputTokens: 30,
				tokenizer: "o200k_base",
				grounded: index !== 0 && index !== 30,
				behaviorCorrect: true,
				languageCorrect: true,
				judgeReason: null,
				error: null,
			},
		})
	)
	return {
		id: "fixture",
		kind: "generation",
		status: "completed",
		gitSha: "fixture",
		perItem: items,
		metrics: qualityMetrics(items),
		config: { profile: "evl1-local", itemCount: items.length, compatibility: "same" },
		error: null,
		triggeredBy: "fixture",
		createdAt: new Date(),
		finishedAt: new Date(),
	}
}

describe("EVL-1 deployment gate", () => {
	it("covers four languages and all required use cases with distinct items", () => {
		const result = run()
		expect(new Set(result.perItem?.map(item => item.question)).size).toBe(120)
		for (const language of ["en", "fil", "ceb", "ilo"]) {
			expect(result.metrics?.[`${language}.count`]).toBe(30)
			expect(result.metrics?.[`${language}.rates.count`]).toBe(8)
			expect(result.metrics?.[`${language}.tracking.count`]).toBe(8)
			expect(result.metrics?.[`${language}.postal-id.count`]).toBe(7)
			expect(result.metrics?.[`${language}.service-info.count`]).toBe(7)
		}
	})
	it("passes a fully compatible candidate", () => {
		expect(compareQualityRuns(run(), run()).exitCode).toBe(0)
	})
	it("blocks a Cebuano regression when overall grounding improves", () => {
		const candidate = run()
		candidate.perItem![0]!.quality!.grounded = true
		candidate.perItem![30]!.quality!.grounded = true
		candidate.perItem![60]!.quality!.grounded = false
		expect(compareQualityRuns(candidate, run())).toMatchObject({
			exitCode: 1,
			regressions: [{ language: "ceb" }],
		})
		expect(compareQualityRuns(candidate, candidate).exitCode).toBe(0)
	})
	it.each([199, 200, 201, null])("checks the visible token boundary %s", tokens => {
		const candidate = run()
		candidate.perItem![0]!.quality!.visibleOutputTokens = tokens
		expect(compareQualityRuns(candidate, run()).exitCode).toBe(
			tokens !== null && tokens <= 200 ? 0 : 2
		)
	})
	it("rejects a provider completion over the ceiling", () => {
		const candidate = run()
		candidate.perItem![0]!.quality!.providerOutputTokens = 201
		expect(compareQualityRuns(candidate, run()).exitCode).toBe(2)
	})
	it("rejects incompatible, incomplete, and absent baselines", () => {
		const candidate = run()
		expect(compareQualityRuns(candidate, null).exitCode).toBe(2)
		expect(
			compareQualityRuns(candidate, {
				...run(),
				config: { ...candidate.config, compatibility: "different" },
			}).exitCode
		).toBe(2)
		candidate.perItem!.pop()
		expect(compareQualityRuns(candidate, run()).exitCode).toBe(2)
	})
})

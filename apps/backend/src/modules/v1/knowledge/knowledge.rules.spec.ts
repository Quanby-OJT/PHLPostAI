import {
	assertArticleActive,
	assertNotSelfApproval,
	assertTransition,
	buildKnowledgeDocument,
	draftPlan,
	KnowledgeRuleError,
} from "./knowledge.rules"

describe("knowledge rules (DOMAIN-MODEL §5.2)", () => {
	it("allows only the transitions in the state machine", () => {
		expect(() => assertTransition("submit", { status: "draft", indexing: false })).not.toThrow()
		expect(() => assertTransition("approve", { status: "in_review", indexing: false })).not.toThrow()
		expect(() => assertTransition("return", { status: "in_review", indexing: false })).not.toThrow()

		expect(() => assertTransition("approve", { status: "draft", indexing: false })).toThrow(
			KnowledgeRuleError
		)
		expect(() => assertTransition("submit", { status: "approved", indexing: false })).toThrow(
			KnowledgeRuleError
		)
		expect(() => assertTransition("edit", { status: "in_review", indexing: false })).toThrow(
			KnowledgeRuleError
		)
	})

	it("refuses a second approval while the version is being indexed", () => {
		expect(() => assertTransition("approve", { status: "in_review", indexing: true })).toThrow(
			/already being indexed/
		)
	})

	it("refuses self-approval with FORBIDDEN", () => {
		expect(() => assertNotSelfApproval("user-a", "user-b")).not.toThrow()
		try {
			assertNotSelfApproval("user-a", "user-a")
			throw new Error("expected a refusal")
		} catch (error) {
			expect(error).toBeInstanceOf(KnowledgeRuleError)
			expect((error as KnowledgeRuleError).code).toBe("FORBIDDEN")
		}
	})

	it("refuses changes to a deactivated article", () => {
		expect(() => assertArticleActive("active")).not.toThrow()
		expect(() => assertArticleActive("deactivated")).toThrow(/deactivated/)
	})

	it("edits an open draft but opens a new draft after approval", () => {
		expect(draftPlan(null)).toBe("create")
		expect(draftPlan({ status: "draft" })).toBe("update")
		expect(draftPlan({ status: "returned" })).toBe("update")
		expect(draftPlan({ status: "approved" })).toBe("create")
		expect(draftPlan({ status: "superseded" })).toBe("create")
		expect(() => draftPlan({ status: "in_review" })).toThrow(/in review/)
	})

	it("builds an escaped HTML document whose bytes depend only on title and text", () => {
		const doc = buildKnowledgeDocument({
			articleId: "a1",
			version: 2,
			title: "Rates <2026>",
			language: "en",
			body: "First line\nsame paragraph\n\nSecond & last",
		})
		const html = doc.buffer.toString("utf8")
		expect(doc.filename).toBe("knowledge-a1-v2.html")
		expect(doc.contentType).toBe("text/html")
		expect(html).toContain("<h1>Rates &lt;2026&gt;</h1>")
		expect(html).toContain("<p>First line<br>same paragraph</p>")
		expect(html).toContain("<p>Second &amp; last</p>")

		const again = buildKnowledgeDocument({
			articleId: "a1",
			version: 3,
			title: "Rates <2026>",
			language: "en",
			body: "First line\nsame paragraph\n\nSecond & last",
		})
		expect(again.buffer.equals(doc.buffer)).toBe(true)
	})
})

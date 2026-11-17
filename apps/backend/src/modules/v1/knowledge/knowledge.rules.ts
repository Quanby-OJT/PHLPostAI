import type { KnowledgeArticleStatus, KnowledgeVersionStatus } from "@repo/contracts"

/**
 * Pure rules for the Knowledge Article version state machine (DOMAIN-MODEL
 * §5.2, Flow E). Kept free of I/O so every transition is unit-testable.
 */

export type KnowledgeAction = "edit" | "submit" | "approve" | "return"

export interface VersionState {
	status: KnowledgeVersionStatus
	/** An ingestion job started on approval is still running. */
	indexing: boolean
}

export class KnowledgeRuleError extends Error {
	constructor(
		readonly code: "CONFLICT" | "FORBIDDEN",
		message: string
	) {
		super(message)
		this.name = "KnowledgeRuleError"
	}
}

/** Throws when the article is retired: a deactivated article accepts no changes. */
export function assertArticleActive(status: KnowledgeArticleStatus): void {
	if (status !== "active") {
		throw new KnowledgeRuleError(
			"CONFLICT",
			"This article is deactivated and can no longer be changed."
		)
	}
}

/** Throws unless `action` is allowed from the version's current state. */
export function assertTransition(action: KnowledgeAction, state: VersionState): void {
	const allowed: Record<KnowledgeAction, KnowledgeVersionStatus[]> = {
		edit: ["draft", "returned"],
		submit: ["draft"],
		approve: ["in_review"],
		return: ["in_review"],
	}
	if (!allowed[action].includes(state.status)) {
		throw new KnowledgeRuleError(
			"CONFLICT",
			`Cannot ${action} a version that is ${state.status.replace("_", " ")}.`
		)
	}
	if ((action === "approve" || action === "return") && state.indexing) {
		throw new KnowledgeRuleError(
			"CONFLICT",
			"This version is already being indexed. Wait for indexing to finish."
		)
	}
}

/** The submitter cannot approve their own version (§5.2, KB-1 AC). */
export function assertNotSelfApproval(submittedBy: string | null, approverId: string): void {
	if (submittedBy !== null && submittedBy === approverId) {
		throw new KnowledgeRuleError("FORBIDDEN", "You cannot approve a version you submitted.")
	}
}

/**
 * What saving a draft does, given the article's newest version:
 * - `update`: edit the open draft (a returned version moves back to draft)
 * - `create`: open a new draft; the approved version keeps serving
 * - refuse while a version is in review
 */
export function draftPlan(
	latest: { status: KnowledgeVersionStatus } | null
): "update" | "create" {
	if (latest === null) return "create"
	switch (latest.status) {
		case "draft":
		case "returned":
			return "update"
		case "in_review":
			throw new KnowledgeRuleError(
				"CONFLICT",
				"A version is in review. Wait for the decision, or ask the approver to return it, before editing."
			)
		default:
			return "create"
	}
}

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, char => HTML_ESCAPES[char] ?? char)
}

/**
 * The file handed to the template ingestion service on approval. The article
 * text is escaped and split into paragraphs, so the HTML loader indexes exactly
 * what the approver read. Identical title + text gives identical bytes, which
 * the ingestion service treats as an idempotent no-op (content hash).
 */
export function buildKnowledgeDocument(input: {
	articleId: string
	version: number
	title: string
	language: string
	body: string
}): { filename: string; contentType: string; buffer: Buffer } {
	const paragraphs = input.body
		.split(/\r?\n\s*\r?\n/)
		.map(part => part.trim())
		.filter(Boolean)
		.map(part => `<p>${escapeHtml(part).replace(/\r?\n/g, "<br>")}</p>`)
		.join("\n")
	const html = [
		"<!doctype html>",
		`<html lang="${escapeHtml(input.language)}">`,
		`<head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title></head>`,
		`<body><h1>${escapeHtml(input.title)}</h1>`,
		paragraphs,
		"</body></html>",
	].join("\n")
	return {
		filename: `knowledge-${input.articleId}-v${input.version}.html`,
		contentType: "text/html",
		buffer: Buffer.from(html, "utf8"),
	}
}

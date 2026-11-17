import type { KnowledgeLanguage, KnowledgeVersionStatus } from "@repo/contracts"

export const LANGUAGE_LABELS: Record<KnowledgeLanguage, string> = {
	en: "English",
	fil: "Filipino",
	ceb: "Cebuano",
	ilo: "Ilocano",
}

export const CATEGORY_LABELS: Record<string, string> = {
	"tracking": "Tracking",
	"rates": "Rates",
	"postal-id": "Postal ID",
	"service-info": "Service information",
	"scam": "Scam guidance",
	"complaint": "Complaint",
	"other": "Other",
}

export function categoryLabel(code: string): string {
	return CATEGORY_LABELS[code] ?? code
}

export const VERSION_STATUS_LABELS: Record<KnowledgeVersionStatus, string> = {
	draft: "Draft",
	in_review: "In review",
	returned: "Returned",
	approved: "Approved",
	superseded: "Superseded",
	deactivated: "Deactivated",
}

export const VERSION_STATUS_VARIANT: Record<
	KnowledgeVersionStatus,
	"default" | "secondary" | "outline" | "destructive"
> = {
	draft: "secondary",
	in_review: "outline",
	returned: "destructive",
	approved: "default",
	superseded: "secondary",
	deactivated: "secondary",
}

/**
 * The RAG worker already starts its reason with "Indexing failed:", and the
 * screens add that label themselves, so drop it from the reason to avoid
 * showing it twice.
 */
export function indexErrorReason(reason: string): string {
	const trimmed = reason.replace(/^(\s*indexing failed:?\s*)+/i, "").trim()
	return trimmed.replace(/\.$/, "") || "unknown error"
}

export function formatDate(iso: string | null): string {
	if (!iso) return "—"
	const date = new Date(iso)
	return Number.isNaN(date.getTime())
		? iso
		: date.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
}

import type { PostalIdIntent } from "./postal-id-guidance"

/**
 * CNV-2 routing hook (Flow A step 5): the Inquiry Category decides the route.
 * Categories with a tool use its result; other categories use approved retrieval.
 * CNV-6: a Postal ID application-status question gets a fixed reply, since no
 * application records exist to look up.
 */
export type InquiryRoute = "tracking" | "rates" | "scam" | "postal-id-status" | "retrieval"

const TOOL_ROUTES: Readonly<Record<string, InquiryRoute>> = {
	tracking: "tracking",
	rates: "rates",
	scam: "scam",
}

export function routeForCategory(category: string, postalId?: PostalIdIntent): InquiryRoute {
	if (category === "postal-id" && postalId === "status") return "postal-id-status"
	return TOOL_ROUTES[category] ?? "retrieval"
}

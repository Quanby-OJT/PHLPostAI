/**
 * CNV-2 routing hook (Flow A step 5): the Inquiry Category decides the route.
 * Categories with a tool use its result; other categories use approved retrieval.
 */
export type InquiryRoute = "tracking" | "rates" | "scam" | "retrieval"

const TOOL_ROUTES: Readonly<Record<string, InquiryRoute>> = {
	tracking: "tracking",
	rates: "rates",
	scam: "scam",
}

export function routeForCategory(category: string): InquiryRoute {
	return TOOL_ROUTES[category] ?? "retrieval"
}

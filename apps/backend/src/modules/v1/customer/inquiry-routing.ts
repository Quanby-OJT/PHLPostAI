/**
 * CNV-2 routing hook (Flow A step 5): the Inquiry Category decides the route.
 * TRK-1 is plugged in; KB-2 adds `rates` and SCM-1 adds `scam` here. Every
 * category without a tool is answered by retrieval over approved chunks.
 */
export type InquiryRoute = "tracking" | "retrieval"

const TOOL_ROUTES: Readonly<Record<string, InquiryRoute>> = {
	tracking: "tracking",
}

export function routeForCategory(category: string): InquiryRoute {
	return TOOL_ROUTES[category] ?? "retrieval"
}

import type { Metadata } from "next"

import { AssistantChat } from "@/features/assistant/components/assistant-chat"

export const metadata: Metadata = {
	title: "PHLPost Assistant",
	description: "Ask about PHLPost services and get an answer from approved information.",
}

/**
 * Public customer chat (CNV-1). Deliberately OUTSIDE the `(site)` route group:
 * that layout redirects anonymous visitors to /login, and this page must work
 * with no account at all. Its session is a Customer Session token, obtained by
 * the client on first use.
 */
export default function AssistantPage() {
	return <AssistantChat />
}

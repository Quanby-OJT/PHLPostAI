import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"

import { EscalationInbox } from "./escalation-inbox"

afterEach(() => vi.unstubAllGlobals())

it("shows the losing agent a conflict and refreshes the claim controls", async () => {
	const escalation = {
		id: "escalation-1",
		conversationId: "conversation-1",
		reason: "I still need help",
		language: "en",
		category: "tracking",
		createdAt: "2026-11-24T00:00:00.000Z",
		waitingSeconds: 1,
	}
	let claimed = false
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string) => {
			const { pathname } = new URL(input)
			if (pathname.endsWith("/claim")) {
				claimed = true
				return Response.json(
					{ error: { message: "This escalation has already been claimed" } },
					{ status: 409 }
				)
			}
			if (pathname.endsWith("/mine")) return Response.json([])
			if (pathname.endsWith("/available-agents")) return Response.json([])
			if (pathname.endsWith("/presence"))
				return Response.json({
					agentId: "agent-1",
					available: true,
					maxOpenChats: 3,
					lastSeenAt: "2026-11-24T00:00:00.000Z",
				})
			if (pathname.endsWith("/escalations")) return Response.json(claimed ? [] : [escalation])
			return Response.json({
				...escalation,
				status: claimed ? "claimed" : "queued",
				canHandle: false,
				messages: [],
				transfers: [],
			})
		})
	)
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false, networkMode: "always" },
			mutations: { networkMode: "always" },
		},
	})
	const user = userEvent.setup()
	render(
		<QueryClientProvider client={client}>
			<EscalationInbox />
		</QueryClientProvider>
	)

	await user.click(
		await screen.findByRole("button", { name: "Claim conversation" }, { timeout: 5000 })
	)
	expect((await screen.findByRole("alert", {}, { timeout: 5000 })).textContent).toBe(
		"This escalation has already been claimed"
	)
	expect(screen.getByText("An agent has joined this chat")).toBeTruthy()
	expect(screen.queryByRole("button", { name: "Claim conversation" })).toBeNull()
	expect(screen.queryByRole("textbox", { name: "Reply to customer" })).toBeNull()
}, 15_000)

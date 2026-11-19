import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomerAnswer } from "@repo/contracts"

import { ApiError } from "@/core/lib/api-error"

import {
	RateLimitedError,
	SESSION_STORAGE_KEY,
	startSession,
	streamQuestion,
} from "../api/assistant.client"
import { AssistantChat } from "./assistant-chat"

vi.mock("../api/assistant.client", async importOriginal => {
	const actual = await importOriginal<Record<string, unknown>>()
	return { ...actual, startSession: vi.fn(), streamQuestion: vi.fn() }
})

const CHAT_STORAGE_KEY = "phlpost.assistant.chat"

const FINAL: CustomerAnswer = {
	answer: "Express Mail is PHLPost's fastest domestic service.",
	conversationId: "3f5a2c1e-0000-4000-8000-000000000001",
	messageId: "3f5a2c1e-0000-4000-8000-000000000002",
	sources: [{ articleId: "3f5a2c1e-0000-4000-8000-000000000003", title: "Express Mail service" }],
	citations: [],
	answerKind: "answer",
	isIDontKnow: false,
}

const NEW_SESSION = {
	sessionToken: "new-token",
	channelCode: "web-widget" as const,
	language: "en" as const,
	idleExpiresAt: "2099-01-01T00:00:00.000Z",
}

/** Chat state as the widget saves it in the tab (CHN-1). */
function seedChat(chat: { accepted: boolean; conversationId?: string; turns?: unknown[] }) {
	window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ turns: [], ...chat }))
}

function seedSession(token: string) {
	window.sessionStorage.setItem(
		SESSION_STORAGE_KEY,
		JSON.stringify({ sessionToken: token, idleExpiresAt: "2099-01-01T00:00:00.000Z" })
	)
}

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
	await user.type(screen.getByRole("textbox", { name: "Your question" }), question)
	await user.click(screen.getByRole("button", { name: "Ask" }))
}

beforeAll(() => {
	// jsdom does not implement scrollIntoView.
	window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
	window.sessionStorage.clear()
	vi.mocked(startSession).mockReset().mockResolvedValue(NEW_SESSION)
	vi.mocked(streamQuestion)
		.mockReset()
		.mockImplementation(async (_input, _token, handlers) => {
			handlers.onToken("Express ")
			handlers.onFinal(FINAL)
		})
})

describe("AssistantChat (CHN-1)", () => {
	describe("AI notice (AC1)", () => {
		it("shows the AI notice and no input before the customer accepts", () => {
			render(<AssistantChat />)

			expect(screen.getByText(/answered by an AI assistant/i)).toBeTruthy()
			expect(screen.queryByRole("textbox")).toBeNull()
			expect(screen.queryByRole("button", { name: "Ask" })).toBeNull()
		})

		it("links the privacy notice, opening in a new tab", () => {
			render(<AssistantChat />)

			const links = screen.getAllByRole("link", { name: /privacy notice/i })
			expect(links.length).toBeGreaterThanOrEqual(2)
			for (const link of links) {
				expect(link.getAttribute("target")).toBe("_blank")
				expect(link.getAttribute("rel")).toContain("noopener")
			}
		})

		it("gives a labelled input only after the customer accepts", async () => {
			const user = userEvent.setup()
			render(<AssistantChat />)

			await user.click(screen.getByRole("button", { name: /i understand, start chat/i }))

			expect(screen.getByRole("textbox", { name: "Your question" })).toBeTruthy()
			expect(screen.queryByText(/answered by an AI assistant/i)).toBeNull()
		})
	})

	describe("answers and persistence (AC2)", () => {
		it("shows the answer and names the article it came from", async () => {
			seedChat({ accepted: true })
			const user = userEvent.setup()
			render(<AssistantChat />)

			await ask(user, "What is Express Mail?")

			expect(await screen.findByText(FINAL.answer)).toBeTruthy()
			expect(screen.getByText("Express Mail service")).toBeTruthy()
		})

		it("saves the conversation so a reload in the same tab can continue it", async () => {
			seedChat({ accepted: true })
			const user = userEvent.setup()
			render(<AssistantChat />)

			await ask(user, "What is Express Mail?")
			await screen.findByText(FINAL.answer)

			await waitFor(() => {
				const saved = JSON.parse(window.sessionStorage.getItem(CHAT_STORAGE_KEY) ?? "{}")
				expect(saved.conversationId).toBe(FINAL.conversationId)
				expect(saved.accepted).toBe(true)
			})
			expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toContain("new-token")
		})

		it("restores an accepted chat after a reload without showing the notice again", () => {
			seedChat({
				accepted: true,
				conversationId: "conv-1",
				turns: [
					{ sender: "customer", content: "hello there" },
					{ sender: "assistant", content: "hi, how can I help?" },
				],
			})
			render(<AssistantChat />)

			expect(screen.queryByText(/answered by an AI assistant/i)).toBeNull()
			expect(screen.getByText("hello there")).toBeTruthy()
			expect(screen.getByText("hi, how can I help?")).toBeTruthy()
			expect(screen.getByRole("textbox", { name: "Your question" })).toBeTruthy()
		})
	})

	describe("rate limit (AC4)", () => {
		it("shows a please-wait notice, gives the question back and counts down", async () => {
			seedChat({ accepted: true })
			vi.mocked(streamQuestion).mockRejectedValue(new RateLimitedError("Too many requests", 2))
			const user = userEvent.setup()
			render(<AssistantChat />)

			await ask(user, "How much?")

			const notice = await screen.findByRole("status")
			expect(notice.textContent).toMatch(/Please wait 2 seconds/)
			const input = screen.getByRole("textbox", { name: "Your question" }) as HTMLInputElement
			expect(input.value).toBe("How much?")
			expect(input.disabled).toBe(true)

			await waitFor(
				() => expect(screen.getByRole("status").textContent).toMatch(/Please wait 1 second/),
				{
					timeout: 3000,
				}
			)
		})
	})

	describe("replaced session", () => {
		it("starts a fresh conversation when there is no stored session", async () => {
			// A conversation id left over from a session that no longer exists.
			seedChat({ accepted: true, conversationId: "old-conversation" })
			const user = userEvent.setup()
			render(<AssistantChat />)

			await ask(user, "hi")
			await screen.findByText(FINAL.answer)

			expect(startSession).toHaveBeenCalledTimes(1)
			const [input] = vi.mocked(streamQuestion).mock.calls[0]!
			expect(input.conversationId).toBeUndefined()
		})

		it("retries once with a new session and no old conversation id after a 401", async () => {
			seedSession("old-token")
			seedChat({ accepted: true, conversationId: "old-conversation" })
			vi.mocked(streamQuestion)
				.mockReset()
				.mockRejectedValueOnce(new ApiError(401, "Invalid or expired customer session"))
				.mockImplementationOnce(async (_input, _token, handlers) => {
					handlers.onFinal(FINAL)
				})
			const user = userEvent.setup()
			render(<AssistantChat />)

			await ask(user, "hi")
			await screen.findByText(FINAL.answer)

			expect(startSession).toHaveBeenCalledTimes(1)
			const calls = vi.mocked(streamQuestion).mock.calls
			expect(calls).toHaveLength(2)
			expect(calls[0]![0].conversationId).toBe("old-conversation")
			expect(calls[0]![1]).toBe("old-token")
			expect(calls[1]![0].conversationId).toBeUndefined()
			expect(calls[1]![1]).toBe("new-token")
			expect(screen.queryByRole("alert")).toBeNull()
		})
	})
})

#!/usr/bin/env node

/**
 * ESC-5 staging acceptance run. Requires 30 disposable customer sessions and
 * 30 agents with escalations.conversations.handle. Configure least_busy routing,
 * open business hours, and a per-agent limit of at least one before running.
 *
 * Fixture JSON: [{"agentCookie":"...","customerSessionToken":"...",
 *   "conversationId":"uuid","afterTurnIndex":4}, ...]
 *
 * ESC5_API_BASE_URL=https://staging.example.com/api
 * ESC5_FIXTURES=./esc5-fixtures.json ESC5_CUSTOMER_ORIGIN=https://staging.example.com \
 *   node scripts/load/esc5-thirty-agent.mjs
 */
import { readFile } from "node:fs/promises"

const count = 30
const apiBase = process.env.ESC5_API_BASE_URL?.replace(/\/$/, "")
const fixturePath = process.env.ESC5_FIXTURES
const customerOrigin = process.env.ESC5_CUSTOMER_ORIGIN

if (!apiBase || !fixturePath || !customerOrigin) {
	console.error(
		"Set ESC5_API_BASE_URL, ESC5_FIXTURES, and ESC5_CUSTOMER_ORIGIN. See the script header for fixture format."
	)
	process.exit(2)
}

const fixtures = JSON.parse(await readFile(fixturePath, "utf8"))
if (!Array.isArray(fixtures) || fixtures.length !== count) {
	throw new Error(
		`Expected exactly ${count} fixture rows; received ${fixtures?.length ?? "invalid data"}`
	)
}
const conversationIds = new Set()
for (const [index, fixture] of fixtures.entries()) {
	if (
		typeof fixture.agentCookie !== "string" ||
		typeof fixture.customerSessionToken !== "string" ||
		typeof fixture.conversationId !== "string" ||
		!Number.isSafeInteger(fixture.afterTurnIndex) ||
		fixture.afterTurnIndex < -1
	) {
		throw new Error(
			`Fixture row ${index + 1} is missing a cookie, session, UUID, or afterTurnIndex`
		)
	}
	if (conversationIds.has(fixture.conversationId))
		throw new Error("Each fixture needs a unique conversationId")
	conversationIds.add(fixture.conversationId)
}

async function request(path, { cookie, sessionToken, method = "GET", body, origin } = {}) {
	const headers = {}
	if (cookie) headers.cookie = cookie
	if (sessionToken) headers["x-customer-session"] = sessionToken
	if (origin) headers.origin = origin
	if (body !== undefined) headers["content-type"] = "application/json"
	const response = await fetch(`${apiBase}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	if (!response.ok) {
		const text = await response.text()
		throw new Error(`${method} ${path}: HTTP ${response.status}: ${text.slice(0, 500)}`)
	}
	return response
}

function openEventStream(url, headers, uniqueText) {
	const controller = new AbortController()
	let resolveReady
	let rejectReady
	let resolveFirst
	let rejectFirst
	const ready = new Promise((resolve, reject) => {
		resolveReady = resolve
		rejectReady = reject
	})
	const first = new Promise((resolve, reject) => {
		resolveFirst = resolve
		rejectFirst = reject
	})
	let matchingEvents = 0
	const background = (async () => {
		const response = await fetch(url, { headers, signal: controller.signal })
		if (!response.ok || !response.body) {
			throw new Error(`Event stream returned HTTP ${response.status}`)
		}
		resolveReady()
		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""
		try {
			while (true) {
				const { value, done: ended } = await reader.read()
				if (ended) break
				buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n")
				let boundary = buffer.indexOf("\n\n")
				while (boundary >= 0) {
					const frame = buffer.slice(0, boundary)
					buffer = buffer.slice(boundary + 2)
					let event = "message"
					let data = ""
					for (const line of frame.split("\n")) {
						if (line.startsWith("event: ")) event = line.slice(7).trim()
						if (line.startsWith("data: ")) data += line.slice(6)
					}
					if (event === "message" && data) {
						const message = JSON.parse(data)
						if (message.content === uniqueText) {
							matchingEvents += 1
							if (matchingEvents === 1) {
								resolveFirst({ deliveredAt: performance.now(), messageId: message.id })
							}
						}
					}
					boundary = buffer.indexOf("\n\n")
				}
			}
		} finally {
			await reader.cancel().catch(() => undefined)
		}
	})().catch(error => {
		rejectReady(error)
		rejectFirst(error)
	})
	return { controller, ready, first, background, count: () => matchingEvents }
}

const started = performance.now()
let assigned = []
let streams = []
try {
	console.log(`Setting ${count} agents available…`)
	await Promise.all(
		fixtures.map(fixture =>
			request("/v1/escalations/presence", {
				cookie: fixture.agentCookie,
				method: "PUT",
				body: { available: true },
			})
		)
	)

	console.log(`Requesting ${count} simultaneous human handoffs…`)
	const escalations = await Promise.all(
		fixtures.map((fixture, index) =>
			request("/v1/customer/escalations", {
				sessionToken: fixture.customerSessionToken,
				origin: customerOrigin,
				method: "POST",
				body: { conversationId: fixture.conversationId, reason: "I want to speak with a person" },
			})
				.then(response => response.json())
				.then(result => ({ fixture, index, result }))
		)
	)
	assigned = escalations.filter(
		({ result }) => result.status === "claimed" && result.assignedAgentId
	)
	const uniqueAssignments = new Set(assigned.map(({ result }) => result.assignedAgentId))
	if (assigned.length !== count || uniqueAssignments.size !== count) {
		throw new Error(
			`Expected 30 uniquely assigned chats; got ${assigned.length} assignments to ${uniqueAssignments.size} agents. Confirm business hours, least_busy mode, and capacity.`
		)
	}
	console.log("All 30 escalations were assigned to distinct agents.")

	streams = assigned.map(({ fixture, result }) => {
		const uniqueText = `ESC5-load-${crypto.randomUUID()}`
		const replyText = `ESC5-reply-${crypto.randomUUID()}`
		const agentEvents = openEventStream(
			`${apiBase}/v1/escalations/${result.id}/events?after=${fixture.afterTurnIndex}`,
			{ cookie: fixture.agentCookie },
			uniqueText
		)
		const customerEvents = openEventStream(
			`${apiBase}/v1/customer/conversations/${fixture.conversationId}/events?after=${fixture.afterTurnIndex}`,
			{ "x-customer-session": fixture.customerSessionToken, "origin": customerOrigin },
			replyText
		)
		return { fixture, result, uniqueText, replyText, agentEvents, customerEvents }
	})
	await Promise.all(
		streams.flatMap(stream => [stream.agentEvents.ready, stream.customerEvents.ready])
	)

	console.log("Sending 30 customer messages concurrently…")
	const deliveries = await Promise.all(
		streams.map(async stream => {
			const customerSentAt = performance.now()
			const response = await request("/v1/customer/chat/stream", {
				sessionToken: stream.fixture.customerSessionToken,
				origin: customerOrigin,
				method: "POST",
				body: { conversationId: stream.fixture.conversationId, query: stream.uniqueText },
			})
			const posted = await response.json()
			if (!posted.agentMode || !posted.messageId)
				throw new Error("Customer message was not accepted in agent mode")
			const deliveredToAgent = await Promise.race([
				stream.agentEvents.first,
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("Message was not delivered within 2 seconds")), 2000)
				),
			])
			if (deliveredToAgent.messageId !== posted.messageId) {
				throw new Error(`Customer message ${posted.messageId} was lost or mismatched`)
			}
			const agentSentAt = performance.now()
			const replyResponse = await request(`/v1/escalations/${stream.result.id}/replies`, {
				cookie: stream.fixture.agentCookie,
				method: "POST",
				body: { content: stream.replyText },
			})
			const reply = await replyResponse.json()
			const deliveredToCustomer = await Promise.race([
				stream.customerEvents.first,
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("Agent reply was not delivered within 2 seconds")),
						2000
					)
				),
			])
			if (deliveredToCustomer.messageId !== reply.id) {
				throw new Error(`Agent reply ${reply.id} was lost or mismatched`)
			}
			return [
				deliveredToAgent.deliveredAt - customerSentAt,
				deliveredToCustomer.deliveredAt - agentSentAt,
			]
		})
	)
	// Leave the streams open through a second poll interval to catch duplicate frames.
	await new Promise(resolve => setTimeout(resolve, 1100))
	const duplicateCounts = streams.map(stream => [
		stream.agentEvents.count(),
		stream.customerEvents.count(),
	])
	if (
		duplicateCounts.some(
			([customerToAgent, agentToCustomer]) => customerToAgent !== 1 || agentToCustomer !== 1
		)
	) {
		throw new Error("At least one test message was duplicated on a live event stream")
	}
	for (const stream of streams) {
		stream.agentEvents.controller.abort()
		stream.customerEvents.controller.abort()
	}
	const slowestMs = Math.max(...deliveries.flat())
	if (deliveries.length !== count || deliveries.flat().some(latency => latency > 2000)) {
		throw new Error(`Message delivery exceeded 2 seconds; slowest was ${Math.round(slowestMs)} ms`)
	}
	console.log(
		`PASS: 30 customer messages and 30 agent replies delivered once; slowest ${Math.round(slowestMs)} ms.`
	)
	console.log(`Elapsed: ${Math.round(performance.now() - started)} ms.`)
} finally {
	for (const stream of streams) {
		stream.agentEvents.controller.abort()
		stream.customerEvents.controller.abort()
	}
	// These are dedicated staging fixtures. Close chats assigned by this run.
	await Promise.allSettled(
		assigned.map(({ fixture, result }) =>
			request(`/v1/escalations/${result.id}/resolve`, {
				cookie: fixture.agentCookie,
				method: "POST",
				body: { outcomeNote: "Closed after the ESC-5 staging load test." },
			})
		)
	)
	await Promise.allSettled(
		fixtures.map(fixture =>
			request("/v1/escalations/presence", {
				cookie: fixture.agentCookie,
				method: "PUT",
				body: { available: false },
			})
		)
	)
}

import { createHash, randomBytes } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { Pool } from "pg"

import { readSseFrames } from "@/modules/v1/customer/sse-frames"

// Opt in with two running replicas and a migrated, disposable local PostgreSQL database.
const databaseUrl = process.env.ESC2_E2E_DATABASE_URL
const primary = process.env.ESC2_E2E_API_URL
const replica = process.env.ESC2_E2E_REPLICA_URL
const origin = process.env.ESC2_E2E_WEB_ORIGIN ?? "http://localhost:3001"
const describeWithReplicas = databaseUrl && primary && replica ? describe : describe.skip

function request(api: string, path: string, options?: RequestInit) {
	return fetch(new URL(`/api/v1${path}`, api), {
		...options,
		headers: { Origin: origin, ...options?.headers },
		signal: AbortSignal.timeout(15_000),
	})
}

function post(api: string, path: string, headers: Record<string, string>, body?: object) {
	return request(api, path, {
		method: "POST",
		headers: { ...headers, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
}

async function signIn(api: string, email: string, password: string) {
	const response = await post(
		api,
		"/auth/sign-in/email",
		{},
		{
			email,
			password,
		}
	)
	expect(response.status).toBe(200)
	const { user } = (await response.json()) as { user: { id: string } }
	const cookie = response.headers
		.getSetCookie()
		.map(value => value.split(";", 1)[0])
		.join("; ")
	expect(cookie).not.toBe("")
	return { id: user.id, headers: { Cookie: cookie } }
}

describeWithReplicas("ESC-2 claim and reply across replicas", () => {
	let pool: Pool
	let agentA: Awaited<ReturnType<typeof signIn>>
	let agentB: Awaited<ReturnType<typeof signIn>>
	const apiA = primary ?? ""
	const apiB = replica ?? ""

	beforeAll(async () => {
		for (const url of [databaseUrl!, apiA, apiB]) {
			if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
				throw new Error("ESC-2 integration tests require loopback database and API URLs")
			}
		}
		expect(new URL(apiA).origin).not.toBe(new URL(apiB).origin)
		const agentAEmail = process.env.ESC2_E2E_AGENT_A_EMAIL
		const agentBEmail = process.env.ESC2_E2E_AGENT_B_EMAIL
		const agentPassword = process.env.ESC2_E2E_AGENT_PASSWORD
		if (!agentAEmail || !agentBEmail || !agentPassword) {
			throw new Error(
				"Set ESC2_E2E_AGENT_A_EMAIL, ESC2_E2E_AGENT_B_EMAIL, and ESC2_E2E_AGENT_PASSWORD"
			)
		}
		pool = new Pool({ connectionString: databaseUrl })
		agentA = await signIn(apiA, agentAEmail, agentPassword)
		agentB = await signIn(apiB, agentBEmail, agentPassword)
		expect(agentA.id).not.toBe(agentB.id)
	})

	afterAll(async () => {
		await pool?.end()
	})

	async function queueConversation() {
		const token = randomBytes(32).toString("hex")
		const tokenHash = createHash("sha256").update(token).digest("hex")
		const {
			rows: [conversation],
		} = await pool.query<{ id: string }>(
			`WITH session AS (INSERT INTO customer_sessions (token_hash) VALUES ($1) RETURNING id)
			 INSERT INTO conversations (customer_session_id, channel_code)
			 SELECT id, 'web' FROM session RETURNING id`,
			[tokenHash]
		)
		if (!conversation) throw new Error("Could not create the ESC-2 test conversation")
		const customer = { "x-customer-session": token }
		const response = await post(apiA, "/customer/escalations", customer, {
			conversationId: conversation.id,
			reason: "I still need help",
		})
		expect(response.status).toBe(201)
		const { id } = (await response.json()) as { id: string }
		return { id, conversationId: conversation.id, customer }
	}

	async function state(id: string) {
		const {
			rows: [row],
		} = await pool.query(
			`SELECT e.status AS escalation, e.assigned_agent_id, c.status AS conversation
			 FROM escalations e JOIN conversations c ON c.id = e.conversation_id WHERE e.id = $1`,
			[id]
		)
		return row
	}

	async function audits(id: string, action: string) {
		return (
			await pool.query(
				"SELECT actor_id, after FROM audit_log WHERE resource_id = $1 AND action = $2",
				[id, action]
			)
		).rows
	}

	async function failAudit(
		id: string,
		action: "escalations.claimed" | "escalations.agent_replied",
		attempt: () => Promise<Response>
	) {
		// The identifier and row filter are restricted to this test's isolated fixture.
		expect(id).toMatch(/^[\da-f-]{36}$/i)
		const constraint = `esc2_e2e_${id.replaceAll("-", "")}`
		await pool.query(`ALTER TABLE audit_log ADD CONSTRAINT ${constraint}
			CHECK (resource_id <> '${id}' OR action <> '${action}') NOT VALID`)
		try {
			const response = await attempt()
			expect(response.status).toBe(500)
			await response.body?.cancel()
		} finally {
			await pool.query(`ALTER TABLE audit_log DROP CONSTRAINT ${constraint}`)
		}
	}

	it("serializes contenders on separate PostgreSQL connections and commits one assignment and audit", async () => {
		const { id } = await queueConversation()
		const blocker = await pool.connect()
		let blocked = 0
		let contenders: Promise<PromiseSettledResult<Response>[]> | undefined
		try {
			await blocker.query("BEGIN")
			await blocker.query("SELECT id FROM escalations WHERE id = $1 FOR UPDATE", [id])
			contenders = Promise.allSettled([
				post(apiA, `/escalations/${id}/claim`, agentA.headers),
				post(apiB, `/escalations/${id}/claim`, agentB.headers),
			])
			for (let i = 0; i < 100; i++) {
				const { rows } = await pool.query<{ n: number }>(
					`SELECT count(DISTINCT pid)::int AS n FROM pg_stat_activity WHERE datname = current_database()
					 AND wait_event_type = 'Lock' AND lower(query) LIKE '%from "escalations"%for update%'`
				)
				blocked = rows[0]?.n ?? 0
				if (blocked === 2) break
				await delay(40)
			}
		} finally {
			try {
				await blocker.query("ROLLBACK")
			} finally {
				blocker.release()
			}
		}
		const responses = (await contenders!).map(result => {
			if (result.status === "rejected") throw result.reason
			return result.value
		})
		expect(blocked).toBe(2)
		expect(responses.map(response => response.status).sort()).toEqual([201, 409])
		const winner = responses[0]?.status === 201 ? agentA : agentB
		const conflict = responses.find(response => response.status === 409)!
		expect(await conflict.json()).toMatchObject({
			error: { message: "This escalation has already been claimed" },
		})
		expect(await state(id)).toEqual({
			escalation: "claimed",
			assigned_agent_id: winner.id,
			conversation: "agent_active",
		})
		expect(await audits(id, "escalations.claimed")).toEqual([
			{ actor_id: winner.id, after: { status: "claimed", assignedAgentId: winner.id } },
		])
	}, 25_000)

	it("rolls back an unaudited claim and allows a clean retry", async () => {
		const { id } = await queueConversation()
		const claim = () => post(apiA, `/escalations/${id}/claim`, agentA.headers)
		await failAudit(id, "escalations.claimed", claim)
		expect(await state(id)).toEqual({
			escalation: "queued",
			assigned_agent_id: null,
			conversation: "escalation_requested",
		})
		expect(await audits(id, "escalations.claimed")).toEqual([])
		expect((await claim()).status).toBe(201)
	}, 25_000)

	it("persists one attributed reply, delivers it live, and replays it on a fresh stream", async () => {
		const { id, conversationId, customer } = await queueConversation()
		expect((await post(apiA, `/escalations/${id}/claim`, agentA.headers)).status).toBe(201)
		const body = { content: "I can check the shipment for you.", agentId: agentB.id }
		const reply = () => post(apiA, `/escalations/${id}/replies`, agentA.headers, body)
		const messages = async () =>
			(
				await pool.query(
					"SELECT id, sender, agent_id, content FROM messages WHERE conversation_id = $1",
					[conversationId]
				)
			).rows
		const denied = await post(apiB, `/escalations/${id}/replies`, agentB.headers, body)
		expect(denied.status).toBe(409)
		await failAudit(id, "escalations.agent_replied", reply)
		expect(await messages()).toEqual([])
		expect(await audits(id, "escalations.agent_replied")).toEqual([])

		const open = async () => {
			const response = await request(apiB, `/customer/conversations/${conversationId}/events`, {
				headers: customer,
			})
			expect(response.status).toBe(200)
			expect(response.headers.get("content-type")).toContain("text/event-stream")
			return readSseFrames(response.body!)
		}
		const live = await open()
		const saved = { id: "", content: body.content, sender: "agent" }
		try {
			expect((await live.next()).value).toMatchObject({
				event: "status",
				data: '{"status":"agent_active"}',
			})
			const response = await reply()
			expect(response.status).toBe(201)
			saved.id = ((await response.json()) as { id: string }).id
			const frame = (await live.next()).value!
			expect(frame.event).toBe("message")
			expect(JSON.parse(frame.data!)).toMatchObject(saved)
		} finally {
			await live.return(undefined)
		}
		expect(await messages()).toEqual([{ ...saved, agent_id: agentA.id }])
		expect(await audits(id, "escalations.agent_replied")).toEqual([
			{ actor_id: agentA.id, after: { messageId: saved.id } },
		])
		const replay = await open()
		try {
			const frame = (await replay.next()).value!
			expect(frame.event).toBe("message")
			expect(JSON.parse(frame.data!)).toMatchObject(saved)
		} finally {
			await replay.return(undefined)
		}
	}, 30_000)
})

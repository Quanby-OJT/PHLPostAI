import Redis from "ioredis"
import { Client } from "pg"

import type {
	CustomerAnswer,
	ScamFinding,
	ScamReportDetail,
	ScamReportReceipt,
} from "@repo/contracts"

const API = "http://127.0.0.1:3020/api/v1"
const ORIGIN = "http://127.0.0.1:3021"
const ESCALATION_SETTINGS = ["escalation_rules", "escalation_business_hours"]
const suite = process.env.SCM3_QA_PASSWORD ? describe : describe.skip
jest.setTimeout(45_000)

type Assessment = CustomerAnswer & { scamSubmissionId: string }

async function call(
	path: string,
	method: string,
	body?: unknown,
	headers?: Record<string, string>
) {
	return fetch(API + path, {
		method,
		headers: {
			origin: ORIGIN,
			...headers,
			...(body === undefined ? {} : { "content-type": "application/json" }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(20_000),
	})
}

async function login(email: string) {
	const response = await call("/auth/sign-in/email", "POST", {
		email,
		password: process.env.SCM3_QA_PASSWORD,
	})
	expect(response.status).toBe(200)
	const cookie = response.headers
		.getSetCookie()
		.map(entry => entry.split(";")[0])
		.join("; ")
	expect(cookie).toBeTruthy()
	return { cookie }
}

async function customer() {
	const response = await call("/customer/session", "POST", {
		channelCode: "web-widget",
		language: "en",
	})
	expect(response.status).toBe(200)
	const { sessionToken } = (await response.json()) as { sessionToken: string }
	return { "x-customer-session": sessionToken }
}

async function assess(query: string, headers: Record<string, string>): Promise<Assessment> {
	const response = await call("/customer/chat/message", "POST", { intent: "scam", query }, headers)
	expect(response.status).toBe(200)
	const body = (await response.json()) as Assessment
	expect(body.scamSubmissionId).toMatch(/^[\da-f-]{36}$/)
	expect(body.answer).toContain("conclusive determinations of fraud")
	return body
}

suite("SCM-3 on isolated loopback PostgreSQL", () => {
	let database: Client
	let reviewer: Record<string, string>
	let reader: Record<string, string>
	let denied: Record<string, string>
	let session: Record<string, string>
	let otherSession: Record<string, string>
	let savedSettings: Map<string, unknown> | undefined
	const submissions: Assessment[] = []
	const reports: ScamReportReceipt[] = []

	beforeAll(async () => {
		const url = new URL(process.env.DATABASE_URL ?? "")
		if (
			url.hostname !== "127.0.0.1" ||
			url.port !== "5433" ||
			url.pathname !== "/phlpost_scm3_qa"
		) {
			throw new Error("SCM-3 tests require the dedicated local QA database")
		}
		database = new Client({ connectionString: url.toString() })
		await database.connect()
		expect((await database.query("select current_database() as name")).rows[0].name).toBe(
			"phlpost_scm3_qa"
		)
		const settings = await database.query<{ key: string; value: unknown }>(
			"select key, value from assistant_settings where key = any($1::text[])",
			[ESCALATION_SETTINGS]
		)
		savedSettings = new Map(settings.rows.map(({ key, value }) => [key, value]))
		await saveSetting("escalation_rules", {
			topics: [],
			keywords: [],
			categories: [],
			repeatedLowConfidenceCount: 2,
		})
		await setBusinessHours(true)
		;[reviewer, reader, denied] = await Promise.all([
			login("scm3.reviewer@example.test"),
			login("scm3.reader@example.test"),
			login("alex@turbo-template.local"),
		])
		session = await customer()
		otherSession = await customer()
	})

	afterAll(async () => {
		try {
			if (savedSettings) {
				for (const key of ESCALATION_SETTINGS) {
					if (savedSettings.has(key)) {
						await saveSetting(key, savedSettings.get(key))
					} else {
						await database.query("delete from assistant_settings where key = $1", [key])
					}
				}
			}
		} finally {
			await database?.end()
		}
	})

	function saveSetting(key: string, value: unknown) {
		return database.query(
			`insert into assistant_settings (key, value, updated_by)
			 values ($1, $2, (select id from users where email='scm3.reviewer@example.test'))
			 on conflict (key) do update set value = excluded.value`,
			[key, JSON.stringify(value)]
		)
	}

	function setBusinessHours(open: boolean) {
		return saveSetting("escalation_business_hours", {
			timezone: "Asia/Manila",
			days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
				day => ({
					day,
					open,
					start: "00:00",
					end: "23:59",
				})
			),
			holidays: [],
			waitLimitSeconds: 3600,
		})
	}

	function report(submissionId: string, headers = session, requestAgent = false) {
		return call("/customer/scam-reports", "POST", { submissionId, requestAgent }, headers)
	}
	function update(id: string, body: object, headers = reviewer) {
		return call(`/scam/reports/${id}/review`, "POST", body, headers)
	}

	it("AC1 reports high, uncertain and customer-selected medium results only after confirmation", async () => {
		const queries = [
			"PHLPost delivery notice for Juan Test. Contact 09170000000 or juan.test@example.com. Pay PHP 50 at https://fake-postal-delivery.example/pay.",
			"Your parcel delivery requires further verification. Please wait for another update.",
			"A parcel notice says pay a delivery fee.",
		]
		for (const query of queries) submissions.push(await assess(query, session))
		expect(submissions.map(answer => answer.scamAssessment?.riskLevel)).toEqual([
			"high",
			"uncertain",
			"medium",
		])
		const ids = submissions.map(answer => answer.scamSubmissionId)
		expect(
			(
				await database.query("select id from scam_reports where submission_id = any($1::uuid[])", [
					ids,
				])
			).rowCount
		).toBe(0)
		expect((await report(ids[0]!, otherSession)).status).toBe(404)
		expect((await call("/customer/scam-reports", "POST", { submissionId: ids[0] })).status).toBe(
			401
		)

		const firstPair = await Promise.all([
			report(ids[0]!, session, true),
			report(ids[0]!, session, true),
		])
		expect(firstPair.map(item => item.status)).toEqual([200, 200])
		const receipts = (await Promise.all(firstPair.map(item => item.json()))) as ScamReportReceipt[]
		expect(receipts[0]).toEqual(receipts[1])
		expect(receipts[0]?.handoff).toBe("queued")
		reports.push(receipts[0]!)
		for (const id of ids.slice(1)) {
			const response = await report(id)
			expect(response.status).toBe(200)
			reports.push((await response.json()) as ScamReportReceipt)
		}
		expect(new Set(reports.map(row => row.reference)).size).toBe(3)

		const rows = await database.query(
			"select id, status from scam_reports where submission_id = any($1::uuid[])",
			[ids]
		)
		expect(rows.rows).toHaveLength(3)
		expect(rows.rows.every(row => row.status === "reported")).toBe(true)
		const events = await database.query(
			"select payload from interaction_events where kind='scam_reported' and conversation_id = any($1::uuid[])",
			[submissions.map(answer => answer.conversationId)]
		)
		expect(events.rows).toEqual([{ payload: null }, { payload: null }, { payload: null }])
		const audit = await database.query(
			"select action from audit_log where action='scam.report.created' and resource_id = any($1::text[])",
			[reports.map(row => row.reference)]
		)
		expect(audit.rows).toHaveLength(3)
		const queue = await call("/scam/reports?page=1", "GET", undefined, reviewer)
		expect(queue.status).toBe(200)
		expect(await queue.json()).toHaveProperty("reports", expect.any(Array))
		const inbox = await call("/escalations", "GET", undefined, reviewer)
		expect(inbox.status).toBe(200)
		expect(await inbox.json()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					conversationId: submissions[0]!.conversationId,
					reason: "I want to speak with a person",
				}),
			])
		)
	})

	it("AC2 projects masked evidence and the original assessment without customer identifiers", async () => {
		const response = await call(
			`/scam/reports/${reports[0]!.reference}`,
			"GET",
			undefined,
			reviewer
		)
		expect(response.status).toBe(200)
		const detail = (await response.json()) as ScamReportDetail
		expect(detail.contentMasked).toMatch(/\[NAME\].*\[PHONE\].*\[EMAIL\]/)
		expect(detail.extractedUrls).toEqual(["[UNOFFICIAL_URL]"])
		expect(detail.indicators).toEqual(["payment_request", "unofficial_domain"])
		expect(detail).toMatchObject({ riskLevel: "high", confidence: 1, status: "reported" })
		expect(JSON.stringify(detail)).not.toMatch(
			/Juan Test|09170000000|juan\.test@|fake-postal-delivery\.example/
		)
		expect(detail).not.toHaveProperty("customerSessionId")
	})

	it("AC3 records all three findings and preserves the review at closure", async () => {
		const outcomes: ScamFinding[] = ["confirmed_scam", "legitimate", "inconclusive"]
		for (const [index, finding] of outcomes.entries()) {
			const { reference } = reports[index]!
			const started = await update(reference, { action: "start_review" })
			expect(started.status).toBe(200)
			expect(await started.json()).toMatchObject({ status: "under_review", finding: null })
			const saved = await update(reference, {
				action: "record_finding",
				finding,
				notes: "Reviewed synthetic evidence.",
			})
			expect(saved.status).toBe(200)
			expect(await saved.json()).toMatchObject({
				status: finding,
				finding,
				notes: "Reviewed synthetic evidence.",
			})
		}
		const closed = await update(reports[0]!.reference, { action: "close" })
		expect(closed.status).toBe(200)
		expect(await closed.json()).toMatchObject({
			status: "closed",
			finding: "confirmed_scam",
			notes: "Reviewed synthetic evidence.",
		})
		const audits = await database.query(
			"select actor_id, before, after from audit_log where action='scam.report.status_changed' and resource_id = any($1::text[]) order by id",
			[reports.map(row => row.reference)]
		)
		expect(audits.rows).toHaveLength(7)
		expect(audits.rows.every(row => row.actor_id === "e2e-user-a")).toBe(true)
		expect(audits.rows[1].after).toMatchObject({
			status: "confirmed_scam",
			finding: "confirmed_scam",
		})
		expect(JSON.stringify(audits.rows)).not.toContain("Reviewed synthetic evidence.")
	})

	it("AC4 allows read-only staff to read and audits denied review writes", async () => {
		const reference = reports[0]!.reference
		expect((await call("/scam/reports", "GET", undefined, reader)).status).toBe(200)
		expect((await call(`/scam/reports/${reference}`, "GET", undefined, reader)).status).toBe(200)
		expect(
			(
				await update(
					reference,
					{ action: "record_finding", finding: "legitimate", notes: "Rejected" },
					reader
				)
			).status
		).toBe(403)
		const audit = await database.query(
			"select after from audit_log where actor_id='e2e-user-b' and action='rbac.denied' and resource_id like $1 order by id desc limit 1",
			[`%/scam/reports/${reference}/review`]
		)
		expect(audit.rows[0]?.after).toMatchObject({ outcome: "denied" })
	})

	it("AC5 denies queue and detail without exposing evidence or writing a report", async () => {
		const reference = reports[0]!.reference
		const before = await database.query(
			"select status, finding, notes, updated_at from scam_reports where id=$1",
			[reference]
		)
		const queue = await call("/scam/reports", "GET", undefined, denied)
		const detail = await call(`/scam/reports/${reference}`, "GET", undefined, denied)
		expect([queue.status, detail.status]).toEqual([403, 403])
		expect(await detail.json()).not.toHaveProperty("contentMasked")
		expect((await call("/scam/reports", "GET")).status).toBe(401)
		const audit = await database.query(
			"select resource_id, after from audit_log where actor_id='seed-user-alex' and action='rbac.denied' and resource_id like '%/scam/reports%' order by id desc limit 2"
		)
		expect(audit.rows).toHaveLength(2)
		expect(audit.rows.every(row => row.after?.outcome === "denied")).toBe(true)
		const after = await database.query(
			"select status, finding, notes, updated_at from scam_reports where id=$1",
			[reference]
		)
		expect(after.rows).toEqual(before.rows)
	})

	it("rolls back report creation when the requested handoff cannot be created", async () => {
		const answer = await assess("A parcel notice says pay a delivery fee.", otherSession)
		expect(
			(
				await call(
					"/customer/conversations/end",
					"POST",
					{ conversationId: answer.conversationId },
					otherSession
				)
			).status
		).toBe(200)
		expect((await report(answer.scamSubmissionId, otherSession, true)).status).toBe(409)
		const partial = await database.query(
			`select (select count(*)::int from scam_reports where submission_id=$1) as reports,
			         (select count(*)::int from interaction_events
			          where conversation_id=$2 and kind='scam_reported') as events`,
			[answer.scamSubmissionId, answer.conversationId]
		)
		expect(partial.rows).toEqual([{ reports: 0, events: 0 }])
		const created = await report(answer.scamSubmissionId, otherSession)
		expect(created.status).toBe(200)
		const retry = await report(answer.scamSubmissionId, otherSession, true)
		expect(retry.status).toBe(200)
		expect(await retry.json()).toEqual(await created.json())
	})

	it("allows only one concurrent finding and retains the winning review", async () => {
		const answer = await assess("A parcel notice says pay a delivery fee.", otherSession)
		const submitted = await report(answer.scamSubmissionId, otherSession)
		expect(submitted.status).toBe(200)
		const { reference } = (await submitted.json()) as ScamReportReceipt
		expect((await update(reference, { action: "start_review" })).status).toBe(200)

		const changes = await Promise.all([
			update(reference, {
				action: "record_finding",
				finding: "legitimate",
				notes: "First review.",
			}),
			update(reference, {
				action: "record_finding",
				finding: "inconclusive",
				notes: "Second review.",
			}),
		])
		expect(changes.map(response => response.status).sort()).toEqual([200, 409])
		const winningChange = await changes.find(response => response.status === 200)?.json()
		const rows = await database.query(
			"select status, finding, notes from scam_reports where id=$1",
			[reference]
		)
		expect(winningChange).toMatchObject(rows.rows[0])
		const audited = await database.query(
			`select id from audit_log where action='scam.report.status_changed'
			 and resource_id=$1 and "before"->>'status'='under_review'`,
			[reference]
		)
		expect(audited.rowCount).toBe(1)
	})

	it("moves an unclaimed SCM-3 handoff offline and records the ESC-3 missed event", async () => {
		const waitingSession = await customer()
		const answer = await assess("A parcel notice says pay a delivery fee.", waitingSession)
		const response = await report(answer.scamSubmissionId, waitingSession, true)
		expect(response.status).toBe(200)
		expect(await response.json()).toHaveProperty("handoff", "queued")
		await database.query(
			"update escalations set created_at = now() - interval '2 hours' where conversation_id=$1",
			[answer.conversationId]
		)
		const events = async () =>
			(
				await database.query(
					"select kind from interaction_events where conversation_id=$1 and kind in ('scam_reported', 'escalation_missed') order by kind",
					[answer.conversationId]
				)
			).rows
		let seen = await events()
		for (let attempt = 0; attempt < 40 && seen.length < 2; attempt++) {
			await new Promise(resolve => setTimeout(resolve, 500))
			seen = await events()
		}
		expect(seen).toEqual([{ kind: "escalation_missed" }, { kind: "scam_reported" }])
		const statuses = await database.query(
			"select e.status as escalation, c.status as conversation from escalations e join conversations c on c.id=e.conversation_id where c.id=$1",
			[answer.conversationId]
		)
		expect(statuses.rows).toEqual([
			{ escalation: "contact_captured", conversation: "contact_captured" },
		])
	})

	it("returns the offline handoff, publishes committed data and accepts an encrypted contact", async () => {
		await setBusinessHours(false)
		const offlineSession = await customer()
		const answer = await assess("A parcel notice says pay a delivery fee.", offlineSession)
		const topic = `conversation-live:${answer.conversationId}`
		const subscriber = new Redis("redis://127.0.0.1:6380/14", {
			lazyConnect: true,
			retryStrategy: () => null,
		})
		const readEscalation = () =>
			database.query(
				`select e.id, e.status, e.contact, c.status as conversation_status,
				 (select count(*)::int from scam_reports where submission_id=$1) as reports
				 from escalations e join conversations c on c.id=e.conversation_id
				 where e.conversation_id=$2`,
				[answer.scamSubmissionId, answer.conversationId]
			)
		let notification: ReturnType<typeof readEscalation> | undefined
		try {
			subscriber.once("message", () => {
				notification = readEscalation()
			})
			await subscriber.subscribe(topic)
			const submissions = await Promise.all([
				report(answer.scamSubmissionId, offlineSession, true),
				report(answer.scamSubmissionId, offlineSession, true),
			])
			expect(submissions.map(response => response.status)).toEqual([200, 200])
			const [first, retry] = (await Promise.all(
				submissions.map(response => response.json())
			)) as ScamReportReceipt[]
			expect(first).toEqual(retry)
			expect(first?.handoff).toBe("contact_captured")
			for (let attempt = 0; attempt < 20 && !notification; attempt++) {
				await new Promise(resolve => setTimeout(resolve, 100))
			}
			expect(notification).toBeDefined()
			const rows = (await notification)?.rows
			expect(rows).toEqual([
				{
					id: expect.any(String),
					status: "contact_captured",
					conversation_status: "contact_captured",
					reports: 1,
					contact: null,
				},
			])
			const escalationId = rows![0].id
			const audit = await database.query(
				"select \"after\" from audit_log where action='escalations.requested' and resource_id=$1",
				[escalationId]
			)
			expect(audit.rows).toEqual([{ after: expect.objectContaining({ offline: true }) }])
			const contact = "scm3-callback@example.test"
			const captured = await call(
				"/customer/escalations/contact",
				"POST",
				{ conversationId: answer.conversationId, contact },
				offlineSession
			)
			expect(captured.ok).toBe(true)
			expect(await captured.json()).toEqual({ status: "contact_captured", contactProvided: true })
			const stored = (await readEscalation()).rows[0].contact
			expect(stored).toMatch(/^v1\./)
			expect(stored).not.toContain(contact)
			expect(
				(await call(`/escalations/${escalationId}/contact`, "GET", undefined, reader)).status
			).toBe(403)
		} finally {
			subscriber.disconnect()
		}
	})
})

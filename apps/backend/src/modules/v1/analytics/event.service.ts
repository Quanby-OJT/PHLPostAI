import { Injectable } from "@nestjs/common"

import type { InteractionEventKind } from "@repo/contracts"
import { interactionEvents } from "@repo/db/schema"

import { db } from "@/common/database/database.client"

type EventWriter = Pick<typeof db, "insert">

export interface RecordInteractionEventInput {
	conversationId: string
	kind: InteractionEventKind
	category: string
	language: string
	channelCode: string
	payload?: InteractionEventPayload | null
}

/** Non-text metadata allowed in analytics event payloads (ANL-3). */
export interface InteractionEventPayload {
	eligible?: boolean
	failed?: boolean
	turnIndex?: number
	answerKind?: "answer" | "uncertain" | "refusal" | "tool"
	outcome?: "resolved_by_ai" | "unresolved"
	lastEligibleTurn?: number | null
	sessionFingerprint?: string
	testSession?: boolean
  response_time_ms?: number
}

/** Sole writer for `interaction_events`; payloads are restricted to validated non-text metadata. */
@Injectable()
export class EventService {
	async record(input: RecordInteractionEventInput, writer: EventWriter = db): Promise<void> {
		if (
			input.payload?.response_time_ms !== undefined &&
			(!Number.isFinite(input.payload.response_time_ms) || input.payload.response_time_ms < 0)
		) {
			throw new Error("Interaction event response time must be a non-negative number")
		}
		if (
			input.language !== "unsupported" &&
			!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(input.language)
		) {
			throw new Error("Interaction event language must be a language code")
		}
		if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.channelCode)) {
			throw new Error("Interaction event channel must be a channel code")
		}
		if (input.category && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.category)) {
			throw new Error("Interaction event category must be a validated category code")
		}
		const allowedPayloadKeys = new Set([
			"eligible",
			"failed",
			"turnIndex",
			"answerKind",
			"outcome",
			"lastEligibleTurn",
			"sessionFingerprint",
			"testSession",
		])
		if (input.payload && Object.keys(input.payload).some(key => !allowedPayloadKeys.has(key))) {
			throw new Error("Interaction event payload contains unsupported metadata")
		}
		if (
			input.payload?.answerKind &&
			!["answer", "uncertain", "refusal", "tool"].includes(input.payload.answerKind)
		) {
			throw new Error("Interaction event answer kind is invalid")
		}
		if (
			input.payload?.outcome &&
			!["resolved_by_ai", "unresolved"].includes(input.payload.outcome)
		) {
			throw new Error("Interaction event outcome is invalid")
		}
		if (
			input.payload?.turnIndex !== undefined &&
			(!Number.isInteger(input.payload.turnIndex) || input.payload.turnIndex < 0)
		) {
			throw new Error("Interaction event turn index must be a non-negative integer")
		}
		if (
			input.payload?.lastEligibleTurn !== undefined &&
			input.payload.lastEligibleTurn !== null &&
			(!Number.isInteger(input.payload.lastEligibleTurn) || input.payload.lastEligibleTurn < 0)
		) {
			throw new Error("Interaction event eligible turn must be a non-negative integer")
		}
		if (
			input.payload?.sessionFingerprint !== undefined &&
			!/^[a-f0-9]{32}$/.test(input.payload.sessionFingerprint)
		) {
			throw new Error("Interaction event session fingerprint must be a stable hex digest")
		}

		await writer.insert(interactionEvents).values({
			conversationId: input.conversationId,
			kind: input.kind,
			category: input.category,
			language: input.language,
			channelCode: input.channelCode,
			payload: input.payload ? { ...input.payload } : null,
		})
	}
}

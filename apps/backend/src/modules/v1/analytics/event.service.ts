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
}

/** Sole writer for `interaction_events`; every record contains codes only. */
@Injectable()
export class EventService {
	async record(input: RecordInteractionEventInput, writer: EventWriter = db): Promise<void> {
		if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(input.language)) {
			throw new Error("Interaction event language must be a language code")
		}
		if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.channelCode)) {
			throw new Error("Interaction event channel must be a channel code")
		}
		if (input.category && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.category)) {
			throw new Error("Interaction event category must be a validated category code")
		}

		await writer.insert(interactionEvents).values({
			conversationId: input.conversationId,
			kind: input.kind,
			category: input.category,
			language: input.language,
			channelCode: input.channelCode,
			payload: null,
		})
	}
}

import type { TrackingEvent } from "./tracking-source"

export const TRACKING_REPLIES = {
	missing:
		"I can check that for you. Please send your tracking number. It usually looks like RR123456789PH.",
	malformed:
		"That doesn't look like a valid tracking number. Please check it and send it again. It usually looks like RR123456789PH.",
	notFound:
		"I couldn't find a record for that tracking number. Please check that it matches the number on your receipt and try again.",
	unavailable:
		"I can't reach the tracking system right now. Please try again in a few minutes, or ask to talk to a person.",
	customs:
		"Your item is being processed by the Bureau of Customs. PHLPost does not decide when Customs releases it.",
} as const

export interface ReplyExplanation {
	explanation: string
	nextSteps: string | null
}

/** The official status always comes first and unchanged; the explanation is appended (TRK-2). */
export function foundReply(
	event: TrackingEvent,
	options: { explanation?: ReplyExplanation | null; customs?: boolean } = {}
): string {
	const lines = [
		"Here is the latest status from the PHLPost tracking system:",
		`Status: ${event.description}`,
		`Location: ${event.location}`,
		`Time: ${event.occurredAt}`,
	]
	const extra: string[] = []
	if (options.explanation) {
		extra.push(`What this means: ${options.explanation.explanation}`)
		if (options.explanation.nextSteps) extra.push(`Next steps: ${options.explanation.nextSteps}`)
	}
	if (options.customs) extra.push(TRACKING_REPLIES.customs)
	return extra.length ? [...lines, "", ...extra].join("\n") : lines.join("\n")
}

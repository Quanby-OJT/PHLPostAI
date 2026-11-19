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
} as const

export function foundReply(event: TrackingEvent): string {
	return [
		"Here is the latest status from the PHLPost tracking system:",
		`Status: ${event.description}`,
		`Location: ${event.location}`,
		`Time: ${event.occurredAt}`,
	].join("\n")
}

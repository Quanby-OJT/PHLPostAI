export interface TrackingEvent {
	statusCode: string
	description: string
	location: string
	occurredAt: string
}

/** A tracking connector. Returns null when the source has no record of the number. */
export interface TrackingSource {
	readonly code: string
	lookup(trackingNumber: string, signal: AbortSignal): Promise<TrackingEvent | null>
}

export const TRACKING_SOURCES = Symbol("TRACKING_SOURCES")

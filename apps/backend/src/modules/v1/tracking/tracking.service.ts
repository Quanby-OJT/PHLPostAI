import { Inject, Injectable, Logger } from "@nestjs/common"

import { TrackingConnectorRegistry } from "./tracking-connector.registry"
import {
	hashTrackingNumber,
	maskTrackingNumber,
	mentionsTracking,
	scanForTrackingNumber,
} from "./tracking-number"
import type { TrackingEvent, TrackingSource } from "./tracking-source"
import { TRACKING_CONFIG, type TrackingConfig } from "./tracking.config"
import { foundReply, TRACKING_REPLIES } from "./tracking.replies"
import type { TrackingLookupRecord } from "./tracking.repository"

export interface TrackingAnswer {
	reply: string
	/** The screened question with the tracking number replaced, safe to store. */
	storedQuery: string
	/** Null when no lookup was made (no number, or a malformed one). */
	lookup: TrackingLookupRecord | null
}

type LookupResult =
	| { outcome: "found"; event: TrackingEvent }
	| { outcome: "not_found" }
	| { outcome: "unavailable" }

/** Flow B steps 1 to 3: extract the number, look it up with a hard timeout, word the reply. */
@Injectable()
export class TrackingService {
	private readonly logger = new Logger(TrackingService.name)
	private readonly source: TrackingSource

	constructor(
		registry: TrackingConnectorRegistry,
		@Inject(TRACKING_CONFIG) private readonly config: TrackingConfig
	) {
		this.source = registry.get(config.connectorCode)
	}

	/** Stand-in routing until CNV-2 classifies messages into the `tracking` category. */
	isTrackingQuestion(text: string): boolean {
		return (
			scanForTrackingNumber(text, this.config.numberPattern).kind === "number" ||
			mentionsTracking(text, this.config.keywords)
		)
	}

	async answer(screenedQuery: string): Promise<TrackingAnswer> {
		const scan = scanForTrackingNumber(screenedQuery, this.config.numberPattern)
		const storedQuery = maskTrackingNumber(screenedQuery, scan)

		if (scan.kind === "missing") {
			return { reply: TRACKING_REPLIES.missing, storedQuery, lookup: null }
		}
		if (scan.kind === "malformed") {
			return { reply: TRACKING_REPLIES.malformed, storedQuery, lookup: null }
		}

		const started = Date.now()
		const result = await this.lookupWithTimeout(scan.trackingNumber)
		const lookup: TrackingLookupRecord = {
			connectorCode: this.source.code,
			trackingNumberHash: hashTrackingNumber(scan.trackingNumber, this.config.hashSecret),
			outcome: result.outcome,
			statusCode: result.outcome === "found" ? result.event.statusCode : null,
			latencyMs: Date.now() - started,
		}

		const reply =
			result.outcome === "found"
				? foundReply(result.event)
				: result.outcome === "not_found"
					? TRACKING_REPLIES.notFound
					: TRACKING_REPLIES.unavailable
		return { reply, storedQuery, lookup }
	}

	private async lookupWithTimeout(trackingNumber: string): Promise<LookupResult> {
		const controller = new AbortController()
		let timer: NodeJS.Timeout | undefined
		const timedOut = new Promise<"timeout">(resolve => {
			timer = setTimeout(() => resolve("timeout"), this.config.timeoutMs)
		})

		try {
			const event = await Promise.race([
				this.source.lookup(trackingNumber, controller.signal),
				timedOut,
			])
			if (event === "timeout") {
				controller.abort()
				this.logger.warn(
					`Tracking connector "${this.source.code}" did not answer within ${this.config.timeoutMs}ms`
				)
				return { outcome: "unavailable" }
			}
			return event ? { outcome: "found", event } : { outcome: "not_found" }
		} catch (error) {
			this.logger.warn(
				`Tracking connector "${this.source.code}" failed: ${error instanceof Error ? error.message : "unknown error"}`
			)
			return { outcome: "unavailable" }
		} finally {
			clearTimeout(timer)
		}
	}
}

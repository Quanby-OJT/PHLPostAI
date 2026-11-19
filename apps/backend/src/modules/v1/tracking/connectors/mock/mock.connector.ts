import { Injectable } from "@nestjs/common"

import type { TrackingEvent, TrackingSource } from "../../tracking-source"
import { MOCK_RECORDS } from "./mock.records"

@Injectable()
export class MockTrackingSource implements TrackingSource {
	readonly code = "mock"

	lookup(trackingNumber: string, signal: AbortSignal): Promise<TrackingEvent | null> {
		const record = MOCK_RECORDS[trackingNumber]
		if (record === "timeout") {
			return new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(new Error("Lookup aborted")), { once: true })
			})
		}
		if (!record) return Promise.resolve(null)
		return Promise.resolve({
			statusCode: record.code,
			description: record.text,
			location: record.office,
			occurredAt: record.at,
		})
	}
}

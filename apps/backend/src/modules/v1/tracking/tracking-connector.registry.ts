import { Inject, Injectable } from "@nestjs/common"

import { TRACKING_SOURCES, type TrackingSource } from "./tracking-source"

@Injectable()
export class TrackingConnectorRegistry {
	private readonly sources: Map<string, TrackingSource>

	constructor(@Inject(TRACKING_SOURCES) sources: TrackingSource[]) {
		this.sources = new Map(sources.map(source => [source.code, source]))
	}

	get(code: string): TrackingSource {
		const source = this.sources.get(code)
		if (!source) {
			throw new Error(
				`Unknown tracking connector "${code}". Available: ${[...this.sources.keys()].join(", ")}`
			)
		}
		return source
	}
}

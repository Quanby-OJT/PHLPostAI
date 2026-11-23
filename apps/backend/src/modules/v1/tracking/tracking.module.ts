import { Module } from "@nestjs/common"

import { MockTrackingSource } from "./connectors/mock/mock.connector"
import { StatusExplanationsController } from "./status-explanations.controller"
import { StatusExplanationsRepository } from "./status-explanations.repository"
import { StatusExplanationsService } from "./status-explanations.service"
import { TrackingConnectorRegistry } from "./tracking-connector.registry"
import { TRACKING_SOURCES, type TrackingSource } from "./tracking-source"
import { TRACKING_CONFIG, trackingConfigFromEnv } from "./tracking.config"
import { TrackingRepository } from "./tracking.repository"
import { TrackingService } from "./tracking.service"

/** New connectors are added to TRACKING_SOURCES and chosen with TRACKING_CONNECTOR. */
@Module({
	controllers: [StatusExplanationsController],
	providers: [
		MockTrackingSource,
		{
			provide: TRACKING_SOURCES,
			useFactory: (mock: MockTrackingSource): TrackingSource[] => [mock],
			inject: [MockTrackingSource],
		},
		{ provide: TRACKING_CONFIG, useFactory: trackingConfigFromEnv },
		TrackingConnectorRegistry,
		TrackingService,
		TrackingRepository,
		StatusExplanationsRepository,
		StatusExplanationsService,
	],
	exports: [TrackingService, TrackingRepository],
})
export class TrackingModule {}

import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { AnalyticsController } from "./analytics.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({ implement: () => ({ handler: () => undefined }) }))
jest.mock("@/config/api-versions.config", () => ({ v1: { analytics: { overview: {} } } }))
jest.mock("./analytics-overview.service", () => ({ AnalyticsOverviewService: class {} }))

describe("AnalyticsController", () => {
	it("requires analytics.dashboard.view on the overview endpoint", () => {
		const handler = AnalyticsController.prototype.overview
		expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
			"analytics.dashboard.view",
		])
	})
})

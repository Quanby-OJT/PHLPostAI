import { REQUIRED_PERMISSIONS_KEY } from "@/shared/decorators/require-permissions.decorator"

import { AnalyticsController } from "./analytics.controller"

jest.mock("@orpc/nest", () => ({ Implement: () => () => undefined }))
jest.mock("@orpc/server", () => ({ implement: () => ({ handler: () => undefined }) }))
jest.mock("@thallesp/nestjs-better-auth", () => ({ Session: () => () => undefined }))
jest.mock("@/config/api-versions.config", () => ({
	v1: {
		analytics: {
			overview: {},
			deflectionReport: {},
			deflectionDrilldown: {},
			listKpiDefinitions: {},
			saveKpiDefinition: {},
		},
	},
}))
jest.mock("./analytics-overview.service", () => ({ AnalyticsOverviewService: class {} }))
jest.mock("./deflection-kpi.service", () => ({ DeflectionKpiService: class {} }))

describe("AnalyticsController", () => {
	it.each(["overview", "dashboard", "getLayout", "saveLayout"])(
		"requires analytics.dashboard.view on %s",
		method => {
			const handler = AnalyticsController.prototype[method as keyof AnalyticsController]
			expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
				"analytics.dashboard.view",
			])
		}
	)
})

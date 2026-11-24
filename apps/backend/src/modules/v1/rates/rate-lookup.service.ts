import { Injectable, Logger } from "@nestjs/common"

import { RagGatewayService } from "@/modules/v1/corpus/rag-gateway.service"

import { missingDetailsReply, noRateReply, quoteReply } from "./rates.replies"
import { RatesRepository } from "./rates.repository"

export interface RateLookupContext {
	principal: string
	permissions: readonly string[]
	correlationId: string
}

export interface RateAnswer {
	reply: string
	outcome: "quoted" | "missing_details" | "no_rate"
}

/** Today's date in the Philippines (YYYY-MM-DD); rates take effect by local date. */
export function manilaToday(now = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now)
}

/**
 * KB-2 rate lookup tool (PRD D4). The model only reads service, zone and weight
 * from the question; the price, service name and effective date come from the
 * approved rate table. No matching entry means no price is quoted.
 */
@Injectable()
export class RateLookupService {
	private readonly logger = new Logger(RateLookupService.name)

	constructor(
		private readonly repository: RatesRepository,
		private readonly ragGatewayService: RagGatewayService
	) {}

	async answer(
		text: string,
		context: RateLookupContext,
		today = manilaToday()
	): Promise<RateAnswer> {
		const catalog = await this.repository.catalog(today)
		if (catalog.services.length === 0) return { reply: noRateReply(), outcome: "no_rate" }

		const extracted = await this.extract(text, catalog, context)
		const service =
			catalog.services.find(item => item.code === extracted.serviceCode) ??
			(catalog.services.length === 1 ? catalog.services[0] : undefined)
		const zone = catalog.zones.find(item => item.toLowerCase() === extracted.zone?.toLowerCase())
		const weightG =
			extracted.weightG !== null && Number.isInteger(extracted.weightG) && extracted.weightG > 0
				? extracted.weightG
				: null

		const missing = [
			...(service ? [] : (["service"] as const)),
			...(zone ? [] : (["destination"] as const)),
			...(weightG ? [] : (["weight"] as const)),
		]
		if (!service || !zone || !weightG) {
			return {
				reply: missingDetailsReply({
					missing,
					services: catalog.services.map(item => item.name),
					zones: catalog.zones,
				}),
				outcome: "missing_details",
			}
		}

		const entry = await this.repository.findRate({
			serviceCode: service.code,
			zone,
			weightG,
			date: today,
		})
		if (!entry) {
			return {
				reply: noRateReply({ serviceName: service.name, zone, weightG }),
				outcome: "no_rate",
			}
		}
		return {
			reply: quoteReply({
				serviceName: entry.serviceName,
				zone: entry.zone,
				weightG,
				priceCentavos: entry.priceCentavos,
				effectiveFrom: entry.effectiveFrom,
			}),
			outcome: "quoted",
		}
	}

	private async extract(
		text: string,
		catalog: { services: { code: string; name: string }[]; zones: string[] },
		context: RateLookupContext
	): Promise<{ serviceCode: string | null; zone: string | null; weightG: number | null }> {
		try {
			return await this.ragGatewayService.extractRateQuery({
				text,
				services: catalog.services,
				zones: catalog.zones,
				userId: context.principal,
				permissions: context.permissions,
				requestId: context.correlationId,
				traceId: context.correlationId,
			})
		} catch (error) {
			this.logger.warn(
				`Rate question extraction failed: ${error instanceof Error ? error.message : "unknown error"}`
			)
			return { serviceCode: null, zone: null, weightG: null }
		}
	}
}

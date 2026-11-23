import { env } from "@/config/env.config"

export interface TrackingConfig {
	connectorCode: string
	timeoutMs: number
	numberPattern: RegExp
	keywords: string[]
	hashSecret: string
	customsStatusCodes: string[]
}

export const TRACKING_CONFIG = Symbol("TRACKING_CONFIG")

export function trackingConfigFromEnv(): TrackingConfig {
	return {
		connectorCode: env.TRACKING_CONNECTOR,
		timeoutMs: env.TRACKING_LOOKUP_TIMEOUT_MS,
		numberPattern: new RegExp(env.TRACKING_NUMBER_PATTERN),
		keywords: env.TRACKING_KEYWORDS.split(",")
			.map(keyword => keyword.trim().toLowerCase())
			.filter(Boolean),
		hashSecret: env.TRACKING_NUMBER_HASH_SECRET ?? env.BETTER_AUTH_SECRET,
		customsStatusCodes: env.TRACKING_CUSTOMS_STATUS_CODES.split(",")
			.map(code => code.trim().toUpperCase())
			.filter(Boolean),
	}
}

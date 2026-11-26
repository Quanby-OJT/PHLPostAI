export function setAuthRateLimitStorage(): void {}

export function createMemoryRateLimitStorage() {
	return { consume: async () => ({ allowed: true, retryAfter: null }) }
}

export const rateLimitStorage = {
	consume: async () => ({ allowed: true, retryAfter: null }),
}

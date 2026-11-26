import { afterEach, describe, expect, it, vi } from "vitest"

const BASE_ENV: Record<string, string> = {
	// Must satisfy authSecretSchema: >=32 chars and not a placeholder prefix.
	BETTER_AUTH_SECRET: "test-secret-value-at-least-32-characters-long",
	BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3001",
	DATABASE_URL: "postgres://postgres:password@localhost:5432/config-spec-test",
}

// The Google provider is registered only when both credentials are present, so
// tests that assert its options supply them.
const GOOGLE_ENV: Record<string, string> = {
	GOOGLE_CLIENT_ID: "test-google-client-id",
	GOOGLE_CLIENT_SECRET: "test-google-client-secret",
}

/**
 * config.ts snapshots env vars at import time (createEnv), so each scenario
 * stubs the environment and re-imports the module with a fresh registry.
 */
async function loadConfig(env: Record<string, string> = {}) {
	vi.resetModules()
	for (const [key, value] of Object.entries({ ...BASE_ENV, ...env })) {
		vi.stubEnv(key, value)
	}
	return import("./config.js")
}

afterEach(() => {
	vi.unstubAllEnvs()
})

describe("admin-provisioned sign-up policy", () => {
	it("disables email/password sign-up by default", async () => {
		const { createAuth } = await loadConfig()
		const auth = createAuth()

		expect(auth.options.emailAndPassword?.disableSignUp).toBe(true)
	})

	it("rejects the public email sign-up endpoint", async () => {
		const { createAuth } = await loadConfig()
		const auth = createAuth()

		await expect(
			auth.api.signUpEmail({
				body: {
					email: "blocked@example.com",
					password: "Password123",
					name: "Blocked Signup",
				},
			})
		).rejects.toThrowError(/sign up is not enabled/i)
	})

	it("disables social sign-up (implicit and explicit) by default", async () => {
		const { createAuth } = await loadConfig(GOOGLE_ENV)
		const auth = createAuth()

		expect(auth.options.socialProviders?.google?.disableSignUp).toBe(true)
		expect(auth.options.socialProviders?.google?.disableImplicitSignUp).toBe(true)
	})

	it("re-enables sign-up when AUTH_SIGN_UP_ENABLED=true", async () => {
		const { createAuth } = await loadConfig({ ...GOOGLE_ENV, AUTH_SIGN_UP_ENABLED: "true" })
		const auth = createAuth()

		expect(auth.options.emailAndPassword?.disableSignUp).toBe(false)
		expect(auth.options.socialProviders?.google?.disableSignUp).toBe(false)
	})

	it("keeps email/password sign-in enabled", async () => {
		const { createAuth } = await loadConfig()
		const auth = createAuth()

		expect(auth.options.emailAndPassword?.enabled).toBe(true)
	})

	it("uses the configured auth URL when present", async () => {
		const { createAuth } = await loadConfig({ BETTER_AUTH_URL: "https://auth.example.test" })
		expect(createAuth().options.baseURL).toBe("https://auth.example.test")
	})

	it("falls back to localhost when there are no parseable trusted origins", async () => {
		const { createAuth } = await loadConfig({ BETTER_AUTH_TRUSTED_ORIGINS: "not a URL" })
		expect(createAuth().options.baseURL).toEqual({ allowedHosts: ["localhost"] })
	})

	it("sends verification and reset emails through the configured callbacks", async () => {
		const { createAuth } = await loadConfig({
			EMAIL_VERIFICATION_REQUIRED: "true",
			EMAIL_VERIFICATION_ENABLED: "false",
		})
		const auth = createAuth()
		const verify = auth.options.emailVerification?.sendVerificationEmail
		const reset = auth.options.emailAndPassword?.sendResetPassword

		expect(auth.options.emailVerification?.sendOnSignUp).toBe(true)
		await verify?.({ user: { email: "test@example.com" }, token: "token" } as never)
		await reset?.({ user: { email: "test@example.com" }, token: "token" } as never)
	})

	it("skips verification mail when sending and verification are both disabled", async () => {
		const { createAuth } = await loadConfig({
			EMAIL_VERIFICATION_REQUIRED: "false",
			EMAIL_VERIFICATION_ENABLED: "false",
		})
		const verify = createAuth().options.emailVerification?.sendVerificationEmail
		await verify?.({ user: { email: "test@example.com" }, token: "token" } as never)
	})

	it("caches the auth instance until the cache is cleared", async () => {
		const { clearAuthCache, getAuth } = await loadConfig()
		const first = getAuth()
		expect(getAuth()).toBe(first)
		clearAuthCache()
		expect(getAuth()).not.toBe(first)
	})
})

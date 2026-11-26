/**
 * ADM-2: second-factor policy. The lockout, the storage of recovery codes, the enrolment-session
 * lifetime, and the rule that no sign-in may skip the code through a trusted device.
 */
import { describe, expect, it } from "vitest"

import {
	buildMfaPlugin,
	MFA_ENROLMENT_SESSION_SECONDS,
	MFA_PLUGIN_OPTIONS,
	MFA_VERIFY_PATHS,
	mfaTrustDeviceBlockHandler,
} from "./mfa.js"

describe("ADM-2 second-factor policy", () => {
	it("locks verification after five wrong codes for 15 minutes", () => {
		expect(MFA_PLUGIN_OPTIONS.accountLockout).toEqual({
			enabled: true,
			maxFailedAttempts: 5,
			durationSeconds: 15 * 60,
		})
	})

	it("stores recovery codes encrypted and never activates a factor before a code is verified", () => {
		expect(MFA_PLUGIN_OPTIONS.backupCodeOptions.storeBackupCodes).toBe("encrypted")
		expect(MFA_PLUGIN_OPTIONS.skipVerificationOnEnable).toBe(false)
		expect(buildMfaPlugin().id).toBe("two-factor")
	})

	it("gives a non-enrolled account a 15 minute enrolment session only", () => {
		expect(MFA_ENROLMENT_SESSION_SECONDS).toBe(15 * 60)
	})

	it("forces trustDevice off on every verify route", async () => {
		for (const path of MFA_VERIFY_PATHS) {
			const result = (await mfaTrustDeviceBlockHandler({
				path,
				body: { code: "123456", trustDevice: true },
			} as never)) as { context: { body: { trustDevice: boolean; code: string } } }
			expect(result.context.body).toEqual({ code: "123456", trustDevice: false })
		}
	})

	it("leaves other routes untouched", async () => {
		const result = await mfaTrustDeviceBlockHandler({
			path: "/sign-in/email",
			body: { trustDevice: true },
		} as never)
		expect(result).toBeUndefined()
	})
})

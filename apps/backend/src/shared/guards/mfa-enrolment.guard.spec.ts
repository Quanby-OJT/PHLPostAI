/**
 * ADM-2: the second-factor gate refuses every route to a staff session whose account has
 * not confirmed an authenticator app, and leaves enrolled sessions, public routes, API-key
 * requests and anonymous requests to the other guards.
 */
import { ForbiddenException, type ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { MfaEnrolmentGuard } from "./mfa-enrolment.guard"
import { resolveRequestSession } from "./resolve-request-session"

jest.mock("./resolve-request-session", () => ({
	resolveRequestSession: jest.fn(),
}))

const resolveMock = resolveRequestSession as jest.MockedFunction<typeof resolveRequestSession>

function contextFor(headers: Record<string, string> = {}, handler: object = {}): ExecutionContext {
	const request = { headers }
	return {
		getType: () => "http",
		getHandler: () => handler,
		getClass: () => class Probe {},
		switchToHttp: () => ({ getRequest: () => request }),
	} as unknown as ExecutionContext
}

function sessionWith(twoFactorEnabled: boolean) {
	return {
		user: { id: "u1", twoFactorEnabled },
		session: { activeOrganizationId: undefined },
	} as never
}

describe("MfaEnrolmentGuard (ADM-2)", () => {
	let guard: MfaEnrolmentGuard

	beforeEach(() => {
		jest.clearAllMocks()
		guard = new MfaEnrolmentGuard(new Reflector())
	})

	it("refuses a staff session whose account has no confirmed second factor", async () => {
		resolveMock.mockResolvedValue(sessionWith(false))

		await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(ForbiddenException)
		await expect(guard.canActivate(contextFor())).rejects.toMatchObject({
			response: { code: "MFA_ENROLMENT_REQUIRED" },
		})
	})

	it("allows a session whose account has an enrolled second factor", async () => {
		resolveMock.mockResolvedValue(sessionWith(true))

		await expect(guard.canActivate(contextFor())).resolves.toBe(true)
	})

	it("leaves anonymous requests to AuthGuard", async () => {
		resolveMock.mockResolvedValue(null)

		await expect(guard.canActivate(contextFor())).resolves.toBe(true)
	})

	it("does not gate API-key requests, which are not staff sessions", async () => {
		resolveMock.mockResolvedValue(sessionWith(false))

		await expect(guard.canActivate(contextFor({ "x-api-key": "k" }))).resolves.toBe(true)
		expect(resolveMock).not.toHaveBeenCalled()
	})

	it("does not gate public routes", async () => {
		resolveMock.mockResolvedValue(sessionWith(false))
		const handler = {}
		jest.spyOn(Reflector.prototype, "getAllAndOverride").mockReturnValueOnce(true)

		await expect(guard.canActivate(contextFor({}, handler))).resolves.toBe(true)
	})
})

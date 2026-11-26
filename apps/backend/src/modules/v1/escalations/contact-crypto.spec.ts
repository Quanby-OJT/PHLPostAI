import { decryptEscalationContact, encryptEscalationContact } from "./contact-crypto"

jest.mock("@/config/env.config", () => ({
	env: { BETTER_AUTH_SECRET: "test-secret-for-contact-encryption" },
}))

describe("offline escalation contact encryption", () => {
	it("round-trips a contact without storing the plaintext", () => {
		const contact = "customer@example.com"
		const encrypted = encryptEscalationContact(contact)

		expect(encrypted).toMatch(/^v1\./)
		expect(encrypted).not.toContain(contact)
		expect(decryptEscalationContact(encrypted)).toBe(contact)
	})

	it("uses a fresh nonce for each stored value", () => {
		expect(encryptEscalationContact("+639171234567")).not.toBe(
			encryptEscalationContact("+639171234567")
		)
	})
})

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

import { env } from "@/config/env.config"

function encryptionKey(): Buffer {
	if (!env.BETTER_AUTH_SECRET) throw new Error("Contact encryption is not configured")
	return Buffer.from(
		hkdfSync("sha256", env.BETTER_AUTH_SECRET, "phlpost-esc3-contact-v1", "aes-256-gcm", 32)
	)
}

/** Versioned AES-256-GCM value for the existing escalations.contact column. */
export function encryptEscalationContact(contact: string): string {
	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
	const encrypted = Buffer.concat([cipher.update(contact, "utf8"), cipher.final()])
	const tag = cipher.getAuthTag()
	return [
		"v1",
		iv.toString("base64url"),
		tag.toString("base64url"),
		encrypted.toString("base64url"),
	].join(".")
}

export function decryptEscalationContact(value: string): string {
	const [version, encodedIv, encodedTag, encodedData, extra] = value.split(".")
	if (
		version !== "v1" ||
		!encodedIv ||
		!encodedTag ||
		encodedData === undefined ||
		extra !== undefined
	) {
		throw new Error("Unsupported escalation contact ciphertext")
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		encryptionKey(),
		Buffer.from(encodedIv, "base64url")
	)
	decipher.setAuthTag(Buffer.from(encodedTag, "base64url"))
	return Buffer.concat([
		decipher.update(Buffer.from(encodedData, "base64url")),
		decipher.final(),
	]).toString("utf8")
}

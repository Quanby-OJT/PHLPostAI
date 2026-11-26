import { randomBytes } from "node:crypto"
import type { Transporter } from "nodemailer"

import { authEnv, getAuth } from "./config.js"
import { sendMail } from "./mailer/send-mail.js"
import { buildResetPasswordEmail } from "./mailer/templates/reset-password-email.js"
import { createTransport } from "./mailer/transport-factory.js"

/**
 * ADM-1: how long a staff invitation link stays valid. Better Auth's default for
 * reset links is one hour, which is too short for a new staff member.
 */
export const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7

let transporter: Transporter | undefined

function mailer(): Transporter {
	transporter ??= createTransport({
		smtpHost: authEnv.SMTP_HOST,
		smtpPort: authEnv.SMTP_PORT,
		smtpUser: authEnv.SMTP_USER,
		smtpPass: authEnv.SMTP_PASS,
		smtpSecure: authEnv.SMTP_SECURE,
		nodeEnv: process.env.NODE_ENV,
	})
	return transporter
}

/**
 * Sends a set-password invitation to a staff account that has no password yet.
 *
 * The link uses a verification row in the same format Better Auth's reset route
 * reads (`reset-password:<token>`, value = user id; Better Auth 1.7.15), so the
 * existing set-password page works unchanged. The email is sent here rather than
 * through Better Auth's reset endpoint, because that endpoint logs mail failures
 * and still reports success. Any failure throws to the caller.
 */
export async function sendStaffInvitation(input: { userId: string; email: string }): Promise<void> {
	const { $context } = getAuth()
	const ctx = await $context
	const token = randomBytes(24).toString("base64url")
	await ctx.internalAdapter.createVerificationValue({
		value: input.userId,
		identifier: `reset-password:${token}`,
		expiresAt: new Date(Date.now() + INVITATION_TTL_SECONDS * 1000),
	})

	const resetUrl = `${authEnv.APP_WEB_URL}/reset-password?token=${token}`
	const message = buildResetPasswordEmail({ resetUrl, userEmail: input.email, mode: "set" })
	await sendMail(mailer(), authEnv.MAIL_FROM, {
		to: input.email,
		subject: message.subject,
		html: message.html,
		text: message.text,
	})
}

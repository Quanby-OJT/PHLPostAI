/**
 * Build the password email content (subject, HTML, and plain text).
 *
 * The same Better Auth link serves two situations. `reset` is for an account
 * that already has a password. `set` is for an account that has none yet, such
 * as an admin-provisioned staff account (ADM-1 invitation), and reads as an
 * invitation rather than a reset request.
 */
export function buildResetPasswordEmail(opts: {
	resetUrl: string
	userEmail: string
	mode?: "reset" | "set"
}): {
	subject: string
	html: string
	text: string
} {
	const { resetUrl, userEmail } = opts
	const mode = opts.mode ?? "reset"

	const copy =
		mode === "set"
			? {
					subject: "Set your password",
					heading: "Set your password",
					body: "An administrator created a PHLPost account for you. Click the button below to choose your password and sign in.",
					cta: "Set password",
					ignore: "If you were not expecting this invitation, you can ignore this email.",
				}
			: {
					subject: "Reset your password",
					heading: "Reset your password",
					body: "We received a request to reset your password. Click the button below to choose a new one.",
					cta: "Reset password",
					ignore: "If you did not request this, you can ignore this email.",
				}

	const subject = copy.subject

	const html = `<!doctype html>
<html>
	<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
			<tr>
				<td align="center">
					<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;padding:32px;">
						<tr>
							<td style="color:#18181b;font-size:20px;font-weight:bold;padding-bottom:16px;">
								${copy.heading}
							</td>
						</tr>
						<tr>
							<td style="color:#3f3f46;font-size:14px;line-height:22px;padding-bottom:24px;">
								Hi ${userEmail},<br />
								${copy.body}
							</td>
						</tr>
						<tr>
							<td style="padding-bottom:24px;">
								<a href="${resetUrl}" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;font-weight:bold;">
									${copy.cta}
								</a>
							</td>
						</tr>
						<tr>
							<td style="color:#71717a;font-size:12px;line-height:20px;word-break:break-all;">
								${copy.ignore} To open the link manually, copy and paste this URL:<br />
								<a href="${resetUrl}" style="color:#2563eb;">${resetUrl}</a>
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`

	const text = `${copy.heading}

Hi ${userEmail},

${copy.body} Open the link below:

${resetUrl}

${copy.ignore}`

	return { subject, html, text }
}

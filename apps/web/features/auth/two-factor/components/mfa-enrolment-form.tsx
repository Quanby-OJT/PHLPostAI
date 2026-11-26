"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/core/components/ui/button"
import { Field, FieldLabel } from "@/core/components/ui/field"
import { Input } from "@/core/components/ui/input"
import { authClient } from "@/services/better-auth/auth-client"

type Enrolment = { secret: string; backupCodes: string[] }

/**
 * ADM-2: the lock and the rate limit both answer HTTP 429. Only the lock carries
 * ACCOUNT_TEMPORARILY_LOCKED, so only that gets the 15-minute message. A plain 429 is the
 * plugin's short rate limit, which says nothing about the account being locked.
 */
function messageFor(error: { status?: number; code?: string }): string {
	if (error.code === "ACCOUNT_TEMPORARILY_LOCKED") {
		return "Too many wrong codes. Wait 15 minutes and try again."
	}
	if (error.status === 429) {
		return "Too many attempts. Wait a moment and try again."
	}
	return "That code is not valid. Check it and try again."
}


/**
 * ADM-2: enrolment for an account without a second factor. The person confirms their
 * password, adds the key to an authenticator app, saves the recovery codes, and proves
 * the app works by entering one code. Until that code is accepted the second factor is
 * not active, and the server holds the session to enrolment.
 */
export function MfaEnrolmentForm() {
	const router = useRouter()
	const [password, setPassword] = useState("")
	const [enrolment, setEnrolment] = useState<Enrolment | null>(null)
	const [code, setCode] = useState("")
	const [message, setMessage] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	async function start(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		setMessage(null)
		const result = await authClient.twoFactor.enable({ password })
		setPending(false)
		const data = result.data
		if (result.error || !data || !("totpURI" in data)) {
			setMessage("Your password was not accepted. Check it and try again.")
			return
		}
		const secret = new URL(data.totpURI).searchParams.get("secret") ?? ""
		setEnrolment({ secret, backupCodes: data.backupCodes })
	}

	async function confirm(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		setMessage(null)
		const result = await authClient.twoFactor.verifyTotp({ code: code.trim() })
		setPending(false)
		if (result.error) {
			setMessage(messageFor(result.error))
			return
		}
		router.push("/")
		router.refresh()
	}

	if (!enrolment) {
		return (
			<form onSubmit={start} className="mx-auto flex w-full max-w-sm flex-col gap-6" noValidate>
				<h1 className="text-center text-2xl font-semibold">Set up two-step sign-in</h1>
				<p className="text-muted-foreground text-sm">
					Staff accounts need an authenticator app. Confirm your password to start.
				</p>
				<Field>
					<FieldLabel htmlFor="mfa-password">Password</FieldLabel>
					<Input
						id="mfa-password"
						name="password"
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={e => setPassword(e.target.value)}
					/>
				</Field>
				{message ? (
					<p role="alert" className="text-destructive text-sm">
						{message}
					</p>
				) : null}
				<Button type="submit" disabled={pending || password === ""}>
					{pending ? "Starting..." : "Continue"}
				</Button>
			</form>
		)
	}

	return (
		<div className="mx-auto flex w-full max-w-sm flex-col gap-6">
			<form onSubmit={confirm} className="flex flex-col gap-6" noValidate>
				<h1 className="text-center text-2xl font-semibold">Add to your authenticator app</h1>
				<p className="text-sm">Add a new account in your app and enter this setup key:</p>
				<code className="bg-muted break-all rounded p-3 font-mono text-sm">{enrolment.secret}</code>
				<section aria-labelledby="recovery-heading" className="flex flex-col gap-2">
					<h2 id="recovery-heading" className="text-base font-medium">
						Recovery codes
					</h2>
					<p className="text-muted-foreground text-sm">
						Save these now. Each one works once, and they are not shown again.
					</p>
					<ul className="bg-muted grid grid-cols-2 gap-1 rounded p-3 font-mono text-sm">
						{enrolment.backupCodes.map(c => (
							<li key={c}>{c}</li>
						))}
					</ul>
				</section>
				<Field>
					<FieldLabel htmlFor="mfa-confirm-code">Code from the app</FieldLabel>
					<Input
						id="mfa-confirm-code"
						name="code"
						inputMode="numeric"
						autoComplete="one-time-code"
						required
						value={code}
						onChange={e => setCode(e.target.value)}
					/>
				</Field>
				{message ? (
					<p role="alert" className="text-destructive text-sm">
						{message}
					</p>
				) : null}
				<Button type="submit" disabled={pending || code.trim() === ""}>
					{pending ? "Checking..." : "Turn on two-step sign-in"}
				</Button>
			</form>
		</div>
	)
}

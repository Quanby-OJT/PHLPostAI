"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/core/components/ui/button"
import { Field, FieldLabel } from "@/core/components/ui/field"
import { Input } from "@/core/components/ui/input"
import { authClient } from "@/services/better-auth/auth-client"

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
 * ADM-2: the second step of sign-in. Accepts a one-time code from the authenticator app,
 * or a single-use recovery code. The server counts failures and locks the account for
 * 15 minutes after five wrong codes (HTTP 429).
 */
export function TwoFactorChallengeForm() {
	const router = useRouter()
	const [useRecovery, setUseRecovery] = useState(false)
	const [code, setCode] = useState("")
	const [message, setMessage] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		setMessage(null)
		const result = useRecovery
			? await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
			: await authClient.twoFactor.verifyTotp({ code: code.trim() })
		setPending(false)

		if (result.error) {
			setMessage(messageFor(result.error))
			return
		}
		router.push("/")
		router.refresh()
	}

	return (
		<form onSubmit={onSubmit} className="mx-auto flex w-full max-w-sm flex-col gap-6" noValidate>
			<h1 className="text-center text-2xl font-semibold">Enter your code</h1>
			<Field>
				<FieldLabel htmlFor="two-factor-code">
					{useRecovery ? "Recovery code" : "Code from your authenticator app"}
				</FieldLabel>
				<Input
					id="two-factor-code"
					name="code"
					inputMode={useRecovery ? "text" : "numeric"}
					autoComplete="one-time-code"
					autoFocus
					required
					value={code}
					onChange={e => setCode(e.target.value)}
					aria-invalid={message ? true : undefined}
					aria-describedby={message ? "two-factor-error" : undefined}
				/>
			</Field>
			{message ? (
				<p id="two-factor-error" role="alert" className="text-destructive text-sm">
					{message}
				</p>
			) : null}
			<Button type="submit" disabled={pending || code.trim() === ""}>
				{pending ? "Checking..." : "Verify"}
			</Button>
			<button
				type="button"
				className="text-muted-foreground text-sm underline-offset-4 hover:underline"
				onClick={() => {
					setUseRecovery(v => !v)
					setCode("")
					setMessage(null)
				}}
			>
				{useRecovery ? "Use an authenticator code instead" : "Use a recovery code instead"}
			</button>
		</form>
	)
}

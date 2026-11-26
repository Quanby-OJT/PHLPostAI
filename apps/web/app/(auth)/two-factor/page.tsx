import { redirect } from "next/navigation"

import { getSession } from "@/services/better-auth/auth-server"
import { TwoFactorChallengeForm } from "@/features/auth/two-factor/components/two-factor-challenge-form"

export default async function TwoFactorPage() {
	// Only reachable mid sign-in. A signed-in user has nothing left to verify here.
	const session = await getSession()
	if (session) {
		redirect("/")
	}

	return (
		<section className="flex flex-1 flex-col items-center justify-center">
			<TwoFactorChallengeForm />
		</section>
	)
}

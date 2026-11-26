import { redirect } from "next/navigation"

import { getSession } from "@/services/better-auth/auth-server"
import { MfaEnrolmentForm } from "@/features/auth/two-factor/components/mfa-enrolment-form"
import { hasConfirmedSecondFactor } from "@/features/auth/two-factor/lib/second-factor"

export default async function MfaSetupPage() {
	const session = await getSession()
	if (!session) {
		redirect("/login")
	}
	if (hasConfirmedSecondFactor(session.user)) {
		redirect("/")
	}

	return (
		<section className="flex flex-1 flex-col items-center justify-center">
			<MfaEnrolmentForm />
		</section>
	)
}

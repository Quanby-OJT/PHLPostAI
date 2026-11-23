import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import { ExplanationsView } from "@/features/tracking-explanations/components/explanations-view"

export const metadata: Metadata = {
	title: "Status explanations",
}

export default async function TrackingExplanationsPage() {
	const access = await getAccess()
	const allowed = canAccess(
		{ roles: access.roles, permissions: access.permissions },
		{ requiredPermission: "tracking.explanations.manage" }
	)

	if (!allowed) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Status explanations</h1>
				<p className="text-muted-foreground mt-2 text-sm" role="alert">
					You do not have permission to manage status explanations. Ask an administrator for{" "}
					<code>tracking.explanations.manage</code>.
				</p>
			</div>
		)
	}

	return <ExplanationsView />
}

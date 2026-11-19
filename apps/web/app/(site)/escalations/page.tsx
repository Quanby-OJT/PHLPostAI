import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import { EscalationInbox } from "@/features/escalations/components/escalation-inbox"

export const metadata: Metadata = { title: "Agent inbox" }

export default async function EscalationsPage() {
	const access = await getAccess()
	const hasAccess = canAccess(
		{ roles: access.roles, permissions: access.permissions },
		{ requiredPermission: "escalations.queue.view" }
	)

	if (!hasAccess) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Agent inbox</h1>
				<p className="text-muted-foreground mt-2 text-sm" role="alert">
					You do not have permission to view the agent inbox. Contact an administrator to request
					the <code>escalations.queue.view</code> permission.
				</p>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-semibold">Agent inbox</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Review queued customer chats and their conversation history.
				</p>
			</header>
			<EscalationInbox />
		</div>
	)
}

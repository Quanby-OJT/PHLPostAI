import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import { EscalationSettingsView } from "@/features/escalation-settings/components/escalation-settings-view"

export const metadata: Metadata = { title: "Escalation Rules" }

export default async function EscalationSettingsPage() {
	const access = await getAccess()
	const allowed = canAccess(
		{ roles: access.roles, permissions: access.permissions },
		{ requiredPermission: "settings.escalation.manage" }
	)
	if (!allowed) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Escalation Rules</h1>
				<p className="text-muted-foreground mt-2 text-sm" role="alert">
					You do not have permission to manage escalation rules. Ask an administrator for{" "}
					<code>settings.escalation.manage</code>.
				</p>
			</div>
		)
	}
	return <EscalationSettingsView />
}

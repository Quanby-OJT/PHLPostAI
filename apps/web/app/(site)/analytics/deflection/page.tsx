import type { Metadata } from "next"

import { DeflectionKpiView } from "@/features/dashboard/components/deflection-kpi-view"
import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"

export const metadata: Metadata = { title: "Deflection KPI" }

export default async function DeflectionKpiPage() {
	const access = await getAccess()
	const profile = { roles: access.roles, permissions: access.permissions }
	const canManage = canAccess(profile, { requiredPermission: "analytics.kpi.manage" })
	const canView = canAccess(profile, { requiredPermission: "analytics.dashboard.view" })

	if (!canView) {
		return (
			<p className="text-muted-foreground p-6 text-sm" role="alert">
				You need analytics.dashboard.view to see the deflection report.
			</p>
		)
	}
	if (!canManage) {
		return <DeflectionKpiView readOnly />
	}
	return <DeflectionKpiView />
}

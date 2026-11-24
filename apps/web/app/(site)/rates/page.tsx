import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import { RatesView } from "@/features/rates/components/rates-view"

export const metadata: Metadata = {
	title: "Postal rates",
}

export default async function RatesPage() {
	const access = await getAccess()
	const profile = { roles: access.roles, permissions: access.permissions }
	const canManage = canAccess(profile, { requiredPermission: "knowledge.rates.manage" })
	const canApprove = canAccess(profile, { requiredPermission: "knowledge.articles.approve" })

	if (!canManage && !canApprove) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Postal rates</h1>
				<p className="text-muted-foreground mt-2 text-sm" role="alert">
					You do not have permission to manage postal rates. Ask an administrator for{" "}
					<code>knowledge.rates.manage</code>.
				</p>
			</div>
		)
	}

	return <RatesView canManage={canManage} canApprove={canApprove} />
}

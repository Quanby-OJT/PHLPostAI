import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import { OfficialContactsView } from "@/features/scam/components/scam-configuration-view"

export const metadata: Metadata = { title: "Official Contacts" }

export default async function OfficialContactsPage() {
	const access = await getAccess()
	if (!canAccess(access, { requiredPermission: "scam.indicators.manage" })) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Official Contacts</h1>
				<p role="alert" className="text-muted-foreground mt-2 text-sm">
					Ask an administrator for <code>scam.indicators.manage</code> to open this page.
				</p>
			</div>
		)
	}
	return <OfficialContactsView />
}

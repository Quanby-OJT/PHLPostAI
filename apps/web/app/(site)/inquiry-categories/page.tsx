import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import { InquiryCategoriesView } from "@/features/inquiry-categories/components/inquiry-categories-view"

export const metadata: Metadata = {
	title: "Inquiry Categories",
}

export default async function InquiryCategoriesPage() {
	const access = await getAccess()
	const allowed = canAccess(
		{ roles: access.roles, permissions: access.permissions },
		{ requiredPermission: "settings.assistant.manage" }
	)

	if (!allowed) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Inquiry Categories</h1>
				<p className="text-muted-foreground mt-2 text-sm" role="alert">
					You do not have permission to manage assistant inquiry categories. Ask an
					administrator for <code>settings.assistant.manage</code>.
				</p>
			</div>
		)
	}

	return <InquiryCategoriesView />
}

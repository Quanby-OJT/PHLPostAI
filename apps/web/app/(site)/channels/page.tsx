import type { Metadata } from "next"

import { ChannelsView } from "@/features/channels/components/channels-view"
import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"

export const metadata: Metadata = { title: "Channels" }

export default async function ChannelsPage() {
	const access = await getAccess()
	const allowed = canAccess(
		{ roles: access.roles, permissions: access.permissions },
		{ requiredPermission: "channels.channels.manage" }
	)
	if (!allowed) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Channels</h1>
				<p className="text-muted-foreground mt-2 text-sm" role="alert">
					You do not have permission to manage channels. Contact an administrator to request the{" "}
					<code>channels.channels.manage</code> permission.
				</p>
			</div>
		)
	}
	return <ChannelsView />
}

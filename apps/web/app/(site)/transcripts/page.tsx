import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import { TranscriptsView } from "@/features/transcripts/components/transcripts-view"

export const metadata: Metadata = {
	title: "Transcripts",
}

export default async function TranscriptsPage() {
	const access = await getAccess()
	const hasAccess = canAccess(
		{ roles: access.roles, permissions: access.permissions },
		{ requiredPermission: "conversations.transcripts.view" }
	)

	return <TranscriptsView hasAccess={hasAccess} />
}

import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import { KnowledgeView } from "@/features/knowledge/components/knowledge-view"

export const metadata: Metadata = {
	title: "Knowledge base",
}

export default async function KnowledgePage() {
	const access = await getAccess()
	const grants = { roles: access.roles, permissions: access.permissions }
	const canManage = canAccess(grants, { requiredPermission: "knowledge.articles.manage" })
	const canApprove = canAccess(grants, { requiredPermission: "knowledge.articles.approve" })

	if (!canManage && !canApprove) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Knowledge base</h1>
				<p className="text-muted-foreground mt-2 text-sm" role="alert">
					You do not have permission to use the knowledge base. Ask an administrator for{" "}
					<code>knowledge.articles.manage</code> or <code>knowledge.articles.approve</code>.
				</p>
			</div>
		)
	}

	return <KnowledgeView canManage={canManage} canApprove={canApprove} />
}

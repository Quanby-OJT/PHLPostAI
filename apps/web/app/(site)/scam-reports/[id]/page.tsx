import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ScamReportIdSchema } from "@repo/contracts"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import {
	ScamReportAccessDenied,
	ScamReportDetailView,
} from "@/features/scam-reports/components/scam-reports"

export const metadata: Metadata = { title: "Scam Report" }

export default async function ScamReportPage({ params }: { params: Promise<{ id: string }> }) {
	const access = await getAccess()
	if (!canAccess(access, { requiredPermission: "scam.reports.view" }))
		return <ScamReportAccessDenied />
	const parsed = ScamReportIdSchema.safeParse(await params)
	if (!parsed.success) notFound()
	return (
		<ScamReportDetailView
			id={parsed.data.id}
			canValidate={canAccess(access, { requiredPermission: "scam.reports.validate" })}
		/>
	)
}

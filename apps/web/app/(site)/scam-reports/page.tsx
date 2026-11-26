import type { Metadata } from "next"

import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import {
	ScamReportAccessDenied,
	ScamReportQueue,
} from "@/features/scam-reports/components/scam-reports"

export const metadata: Metadata = { title: "Scam Reports" }

export default async function ScamReportsPage() {
	const access = await getAccess()
	return canAccess(access, { requiredPermission: "scam.reports.view" }) ? (
		<ScamReportQueue />
	) : (
		<ScamReportAccessDenied />
	)
}

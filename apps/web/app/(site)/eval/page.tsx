import type { Metadata } from "next"

import { env } from "@/env"
import { canAccess } from "@/features/dashboard/lib/access"
import { getAccess } from "@/features/dashboard/server/get-access"
import {
	AnswerQualityPanel,
	QualityApprovalPanel,
} from "@/features/eval/components/answer-quality-panel"
import { GoldenView } from "@/features/eval/components/golden-view"
import { RunsPanel } from "@/features/eval/components/runs-panel"

export const metadata: Metadata = {
	title: "Evaluation",
}

export default async function EvalPage() {
	const access = await getAccess()
	const grants = { roles: access.roles, permissions: access.permissions }
	const hasGoldenAccess = canAccess(grants, { requiredPermission: "eval.golden.manage" })
	const hasRunsAccess = canAccess(grants, { requiredPermission: "eval.runs.execute" })
	const hasApprovalAccess = canAccess(grants, { requiredPermission: "eval.gate.approve" })

	if (!hasGoldenAccess && !hasRunsAccess && !hasApprovalAccess) {
		return (
			<div className="p-6">
				<h1 className="text-lg font-semibold">Evaluation</h1>
				<p className="text-muted-foreground mt-2 text-sm" role="alert">
					You do not have permission to use the evaluation console. Contact an administrator to
					request <code>eval.golden.manage</code> or <code>eval.runs.execute</code>.
				</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-6">
			{hasRunsAccess ? (
				<div className="grid gap-6 px-4 pt-4 md:px-6 md:pt-6">
					<AnswerQualityPanel localFixtures={env.EVL1_LOCAL_UI ?? false} />
					<RunsPanel />
				</div>
			) : null}
			{hasApprovalAccess && (
				<div className="px-4 pt-4 md:px-6 md:pt-6">
					<QualityApprovalPanel />
				</div>
			)}
			{hasGoldenAccess ? <GoldenView /> : null}
		</div>
	)
}

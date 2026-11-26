import "dotenv/config"
import "reflect-metadata"

import { NestFactory } from "@nestjs/core"
import { writeFile } from "node:fs/promises"

import { AppModule } from "@/app.module"
import { db } from "@/common/database/database.client"

import { draftQualitySet } from "./modules/v1/eval/answer-quality-fixtures"
import { compareQualityRuns } from "./modules/v1/eval/answer-quality-gate"
import { AnswerQualityService } from "./modules/v1/eval/answer-quality.service"
import { EvalRunsService } from "./modules/v1/eval/eval-runs.service"

async function main() {
	const [mode, output, candidateId] = process.argv.slice(2)
	if (!output) throw new Error("An output file is required")
	if (mode === "drafts") {
		await writeFile(output, `${JSON.stringify(draftQualitySet(), null, 2)}\n`)
		return 0
	}
	if (mode !== "ci" && mode !== "local")
		throw new Error("Use ci <report>, local <report> [candidate id], or drafts <file>")
	const profile = mode === "ci" ? "evl1" : "evl1-local"
	if (process.env.EVL1_MODE !== profile)
		throw new Error("Evaluation sandbox mode does not match the command")
	if (mode === "ci" && (candidateId || !/^[a-f0-9]{40}$/.test(process.env.GIT_SHA ?? ""))) {
		throw new Error("CI must execute the checked-out candidate")
	}
	if (mode === "local") {
		const database = new URL(process.env.DATABASE_URL ?? "")
		if (
			!["127.0.0.1", "localhost"].includes(database.hostname) ||
			database.pathname !== "/phlpost_evl1_qa"
		) {
			throw new Error("Local gate requires the dedicated loopback database")
		}
	}
	const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] })
	try {
		const runs = app.get(EvalRunsService)
		const candidate = candidateId
			? await runs.get(candidateId)
			: await app.get(AnswerQualityService).execute(profile, "evl1-gate", false)
		if (candidate.config.profile !== profile)
			throw new Error("Run belongs to a different evaluation profile")
		const approval = await runs.currentBaseline(profile)
		const baseline = approval ? await runs.get(approval.runId) : null
		const report = compareQualityRuns(candidate, baseline)
		await writeFile(output, `${JSON.stringify({ ...report, approval, candidate }, null, 2)}\n`)
		console.log(JSON.stringify({ ...report, approvalId: approval?.id, candidateId: candidate.id }))
		return report.exitCode
	} finally {
		await app.close()
		await db.$client.end()
	}
}

void main()
	.then(code => {
		process.exitCode = code
	})
	.catch(error => {
		console.error(
			error instanceof Error ? error.message : "EVL-1 gate could not evaluate this candidate"
		)
		process.exitCode = 2
	})

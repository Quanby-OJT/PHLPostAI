import type { EvalRun, EvalRunItem } from "@repo/contracts"

export const qualityLanguages = ["en", "fil", "ceb", "ilo"] as const
export const qualityUseCases = ["tracking", "rates", "postal-id", "service-info"] as const
const dimensions = ["grounded", "behaviorCorrect", "languageCorrect"] as const
export const qualityTokenCap = 200

export function qualityMetrics(items: EvalRunItem[]) {
	const results: Record<string, number> = {}
	for (const [prefix, subset] of [
		["overall", items] as const,
		...qualityLanguages.flatMap(language => [
			[language, items.filter(item => item.quality?.expected.language === language)] as const,
			...qualityUseCases.map(
				useCase =>
					[
						`${language}.${useCase}`,
						items.filter(
							item =>
								item.quality?.expected.language === language &&
								item.quality.expected.useCase === useCase
						),
					] as const
			),
		]),
		...qualityUseCases.map(
			useCase =>
				[useCase, items.filter(item => item.quality?.expected.useCase === useCase)] as const
		),
	]) {
		results[`${prefix}.count`] = subset.length
		results[`${prefix}.codeSwitched`] = subset.filter(
			item => item.quality?.expected.codeSwitched
		).length
		results[`${prefix}.failed`] = subset.filter(item => {
			const evidence = item.quality
			return (
				item.skipped ||
				!evidence ||
				Boolean(evidence.error) ||
				dimensions.some(metric => evidence[metric] !== true) ||
				Math.max(evidence.visibleOutputTokens ?? Infinity, evidence.providerOutputTokens ?? 0) >
					qualityTokenCap
			)
		}).length
		for (const metric of dimensions) {
			results[`${prefix}.${metric}`] = subset.length
				? subset.filter(item => item.quality?.[metric] === true).length / subset.length
				: 0
		}
	}
	return results
}

export function qualityCoverageBlockers(metrics: Record<string, number>) {
	const issues: string[] = []
	for (const language of qualityLanguages) {
		if ((metrics[`${language}.count`] ?? 0) < 30 || !metrics[`${language}.codeSwitched`]) {
			issues.push(`${language} requires 30 items and code-switched coverage`)
		}
		for (const useCase of qualityUseCases) {
			if (!metrics[`${language}.${useCase}.count`])
				issues.push(`Missing ${language}/${useCase} coverage`)
		}
	}
	return issues
}

export function qualityBlockers(run: EvalRun) {
	const items = run.perItem ?? []
	const issues = qualityCoverageBlockers(qualityMetrics(items))
	if (
		run.status !== "completed" ||
		!items.length ||
		items.length !== run.config.itemCount ||
		new Set(items.map(item => item.goldenItemId)).size !== items.length
	) {
		issues.unshift("The evaluation did not complete for every required item")
	}
	for (const item of items) {
		const evidence = item.quality
		if (
			!evidence ||
			item.skipped ||
			evidence.error ||
			!item.answer ||
			!evidence.approvalReference ||
			(run.config.profile === "evl1" && (!evidence.externalApprover || !evidence.approvedAt)) ||
			!evidence.tokenizer ||
			!Number.isInteger(evidence.visibleOutputTokens) ||
			!dimensions.every(metric => typeof evidence[metric] === "boolean")
		) {
			issues.push(`Incomplete evidence for ${item.goldenItemId}`)
			continue
		}
		if (
			Math.max(evidence.visibleOutputTokens ?? Infinity, evidence.providerOutputTokens ?? 0) >
			qualityTokenCap
		) {
			issues.push(`Output exceeds ${qualityTokenCap} tokens for ${item.goldenItemId}`)
		}
	}
	return issues
}

export function compareQualityRuns(candidate: EvalRun, baseline: EvalRun | null) {
	const issues = qualityBlockers(candidate)
	if (!baseline) issues.push("An explicitly approved baseline is required")
	else {
		issues.push(...qualityBlockers(baseline).map(issue => `Baseline: ${issue}`))
		if (
			!candidate.config.compatibility ||
			candidate.config.compatibility !== baseline.config.compatibility ||
			candidate.config.profile !== baseline.config.profile
		) {
			issues.push("Dataset or evaluation configuration differs from the accepted baseline")
		}
	}
	const regressions: { language: string; metric: string; baseline: number; candidate: number }[] =
		[]
	if (baseline && issues.length === 0) {
		const past = qualityMetrics(baseline.perItem ?? [])
		const current = qualityMetrics(candidate.perItem ?? [])
		for (const language of qualityLanguages) {
			for (const metric of dimensions) {
				const key = `${language}.${metric}`
				const candidateValue = current[key] ?? 0
				const baselineValue = past[key] ?? 0
				if (candidateValue < baselineValue) {
					regressions.push({ language, metric, baseline: baselineValue, candidate: candidateValue })
				}
			}
		}
	}
	return { exitCode: issues.length ? 2 : regressions.length ? 1 : 0, issues, regressions }
}

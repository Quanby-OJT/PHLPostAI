"use client"

import { useState } from "react"

import {
	EXPLANATION_LANGUAGES,
	SaveStatusExplanationRequestSchema,
	type ExplanationLanguage,
} from "@repo/contracts"

import { Button } from "@/core/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/core/components/ui/field"
import { Input } from "@/core/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/core/components/ui/select"
import { Textarea } from "@/core/components/ui/textarea"
import { LANGUAGE_LABELS } from "@/features/knowledge/lib/labels"
import { useSaveExplanationMutation } from "@/features/tracking-explanations/api/explanations.hooks"

type FieldErrors = Partial<Record<"statusCode" | "language" | "explanation" | "nextSteps", string>>

export interface ExplanationDraft {
	statusCode: string
	language: ExplanationLanguage
	explanation?: string
	nextSteps?: string | null
}

interface ExplanationEditorProps {
	initial?: ExplanationDraft
	/** Editing keeps the status code and language fixed; they identify the explanation. */
	editing?: boolean
	onDone: () => void
	onCancel: () => void
}

export function ExplanationEditor({ initial, editing, onDone, onCancel }: ExplanationEditorProps) {
	const [statusCode, setStatusCode] = useState(initial?.statusCode ?? "")
	const [language, setLanguage] = useState<ExplanationLanguage>(initial?.language ?? "en")
	const [explanation, setExplanation] = useState(initial?.explanation ?? "")
	const [nextSteps, setNextSteps] = useState(initial?.nextSteps ?? "")
	const [errors, setErrors] = useState<FieldErrors>({})
	const [formError, setFormError] = useState<string | null>(null)
	const save = useSaveExplanationMutation()
	const fixedKey = editing || Boolean(initial?.statusCode)

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault()
		setFormError(null)
		const parsed = SaveStatusExplanationRequestSchema.safeParse({
			statusCode,
			language,
			explanation,
			nextSteps,
		})
		if (!parsed.success) {
			const next: FieldErrors = {}
			for (const issue of parsed.error.issues) {
				const key = issue.path[0] as keyof FieldErrors
				next[key] ??= issue.message
			}
			setErrors(next)
			return
		}
		setErrors({})
		try {
			await save.mutateAsync(parsed.data)
			onDone()
		} catch (error) {
			setFormError(error instanceof Error ? error.message : "Something went wrong")
		}
	}

	return (
		<form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
			<div className="flex flex-wrap gap-4">
				<Field data-invalid={Boolean(errors.statusCode)} className="w-64">
					<FieldLabel htmlFor="se-code">Status code</FieldLabel>
					<Input
						id="se-code"
						value={statusCode}
						onChange={e => setStatusCode(e.target.value)}
						placeholder="HELD_AT_CUSTOMS"
						aria-invalid={Boolean(errors.statusCode)}
						disabled={save.isPending || fixedKey}
					/>
					{errors.statusCode ? <FieldError>{errors.statusCode}</FieldError> : null}
				</Field>
				<Field className="w-56">
					<FieldLabel htmlFor="se-language">Language</FieldLabel>
					<Select
						value={language}
						onValueChange={value => value && setLanguage(value as ExplanationLanguage)}
						disabled={save.isPending || fixedKey}
					>
						<SelectTrigger id="se-language">
							<SelectValue>{LANGUAGE_LABELS[language]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{EXPLANATION_LANGUAGES.map(code => (
								<SelectItem key={code} value={code}>
									{LANGUAGE_LABELS[code]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			</div>

			<Field data-invalid={Boolean(errors.explanation)}>
				<FieldLabel htmlFor="se-explanation">What this status means</FieldLabel>
				<Textarea
					id="se-explanation"
					value={explanation}
					onChange={e => setExplanation(e.target.value)}
					rows={4}
					aria-invalid={Boolean(errors.explanation)}
					disabled={save.isPending}
				/>
				<FieldDescription>
					Shown after the official status, which is never changed. For a Customs status, include the
					approved guidance.
				</FieldDescription>
				{errors.explanation ? <FieldError>{errors.explanation}</FieldError> : null}
			</Field>

			<Field data-invalid={Boolean(errors.nextSteps)}>
				<FieldLabel htmlFor="se-next-steps">Next steps (optional)</FieldLabel>
				<Textarea
					id="se-next-steps"
					value={nextSteps}
					onChange={e => setNextSteps(e.target.value)}
					rows={3}
					aria-invalid={Boolean(errors.nextSteps)}
					disabled={save.isPending}
				/>
				<FieldDescription>For a Customs status, list the required documents.</FieldDescription>
				{errors.nextSteps ? <FieldError>{errors.nextSteps}</FieldError> : null}
			</Field>

			{formError ? (
				<p className="text-destructive text-sm" role="alert">
					{formError}
				</p>
			) : null}

			<div className="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>
					Cancel
				</Button>
				<Button type="submit" disabled={save.isPending}>
					{save.isPending ? "Saving..." : "Save explanation"}
				</Button>
			</div>
		</form>
	)
}

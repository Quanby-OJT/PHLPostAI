"use client"

import { useState } from "react"

import { CreateInquiryCategoryRequestSchema } from "@repo/contracts"

import { Button } from "@/core/components/ui/button"
import { Checkbox } from "@/core/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/core/components/ui/field"
import { Input } from "@/core/components/ui/input"

import { useCreateInquiryCategoryMutation } from "../api/categories.hooks"

type FieldErrors = Partial<Record<"code" | "name", string>>

/** CNV-2 AC3: add a category; new messages can be classified into it right away. */
export function AddCategoryForm() {
	const [code, setCode] = useState("")
	const [name, setName] = useState("")
	const [isEligible, setIsEligible] = useState(false)
	const [errors, setErrors] = useState<FieldErrors>({})
	const [formError, setFormError] = useState<string | null>(null)
	const create = useCreateInquiryCategoryMutation()

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault()
		setFormError(null)
		const parsed = CreateInquiryCategoryRequestSchema.safeParse({ code, name, isEligible })
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
			await create.mutateAsync(parsed.data)
			setCode("")
			setName("")
			setIsEligible(false)
		} catch (error) {
			setFormError(error instanceof Error ? error.message : "Something went wrong")
		}
	}

	return (
		<form
			className="flex flex-col gap-4 rounded-md border p-4"
			onSubmit={handleSubmit}
			noValidate
			aria-label="Add a category"
		>
			<h2 className="text-sm font-semibold">Add a category</h2>
			<div className="flex flex-wrap gap-4">
				<Field data-invalid={Boolean(errors.code)} className="w-56">
					<FieldLabel htmlFor="ic-code">Code</FieldLabel>
					<Input
						id="ic-code"
						value={code}
						onChange={e => setCode(e.target.value)}
						placeholder="customs-help"
						aria-invalid={Boolean(errors.code)}
						disabled={create.isPending}
					/>
					{errors.code ? <FieldError>{errors.code}</FieldError> : null}
				</Field>
				<Field data-invalid={Boolean(errors.name)} className="w-64">
					<FieldLabel htmlFor="ic-name">Name</FieldLabel>
					<Input
						id="ic-name"
						value={name}
						onChange={e => setName(e.target.value)}
						placeholder="Customs help"
						aria-invalid={Boolean(errors.name)}
						disabled={create.isPending}
					/>
					{errors.name ? <FieldError>{errors.name}</FieldError> : null}
				</Field>
			</div>
			<Field orientation="horizontal" className="w-auto">
				<Checkbox
					id="ic-eligible"
					checked={isEligible}
					onCheckedChange={checked => setIsEligible(checked === true)}
					disabled={create.isPending}
				/>
				<FieldLabel htmlFor="ic-eligible" className="font-normal">
					Eligible for AI self-service
				</FieldLabel>
			</Field>
			<FieldDescription>
				The classifier can choose the new category from the next message. The name tells it what the
				category is about.
			</FieldDescription>
			{formError ? (
				<p className="text-destructive text-sm" role="alert">
					{formError}
				</p>
			) : null}
			<div>
				<Button type="submit" disabled={create.isPending}>
					{create.isPending ? "Adding..." : "Add category"}
				</Button>
			</div>
		</form>
	)
}

"use client"

import { useRef, useState } from "react"

import {
	CreateKnowledgeArticleRequestSchema,
	DEFAULT_INQUIRY_CATEGORIES,
	KNOWLEDGE_LANGUAGES,
	type KnowledgeLanguage,
} from "@repo/contracts"

import { Button } from "@/core/components/ui/button"
import { Checkbox } from "@/core/components/ui/checkbox"
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
import {
	EXTRACT_ACCEPT,
	MAX_EXTRACT_BYTES,
	useCreateArticleMutation,
	useExtractTextMutation,
	useSaveDraftMutation,
	useUpdateArticleMutation,
	type KnowledgeArticleDetailUi,
} from "@/features/knowledge/api/knowledge.hooks"
import { categoryLabel, LANGUAGE_LABELS } from "@/features/knowledge/lib/labels"

type FieldErrors = Partial<Record<"title" | "category" | "languages" | "body" | "language", string>>

interface ArticleEditorProps {
	/** The article to edit; leave out to create a new one. */
	article?: KnowledgeArticleDetailUi
	onDone: (articleId: string) => void
	onCancel: () => void
}

/**
 * Create an article, or save a draft of an existing one (KB-1). Saving an
 * approved article opens a NEW draft version; the approved version keeps
 * serving until the new one is approved. A DOCX/PDF/HTML file can seed the
 * text; the file itself is not indexed.
 */
export function ArticleEditor({ article, onDone, onCancel }: ArticleEditorProps) {
	const latest = article?.versions[0]
	const editableLatest = latest && (latest.status === "draft" || latest.status === "returned")

	const [title, setTitle] = useState(article?.title ?? "")
	const [category, setCategory] = useState(article?.category ?? "")
	const [languages, setLanguages] = useState<KnowledgeLanguage[]>(article?.languages ?? ["en"])
	const [language, setLanguage] = useState<KnowledgeLanguage>(latest?.language ?? "en")
	const [body, setBody] = useState(latest?.body ?? "")
	const [errors, setErrors] = useState<FieldErrors>({})
	const [formError, setFormError] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const createArticle = useCreateArticleMutation()
	const updateArticle = useUpdateArticleMutation()
	const saveDraft = useSaveDraftMutation()
	const extract = useExtractTextMutation()
	const isPending = createArticle.isPending || updateArticle.isPending || saveDraft.isPending

	function toggleLanguage(code: KnowledgeLanguage, checked: boolean) {
		setLanguages(current => {
			const next = checked ? [...new Set([...current, code])] : current.filter(c => c !== code)
			if (!next.includes(language) && next[0]) setLanguage(next[0])
			return next
		})
	}

	function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
		setFormError(null)
		setNotice(null)
		const file = event.target.files?.[0]
		event.target.value = ""
		if (!file) return
		if (file.size > MAX_EXTRACT_BYTES) {
			setFormError("This file exceeds the 25 MB limit.")
			return
		}
		extract.mutate(file, {
			onSuccess: result => {
				setBody(result.text)
				setNotice(`Text taken from ${result.filename}. Review it before saving.`)
			},
			onError: error => setFormError(error.message),
		})
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault()
		setFormError(null)

		// The same rules the API enforces (shared Zod schema).
		const parsed = CreateKnowledgeArticleRequestSchema.safeParse({
			title,
			category,
			languages,
			body,
			language,
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
		if (!parsed.data.languages.includes(parsed.data.language)) {
			setErrors({ language: "Choose one of the article's languages" })
			return
		}
		setErrors({})

		try {
			if (!article) {
				const created = await createArticle.mutateAsync(parsed.data)
				onDone(created.id)
				return
			}
			const metaChanged =
				parsed.data.title !== article.title ||
				parsed.data.category !== article.category ||
				parsed.data.languages.join() !== article.languages.join()
			if (metaChanged) {
				await updateArticle.mutateAsync({
					id: article.id,
					title: parsed.data.title,
					category: parsed.data.category,
					languages: parsed.data.languages,
				})
			}
			await saveDraft.mutateAsync({
				id: article.id,
				body: parsed.data.body,
				language: parsed.data.language,
			})
			onDone(article.id)
		} catch (error) {
			setFormError(error instanceof Error ? error.message : "Something went wrong")
		}
	}

	return (
		<form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
			{article && !editableLatest ? (
				<p className="bg-muted rounded-lg p-3 text-sm">
					Saving creates version {(latest?.version ?? 0) + 1} as a draft. The approved version
					keeps serving until the new one is approved.
				</p>
			) : null}
			{latest?.status === "returned" && latest.reviewNote ? (
				<div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm" role="note">
					<p className="font-medium">Returned by the approver</p>
					<p className="whitespace-pre-wrap">{latest.reviewNote}</p>
				</div>
			) : null}

			<Field data-invalid={Boolean(errors.title)}>
				<FieldLabel htmlFor="kb-title">Title</FieldLabel>
				<Input
					id="kb-title"
					value={title}
					onChange={e => setTitle(e.target.value)}
					aria-invalid={Boolean(errors.title)}
					disabled={isPending}
				/>
				{errors.title ? <FieldError>{errors.title}</FieldError> : null}
			</Field>

			<Field data-invalid={Boolean(errors.category)}>
				<FieldLabel htmlFor="kb-category">Category</FieldLabel>
				<Select
					value={category || null}
					onValueChange={value => value && setCategory(value)}
					disabled={isPending}
				>
					<SelectTrigger id="kb-category" className="w-full" aria-invalid={Boolean(errors.category)}>
						<SelectValue>{category ? categoryLabel(category) : "Choose a category"}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{DEFAULT_INQUIRY_CATEGORIES.map(code => (
							<SelectItem key={code} value={code}>
								{categoryLabel(code)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{errors.category ? <FieldError>{errors.category}</FieldError> : null}
			</Field>

			<fieldset className="flex flex-col gap-2">
				<legend className="mb-2 text-sm font-medium">Languages the article covers</legend>
				<div className="flex flex-wrap gap-4">
					{KNOWLEDGE_LANGUAGES.map(code => (
						<Field key={code} orientation="horizontal" className="w-auto">
							<Checkbox
								id={`kb-lang-${code}`}
								checked={languages.includes(code)}
								onCheckedChange={checked => toggleLanguage(code, checked === true)}
								disabled={isPending}
							/>
							<FieldLabel htmlFor={`kb-lang-${code}`} className="font-normal">
								{LANGUAGE_LABELS[code]}
							</FieldLabel>
						</Field>
					))}
				</div>
				{errors.languages ? <FieldError>{errors.languages}</FieldError> : null}
			</fieldset>

			<Field data-invalid={Boolean(errors.language)}>
				<FieldLabel htmlFor="kb-language">Language of this text</FieldLabel>
				<Select
					value={language}
					onValueChange={value => value && setLanguage(value as KnowledgeLanguage)}
					disabled={isPending}
				>
					<SelectTrigger id="kb-language" className="w-56">
						<SelectValue>{LANGUAGE_LABELS[language]}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{languages.map(code => (
							<SelectItem key={code} value={code}>
								{LANGUAGE_LABELS[code]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{errors.language ? <FieldError>{errors.language}</FieldError> : null}
			</Field>

			<Field data-invalid={Boolean(errors.body)}>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<FieldLabel htmlFor="kb-body">Article text</FieldLabel>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isPending || extract.isPending}
					>
						{extract.isPending ? "Reading file..." : "Start from a file"}
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						accept={EXTRACT_ACCEPT}
						className="sr-only"
						aria-label="Upload a DOCX, PDF, or HTML file"
						onChange={handleFile}
					/>
				</div>
				<Textarea
					id="kb-body"
					value={body}
					onChange={e => setBody(e.target.value)}
					rows={14}
					aria-invalid={Boolean(errors.body)}
					disabled={isPending}
				/>
				<FieldDescription>
					DOCX, PDF, or HTML files fill in this text. Only approved versions are used by the
					assistant.
				</FieldDescription>
				{notice ? <p className="text-muted-foreground text-sm">{notice}</p> : null}
				{errors.body ? <FieldError>{errors.body}</FieldError> : null}
			</Field>

			{formError ? (
				<p className="text-destructive text-sm" role="alert">
					{formError}
				</p>
			) : null}

			<div className="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
					Cancel
				</Button>
				<Button type="submit" disabled={isPending}>
					{isPending ? "Saving..." : article ? "Save draft" : "Create draft"}
				</Button>
			</div>
		</form>
	)
}

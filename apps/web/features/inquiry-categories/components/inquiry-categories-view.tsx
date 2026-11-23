"use client"

import {
	useInquiryCategoriesQuery,
	useUpdateInquiryCategoryMutation,
	type InquiryCategoryUi,
} from "../api/categories.hooks"
import { AddCategoryForm } from "./add-category-form"

/** The classifier's fallback (CNV-2 AC2); it can't be deactivated. */
const FALLBACK_CATEGORY = "other"

export function InquiryCategoriesView() {
	const { data: categories, isLoading, error } = useInquiryCategoriesQuery()
	const updateMutation = useUpdateInquiryCategoryMutation()

	const handleToggleEligible = (category: InquiryCategoryUi) => {
		updateMutation.mutate({
			code: category.code,
			isEligible: !category.isEligible,
			isActive: category.isActive,
		})
	}

	const handleToggleActive = (category: InquiryCategoryUi) => {
		updateMutation.mutate({
			code: category.code,
			isEligible: category.isEligible,
			isActive: !category.isActive,
		})
	}

	return (
		<div className="space-y-6 p-6">
			<div>
				<h1 className="text-lg font-semibold">Inquiry Categories &amp; Eligibility</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Every customer message is labelled with one active category. Eligibility decides whether
					the message counts toward the self-service measure; a change applies to new messages only,
					and earlier messages keep their label.
				</p>
			</div>

			{error && (
				<div
					role="alert"
					className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
				>
					{error.message}
				</div>
			)}

			{updateMutation.error && (
				<div
					role="alert"
					className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
				>
					{updateMutation.error.message}
				</div>
			)}

			<AddCategoryForm />

			{isLoading ? (
				<p className="text-muted-foreground text-sm">Loading inquiry categories…</p>
			) : (
				<div className="overflow-x-auto rounded-md border">
					<table className="w-full text-left text-sm">
						<thead className="bg-muted/50 border-b text-xs uppercase">
							<tr>
								<th className="px-4 py-3 font-medium">Category</th>
								<th className="px-4 py-3 font-medium">Code</th>
								<th className="px-4 py-3 font-medium">AI Self-Service Eligible</th>
								<th className="px-4 py-3 font-medium">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{(categories ?? []).map(category => (
								<tr key={category.code}>
									<td className="px-4 py-3 font-medium">{category.name}</td>
									<td className="text-muted-foreground px-4 py-3 font-mono text-xs">
										{category.code}
									</td>
									<td className="px-4 py-3">
										<button
											type="button"
											role="switch"
											aria-checked={category.isEligible}
											aria-label={`Toggle eligibility for ${category.name}`}
											disabled={updateMutation.isPending}
											onClick={() => handleToggleEligible(category)}
											className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
												category.isEligible
													? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
													: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
											}`}
										>
											{category.isEligible ? "Eligible" : "Ineligible"}
										</button>
									</td>
									<td className="px-4 py-3">
										<button
											type="button"
											aria-label={`Toggle active status for ${category.name}`}
											title={
												category.code === FALLBACK_CATEGORY
													? "The fallback category can't be deactivated"
													: undefined
											}
											disabled={updateMutation.isPending || category.code === FALLBACK_CATEGORY}
											onClick={() => handleToggleActive(category)}
											className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
												category.isActive
													? "bg-primary/10 text-primary"
													: "bg-muted text-muted-foreground"
											}`}
										>
											{category.isActive ? "Active" : "Inactive"}
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}

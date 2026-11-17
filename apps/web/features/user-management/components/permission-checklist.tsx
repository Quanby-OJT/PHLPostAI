"use client"

import { useMemo } from "react"

import { permissionModule, type PermissionName } from "@repo/contracts"

import { Checkbox } from "@/core/components/ui/checkbox"
import { Field, FieldLabel } from "@/core/components/ui/field"
import { usePermissionsQuery } from "@/features/user-management/api/rbac.hooks"

interface PermissionChecklistProps {
	value: PermissionName[]
	onChange: (next: PermissionName[]) => void
	disabled?: boolean
}

export function PermissionChecklist({ value, onChange, disabled }: PermissionChecklistProps) {
	const { data: permissions, isLoading, isError, error } = usePermissionsQuery()

	// FND-2: one group per module (`knowledge.articles.approve` -> `knowledge`),
	// in catalog order, so new PHLPost modules appear as their own groups.
	const grouped = useMemo(() => {
		const groups = new Map<string, PermissionName[]>()
		for (const permission of permissions ?? []) {
			const moduleName = permissionModule(permission.name)
			const list = groups.get(moduleName) ?? []
			list.push(permission.name)
			groups.set(moduleName, list)
		}
		return Array.from(groups.entries())
	}, [permissions])

	const selected = useMemo(() => new Set(value), [value])

	function toggle(permission: PermissionName, checked: boolean) {
		if (checked) {
			onChange([...value, permission])
		} else {
			onChange(value.filter(p => p !== permission))
		}
	}

	if (isLoading) {
		return <p className="text-muted-foreground text-sm">Loading permissions...</p>
	}

	if (isError) {
		return (
			<p className="text-destructive text-sm">
				{error instanceof Error ? error.message : "Failed to load permissions"}
			</p>
		)
	}

	return (
		<div className="flex flex-col gap-4">
			{grouped.map(([moduleName, names]) => (
				<fieldset key={moduleName} className="flex flex-col gap-2">
					<legend className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
						{moduleName}
					</legend>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{names.map(name => (
							<Field key={name} orientation="horizontal">
								<Checkbox
									id={`perm-${name}`}
									checked={selected.has(name)}
									onCheckedChange={checked => toggle(name, checked === true)}
									disabled={disabled}
								/>
								<FieldLabel htmlFor={`perm-${name}`} className="font-normal">
									{name}
								</FieldLabel>
							</Field>
						))}
					</div>
				</fieldset>
			))}
		</div>
	)
}

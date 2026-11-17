import type { KnowledgeVersionStatus } from "@repo/contracts"

import { Badge } from "@/core/components/ui/badge"
import { VERSION_STATUS_LABELS, VERSION_STATUS_VARIANT } from "@/features/knowledge/lib/labels"

export function VersionStatusBadge({
	status,
	indexing = false,
}: {
	status: KnowledgeVersionStatus
	indexing?: boolean
}) {
	if (indexing) return <Badge variant="outline">Indexing…</Badge>
	return <Badge variant={VERSION_STATUS_VARIANT[status]}>{VERSION_STATUS_LABELS[status]}</Badge>
}

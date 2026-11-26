/**
 * ADM-2: the audit sink, kept free of Better Auth imports. The backend imports it through the
 * `@repo/auth/audit-sink` subpath, so unit tests that load AuditService do not pull in the
 * ESM-only Better Auth packages that the root `@repo/auth` entry depends on.
 */

/** The entry this package hands to the backend's AuditService. */
export interface AuthAuditEntry {
	actorId: string
	actorType: "user"
	action: string
	resourceType: "user"
	resourceId: string
}

export type AuthAuditSink = (entry: AuthAuditEntry) => Promise<void>

let auditSink: AuthAuditSink | null = null

/**
 * ADM-2: the backend registers its AuditService here at startup. Every audit row written from
 * this package then goes through AuditService.writeAudit, the only writer of audit_log.
 */
export function setAuthAuditSink(sink: AuthAuditSink | null): void {
	auditSink = sink
}

export async function recordAuthAudit(entry: AuthAuditEntry): Promise<void> {
	if (!auditSink) {
		throw new Error("Audit sink not registered; the sign-in cannot be audited")
	}
	await auditSink(entry)
}

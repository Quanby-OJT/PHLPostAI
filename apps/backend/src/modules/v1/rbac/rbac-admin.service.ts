import { Injectable } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { ORPCError } from "@orpc/server"
import { and, eq, inArray, ne, sql } from "drizzle-orm"

import { sendStaffInvitation } from "@repo/auth"
import {
	ADMIN_ROLE,
	PERMISSION_NAMES,
	type AssignRoleRequest,
	type CreateRoleInput,
	type CreateUserRequest,
	type CreateUserResponse,
	type PermissionCatalogEntry,
	type PermissionName,
	type RemoveRoleRequest,
	type Role,
	type SetRolePermissionsRequest,
	type SetUserDisabledRequest,
	type UpdateRoleRequest,
	type UserWithRoles,
} from "@repo/contracts"
import { permissions, rolePermissions, roles, sessions, userRoles, users } from "@repo/db/schema"

import { AuditService } from "@/common/audit/audit.service"
import { db } from "@/common/database/database.client"
import { RbacCacheService } from "@/common/rbac/rbac-cache.service"

/** A transaction handle, so role writes and their audit rows commit together. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const PERMISSION_CATALOG = new Set<string>(PERMISSION_NAMES)

@Injectable()
export class RbacAdminService {
	constructor(
		private readonly cacheService: RbacCacheService,
		private readonly auditService: AuditService
	) {}

	// ---------------------------------------------------------------- roles
	async listRoles(): Promise<Role[]> {
		const roleRows = await db.select().from(roles).orderBy(roles.name)

		const permRows = await db
			.select({ roleId: rolePermissions.roleId, name: permissions.name })
			.from(rolePermissions)
			.innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))

		const countRows = await db
			.select({ roleId: userRoles.roleId, count: sql<number>`count(*)::int` })
			.from(userRoles)
			.groupBy(userRoles.roleId)

		const permsByRole = new Map<number, PermissionName[]>()
		for (const row of permRows) {
			if (!PERMISSION_CATALOG.has(row.name)) continue
			const list = permsByRole.get(row.roleId) ?? []
			list.push(row.name as PermissionName)
			permsByRole.set(row.roleId, list)
		}

		const countByRole = new Map<number, number>()
		for (const row of countRows) {
			countByRole.set(row.roleId, row.count)
		}

		return roleRows.map(role => ({
			id: role.id,
			name: role.name,
			description: role.description,
			permissions: this.orderPermissions(permsByRole.get(role.id) ?? []),
			userCount: countByRole.get(role.id) ?? 0,
			createdAt: role.createdAt,
			updatedAt: role.updatedAt,
		}))
	}

	async createRole(payload: CreateRoleInput): Promise<Role> {
		const [existing] = await db.select().from(roles).where(eq(roles.name, payload.name))
		if (existing) {
			throw new ORPCError("CONFLICT", { message: `Role "${payload.name}" already exists` })
		}

		const [role] = await db
			.insert(roles)
			.values({ name: payload.name, description: payload.description ?? null })
			.returning()

		if (!role) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Role could not be created" })
		}

		return this.buildRole(role.id)
	}

	async updateRole(payload: UpdateRoleRequest): Promise<Role> {
		const role = await this.getRoleRowOrThrow(payload.id)

		if (role.name === ADMIN_ROLE && payload.name !== undefined && payload.name !== ADMIN_ROLE) {
			throw new ORPCError("FORBIDDEN", { message: "The Admin role cannot be renamed" })
		}

		if (payload.name !== undefined && payload.name !== role.name) {
			const [clash] = await db.select().from(roles).where(eq(roles.name, payload.name))
			if (clash) {
				throw new ORPCError("CONFLICT", { message: `Role "${payload.name}" already exists` })
			}
		}

		await db
			.update(roles)
			.set({
				name: payload.name ?? role.name,
				description: payload.description !== undefined ? payload.description : role.description,
				updatedAt: new Date(),
			})
			.where(eq(roles.id, role.id))

		return this.buildRole(role.id)
	}

	async setRolePermissions(payload: SetRolePermissionsRequest): Promise<Role> {
		const role = await this.getRoleRowOrThrow(payload.id)

		const uniqueNames = Array.from(new Set(payload.permissions))
		const permissionRows = uniqueNames.length
			? await db.select().from(permissions).where(inArray(permissions.name, uniqueNames))
			: []

		const foundNames = new Set(permissionRows.map(p => p.name))
		const missing = uniqueNames.filter(name => !foundNames.has(name))
		if (missing.length) {
			throw new ORPCError("BAD_REQUEST", { message: `Unknown permissions: ${missing.join(", ")}` })
		}

		await db.transaction(async tx => {
			await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id))
			if (permissionRows.length) {
				await tx
					.insert(rolePermissions)
					.values(permissionRows.map(p => ({ roleId: role.id, permissionId: p.id })))
			}
		})

		await this.cacheService.clear()
		return this.buildRole(role.id)
	}

	async deleteRole(id: number): Promise<{ success: boolean; id: number }> {
		const role = await this.getRoleRowOrThrow(id)

		if (role.name === ADMIN_ROLE) {
			throw new ORPCError("FORBIDDEN", { message: "The Admin role cannot be deleted" })
		}

		await db.delete(roles).where(eq(roles.id, role.id))
		await this.cacheService.clear()
		return { success: true, id: role.id }
	}

	// ---------------------------------------------------------- permissions
	async listPermissions(): Promise<PermissionCatalogEntry[]> {
		const rows = await db.select().from(permissions)
		const descByName = new Map(rows.map(row => [row.name, row.description]))

		return PERMISSION_NAMES.filter(name => descByName.has(name)).map(name => ({
			name,
			description: descByName.get(name) ?? null,
		}))
	}

	// ---------------------------------------------------------------- users
	async listUsers(): Promise<UserWithRoles[]> {
		const userRows = await db.select().from(users).orderBy(users.email)

		const roleRows = await db
			.select({ userId: userRoles.userId, name: roles.name })
			.from(userRoles)
			.innerJoin(roles, eq(userRoles.roleId, roles.id))

		const rolesByUser = new Map<string, string[]>()
		for (const row of roleRows) {
			const list = rolesByUser.get(row.userId) ?? []
			list.push(row.name)
			rolesByUser.set(row.userId, list)
		}

		return userRows.map(user => ({
			id: user.id,
			name: user.name,
			email: user.email,
			roles: (rolesByUser.get(user.id) ?? []).sort(),
			disabled: user.disabled,
		}))
	}

	/**
	 * ADM-1: admin-provisioned account. The account and its roles commit in one
	 * transaction with the audit entry. The person then gets an invitation to set
	 * a password. No credential row exists until they do, so nothing can sign in.
	 */
	async createUser(payload: CreateUserRequest, actorId: string): Promise<CreateUserResponse> {
		const [existing] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, payload.email))
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: `A user with email ${payload.email} already exists`,
			})
		}

		const roleNames = Array.from(new Set(payload.roleNames)).sort()
		const roleRows = await db
			.select({ id: roles.id, name: roles.name })
			.from(roles)
			.where(inArray(roles.name, roleNames))
		const missing = roleNames.filter(name => !roleRows.some(row => row.name === name))
		if (missing.length) {
			throw new ORPCError("BAD_REQUEST", { message: `Unknown roles: ${missing.join(", ")}` })
		}

		const userId = randomUUID()
		await db.transaction(async tx => {
			await tx.insert(users).values({
				id: userId,
				name: payload.name,
				email: payload.email,
				emailVerified: true, // the invitation link proves the address
			})
			await tx.insert(userRoles).values(roleRows.map(role => ({ userId, roleId: role.id })))
			await this.auditService.writeAudit(
				{
					actorId,
					actorType: "user",
					action: "users.accounts.create",
					resourceType: "user",
					resourceId: userId,
					after: { email: payload.email, name: payload.name, roles: roleNames },
				},
				tx
			)
		})

		await this.sendInvitationOrRollBack(userId, payload.email, roleNames, actorId)
		return { id: userId, name: payload.name, email: payload.email, roles: roleNames }
	}

	/**
	 * ADM-1: the invitation is sent here, not through Better Auth's reset endpoint.
	 * That endpoint logs mail failures and still reports success, so a failed send
	 * would look like a created account with no email. If the email cannot be sent,
	 * the new account is removed, the failure is audited, and the request fails.
	 */
	private async sendInvitationOrRollBack(
		userId: string,
		email: string,
		roleNames: string[],
		actorId: string
	): Promise<void> {
		try {
			await sendStaffInvitation({ userId, email })
		} catch {
			await db.transaction(async tx => {
				await tx.delete(users).where(eq(users.id, userId))
				await this.auditService.writeAudit(
					{
						actorId,
						actorType: "user",
						action: "users.accounts.invite_failed",
						resourceType: "user",
						resourceId: userId,
						after: { email, roles: roleNames },
					},
					tx
				)
			})
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					"The invitation email could not be sent, so the account was not kept. Check the mail settings and try again.",
			})
		}
	}

	/**
	 * F4/ADM-1: disable = no new sessions (Better Auth session-create hook) AND
	 * every existing session revoked in the same transaction. Re-enable restores
	 * sign-in. Refused when it would leave no active System Administrator.
	 */
	async setUserDisabled(payload: SetUserDisabledRequest, actorId: string) {
		await db.transaction(async tx => {
			await this.lockAdminRole(tx)
			const user = await this.getUserOrThrow(tx, payload.userId)
			if (user.id === actorId) {
				throw new ORPCError("BAD_REQUEST", { message: "You cannot disable your own account" })
			}
			if (payload.disabled && !user.disabled) {
				await this.assertNotLastActiveAdmin(tx, user.id)
			}

			await tx
				.update(users)
				.set({ disabled: payload.disabled, updatedAt: new Date() })
				.where(eq(users.id, payload.userId))
			if (payload.disabled) {
				// Revoke every live session so the lockout is immediate.
				await tx.delete(sessions).where(eq(sessions.userId, payload.userId))
			}

			await this.auditService.writeAudit(
				{
					actorId,
					actorType: "user",
					action: payload.disabled ? "users.accounts.disable" : "users.accounts.enable",
					resourceType: "user",
					resourceId: payload.userId,
					before: { disabled: user.disabled },
					after: { disabled: payload.disabled },
				},
				tx
			)
		})

		return { id: payload.userId, disabled: payload.disabled }
	}

	/**
	 * ADM-1: assigning a role needs users.accounts.manage (route) and
	 * users.roles.manage. Audited with the role set before and after, in the same
	 * transaction as the change. The RBAC cache is cleared inside the transaction and
	 * again after commit, so the new permissions apply on the next request, and a cache
	 * failure rolls the change back.
	 */
	async assignUserRole(payload: AssignRoleRequest, actorId: string) {
		await db.transaction(async tx => {
			await this.getUserOrThrow(tx, payload.userId)
			const role = await this.getRoleRowByName(tx, payload.roleName)
			const before = await this.getUserRoleNames(payload.userId, tx)

			await tx
				.insert(userRoles)
				.values({ userId: payload.userId, roleId: role.id })
				.onConflictDoNothing()

			const after = await this.getUserRoleNames(payload.userId, tx)
			// Inside the transaction: if the cache cannot be cleared the change rolls back.
			await this.cacheService.invalidate(payload.userId)
			// Flow E: role assignment is a privileged state change, audited with the
			// before -> after role sets on the append-only spine.
			await this.auditService.writeAudit(
				{
					actorId,
					actorType: "user",
					action: "users.roles.assign",
					resourceType: "user",
					resourceId: payload.userId,
					before: { roles: before },
					after: { roles: after },
				},
				tx
			)
		})

		await this.invalidateAfterCommit(payload.userId)
		return { success: true, userId: payload.userId, roleName: payload.roleName }
	}

	/**
	 * ADM-1: removing a role needs the same two keys as assigning one. Removing
	 * System Administrator from the last active holder is refused. The admin-role
	 * lock is taken before the check, so a concurrent change cannot slip past it.
	 * A Staff user holds one or more Roles (DOMAIN-MODEL glossary), so removing the
	 * account's only role is refused too.
	 */
	async removeUserRole(payload: RemoveRoleRequest, actorId: string) {
		await db.transaction(async tx => {
			const role = await this.getRoleRowByName(tx, payload.roleName)
			if (role.name === ADMIN_ROLE) {
				await this.lockAdminRole(tx)
			}
			const user = await this.getUserOrThrow(tx, payload.userId)
			if (role.name === ADMIN_ROLE) {
				await this.assertNotLastActiveAdmin(tx, user.id)
			}

			const before = await this.getUserRoleNames(user.id, tx)
			if (before.length === 1 && before[0] === role.name) {
				throw new ORPCError("BAD_REQUEST", {
					message: "A staff account must keep at least one role. Assign another role before removing this one.",
				})
			}
			await tx
				.delete(userRoles)
				.where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, role.id)))
			const after = await this.getUserRoleNames(user.id, tx)

			// Inside the transaction: if the cache cannot be cleared the removal rolls back.
			await this.cacheService.invalidate(user.id)
			await this.auditService.writeAudit(
				{
					actorId,
					actorType: "user",
					action: "users.roles.remove",
					resourceType: "user",
					resourceId: user.id,
					before: { roles: before },
					after: { roles: after },
				},
				tx
			)
		})

		await this.invalidateAfterCommit(payload.userId)
		return { success: true, userId: payload.userId, roleName: payload.roleName }
	}

	// -------------------------------------------------------------- helpers
	/**
	 * Second invalidation, after commit. The first one (inside the transaction) already
	 * rolls the change back on failure; this one catches a request that cached the old
	 * roles between the two calls. If it fails, the request fails. The change is saved,
	 * so repeating it is safe and clears the cache again.
	 */
	private async invalidateAfterCommit(userId: string): Promise<void> {
		try {
			await this.cacheService.invalidate(userId)
		} catch {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					"The change was saved, but permissions could not be refreshed. Repeat the change; it is safe to repeat and clears the cache again.",
			})
		}
	}

	/**
	 * Serialises every change that could remove an active System Administrator.
	 * The row lock lasts until the transaction ends, so two concurrent changes
	 * cannot both see the other administrator still active.
	 */
	private async lockAdminRole(tx: Tx): Promise<void> {
		await tx.select({ id: roles.id }).from(roles).where(eq(roles.name, ADMIN_ROLE)).for("update")
	}

	/**
	 * Throws when `userId` is an active System Administrator and no other active
	 * System Administrator would remain. Callers take the admin-role lock first.
	 */
	private async assertNotLastActiveAdmin(tx: Tx, userId: string): Promise<void> {
		const [self] = await tx
			.select({ id: users.id })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.innerJoin(users, eq(users.id, userRoles.userId))
			.where(and(eq(users.id, userId), eq(roles.name, ADMIN_ROLE), eq(users.disabled, false)))
			.limit(1)
		if (!self) return

		const [other] = await tx
			.select({ id: users.id })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.innerJoin(users, eq(users.id, userRoles.userId))
			.where(and(ne(users.id, userId), eq(roles.name, ADMIN_ROLE), eq(users.disabled, false)))
			.limit(1)
		if (!other) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"This is the last active System Administrator. Make another active account a System Administrator first.",
			})
		}
	}

	private async getUserOrThrow(tx: Tx | typeof db, userId: string) {
		const [user] = await tx.select().from(users).where(eq(users.id, userId))
		if (!user) {
			throw new ORPCError("NOT_FOUND", { message: `User ${userId} not found` })
		}
		return user
	}

	private async getRoleRowByName(tx: Tx | typeof db, name: string) {
		const [role] = await tx.select().from(roles).where(eq(roles.name, name))
		if (!role) {
			throw new ORPCError("NOT_FOUND", { message: `Role "${name}" not found` })
		}
		return role
	}

	private async getUserRoleNames(userId: string, tx: Tx | typeof db = db): Promise<string[]> {
		const rows = await tx
			.select({ name: roles.name })
			.from(userRoles)
			.innerJoin(roles, eq(userRoles.roleId, roles.id))
			.where(eq(userRoles.userId, userId))
		return rows.map(row => row.name).sort()
	}

	private async getRoleRowOrThrow(id: number) {
		const [role] = await db.select().from(roles).where(eq(roles.id, id))
		if (!role) {
			throw new ORPCError("NOT_FOUND", { message: `Role with ID ${id} not found` })
		}
		return role
	}

	private async buildRole(id: number): Promise<Role> {
		const role = await this.getRoleRowOrThrow(id)

		const permRows = await db
			.select({ name: permissions.name })
			.from(rolePermissions)
			.innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
			.where(eq(rolePermissions.roleId, id))

		const [{ count } = { count: 0 }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(userRoles)
			.where(eq(userRoles.roleId, id))

		const grantedPermissions = permRows
			.map(p => p.name)
			.filter((name): name is PermissionName => PERMISSION_CATALOG.has(name))

		return {
			id: role.id,
			name: role.name,
			description: role.description,
			permissions: this.orderPermissions(grantedPermissions),
			userCount: count,
			createdAt: role.createdAt,
			updatedAt: role.updatedAt,
		}
	}

	private orderPermissions(names: PermissionName[]): PermissionName[] {
		const held = new Set(names)
		return PERMISSION_NAMES.filter(name => held.has(name))
	}
}

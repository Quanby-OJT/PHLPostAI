import { oc } from "@orpc/contract"
import { z } from "zod"

import {
	AssignRoleRequestSchema,
	CreateRoleSchema,
	CreateUserRequestSchema,
	CreateUserResponseSchema,
	DeleteRoleResponseSchema,
	PermissionSchema,
	RemoveRoleRequestSchema,
	ResetSecondFactorRequestSchema,
	ResetSecondFactorResponseSchema,
	RoleIdSchema,
	RoleSchema,
	SetRolePermissionsRequestSchema,
	SetUserDisabledRequestSchema,
	UpdateRoleRequestSchema,
	UserRoleMutationResponseSchema,
	UserWithRolesSchema,
} from "./rbac.schema.js"

/**
 * RBAC administration contract.
 *
 * Role/permission surfaces require `users.roles.manage`; the user directory
 * requires `users.accounts.manage` (enforced by the backend RbacGuard).
 * Permissions are a fixed catalog; this surface assigns
 * existing catalog permissions to roles, it does not mint new permissions.
 */
export const rbacContract = {
	roles: {
		list: oc
			.route({
				method: "GET",
				path: "/rbac/roles",
				summary: "List roles",
				description: "List all roles with their assigned permissions and user counts.",
				tags: ["RBAC"],
			})
			.output(z.array(RoleSchema)),

		create: oc
			.route({
				method: "POST",
				path: "/rbac/roles",
				summary: "Create role",
				description: "Create a new role.",
				tags: ["RBAC"],
			})
			.input(CreateRoleSchema)
			.output(RoleSchema),

		update: oc
			.route({
				method: "PUT",
				path: "/rbac/roles/{id}",
				summary: "Update role",
				description: "Update a role's name or description.",
				tags: ["RBAC"],
			})
			.input(UpdateRoleRequestSchema)
			.output(RoleSchema),

		setPermissions: oc
			.route({
				method: "PUT",
				path: "/rbac/roles/{id}/permissions",
				summary: "Set role permissions",
				description: "Replace the full set of permissions granted to a role.",
				tags: ["RBAC"],
			})
			.input(SetRolePermissionsRequestSchema)
			.output(RoleSchema),

		delete: oc
			.route({
				method: "DELETE",
				path: "/rbac/roles/{id}",
				summary: "Delete role",
				description: "Delete a role.",
				tags: ["RBAC"],
			})
			.input(RoleIdSchema)
			.output(DeleteRoleResponseSchema),
	},

	permissions: {
		list: oc
			.route({
				method: "GET",
				path: "/rbac/permissions",
				summary: "List permissions",
				description: "List the permission catalog.",
				tags: ["RBAC"],
			})
			.output(z.array(PermissionSchema)),
	},

	users: {
		list: oc
			.route({
				method: "GET",
				path: "/rbac/users",
				summary: "List users",
				description: "List all users with their assigned role names.",
				tags: ["RBAC"],
			})
			.output(z.array(UserWithRolesSchema)),

		assignRole: oc
			.route({
				method: "POST",
				path: "/rbac/users/{userId}/roles",
				summary: "Assign role to user",
				description:
					"Assign a role to a user by role name. Requires users.accounts.manage and users.roles.manage. Audited with old and new roles.",
				tags: ["RBAC"],
			})
			.input(AssignRoleRequestSchema)
			.output(UserRoleMutationResponseSchema),

		removeRole: oc
			.route({
				method: "DELETE",
				path: "/rbac/users/{userId}/roles/{roleName}",
				summary: "Remove role from user",
				description:
					"Remove a role from a user by role name. Requires users.accounts.manage and users.roles.manage. Refused when it would leave no active System Administrator or leave the account with no role. Audited with old and new roles.",
				tags: ["RBAC"],
			})
			.input(RemoveRoleRequestSchema)
			.output(UserRoleMutationResponseSchema),

		create: oc
			.route({
				method: "POST",
				path: "/rbac/users",
				summary: "Create a user (admin-provisioned)",
				description:
					"ADM-1: create an account with one or more roles and email the person an invitation to set a password. There is no public registration. Requires users.accounts.manage and users.roles.manage.",
				tags: ["RBAC"],
			})
			.input(CreateUserRequestSchema)
			.output(CreateUserResponseSchema),

		setDisabled: oc
			.route({
				method: "PUT",
				path: "/rbac/users/{userId}/disabled",
				summary: "Disable or re-enable a user",
				description:
					"F4: a disabled account cannot obtain new sessions and its existing sessions are revoked. Audited.",
				tags: ["RBAC"],
			})
			.input(SetUserDisabledRequestSchema)
			.output(UserWithRolesSchema.pick({ id: true, disabled: true })),

		/**
		 * ADM-2: remove a user's authenticator app and recovery codes, end their sessions,
		 * and require enrolment again at next sign-in. Requires users.accounts.manage. Audited.
		 */
		resetSecondFactor: oc
			.route({
				method: "POST",
				path: "/rbac/users/{userId}/mfa/reset",
				summary: "Reset a user's second factor",
				description:
					"ADM-2: removes the authenticator app and recovery codes, ends the user's sessions, and requires enrolment again at next sign-in. Requires users.accounts.manage. Audited.",
				tags: ["RBAC"],
			})
			.input(ResetSecondFactorRequestSchema)
			.output(ResetSecondFactorResponseSchema),
	},
}

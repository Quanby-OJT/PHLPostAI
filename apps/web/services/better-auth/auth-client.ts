import { twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

import { getAuthUrl } from "./lib/utils"

/**
 * Better Auth client for React components.
 * Provides hooks like useSession, signIn, signOut, etc.
 *
 * Points to the NestJS backend for auth operations.
 * ADM-2: the two-factor client adds the authenticator-app and recovery-code calls.
 */
export const authClient = createAuthClient({
	baseURL: getAuthUrl(),
	plugins: [twoFactorClient()],
}) as ReturnType<typeof createAuthClient>

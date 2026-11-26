export const AUTH_BASE_PATH = "/auth"
export const AUTH_CLIENT_ADDRESS_HEADER = "x-auth-client-address"

const auth = {
	api: { getSession: async () => null },
	handler: async () => new Response(null, { status: 404 }),
}

export function getAuth(): {
	api: { getSession: () => Promise<null> }
	handler: () => Promise<Response>
} {
	return auth
}

export function parseOriginList(value: string): string[] {
	return value
		.split(",")
		.map(origin => origin.trim())
		.filter(Boolean)
}

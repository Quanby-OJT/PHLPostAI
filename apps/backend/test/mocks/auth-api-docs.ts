export function isApiDocsEnabled(
	nodeEnv: string | undefined,
	rawFlag: boolean | undefined
): boolean {
	if (rawFlag !== undefined) return rawFlag
	return (nodeEnv ?? "development") === "development"
}

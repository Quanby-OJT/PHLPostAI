export function fromNodeHeaders(headers: ConstructorParameters<typeof Headers>[0]): Headers {
	return new Headers(headers)
}

export function toNodeHandler() {
	return (_request: unknown, _response: unknown, next: () => void) => next()
}

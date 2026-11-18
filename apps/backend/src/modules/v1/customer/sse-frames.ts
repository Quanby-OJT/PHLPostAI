/** One parsed Server-Sent Events frame. */
export interface SseFrame {
	/** The frame exactly as it arrived, for verbatim forwarding. */
	raw: string
	/** `event:` name, or null for an unnamed frame. */
	event: string | null
	/** Concatenated `data:` lines, or null when the frame carried none. */
	data: string | null
}

/**
 * Split an SSE byte stream into frames (CNV-1).
 *
 * The public chat endpoint forwards the RAG service's `token` frames through
 * untouched but has to REPLACE the `final` frame — it is the only place the
 * backend can attach the conversation id, the stored message id, and the
 * article titles. That means parsing frames rather than piping bytes, which
 * is also why the parser lives here: it is pure, so the forwarding rules are
 * unit-testable without an HTTP server or a RAG service.
 *
 * Frames are separated by a blank line. A trailing partial frame (a stream cut
 * mid-frame) is discarded rather than guessed at.
 */
export async function* readSseFrames(
	body: AsyncIterable<Uint8Array | string>
): AsyncGenerator<SseFrame> {
	const decoder = new TextDecoder()
	let buffer = ""

	for await (const chunk of body) {
		buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })

		let separator = buffer.indexOf("\n\n")
		while (separator !== -1) {
			const raw = buffer.slice(0, separator)
			buffer = buffer.slice(separator + 2)
			if (raw.trim() !== "") yield parseSseFrame(raw)
			separator = buffer.indexOf("\n\n")
		}
	}

	// A well-formed stream ends with a blank line, so anything left here is a
	// truncated frame. Yield it only if it parsed into something complete.
	const remainder = buffer.trim()
	if (remainder !== "") yield parseSseFrame(remainder)
}

/** Parse one frame body (no trailing blank line) into its event and data. */
export function parseSseFrame(raw: string): SseFrame {
	let event: string | null = null
	const dataLines: string[] = []

	for (const line of raw.split("\n")) {
		if (line.startsWith("event:")) {
			event = line.slice("event:".length).trim()
		} else if (line.startsWith("data:")) {
			dataLines.push(line.slice("data:".length).trimStart())
		}
	}

	return { raw, event, data: dataLines.length > 0 ? dataLines.join("\n") : null }
}

/** Render one SSE frame for the wire. */
export function formatSseFrame(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

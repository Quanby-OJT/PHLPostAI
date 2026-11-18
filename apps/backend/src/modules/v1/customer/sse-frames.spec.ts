import { formatSseFrame, parseSseFrame, readSseFrames } from "./sse-frames"

/** Feed a stream in arbitrary byte-sized pieces, as a socket would. */
async function* chunks(...pieces: string[]): AsyncGenerator<Uint8Array> {
	const encoder = new TextEncoder()
	for (const piece of pieces) yield encoder.encode(piece)
}

describe("SSE frame reader (CNV-1 stream rewriting)", () => {
	it("splits frames and reads their event and data", async () => {
		const frames = []
		for await (const frame of readSseFrames(
			chunks('event: token\ndata: {"delta":"Hi"}\n\nevent: final\ndata: {"answer":"Hi"}\n\n')
		)) {
			frames.push(frame)
		}

		expect(frames).toHaveLength(2)
		expect(frames[0]).toMatchObject({ event: "token", data: '{"delta":"Hi"}' })
		expect(frames[1]).toMatchObject({ event: "final", data: '{"answer":"Hi"}' })
	})

	it("reassembles a frame split across chunk boundaries", async () => {
		// The boundary falls inside the data line AND inside the separator —
		// the case that makes a naive per-chunk parser drop tokens.
		const frames = []
		for await (const frame of readSseFrames(
			chunks("event: token\nda", 'ta: {"delta":"par', 'tial"}\n', "\nevent: token\ndata: {}\n\n")
		)) {
			frames.push(frame)
		}

		expect(frames.map(frame => frame.data)).toEqual(['{"delta":"partial"}', "{}"])
	})

	it("keeps a frame's raw text intact so token frames forward verbatim", async () => {
		const frames = []
		for await (const frame of readSseFrames(chunks('event: token\ndata: {"delta":"a"}\n\n'))) {
			frames.push(frame)
		}

		expect(frames[0]?.raw).toBe('event: token\ndata: {"delta":"a"}')
	})

	it("ignores keep-alive blank frames", async () => {
		const frames = []
		for await (const frame of readSseFrames(chunks("\n\n", "event: token\ndata: {}\n\n", "\n\n"))) {
			frames.push(frame)
		}

		expect(frames).toHaveLength(1)
	})

	it("concatenates multi-line data as the SSE spec requires", () => {
		expect(parseSseFrame("event: final\ndata: {\ndata: }").data).toBe("{\n}")
	})

	it("reports no data for a frame that carries none", () => {
		expect(parseSseFrame("event: ping")).toEqual({ raw: "event: ping", event: "ping", data: null })
	})

	it("formats a frame the browser can parse back", () => {
		expect(formatSseFrame("final", { answer: "ok" })).toBe(
			'event: final\ndata: {"answer":"ok"}\n\n'
		)
	})
})

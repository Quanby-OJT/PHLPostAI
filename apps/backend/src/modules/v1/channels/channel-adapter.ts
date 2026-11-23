/** Normalized message received from any supported delivery channel. */
export interface ChannelMessage {
	text: string
	conversationId?: string
	metadata?: Record<string, unknown>
}

export interface ChannelCapabilities {
	streaming: boolean
	attachments: boolean
	conversationHistory: boolean
}

/** Adapter boundary between channel-specific transports and chat services. */
export interface ChannelAdapter {
	readonly code: string
	readonly capabilities: ChannelCapabilities
	receive(payload: unknown): ChannelMessage
	send<T>(message: T): T
}

/** CHN-2's website widget adapter. Other transports register alongside it. */
export class WebWidgetChannelAdapter implements ChannelAdapter {
	readonly code = "web-widget"
	readonly capabilities: ChannelCapabilities = {
		streaming: true,
		attachments: false,
		conversationHistory: true,
	}

	receive(payload: unknown): ChannelMessage {
		if (!payload || typeof payload !== "object") throw new Error("Invalid channel message")
		const value = payload as { query?: unknown; conversationId?: unknown }
		if (typeof value.query !== "string" || !value.query.trim()) {
			throw new Error("Channel message must include text")
		}
		return {
			text: value.query.trim(),
			...(typeof value.conversationId === "string" ? { conversationId: value.conversationId } : {}),
		}
	}

	send<T>(message: T): T {
		return message
	}
}

/** Registry keyed by stable channel code; duplicate registrations fail early. */
export class ChannelAdapterRegistry {
	private readonly adapters = new Map<string, ChannelAdapter>()

	register(adapter: ChannelAdapter): void {
		if (this.adapters.has(adapter.code))
			throw new Error(`Channel adapter already registered: ${adapter.code}`)
		this.adapters.set(adapter.code, adapter)
	}

	get(code: string): ChannelAdapter {
		const adapter = this.adapters.get(code)
		if (!adapter) throw new Error(`No channel adapter registered for ${code}`)
		return adapter
	}
}

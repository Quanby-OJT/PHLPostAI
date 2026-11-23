import { Inject, Injectable } from "@nestjs/common"
import { EventEmitter } from "node:events"
import { and, asc, eq, gt } from "drizzle-orm"
import type { Response } from "express"

import { conversations, messages } from "@repo/db/schema"

import { db } from "@/common/database/database.client"

import { REDIS_CLIENT, type RedisClient } from "../redis/redis.provider"

const topic = (conversationId: string) => `conversation-live:${conversationId}`

@Injectable()
export class ConversationLiveService {
	private readonly local = new EventEmitter()

	constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

	async publish(conversationId: string): Promise<void> {
		this.local.emit(topic(conversationId))
		if (!this.redis) return
		await this.redis.publish(topic(conversationId), "changed").catch(() => undefined)
	}

	async subscribe(conversationId: string, notify: () => void): Promise<() => Promise<void>> {
		const channel = topic(conversationId)
		this.local.on(channel, notify)
		const subscriber = this.redis?.duplicate()
		if (!subscriber)
			return async () => {
				this.local.off(channel, notify)
			}

		const onMessage = (receivedChannel: string) => {
			if (receivedChannel === channel) notify()
		}
		subscriber.on("message", onMessage)
		try {
			await subscriber.subscribe(channel)
		} catch {
			// Database polling remains active if Redis is not ready.
		}
		return async () => {
			this.local.off(channel, notify)
			subscriber.off("message", onMessage)
			if (subscriber.status !== "end") {
				await subscriber.unsubscribe(channel).catch(() => undefined)
				await subscriber.quit().catch(() => subscriber.disconnect())
			}
		}
	}

	async getMessagesAfter(conversationId: string, turnIndex: number) {
		return db
			.select({
				id: messages.id,
				sender: messages.sender,
				role: messages.role,
				content: messages.content,
				turnIndex: messages.turnIndex,
				createdAt: messages.createdAt,
			})
			.from(messages)
			.where(and(eq(messages.conversationId, conversationId), gt(messages.turnIndex, turnIndex)))
			.orderBy(asc(messages.turnIndex))
	}

	async getConversationStatus(conversationId: string) {
		const [row] = await db
			.select({ status: conversations.status })
			.from(conversations)
			.where(eq(conversations.id, conversationId))
			.limit(1)
		return row?.status ?? null
	}

	async stream(
		conversationId: string,
		response: Response,
		options: { afterTurnIndex?: number; agentsOnly?: boolean } = {}
	): Promise<void> {
		response.status(200)
		response.setHeader("content-type", "text/event-stream")
		response.setHeader("cache-control", "no-cache, no-transform")
		response.setHeader("connection", "keep-alive")
		response.setHeader("x-accel-buffering", "no")
		response.flushHeaders()

		let cursor = options.afterTurnIndex ?? -1
		let previousStatus: string | null = null
		let alive = true
		let flushing = false
		let unsubscribe: (() => Promise<void>) | undefined
		const flush = async () => {
			if (!alive || flushing) return
			flushing = true
			try {
				const rows = await this.getMessagesAfter(conversationId, cursor)
				for (const row of rows) {
					cursor = row.turnIndex
					if (options.agentsOnly && row.sender !== "agent") continue
					response.write(
						`event: message\ndata: ${JSON.stringify({
							id: row.id,
							sender: row.sender ?? row.role,
							content: row.content,
							turnIndex: row.turnIndex,
							createdAt: row.createdAt,
						})}\n\n`
					)
				}
				const status = await this.getConversationStatus(conversationId)
				if (status && status !== previousStatus) {
					previousStatus = status
					response.write(`event: status\ndata: ${JSON.stringify({ status })}\n\n`)
				}
				if (status === "resolved_by_agent" || status === "abandoned") {
					response.end()
				}
			} catch {
				// A transient database/Redis error is retried by the next poll.
			} finally {
				flushing = false
			}
		}
		const notify = () => void flush()
		const poll = setInterval(notify, 1000)
		const heartbeat = setInterval(() => {
			if (alive) response.write(": keepalive\n\n")
		}, 15_000)
		response.on("close", () => {
			alive = false
			clearInterval(poll)
			clearInterval(heartbeat)
			void unsubscribe?.()
		})
		unsubscribe = await this.subscribe(conversationId, notify)
		await flush()
		if (alive) await new Promise<void>(resolve => response.once("close", resolve))
	}
}

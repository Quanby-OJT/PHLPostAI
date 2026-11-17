import { Injectable, Logger } from "@nestjs/common"
import { createHash, randomBytes } from "node:crypto"
import { db } from "@/common/database/database.client"
import { customer_sessions } from "@repo/db/schema"
import { eq } from "drizzle-orm"

@Injectable()
export class CustomerChatService {
    private readonly logger = new Logger(CustomerChatService.name)

    /**
     * Generates a cryptographically secure session token and its SHA-256 hash.
     */
    generateSessionToken(): { rawToken: string; tokenHash: string } {
        const rawToken = randomBytes(32).toString("hex")
        const tokenHash = createHash("sha256").update(rawToken).digest("hex")
        return { rawToken, tokenHash }
    }

    /**
     * Scrubs PII (phone numbers, email addresses, ID numbers) from customer input text.
     */
    maskPii(text: string): string {
        return text
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
            .replace(/(\+63|0)?9\d{9}/g, "[REDACTED_PHONE]")
            .replace(/\b(?:ID|Ref|Tracking)[\s#:]*([A-Za-z0-9-_]{6,})/gi, "[REDACTED_ID]")
    }

    /**
     * Creates a new customer session in the database storing zero PII.
     */
    async createSession(channelCode: string = "web", language: string = "en") {
        const { rawToken, tokenHash } = this.generateSessionToken()

        await db.insert(customer_sessions).values({
            tokenHash,
            channelCode,
            language,
            consentedAt: new Date(),
            lastSeenAt: new Date(),
        })

        this.logger.log(`Created new customer session for channel: ${channelCode}`)

        return {
            sessionToken: rawToken,
            channelCode,
            language,
        }
    }
}
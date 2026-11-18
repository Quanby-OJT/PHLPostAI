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
     * Scrubs PII (phone numbers with spaces/dashes, email addresses, and ID numbers) from customer input text.
     */
    maskPii(text: string): string {
        return text
            // Email masking
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
            // Phone numbers with optional spaces, dashes, country codes, or prefixes (+63 917 123 4567, 0917-123-4567)
            .replace(/(?:(?:\+?63|0)?\s*-?\s*\(?\d{1,4}\)?[\s.-]*)?\d{3}[\s.-]*\d{3,4}[\s.-]*\d{4}\b/g, "[REDACTED_PHONE]")
            // IDs with explicit prefix (ID, Ref, Tracking) or generic standalone tracking codes/IDs without a prefix
            .replace(/\b(?:(?:ID|Ref|Tracking)[\s#:]*)?([A-Z0-9_-]{6,})\b/gi, (match, p1) => {
                // If it has a prefix, definitely redact. If not, check if it looks like an ID/tracking code (contains digits)
                if (/\b(?:ID|Ref|Tracking)/i.test(match) || /\d/.test(p1)) {
                    return "[REDACTED_ID]"
                }
                return match
            })
    }

    /**
     * Creates a new customer session in the database storing zero PII.
     */
    async createSession(channelCode: string = "web-widget", language: string = "en") {
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
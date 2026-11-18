CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"token_hash" text NOT NULL UNIQUE,
	"channel_code" text DEFAULT 'web' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"consented_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "customer_session_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel_code" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "status" text DEFAULT 'ai_active' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "answer_kind" text;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_customer_session_id_idx" ON "conversations" ("customer_session_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_session_id_customer_sessions_id_fkey" FOREIGN KEY ("customer_session_id") REFERENCES "customer_sessions"("id") ON DELETE CASCADE;
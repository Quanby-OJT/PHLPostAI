CREATE TABLE "tracking_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"message_id" uuid NOT NULL,
	"connector_code" text NOT NULL,
	"tracking_number_hash" text NOT NULL,
	"outcome" text NOT NULL,
	"status_code" text,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tracking_lookups_message_idx" ON "tracking_lookups" ("message_id");--> statement-breakpoint
CREATE INDEX "tracking_lookups_number_hash_idx" ON "tracking_lookups" ("tracking_number_hash");--> statement-breakpoint
ALTER TABLE "tracking_lookups" ADD CONSTRAINT "tracking_lookups_message_id_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE;
CREATE TABLE "interaction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text,
	"language" text NOT NULL,
	"channel_code" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "interaction_events_occurred_at_idx" ON "interaction_events" ("occurred_at");--> statement-breakpoint
CREATE INDEX "interaction_events_kind_occurred_at_idx" ON "interaction_events" ("kind","occurred_at");--> statement-breakpoint
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_kind_check" CHECK ("kind" IN ('conversation_started', 'message_answered', 'tracking_lookup', 'escalation_requested'));
--> statement-breakpoint
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_category_code_check" CHECK ("category" IS NULL OR "category" ~ '^[a-z0-9][a-z0-9_-]{0,63}$');
--> statement-breakpoint
CREATE FUNCTION reject_interaction_event_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'interaction_events is append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER interaction_events_no_update_or_delete
BEFORE UPDATE OR DELETE ON "interaction_events"
FOR EACH ROW EXECUTE FUNCTION reject_interaction_event_mutation();

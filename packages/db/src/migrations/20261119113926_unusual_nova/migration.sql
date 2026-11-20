CREATE TABLE "escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"assigned_agent_id" text,
	"contact" text,
	"claimed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "escalations_status_created_at_idx" ON "escalations" ("status","created_at");--> statement-breakpoint
CREATE INDEX "escalations_conversation_id_idx" ON "escalations" ("conversation_id");--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_assigned_agent_id_users_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id") ON DELETE SET NULL;
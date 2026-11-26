CREATE TABLE "agent_presence" (
	"agent_id" text PRIMARY KEY,
	"available" boolean DEFAULT false NOT NULL,
	"max_open_chats" integer DEFAULT 3 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_presence_max_open_chats_check" CHECK ("max_open_chats" between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "escalation_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"escalation_id" uuid NOT NULL,
	"from_agent_id" text,
	"to_agent_id" text,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "escalation_transfers_escalation_id_created_at_idx" ON "escalation_transfers" ("escalation_id","created_at");--> statement-breakpoint
ALTER TABLE "agent_presence" ADD CONSTRAINT "agent_presence_agent_id_users_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "escalation_transfers" ADD CONSTRAINT "escalation_transfers_escalation_id_escalations_id_fkey" FOREIGN KEY ("escalation_id") REFERENCES "escalations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "escalation_transfers" ADD CONSTRAINT "escalation_transfers_from_agent_id_users_id_fkey" FOREIGN KEY ("from_agent_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "escalation_transfers" ADD CONSTRAINT "escalation_transfers_to_agent_id_users_id_fkey" FOREIGN KEY ("to_agent_id") REFERENCES "users"("id") ON DELETE SET NULL;
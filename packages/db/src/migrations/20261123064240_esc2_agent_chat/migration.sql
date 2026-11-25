ALTER TABLE "escalations" ADD COLUMN "outcome_note" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_id_users_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE SET NULL;
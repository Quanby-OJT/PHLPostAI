ALTER TABLE "interaction_events" DROP CONSTRAINT "interaction_events_kind_check";
--> statement-breakpoint
ALTER TABLE "interaction_events"
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN ('conversation_started', 'message_received', 'answer_sent', 'tracking_lookup', 'escalated')) NOT VALID;
--> statement-breakpoint
CREATE TABLE "dashboard_layouts" (
	"user_id" text,
	"tiles" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_users_id_fkey"
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_layouts_user_id_uq" ON "dashboard_layouts" ("user_id");
--> statement-breakpoint
INSERT INTO "dashboard_layouts" ("user_id", "tiles")
VALUES (NULL, '["inquiry-volume","by-category","by-language","by-channel","escalations","response-time"]'::jsonb);

CREATE TABLE "scam_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"submission_id" uuid NOT NULL UNIQUE,
	"status" text DEFAULT 'reported' NOT NULL,
	"reviewer_id" text,
	"finding" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scam_reports_state_check" CHECK ((
				("status" in ('reported', 'under_review') and "finding" is null and "notes" is null)
				or
				("finding" is not null and "finding" in ('confirmed_scam', 'legitimate', 'inconclusive')
					and ("status" = "finding" or "status" = 'closed')
					and "notes" is not null and length(trim("notes")) > 0)
			))
);
--> statement-breakpoint
CREATE INDEX "scam_reports_queue_idx" ON "scam_reports" ("created_at","id");--> statement-breakpoint
ALTER TABLE "scam_reports" ADD CONSTRAINT "scam_reports_submission_id_scam_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "scam_submissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scam_reports" ADD CONSTRAINT "scam_reports_reviewer_id_users_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "interaction_events"
	DROP CONSTRAINT "interaction_events_kind_check",
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN (
		'conversation_started', 'conversation_context', 'message_received',
		'answer_sent', 'answer_classified', 'tracking_lookup', 'scam_assessed',
		'scam_reported', 'escalated', 'conversation_closed'
	)) NOT VALID;

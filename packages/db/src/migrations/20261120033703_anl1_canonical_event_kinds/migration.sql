-- Keep the append-only event history untouched. Existing development databases
-- may contain the pre-domain names; NOT VALID preserves those rows while
-- enforcing the canonical vocabulary for every new insert.
ALTER TABLE "interaction_events" DROP CONSTRAINT "interaction_events_kind_check";
--> statement-breakpoint
ALTER TABLE "interaction_events"
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN ('conversation_started', 'answer_sent', 'tracking_lookup', 'escalated')) NOT VALID;

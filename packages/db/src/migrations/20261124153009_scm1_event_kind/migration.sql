-- Custom SQL migration file, put your code below! --
-- Extend the existing insert constraint without rewriting historical event rows.
ALTER TABLE "interaction_events"
	DROP CONSTRAINT "interaction_events_kind_check",
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN ('conversation_started', 'answer_sent', 'tracking_lookup', 'escalated', 'scam_assessed')) NOT VALID;

-- Preserve CNV-5, SCM-3, and ESC-3 events when upgrading either branch history.
ALTER TABLE "interaction_events"
	DROP CONSTRAINT "interaction_events_kind_check",
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN (
		'conversation_started', 'conversation_context', 'message_received',
		'answer_sent', 'answer_classified', 'answer_blocked', 'tracking_lookup',
		'scam_assessed', 'scam_reported', 'escalated', 'escalation_missed',
		'conversation_closed'
	)) NOT VALID;

-- CNV-5: accept `answer_blocked`. Runs after the analytics/SCM-1 merge so its
-- vocabulary is kept; historical rows are left unchecked like the earlier changes.
ALTER TABLE "interaction_events"
	DROP CONSTRAINT "interaction_events_kind_check",
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN (
		'conversation_started', 'conversation_context', 'message_received',
		'answer_sent', 'answer_classified', 'answer_blocked', 'tracking_lookup',
		'scam_assessed', 'escalated', 'conversation_closed'
	)) NOT VALID;

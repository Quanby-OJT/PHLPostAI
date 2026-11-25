-- The analytics and SCM-1 branches independently extended the event vocabulary.
-- Keep historical rows and accept events from both implementations going forward.
ALTER TABLE "interaction_events"
	DROP CONSTRAINT "interaction_events_kind_check",
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN (
		'conversation_started', 'conversation_context', 'message_received',
		'answer_sent', 'answer_classified', 'tracking_lookup', 'scam_assessed',
		'escalated', 'conversation_closed'
	)) NOT VALID;

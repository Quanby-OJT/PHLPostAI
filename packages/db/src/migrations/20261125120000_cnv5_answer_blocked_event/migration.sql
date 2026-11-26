ALTER TABLE "interaction_events" DROP CONSTRAINT "interaction_events_kind_check";
--> statement-breakpoint
ALTER TABLE "interaction_events"
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN (
		'conversation_started', 'conversation_context', 'message_received',
		'answer_sent', 'answer_classified', 'answer_blocked', 'injection_refused', 'throttled',
		'tracking_lookup', 'escalated', 'escalation_claimed', 'escalation_transferred',
		'escalation_missed', 'escalation_resolved', 'feedback_given', 'sentiment_labelled',
		'scam_assessed', 'scam_reported', 'conversation_closed'
	)) NOT VALID;

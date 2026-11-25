ALTER TABLE "interaction_events" DROP CONSTRAINT "interaction_events_kind_check";
--> statement-breakpoint
ALTER TABLE "interaction_events"
	ADD CONSTRAINT "interaction_events_kind_check"
	CHECK ("kind" IN (
		'conversation_started', 'conversation_context', 'message_received',
		'answer_sent', 'answer_classified', 'tracking_lookup', 'escalated',
		'conversation_closed'
	)) NOT VALID;
--> statement-breakpoint
INSERT INTO "interaction_events" ("conversation_id", "kind", "category", "language", "channel_code", "payload", "occurred_at")
SELECT c.id, 'conversation_context', 'other', COALESCE(cs.language, 'en'), COALESCE(c.channel_code, 'web'),
	jsonb_build_object('sessionFingerprint', CASE WHEN c.customer_session_id IS NULL THEN NULL ELSE md5(c.customer_session_id::text) END, 'testSession', COALESCE(c.channel_code = 'test', false)),
	start_event.occurred_at
FROM conversations c
JOIN customer_sessions cs ON cs.id = c.customer_session_id
JOIN interaction_events start_event ON start_event.conversation_id = c.id AND start_event.kind = 'conversation_started'
WHERE NOT EXISTS (
	SELECT 1 FROM interaction_events existing
	WHERE existing.conversation_id = c.id AND existing.kind = 'conversation_context'
);
--> statement-breakpoint
INSERT INTO "interaction_events" ("conversation_id", "kind", "category", "language", "channel_code", "payload", "occurred_at")
SELECT m.conversation_id, 'message_received', COALESCE(m.inquiry_category, 'other'), COALESCE(m.language, cs.language, 'en'), COALESCE(c.channel_code, 'web'),
	jsonb_build_object('eligible', COALESCE(m.is_eligible, false), 'failed', false, 'turnIndex', m.turn_index), m.created_at
FROM messages m
JOIN conversations c ON c.id = m.conversation_id AND c.customer_session_id IS NOT NULL
JOIN customer_sessions cs ON cs.id = c.customer_session_id
WHERE m.role = 'user'
	AND NOT EXISTS (
		SELECT 1 FROM interaction_events existing
		WHERE existing.conversation_id = m.conversation_id AND existing.kind = 'message_received'
		AND existing.payload->>'turnIndex' = m.turn_index::text
	);
--> statement-breakpoint
INSERT INTO "interaction_events" ("conversation_id", "kind", "category", "language", "channel_code", "payload", "occurred_at")
SELECT a.conversation_id, 'answer_classified', COALESCE(u.inquiry_category, 'other'), COALESCE(u.language, cs.language, 'en'), COALESCE(c.channel_code, 'web'),
	jsonb_build_object('answerKind', a.answer_kind, 'eligible', COALESCE(u.is_eligible, false), 'turnIndex', u.turn_index), a.created_at
FROM messages a
JOIN messages u ON u.conversation_id = a.conversation_id AND u.role = 'user' AND u.turn_index + 1 = a.turn_index
JOIN conversations c ON c.id = a.conversation_id AND c.customer_session_id IS NOT NULL
JOIN customer_sessions cs ON cs.id = c.customer_session_id
WHERE a.role = 'assistant'
	AND NOT EXISTS (
		SELECT 1 FROM interaction_events existing
		WHERE existing.conversation_id = a.conversation_id AND existing.kind = 'answer_classified'
		AND existing.payload->>'turnIndex' = u.turn_index::text
	);
--> statement-breakpoint
CREATE OR REPLACE VIEW "deflection_kpi_conversations" AS
WITH definition_windows AS (
	SELECT d.*, lead(d.effective_from) OVER (PARTITION BY d.code ORDER BY d.version) AS next_effective
	FROM kpi_definitions d
), conversation_starts AS (
	SELECT
		d.id AS definition_id,
		d.code AS definition_code,
		d.version AS definition_version,
		d.method,
		start_event.conversation_id,
		start_event.occurred_at AS started_at,
		context.payload->>'sessionFingerprint' AS session_fingerprint,
		COALESCE((context.payload->>'testSession')::boolean, false) AS test_session
	FROM definition_windows d
	JOIN interaction_events start_event ON start_event.kind = 'conversation_started'
		AND start_event.occurred_at >= d.effective_from
		AND (d.next_effective IS NULL OR start_event.occurred_at < d.next_effective)
	LEFT JOIN interaction_events context ON context.conversation_id = start_event.conversation_id
		AND context.kind = 'conversation_context'
), eligible_conversations AS (
	SELECT
		s.definition_id,
		s.definition_code,
		s.definition_version,
		s.method,
		s.conversation_id,
		s.started_at,
		s.session_fingerprint,
		(array_agg(m.category ORDER BY m.occurred_at DESC) FILTER (
			WHERE COALESCE((m.payload->>'eligible')::boolean, false)
			AND (NOT (s.method ? 'eligibleCategories') OR m.category IN (SELECT jsonb_array_elements_text(s.method->'eligibleCategories')))
		))[1] AS category,
		max((m.payload->>'turnIndex')::integer) FILTER (
			WHERE COALESCE((m.payload->>'eligible')::boolean, false)
			AND (NOT (s.method ? 'eligibleCategories') OR m.category IN (SELECT jsonb_array_elements_text(s.method->'eligibleCategories')))
		) AS last_eligible_turn,
		max((m.payload->>'turnIndex')::integer) AS latest_customer_turn
	FROM conversation_starts s
	JOIN interaction_events m ON m.conversation_id = s.conversation_id AND m.kind = 'message_received'
	GROUP BY s.definition_id, s.definition_code, s.definition_version, s.method, s.conversation_id, s.started_at, s.session_fingerprint
	HAVING count(*) FILTER (
		WHERE COALESCE((m.payload->>'eligible')::boolean, false)
		AND (NOT (s.method ? 'eligibleCategories') OR m.category IN (SELECT jsonb_array_elements_text(s.method->'eligibleCategories')))
	) > 0
)
SELECT
	e.definition_id,
	e.definition_code,
	e.definition_version,
	e.conversation_id,
	e.started_at,
	e.category,
	(
		EXISTS (
			SELECT 1 FROM interaction_events response
			WHERE response.conversation_id = e.conversation_id AND response.kind = 'answer_classified'
			AND (response.payload->>'turnIndex')::integer = e.last_eligible_turn
		)
		OR EXISTS (
			SELECT 1 FROM interaction_events failed
			WHERE failed.conversation_id = e.conversation_id AND failed.kind = 'message_received'
			AND (failed.payload->>'turnIndex')::integer = e.last_eligible_turn
			AND COALESCE((failed.payload->>'failed')::boolean, false)
		)
		OR COALESCE((e.method->>'includeAbandoned')::boolean, false)
	) AS is_denominator,
	(
		e.latest_customer_turn = e.last_eligible_turn
		AND EXISTS (
			SELECT 1 FROM interaction_events closed
			WHERE closed.conversation_id = e.conversation_id AND closed.kind = 'conversation_closed'
			AND closed.payload->>'outcome' = 'resolved_by_ai'
		)
		AND EXISTS (
			SELECT 1 FROM interaction_events answer
			WHERE answer.conversation_id = e.conversation_id AND answer.kind = 'answer_classified'
			AND (answer.payload->>'turnIndex')::integer = e.last_eligible_turn
			AND answer.payload->>'answerKind' IN ('answer', 'tool')
		)
		AND NOT EXISTS (
			SELECT 1 FROM interaction_events escalated
			WHERE escalated.conversation_id = e.conversation_id AND escalated.kind = 'escalated'
		)
	) AS is_resolved_by_ai
FROM eligible_conversations e
WHERE NOT (
	COALESCE((e.method->>'excludeTestSessions')::boolean, true)
	AND EXISTS (
		SELECT 1 FROM interaction_events context
		WHERE context.conversation_id = e.conversation_id AND context.kind = 'conversation_context'
		AND COALESCE((context.payload->>'testSession')::boolean, false)
	)
)
	AND NOT (
		COALESCE((e.method->>'duplicateWindowMinutes')::integer, 0) > 0
		AND e.session_fingerprint IS NOT NULL
		AND EXISTS (
			SELECT 1 FROM eligible_conversations earlier
			WHERE earlier.definition_id = e.definition_id
			AND earlier.session_fingerprint = e.session_fingerprint
			AND earlier.category = e.category
			AND earlier.started_at < e.started_at
			AND earlier.started_at >= e.started_at - make_interval(mins => (e.method->>'duplicateWindowMinutes')::integer)
		)
	);
--> statement-breakpoint
COMMENT ON VIEW "deflection_kpi_conversations" IS 'Auditable deflection facts derived only from append-only interaction_events and the definition version effective at conversation start.';

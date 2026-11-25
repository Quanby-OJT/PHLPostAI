# Human agent handoff

ESC-1 places a customer conversation in the agent queue. ESC-2 adds claim,
live replies, and resolution on the same conversation.

## Ownership and state

- `EscalationService` is the only writer of escalation state.
- `ConversationService` owns conversation state and all customer/agent messages.
- Claim locks the escalation and conversation rows in one transaction. A second
  claim sees the updated state and receives a conflict response.
- Only the assigned agent can reply or resolve. Resolution requires an outcome
  note and closes the conversation as `resolved_by_agent`.

## Live delivery

The customer and assigned agent use the conversation events endpoints over
server-sent events. Redis pub/sub wakes listeners across backend replicas;
listeners also poll the database once per second, so delivery continues when
Redis is not configured. Messages remain in the database and are replayed by
turn index when a listener reconnects.

While the conversation is `escalation_requested` or `agent_active`, customer
messages are screened, stored through `ConversationService`, and delivered to
the agent without invoking the assistant.

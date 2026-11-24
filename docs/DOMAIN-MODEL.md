# PHLPost AI Customer Support — Domain Model

Shared vocabulary for every ticket in `TICKETS.md`. Use these names in table, contract, module, and screen names. Section references (§) are to the PHLPost Technical Specifications (TS).

The project is built on the Quanby `RAG_AI` template. Names marked *(template)* already exist there and keep their meaning.

## 1. Glossary

| Term | Meaning |
|---|---|
| **Customer** | A member of the public using the assistant. Anonymous: no account, no sign-in. |
| **Customer Session** | One anonymous visit on one Channel, identified by a random session token held by the widget. Owns Conversations. |
| **Staff user** | A PHLPost employee account. Holds one or more Roles. |
| **Role** *(template)* | A named, admin-editable bundle of Permissions. |
| **Permission** *(template)* | One key the API checks before an action. Format in section 2. |
| **Channel** | Where customers reach the assistant. Release scope: `web-widget`. Each Channel is an adapter behind the `ChannelAdapter` interface. |
| **Conversation** *(template, extended)* | One chat between a Customer Session and the assistant, possibly continued by an agent. |
| **Message** *(template, extended)* | One turn. Sender is `customer`, `assistant`, `agent`, or `system`. Assistant messages carry citations, confidence, language, and trace id. |
| **Inquiry Category** | The classified topic of a customer message: `tracking`, `rates`, `postal-id`, `service-info`, `scam`, `complaint`, `other`. Admin-editable list. |
| **Eligible Inquiry** | A message whose Inquiry Category is marked eligible for automated handling. The base of the deflection KPI. |
| **Knowledge Article** | One piece of PHLPost-approved content the assistant may answer from. Has versions and an approval status. |
| **Document / Chunk** *(template)* | The indexed form of an approved Knowledge Article version. Only approved versions are indexed. |
| **Rate Entry** | One structured postal rate: service, destination zone, weight band, price, effective dates. The only source of quoted prices. |
| **Tracking Connector** | An integration behind the `TrackingSource` interface that returns the official status of a mail item: `mock`, later `phlpost-track-trace` or `mmas`. |
| **Tracking Lookup** | One call to a Tracking Connector for one tracking number, with its outcome. |
| **Status Explanation** | PHLPost-approved customer-friendly wording for one official status code, with optional next steps. |
| **Scam Submission** | A suspicious message, link, or screenshot a customer submits for assessment. Untrusted content. |
| **Risk Indicator** | A PHLPost-approved signal of a scam: suspicious link, payment request, urgency, impersonation, unofficial sender. |
| **Scam Assessment** | The advisory result for a Scam Submission: risk level `low`, `medium`, `high`, or `uncertain`, the indicators found, and safety guidance. Never a final finding of fraud. |
| **Scam Report** | A Scam Submission sent to PHLPost staff for human validation. |
| **Scam Pattern** | A known scam recorded by staff and matched against new submissions. |
| **Escalation** | A request to move a Conversation to a human, with its reason and outcome. |
| **Agent** | A Staff user who handles Escalations in the agent inbox. |
| **Handoff Connector** | An outbound integration that pushes an Escalation to an external helpdesk: `webhook`, `email`. |
| **Confidence** | A 0 to 1 score for an assistant answer: the strongest retrieved similarity when the cited answer passes validation and the groundedness check; zero when it does not. |
| **Assistant Setting** | A named, admin-editable value: confidence threshold, AI disclosure text, business hours, eligible categories. |
| **Feedback** | A customer's rating of a Conversation: helpful or not, with an optional comment. |
| **Interaction Event** | An append-only analytics record of one thing that happened in a Conversation. |
| **KPI Definition** | The approved method for one indicator: inclusions, exclusions, period, baseline, target. |
| **Management Summary** | An AI-drafted plain-language summary of a reporting period, traceable to its figures and approved by a person. |
| **Audit Entry** *(template)* | An append-only record of one privileged or state-changing action. |
| **Privacy Request** | A data subject's request to access or delete their data. |
| **Export Bundle** | A machine-readable export of PHLPost-owned data and configuration. |
| **System** | The automated actor: classification, retention jobs, connector calls. |

## 2. Permission-key convention

```
<module>.<submodule>.<action>        e.g.  knowledge.articles.approve
```

- This is the template's convention. Every key lives in `PERMISSION_NAMES` in `packages/contracts/src/modules/v1/rbac/rbac.catalog.ts`. Unknown keys fail closed.
- A granted key ending in `.*` matches every key under that prefix: `scam.*` satisfies `scam.reports.validate`.
- Routes declare keys with `@RequirePermissions(...)`; the RBAC guard enforces them. A denial returns 403 and writes an Audit Entry with outcome `denied`.
- User stories name the key; acceptance criteria and technical notes enforce the same key.
- Customers are anonymous and hold no permission. Customer-facing endpoints are public, rate limited, and bound to the Customer Session token. Stories for them use the persona "customer".

### Catalog

| Module | Keys |
|---|---|
| users *(template)* | `users.accounts.manage` · `users.roles.manage` |
| audit | `audit.log.view` *(template)* · `audit.log.export` |
| corpus *(template)* | `corpus.documents.upload` · `corpus.documents.read` · `corpus.ingest.run` · `corpus.chunks.inspect` · `corpus.reembed.run` |
| chat *(template)* | `chat.query.submit` · `chat.history.read` |
| eval *(template)* | `eval.golden.manage` · `eval.runs.execute` · `eval.gate.approve` |
| apikeys *(template)* | `apikeys.keys.manage` |
| ops *(template)* | `ops.dashboards.view` · `ops.config.view` |
| reports *(template)* | `reports.reports.view` · `reports.reports.export` · `reports.schedules.manage` |
| knowledge | `knowledge.articles.manage` · `knowledge.articles.approve` · `knowledge.rates.manage` · `knowledge.gaps.view` |
| channels | `channels.channels.manage` |
| settings | `settings.assistant.manage` · `settings.escalation.manage` · `settings.retention.manage` |
| conversations | `conversations.transcripts.view` |
| escalations | `escalations.queue.view` · `escalations.conversations.handle` · `escalations.connectors.manage` |
| scam | `scam.indicators.manage` · `scam.reports.view` · `scam.reports.validate` |
| tracking | `tracking.connectors.manage` · `tracking.explanations.manage` |
| analytics | `analytics.dashboard.view` · `analytics.kpi.manage` · `analytics.summaries.generate` · `analytics.summaries.approve` · `analytics.monitoring.view` |
| privacy | `privacy.requests.manage` · `privacy.exports.create` |

### Seeded roles (editable afterwards)

| Role | Grants |
|---|---|
| System Administrator | Everything. This is the template's `ADMIN_ROLE` short-circuit. |
| Knowledge Manager | `knowledge.articles.manage`, `knowledge.rates.manage`, `knowledge.gaps.view`, `tracking.explanations.manage`, `corpus.documents.read` |
| Knowledge Approver | `knowledge.articles.approve`, `knowledge.gaps.view`, `corpus.documents.read` |
| Customer Service Agent | `escalations.queue.view`, `escalations.conversations.handle` |
| Customer Service Supervisor | Agent grants plus `conversations.transcripts.view`, `settings.escalation.manage`, `analytics.dashboard.view`, `reports.reports.view`, `reports.reports.export` |
| Scam Reviewer | `scam.*` |
| Management Viewer | `analytics.dashboard.view`, `analytics.summaries.generate`, `analytics.summaries.approve`, `reports.reports.view`, `reports.reports.export` |
| Quality Analyst | `eval.*`, `analytics.monitoring.view`, `analytics.kpi.manage`, `conversations.transcripts.view`, `ops.dashboards.view` |
| Data Protection Officer | `privacy.*`, `settings.retention.manage`, `audit.log.view`, `audit.log.export`, `conversations.transcripts.view` |
| Auditor/Viewer | `audit.log.view`, `reports.reports.view`, `analytics.dashboard.view` |

Channels, connectors, and assistant settings (`channels.channels.manage`, `tracking.connectors.manage`, `escalations.connectors.manage`, `settings.assistant.manage`) are held only by the System Administrator by default; PHLPost can grant them to other roles.

## 3. Entities and relationships

```
role >──< permission                         (template)
role >──< user ──< audit_log                 (template)

channel ──< customer_session ──< conversation ──< message ──(cites)──> chunk
                                     │              └──< tracking_lookup
                                     ├──< escalation ──< handoff_delivery >── handoff_connector
                                     ├──── feedback
                                     ├──< scam_submission ──── scam_assessment
                                     │           └──── scam_report >── scam_pattern (matched)
                                     └──< interaction_event

knowledge_article ──< knowledge_article_version ──(approved)──> document ──< chunk
rate_entry        status_explanation        risk_indicator        official_contact
inquiry_category  assistant_setting         kpi_definition        management_summary
privacy_request   export_bundle             integration_log
```

## 4. Core tables and lifecycle notes

All tables are defined with `createTable` in `packages/db/src/schema.ts` and ship as ordered Drizzle migrations. Money is integer centavos. Timestamps are UTC; reports use Asia/Manila.

| Table | Key columns | Lifecycle notes |
|---|---|---|
| `channels` | `code`, `name`, `is_enabled`, `config` (jsonb) | Seeded with `web-widget`. Disable, never delete, once used. `config.allowedOrigins` (string array) lists the origins allowed to call the public chat API (CHN-1). |
| `customer_sessions` | `token_hash`, `channel_code`, `language`, `consented_at`, `last_seen_at` | No name, email, or phone. Expire after inactivity. |
| `conversations` *(template)* | + `customer_session_id`, `channel_code`, `status`, `language`, `resolved_by`, `closed_at`, `legal_hold` | State machine 5.1. `user_id` stays null for customers. |
| `messages` *(template)* | + `sender`, `agent_id?`, `inquiry_category`, `is_eligible`, `confidence`, `language`, `answer_kind` (`answer`/`uncertain`/`refusal`/`tool`) | Insert-only. Personal data is masked before storage. `inquiry_category` uses the domain category codes, and `is_eligible` is copied from the category at the moment the message is stored (CNV-2); `language` is the detected language (`en`/`fil`/`ceb`/`ilo`), `unsupported` when a message is in an unsupported language outside those four (CNV-4), else the session's; Confidence combines the strongest retrieval similarity with grounded answer validation. |
| `inquiry_categories` | `code`, `name`, `is_eligible`, `is_active` | Changing `is_eligible` applies to new messages only. Seeded with the seven domain codes (PRD A2 eligibility). Admins can add categories; the classifier chooses only from active ones. `other` is the fallback and can't be deactivated (CNV-2). |
| `knowledge_articles` | `title`, `category`, `languages`, `current_version_id?`, `status` (`active`/`deactivated`) | `current_version_id` points at the serving `approved` version. Deactivating the article retires its approved version (5.2); a deactivated article accepts no new drafts, submissions, or approvals. |
| `knowledge_article_versions` | `article_id`, `version`, `body`, `language`, `status`, `submitted_by?`, `approved_by?`, `approved_at?`, `document_id?`, `review_note?`, `indexing_job_id?`, `indexing_requested_by?`, `index_error?` | State machine 5.2. Only an `approved` version has a `document_id` and is retrievable. `indexing_*` track the ingestion job started on approval; `index_error` keeps the reason when indexing fails (Flow E failure branch). `review_note` is the approver's reason for returning a version. |
| `rate_entries` | `service_code`, `zone`, `weight_min_g`, `weight_max_g`, `price_centavos`, `effective_from`, `effective_to?`, `status` | Prices are quoted from here only. Changes go through approval like articles. |
| `tracking_lookups` | `message_id`, `connector_code`, `tracking_number_hash`, `outcome` (`found`/`not_found`/`unavailable`), `status_code?`, `latency_ms` | The raw tracking number is not stored. `message_id` is the assistant's `tool` reply, written in the same transaction as the turn. The hash is an HMAC-SHA256 of the normalized number. A message with no number or a malformed one makes no lookup and no row. |
| `status_explanations` | `status_code`, `language`, `explanation`, `next_steps?`, `is_active` | Unknown codes fall back to the raw official description. One row per (`status_code`, `language`). The explanation is appended after the official status, never substituted for it (TRK-2). The 'needs explanation' list is derived from `tracking_lookups.status_code` joined to the customer session's `language`; no extra table. |
| `integration_log` | `connector_code`, `direction`, `endpoint`, `outcome`, `latency_ms`, `error?` | Insert-only. No payload bodies containing personal data. |
| `scam_submissions` | `conversation_id`, `kind` (`text`/`link`/`email`/`image`), `content_masked`, `extracted_urls`, `image_ref?` | Untrusted. Links are parsed, never opened. |
| `scam_assessments` | `submission_id`, `risk_level`, `indicators` (jsonb), `matched_pattern_id?`, `confidence`, `guidance_key` | Insert-only. Advisory. |
| `scam_reports` | `submission_id`, `status`, `reviewer_id?`, `finding`, `notes` | State machine 5.4. |
| `scam_patterns` | `title`, `signature` (jsonb), `first_seen`, `is_active` | Created from confirmed reports. |
| `risk_indicators` | `code`, `name`, `weight`, `is_active` | Admin-editable. |
| `official_contacts` | `kind` (`domain`/`sender`/`payment-channel`), `value`, `is_active` | The allowlist of genuine PHLPost domains, sender names, and payment channels. |
| `escalations` | `conversation_id`, `reason`, `status`, `assigned_agent_id?`, `contact` (encrypted, optional), `claimed_at`, `resolved_at` | State machine 5.3. |
| `handoff_connectors`, `handoff_deliveries` | connector `code`, `kind`, `config`; delivery `escalation_id`, `status`, `attempts`, `external_ref?` | Outbox: `queued → delivered`, or `failed` after retries. |
| `knowledge_gaps` | `label`, `category`, `language`, `question_count`, `examples_masked`, `status`, `draft_article_id?` | Rebuilt by the grouping job; `open → in_progress → resolved`. |
| `feedback` | `conversation_id` (unique), `rating`, `comment_masked` | One per Conversation. |
| `interaction_events` | `conversation_id`, `kind`, `category`, `language`, `channel_code`, `payload`, `occurred_at` | Append-only. The only source for analytics. ANL-1 records `conversation_started`, `answer_sent`, `tracking_lookup`, and `escalated`. `category` is an Inquiry Category code (`tracking`, `rates`, `postal-id`, `service-info`, `scam`, `complaint`, `other`); use `other` when classification is unavailable. `payload` is null unless validated non-text metadata is available; never place customer text or other free text in an event. |
| `assistant_settings` | `key` (unique), `value` (jsonb), `updated_by` | Every change is audited with old and new value. |
| `dashboard_layouts` | `user_id?`, `tiles` (jsonb) | A null `user_id` is the default layout. |
| `kpi_definitions` | `code`, `method` (jsonb), `baseline`, `target`, `approved_by`, `effective_from` | Versioned; reports cite the version used. |
| `management_summaries` | `period`, `draft`, `figures` (jsonb), `status`, `approved_by?` | `draft → approved`, or `discarded`. |
| `privacy_requests` | `kind` (`access`/`delete`), `session_token_hash`, `status`, `handled_by` | `received → fulfilled`, or `rejected` with reason. |
| `export_bundles` | `scope` (jsonb), `status`, `file_ref`, `checksum`, `requested_by` | Files expire; the request stays in the audit trail. |

### Interaction Event kinds

`interaction_events.kind` is a Zod enum in `packages/contracts` (ANL-1). These names are binding; a ticket that needs a new kind adds it here and to the enum.

`conversation_started` · `message_received` · `answer_sent` · `answer_blocked` · `injection_refused` · `throttled` · `tracking_lookup` · `escalated` · `escalation_claimed` · `escalation_transferred` · `escalation_missed` · `escalation_resolved` · `feedback_given` · `sentiment_labelled` · `scam_assessed` · `scam_reported` · `conversation_closed`

## 5. State machines

### 5.1 Conversation (the centre of the system)

```
ai_active ──► resolved_by_ai
    │
    ├──► escalation_requested ──► agent_active ──► resolved_by_agent
    │            │
    │            └──► contact_captured        (no agent available; follow-up outside the chat)
    └──► abandoned                            (session idle past the timeout)
```

| Transition | Trigger | Guard |
|---|---|---|
| `ai_active` → `resolved_by_ai` | Customer ends the chat or confirms the answer helped; or idle after a confident answer | No open Escalation |
| `ai_active` → `escalation_requested` | Customer asks for a person; Confidence below threshold and customer accepts; an escalation rule matches | Escalation created in the same transaction |
| `escalation_requested` → `agent_active` | An Agent claims the Escalation | Only one Agent can claim; the assistant stops answering |
| `escalation_requested` → `contact_captured` | Outside business hours, or no claim within the wait limit | Customer agreed to leave a contact, or declined |
| `agent_active` → `resolved_by_agent` | Agent closes the Conversation | |
| any open state → `abandoned` | Idle timeout | |

Once a Conversation is `agent_active`, the assistant never posts another answer in it.

### 5.2 Knowledge Article version

```
draft ──► in_review ──► approved ──► deactivated
  ▲           │             │
  └── returned┘             └──► superseded
```

Editing an approved article creates a new `draft` version; the approved version keeps serving until the new one is approved. Approval indexes the version: the version stays `in_review` while the ingestion job runs, and becomes `approved` only when indexing succeeds; at that moment the previously approved version becomes `superseded` (Flow E). If indexing fails the version stays `in_review` with `index_error` set and the previous approved version keeps serving. Deactivation removes its chunks from retrieval in the same transaction and clears the response cache. The submitter cannot approve their own version. Editing a `returned` version moves it back to `draft`.

`knowledge_articles.status`: `active` → `deactivated`. Retrieval only returns chunks whose document belongs to an `approved` version of an `active` article (filter in the RAG service).

### 5.3 Escalation

```
queued ──► claimed ──► resolved
   │
   ├──► pushed_external      (delivered through a Handoff Connector)
   └──► contact_captured     (offline; customer left a contact or declined)
```

### 5.4 Scam Report

```
reported ──► under_review ──► confirmed_scam ──► closed
                  │─────────► legitimate ──────► closed
                  └─────────► inconclusive ────► closed
```

Only a holder of `scam.reports.validate` sets a finding. The customer-facing assessment stays advisory in every state.

## 6. Cross-epic ownership risks

| Table | Written by | Extended by | Ownership rule |
|---|---|---|---|
| `conversations`, `messages` | conversation | escalation, scam-protection, analytics, admin | Only `ConversationService` changes `status` and inserts messages. Agents post through `ConversationService.postAgentMessage`. Readers never mutate. |
| `chunks`, `documents` *(template)* | template ingestion | knowledge | Knowledge indexes and de-indexes only through the template's ingestion service; it never writes chunks directly. The idempotent upsert on content hash must survive. |
| `interaction_events` | analytics (creates the table in ANL-1) | every epic | Other epics call `EventService.record(kind, …)`. Nobody updates or deletes rows. |
| `assistant_settings` | conversation (first consumer, CNV-3) | escalation, admin, analytics | All reads go through `SettingsService.get(key)`; all writes through `SettingsService.set`, which audits. |
| `audit_log` *(template)* | template | every epic | Only `AuditService.record` inserts. |
| `escalations` | escalation | analytics, scam-protection | Only `EscalationService` changes `status`. Scam reports that need a person create an Escalation through it. |
| `integration_log` | tracking (creates it in TRK-3) | escalation connectors | Insert through `IntegrationLogService` only; no payload bodies. |

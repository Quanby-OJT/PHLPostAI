# PHLPost AI Customer Support — Tickets

Development-ready vertical slices for the PHLPost AI-Backed Customer Support Solution. Built from the PHLPost Technical Specifications (source pages 90–127, "TS") as amended by Bid Bulletin Addendum No. 2026-17 of 2026-11-06, `PRD.md`, and `DOMAIN-MODEL.md`. Section references (§) are to the TS.

- 44 tickets in 10 epics. Software development only: managed cloud hosting, backups and recovery, uptime, penetration testing, the service desk, training, and documentation are DevOps, QA, and service work outside this set (see `PRD.md`, Scope). Each ticket is one thin slice through database, API, and UI, sized for one to two days, one branch, and one small pull request.
- Stack: Quanby `RAG_AI` template — Next.js 16, NestJS, Python FastAPI RAG service, Drizzle and PostgreSQL with pgvector, Redis, Better Auth, Zod contracts.
- The template already provides document ingestion, hybrid retrieval, grounded and cited streaming answers, model routing and failover across providers, input screening, the evaluation gate, reports, RBAC, and audit. Tickets reuse these and say so in their technical notes; none rebuilds them.
- Staff actors are permission keys, not job titles. The key in a user story is the key the acceptance criteria and technical notes enforce. Keys are defined in `DOMAIN-MODEL.md` §2. Customers are anonymous and hold no permission, so their stories use the persona "customer".
- Seven risky flows are described once in section 3 and referenced by name in the tickets they concern. Standard create-and-view screens have no flow; their acceptance criteria are enough.

## Importing into GitHub Issues or Linear

Ticket blocks follow the format parsed by the template's import scripts. Save this file as `docs/TICKETS.md` in the project repository, then preview and import:

```bash
node scripts/tickets-to-issues.mjs --dry-run
node scripts/tickets-to-linear.mjs --dry-run
```

## Story map

Backbone left to right in the order a customer inquiry travels. Release 1 is the thinnest product that works end to end.

| Backbone →                              | Set up and secure | Curate knowledge | Reach the assistant | Understand and answer             | Look up tracking | Protect from scams  | Hand over to a person | Measure and report                | Govern and hand back              |
| --------------------------------------- | ----------------- | ---------------- | ------------------- | --------------------------------- | ---------------- | ------------------- | --------------------- | --------------------------------- | --------------------------------- |
| **Release 1 — walking skeleton**        | FND-1, FND-2      | KB-1             | CHN-1               | CNV-1                             | TRK-1            | —                   | ESC-1                 | ANL-1                             | —                                 |
| **Release 2 — every approved use case** | ADM-1, ADM-2      | KB-2             | CHN-2               | CNV-2, CNV-3, CNV-4, CNV-5, CNV-6 | TRK-2            | SCM-1, SCM-2, SCM-3 | ESC-2, ESC-3          | ANL-2, ANL-3                      | ADM-3, EVL-1                      |
| **Release 3 — depth and acceptance**    | —                 | KB-3             | CHN-3               | —                                 | TRK-3, TRK-4     | SCM-4, SCM-5        | ESC-4                 | ANL-4, ANL-5, ANL-6, ANL-7, ANL-8 | ADM-4, ADM-5, ADM-6, ADM-7, EVL-2 |

## 1. Epic map

| Epic key | Label             | TOR / PRD source                                                     | Note                                                                         | Tickets |
| -------- | ----------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------- |
| FND      | `foundation`      | PRD constraints; TS §3.5, §4.10                                      | Repository from the RAG_AI template, PHLPost permission catalog and roles    | 2       |
| CHN      | `channels`        | TS §3.1 Omnichannel AI Virtual Assistant; §4.8                       | Website chat widget, channel interface, customer feedback                    | 3       |
| CNV      | `conversation`    | TS §3.1 conversational AI, NLP, Postal ID; §4.8–4.9                  | Grounded answers, categories, confidence, languages, output guardrails       | 6       |
| KB       | `knowledge`       | TS §3.1 PHLPost Knowledge Base, Postal Rates and Service Information | Article approval workflow, rate table, knowledge gaps                        | 3       |
| TRK      | `tracking`        | TS §3.1 Track and Trace Assistance; §3.3; §3.4                       | Tracking connector interface, status explanations, real adapter              | 4       |
| SCM      | `scam-protection` | TS §3.1 AI-Assisted Scam Detection and Customer Protection           | Advisory assessment, indicators, report review, known patterns               | 5       |
| ESC      | `escalation`      | TS §3.1 Human Agent Escalation and Handoff; §4.8                     | Agent inbox, live takeover, rules, external helpdesk connector               | 4       |
| ANL      | `analytics`       | TS §3.1 analytics; §3.2; §5.10; §6.14                                | Events, dashboard, deflection KPI, trends, summaries, reports, AI monitoring | 8       |
| ADM      | `admin`           | TS §3.1 Administrative and Management Interface; §4.6; §4.13; §4.20  | Staff, MFA, transcripts, audit, retention, export, privacy requests          | 7       |
| EVL      | `evaluation`      | TS §3.1 language testing; §6.4 AI testing                            | Approved test sets per language and use case; safety suite                   | 2       |

## 2. Build order

Work top to bottom. A ticket may start once its dependencies are merged, so tickets in the same release with no dependency between them run in parallel. Release 1 is the walking skeleton: after its eight tickets a customer on the website can get an answer from approved content, check a tracking number against the mock source, and be handed to an agent, and the event counts show on a page.

### Release 1 — walking skeleton: ask, track, hand over, count

1. **FND-1** — Bootstrap the PHLPost repository from the RAG_AI template
2. **FND-2** — Seed the PHLPost permission catalog and staff roles
3. **KB-1** — Write, review, approve, and retire knowledge articles
4. **CNV-1** — Answer a customer question from approved knowledge
5. **CHN-1** — Embed the assistant on the PHLPost website as a chat widget
6. **TRK-1** — Check a tracking number through a tracking connector
7. **ESC-1** — Hand a chat over to an agent inbox
8. **ANL-1** — Record interaction events and show live counts

### Release 2 — every approved use case working

9. **ADM-1** — Manage PHLPost staff accounts and their roles
10. **ADM-2** — Require multi-factor authentication for staff
11. **CNV-2** — Classify each inquiry by category and eligibility
12. **CNV-3** — State uncertainty and offer a person when confidence is low
13. **CNV-4** — Reply in the customer's language
14. **CNV-5** — Block invented official information in answers
15. **CNV-6** — Guide Postal ID applicants without deciding their case
16. **KB-2** — Maintain postal rates and answer rate questions from the table
17. **TRK-2** — Explain each official status in plain language
18. **CHN-2** — Manage channels through one channel interface
19. **ESC-2** — Reply to the customer as an agent in the same chat
20. **ESC-3** — Set escalation rules, business hours, and the offline path
21. **SCM-1** — Assess a suspicious message and give safety guidance
22. **SCM-2** — Maintain risk indicators and the list of genuine PHLPost contacts
23. **SCM-3** — Report a suspected scam to PHLPost and review it
24. **ANL-2** — Show the management dashboard
25. **ANL-3** — Measure the deflection rate by an approved method
26. **ADM-3** — Review conversation transcripts with their AI trace
27. **EVL-1** — Prove answer quality per language and use case with approved test sets

### Release 3 — depth, real integration, governance, acceptance evidence

28. **CHN-3** — Collect a customer rating at the end of a chat
29. **KB-3** — Turn unanswered questions into knowledge to write
30. **TRK-3** — Keep tracking lookups safe when the source is slow or down
31. **TRK-4** — Connect the real PHLPost Track and Trace or MMAS source
32. **SCM-4** — Match new submissions against known scam patterns
33. **SCM-5** — Assess a screenshot of a suspicious message
34. **ESC-4** — Push escalations to an external helpdesk
35. **ANL-4** — Show sentiment and the concerns customers raise most
36. **ANL-5** — Show scam-reporting trends
37. **ANL-6** — Draft a plain-language management summary for approval
38. **ANL-7** — Generate and export customer-service reports
39. **ANL-8** — Monitor the health and quality of the AI service
40. **ADM-4** — Search and export the audit log
41. **ADM-5** — Apply retention periods and anonymize old conversations
42. **ADM-6** — Export PHLPost's data and configuration in open formats
43. **ADM-7** — Handle a customer's request to see or delete their data
44. **EVL-2** — Test the assistant against unsafe, false, and hostile inputs

## 3. Risky-path flows

Only paths that are easy to get wrong are drawn. Tickets cite them by name in their technical notes. Flow A extends the template's own "/chat heavy path" (template `docs/TICKETS.md`, Flow B), which stays in force.

### Flow A — Public chat turn

```
1. Widget posts a message with its session token   → rate limit per session and per IP; unknown token → 401
2. Conversation is agent_active?                   → store the message, notify the agent, STOP (assistant stays silent)
3. Template screening: sanitize → injection check → mask personal data      [before cache, storage, and tracing]
4. Classify: Inquiry Category, language, is_eligible
5. Route:  tracking → Flow B · rates → rate lookup tool · scam → Flow D · otherwise → retrieval over APPROVED chunks only
6. Generate from the tool result or the retrieved chunks; run the groundedness check; compute Confidence; CNV-5 validates claims and blocks unsafe requests before final output
7. Confidence ≥ threshold → streamed answer with sources
   Confidence < threshold → "I'm not sure" answer + offer of a person (Flow C)
   an escalation rule matches (sensitive topic, explicit request) → Flow C directly
8. Store the message; record Interaction Events
```

Failure branch: the model provider fails → the template's retry, breaker, and failover apply; if every provider is down the customer gets a plain "the assistant is unavailable" message with the offer of a person, and the event is recorded as failed, never as resolved.
Why risky: the order is a contract (screen before storing, approved content only, confidence before answering), and a skipped step produces a confident wrong answer in PHLPost's name.
Tickets: CNV-1, CNV-2, CNV-3, CNV-5, CHN-1.

### Flow B — Tracking lookup through a connector

```
1. Extract a tracking number from the message; none or malformed → ask for it, no lookup
2. TrackingSource.lookup(number) on the configured connector, with a hard timeout
3. found       → status code, official description, location, time
   not_found   → say no record was found and what to check; never guess
   unavailable → say the tracking system cannot be reached right now; offer to retry or a person
4. Map the status code to its approved Status Explanation; unknown code → show the official description as is
5. The model may word the reply but the status, place, and time come only from step 3
6. Store a Tracking Lookup row with a hash of the number, the outcome, and latency
```

Failure branch: slow or failing connector → circuit breaker opens, lookups answer `unavailable` at once, and an alert is logged; no stale result is shown as current.
Why risky: this is the one place the assistant speaks for a system of record; an invented or outdated status is the exact failure the TS forbids.
Tickets: TRK-1, TRK-2, TRK-3, TRK-4.

### Flow C — Human handoff

```
1. Trigger: customer asks, low Confidence accepted, or a rule matches   → Escalation (queued), Conversation → escalation_requested
2. Within business hours → the inbox shows it; the customer sees "connecting you to an agent"
3. An Agent claims it (row lock)     → Escalation claimed, Conversation → agent_active, assistant goes silent
4. Agent reads the full history and replies in the same chat; closes → resolved_by_agent
5. Outside hours, or no claim within the wait limit → ask for an optional contact → contact_captured
6. If a Handoff Connector is enabled → queue a delivery with the transcript link and reason → pushed_external
```

Failure branch: two agents claim at once → the row lock gives it to one; the other sees "already claimed". Connector delivery fails → retried with backoff, then marked failed and shown in the inbox so nobody assumes it arrived.
Why risky: a customer left waiting with no person and no assistant is the worst outcome; the state machine must never strand a chat.
Tickets: ESC-1, ESC-2, ESC-3, ESC-4.

### Flow D — Scam assessment

```
1. Customer submits text, a link, an email body, or a screenshot       → stored as a Scam Submission (masked)
2. The content is DATA: it is quoted to the model inside a delimited block and never executed as instructions
3. Links are parsed (domain, look-alikes, shorteners) and compared with Official Contacts — NEVER opened or fetched
4. Deterministic checks first: Risk Indicators and Scam Pattern matches
5. Model assessment second, limited to the approved indicators; output is a risk level and the indicators found
6. Reply: advisory wording ("this looks like…", never "this is fraud"), safety guidance, and an offer to report
7. high or uncertain, or the customer chooses to report → Scam Report (reported) for human validation
```

Failure branch: the model is unavailable → the deterministic result alone is shown, marked as preliminary. The submission tries to instruct the assistant → the injection screen flags it, which itself counts as an indicator.
Why risky: the input is hostile by definition, and a wrong "safe" verdict harms the customer while a wrong "fraud" verdict harms PHLPost.
Tickets: SCM-1, SCM-2, SCM-3, SCM-4, SCM-5.

### Flow E — Knowledge approval and indexing

```
1. Author saves a draft version                     → not retrievable
2. Author submits for review                        → in_review
3. A different user with the approve permission approves
      → version approved · previous approved version superseded
      → index through the template ingestion service (idempotent on content hash)
      → response cache invalidated
4. Deactivate                                       → chunks removed from retrieval in the same transaction · cache invalidated
```

Failure branch: indexing fails → the version stays `in_review` with the error and the previous approved version keeps serving; nothing half-indexed is retrievable.
Why risky: unapproved or retired content reaching a customer is a governance failure, and the cache can keep serving it after the database is right.
Tickets: KB-1, KB-2.

### Flow F — Deflection KPI

```
1. Take Conversations in the period that contain at least one Eligible Inquiry
2. Apply the KPI Definition's exclusions: test sessions, duplicates within the window, blocked or abusive sessions
3. Resolved by AI = closed as resolved_by_ai, no Escalation, not answered "uncertain" on the last eligible turn
4. Abandoned sessions are counted as the definition says (default: excluded when no answer was given, unresolved otherwise)
5. Deflection rate = resolved by AI ÷ eligible × 100, reported with the definition version and the counts behind it
```

Failure branch: the definition changes mid-period → figures are recomputed per version and both are kept; no report mixes two methods.
Why risky: this number decides whether the project met its target, so it must be reproducible from events by someone else.
Tickets: ANL-1, ANL-3, ANL-7.

### Flow G — Retention and deletion

```
1. A daily job reads the retention periods per data class from Assistant Settings
2. Past the period: conversations and scam submissions are anonymized (text removed, counts and categories kept) or deleted, as configured
3. Interaction Events keep no free text, so analytics survive
4. A Privacy Request for deletion runs the same routine for one session at once
5. Every run writes an Audit Entry with the class, range, and counts
```

Failure branch: no period configured for a class → nothing in that class is touched. A legal hold flag on a Conversation → it is skipped and listed.
Why risky: it deletes data on a schedule; a wrong query is unrecoverable, and a missing one is a privacy breach.
Tickets: ADM-5, ADM-7.

## 4. Tickets

Every ticket below is complete. Blocks are separated by a line containing only three hyphens, as the import scripts require.

---

### Epic FND — `foundation`

Source: PRD constraints; TS §3.5, §4.10. Repository from the RAG_AI template, PHLPost permission catalog and roles.

---

**Title:** [FND-1] Bootstrap the PHLPost repository from the RAG_AI template
**Epic:** `foundation`

**Problem / context:** Every later ticket needs a running monorepo, CI, and a staging URL. PRD constraint 'Stack'; TS §3.5 requires a PHLPost-owned code base that can be turned over.

**User story:** As a developer on the PHLPost team, I want a deployed, empty PHLPost shell built from the template so that every feature ticket starts from a working pipeline.

**Acceptance criteria:**

- _Given_ a fresh clone, _when_ I run the README quick start, _then_ web, backend, the RAG service, and the pgvector database start locally and `pnpm test` passes.
- _Given_ a merge to `staging`, _when_ the deploy workflow finishes, _then_ the staging URL serves the PHLPost admin sign-in page and the API health endpoint returns 200.
- _Given_ the repository, _when_ I search for the template's example modules, _then_ `todos`, `tickets`, and `feature-preview` are gone from backend, web, contracts, and schema, and the Flutter app is removed from the workspace.
- _Given_ the RAG service configuration, _when_ it starts, _then_ it runs the `agentic` profile with provider keys read from environment variables and no provider name hard-coded outside the provider module.

**In scope:**

- Create the repository from the template; rename packages and `PROJECT_NAME` to `phlpost-assist`
- Remove example modules and `apps/mobile`; keep auth, RBAC, audit, corpus, chat, eval, reports, API keys, observability
- Staging environment variables and first deploy; Asia/Manila as the business timezone constant in `packages/contracts`
- Model provider calls set to no data retention and no training on inputs wherever the provider offers the option; the providers, models, and these settings listed in `docs/AI-PROVIDERS.md` (TS §4.7)

**Out of scope:**

- Production infrastructure and the PHLPost domain (DevOps, outside these tickets)
- Any PHLPost feature

**Technical notes:** Follow the template README and `docs/RUNNING.md`. The `agentic` profile is chosen because its grade, rewrite, and groundedness loop is what CNV-3 builds Confidence on; Graph and multimodal stay off except where SCM-5 turns vision on. Keep `scripts/tickets-to-issues.mjs` and `scripts/tickets-to-linear.mjs`; copy `TICKETS.md` to `docs/TICKETS.md`. No permission key: no user-facing behaviour.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** none

---

**Title:** [FND-2] Seed the PHLPost permission catalog and staff roles
**Epic:** `foundation`
**Also touches:**
`admin`

**Problem / context:** TS §3.1 Administrative and Management Interface and §4.10 require role-based access. PRD: roles are data, checks are permission keys. `DOMAIN-MODEL.md` §2 lists the keys and seeded roles.

**User story:** As a user with `users.roles.manage` permission, I want the PHLPost permissions and starting roles in place so that I can give each staff member exactly the access their work needs.

**Acceptance criteria:**

- _Given_ a fresh database, _when_ `pnpm db:seed` runs, _then_ every key in the `DOMAIN-MODEL.md` catalog exists and the ten seeded roles hold the grants listed there.
- _Given_ the seed has already run, _when_ it runs again, _then_ no duplicate rows are created and admin-made changes to role grants are kept.
- _Given_ a route that requires a key the signed-in user lacks, _when_ it is called, _then_ the API returns 403 and an Audit Entry with outcome `denied` records the key, the actor, and the IP address.
- _Given_ a user with `users.roles.manage`, _when_ they open the roles screen, _then_ the new modules appear as groups in the permission checklist and can be granted or removed.

**In scope:**

- Add the new keys to `PERMISSION_NAMES`; seed roles; group the template's permission checklist by module
- Denied-access audit entry in the RBAC guard

**Out of scope:**

- Staff account creation and deactivation (ADM-1)
- MFA (ADM-2)

**Technical notes:** Edit `packages/contracts/src/modules/v1/rbac/rbac.catalog.ts` and the template seed script. The template's `End User` and `Developer/Integrator` roles stay for internal testing and API keys. Enforces `users.roles.manage` on role edits. Wildcards are grant-side only, as the template documents.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** FND-1

---

### Epic CHN — `channels`

Source: TS §3.1 Omnichannel AI Virtual Assistant; §4.8. Website chat widget, channel interface, customer feedback.

---

**Title:** [CHN-1] Embed the assistant on the PHLPost website as a chat widget
**Epic:** `channels`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1 Omnichannel AI Virtual Assistant: the assistant must be accessible through the official PHLPost website. §4.8: customers must be told they are talking to an AI.

**User story:** As a customer on the PHLPost website, I want a chat box I can open on any page so that I can ask my question without leaving the site or creating an account.

**Acceptance criteria:**

- _Given_ a page that includes the widget script, _when_ the customer opens the chat, _then_ a notice says they are chatting with an AI assistant and links the privacy notice before the first message can be sent.
- _Given_ an open chat, _when_ the customer sends a message, _then_ the answer streams into the widget and the Conversation continues across page loads in the same browser tab session.
- _Given_ a request from an origin that is not on the allowed list, _when_ it calls the public chat API, _then_ it is refused and the attempt is logged.
- _Given_ a session sending messages faster than the limit, _when_ the limit is reached, _then_ further messages are refused with a clear 'please wait' notice and an Interaction Event records the throttle.
- _Given_ a phone-sized screen or a keyboard-only user, _when_ they use the widget, _then_ it is fully usable and meets WCAG 2.1 AA for contrast, focus, and labels.

**In scope:**

- Widget bundle served by the web app and embeddable with one script tag; Customer Session token issued on first open
- AI disclosure and privacy notice; allowed-origin list; per-session and per-IP rate limits
- `channels` table seeded with `web-widget`

**Out of scope:**

- Other channels (CHN-2 adds the interface)
- Customer rating of the chat (CHN-3)

**Technical notes:** Flow A — Public chat turn, steps 1 and 8. Replaces the bare page from CNV-1 with the embeddable widget calling the same public endpoints. The session token is random, stored hashed in `customer_sessions`, and carries no identity. Public route: no permission key; protected by origin check, rate limit, and the template screening.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-1

---

**Title:** [CHN-2] Manage channels through one channel interface
**Epic:** `channels`
**Also touches:**
`admin`

**Problem / context:** TS §3.1: the architecture shall allow additional authorized channels to be integrated later without replacing the core application. §3.4 technology neutrality.

**User story:** As a user with `channels.channels.manage` permission, I want to see, configure, and switch channels on or off so that PHLPost controls where the assistant is available.

**Acceptance criteria:**

- _Given_ the channels screen, _when_ a permitted user disables `web-widget`, _then_ the widget shows an 'assistant unavailable' notice within one minute and no new Conversation can start.
- _Given_ the web widget, _when_ its messages are processed, _then_ they pass through the `ChannelAdapter` interface exactly as a second adapter would, proven by a test adapter registered only in tests.
- _Given_ a permitted user, _when_ they change the allowed origins or the welcome text for a channel, _then_ the change takes effect without a deploy and is audited with old and new values.
- _Given_ a user without `channels.channels.manage`, _when_ they open or call the channels screen, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `ChannelAdapter` interface (receive, send, capabilities) and a registry keyed by channel code; the web widget refactored onto it
- Channels admin screen: enable or disable, allowed origins, welcome text

**Out of scope:**

- Building a Messenger, Viber, or SMS adapter — not in this release (PRD decision B2)

**Technical notes:** The interface lives in `apps/backend/src/modules/v1/channels/`. Adding a channel later means one adapter folder plus a registry entry; document this in `docs/CHANNELS.md`. Enforces `channels.channels.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CHN-1

---

**Title:** [CHN-3] Collect a customer rating at the end of a chat
**Epic:** `channels`
**Also touches:**
`analytics`

**Problem / context:** TS §3.1 and §3.2 require customer sentiment indicators and customer-service performance. PRD assumption A5: sentiment is a label per conversation plus the customer's own rating.

**User story:** As a customer on the PHLPost website, I want to say whether the chat helped so that PHLPost can improve its answers.

**Acceptance criteria:**

- _Given_ a Conversation that the customer ends or that receives a confident answer, _when_ the chat closes, _then_ the widget asks 'Did this help?' with yes and no and an optional comment.
- _Given_ a submitted rating, _when_ it is saved, _then_ one Feedback row exists for the Conversation, the comment is masked for personal data, and an Interaction Event is recorded.
- _Given_ a Conversation that already has Feedback, _when_ the customer rates again, _then_ the earlier rating is replaced, never duplicated.
- _Given_ a customer who closes the widget without rating, _when_ the session ends, _then_ nothing is stored and the Conversation is not marked unhelpful.

**In scope:**

- Rating prompt in the widget; `feedback` table; event `feedback_given`

**Out of scope:**

- Sentiment classification and its dashboard tiles (ANL-4)

**Technical notes:** Public route bound to the Customer Session token; no permission key. Comment masking reuses the template screening. A 'no' rating does not reopen the chat but does offer a person once (Flow C — Human handoff, step 1).

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CHN-1

---

### Epic CNV — `conversation`

Source: TS §3.1 conversational AI, NLP, Postal ID; §4.8–4.9. Grounded answers, categories, confidence, languages, output guardrails.

---

**Title:** [CNV-1] Answer a customer question from approved knowledge
**Epic:** `conversation`
**Also touches:**
`knowledge`

**Problem / context:** TS §3.1: the assistant gives timely, consistent answers to routine inquiries. §4.9: official information must be grounded on PHLPost-approved sources.

**User story:** As a customer on the PHLPost website, I want to ask a question in my own words and get an answer taken from PHLPost's approved information so that I can trust it.

**Acceptance criteria:**

- _Given_ at least one approved Knowledge Article, _when_ a customer asks a question it covers, _then_ a streamed answer is returned with the titles of the articles it used.
- _Given_ a question no approved content covers, _when_ it is asked, _then_ the assistant says it does not have that information and invents nothing.
- _Given_ a message containing a phone number, email address, or ID number, _when_ it is processed, _then_ the stored Message and the trace hold the masked form only.
- _Given_ a message that tries to override the assistant's instructions, _when_ it is screened, _then_ the request is refused or neutralized as configured and the attempt is recorded.
- _Given_ an anonymous caller without a valid Customer Session token, _when_ they call the public chat endpoint, _then_ the API returns 401.

**In scope:**

- Public chat endpoints (start session, send message, stream) keyed by a Customer Session token; `customer_sessions` table
- `conversations` and `messages` extended with `customer_session_id`, `channel_code`, `status`, `sender`
- A plain chat page at `/assistant` to exercise it end to end

**Out of scope:**

- The embeddable widget, disclosure, and rate limits (CHN-1)
- Categories (CNV-2), Confidence (CNV-3), languages (CNV-4)

**Technical notes:** Flow A — Public chat turn, steps 3, 5 (retrieval branch), 6, and 8. Reuses the template `rag-gateway.service` and the RAG service's screening, hybrid retrieval, grounded generation, and refusal; retrieval is filtered to chunks of approved versions (KB-1). `ConversationService` is created here and is the only writer of `conversations.status` and `messages`. Public route: no permission key.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** KB-1

---

**Title:** [CNV-2] Classify each inquiry by category and eligibility
**Epic:** `conversation`
**Also touches:**
`analytics`

**Problem / context:** TS §3.1 analytics need inquiry categories; §6.14 measures deflection over eligible, AI-addressable inquiries only. PRD assumption A2 lists the default eligible categories.

**User story:** As a user with `settings.assistant.manage` permission, I want every customer message labelled with a category I control so that routing and the 70% measure rest on the same definition.

**Acceptance criteria:**

- _Given_ a customer message, _when_ it passes screening, _then_ it is stored with one Inquiry Category and `is_eligible` taken from that category's setting at that moment.
- _Given_ a message the classifier cannot place, _when_ it is classified, _then_ it is labelled `other` and is not eligible.
- _Given_ the categories screen, _when_ a permitted user adds a category or changes whether one is eligible, _then_ new messages use the change, earlier messages keep their label, and the change is audited.
- _Given_ a labelled test set of at least 100 messages across the seeded categories, _when_ the classifier runs in CI, _then_ accuracy is reported and the build fails below the agreed floor.
- _Given_ a user without `settings.assistant.manage`, _when_ they call the categories endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `inquiry_categories` table seeded with `tracking`, `rates`, `postal-id`, `service-info`, `scam`, `complaint`, `other`
- Classification step in the chat pipeline; categories admin screen; routing hook used by TRK-1, KB-2, and SCM-1

**Out of scope:**

- The deflection calculation (ANL-3)

**Technical notes:** Flow A — Public chat turn, steps 4 and 5. One cheap-model call returns category and language together (CNV-4 reads the language). The category decides the route: tools for tracking, rates, and scam; retrieval otherwise. Enforces `settings.assistant.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-1

---

**Title:** [CNV-3] State uncertainty and offer a person when confidence is low
**Epic:** `conversation`
**Also touches:**
`escalation` `admin`

**Problem / context:** TS §2 and §4.9: where reliable information is unavailable or confidence falls below an approved threshold, the assistant shall indicate uncertainty or escalate. §4.8 requires confidence thresholds.

**User story:** As a user with `settings.assistant.manage` permission, I want to set the confidence the assistant needs before it answers on its own so that doubtful answers go to a person instead of to the customer.

**Acceptance criteria:**

- _Given_ an answer whose Confidence is at or above the threshold, _when_ it is produced, _then_ it is sent normally and stored with its Confidence.
- _Given_ an answer whose Confidence is below the threshold, _when_ it is produced, _then_ the customer instead sees that the assistant is not sure, what it could find, and an offer to talk to a person.
- _Given_ the settings screen, _when_ a permitted user changes the threshold between 0 and 1, _then_ the next message uses it and the change is audited with old and new values.
- _Given_ a stored assistant Message, _when_ it is inspected, _then_ it shows the retrieval score, the groundedness result, and the Confidence derived from them.
- _Given_ a user without `settings.assistant.manage`, _when_ they call the settings endpoint, _then_ the API returns 403 and the denial is audited.
- _Given_ the routine-answer length limit, which a permitted user can set to any value up to 200 tokens, _when_ an answer in an eligible category is generated, _then_ it does not exceed the limit, ends on a complete sentence, offers “more details” when content was left out, and stores its token count on the Message.

**In scope:**

- `assistant_settings` table and `SettingsService` (first consumer: `confidence_threshold`)
- Confidence calculation; the 'not sure' reply; `confidence` and `answer_kind` columns on `messages`; settings screen
- Routine-answer output limit (setting `max_output_tokens`, default and ceiling 200) passed to the model call and re-checked after generation; `output_tokens` column on `messages`

**Out of scope:**

- Creating the Escalation and the agent side (ESC-1 exists; rules in ESC-3)
- Sensitive-topic rules (ESC-3)

**Technical notes:** Flow A — Public chat turn, steps 6 and 7. Confidence = a documented function of the top reranked retrieval score and the template's groundedness gate result from the `agentic` profile; tool answers (tracking, rates) take the tool's certainty. `SettingsService` is the only reader and writer of `assistant_settings` from here on. The output limit applies to answers in eligible categories (PRD assumption A9); the settings screen refuses a value above 200. Token counts come from the provider's usage figures, which ANL-8 also reads. Enforces `settings.assistant.manage`. Schema: use the table, column, setting-key, and event-kind names exactly as listed in DOMAIN-MODEL.md for `assistant_settings`, `messages`. If this ticket needs a name that is not listed there, add it to DOMAIN-MODEL.md in the same pull request first.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-2

---

**Title:** [CNV-4] Reply in the customer's language
**Epic:** `conversation`

**Problem / context:** TS §2 and §3.1 Localized Natural Language Processing: Philippine English, Filipino/Tagalog, Visayan, Ilocano, code-switching, colloquial expressions, spelling variations, and postal terms. PRD assumption A1: Visayan means Cebuano.

**User story:** As a customer on the PHLPost website, I want to write the way I normally do, in English, Tagalog, Cebuano, Ilocano, or a mix, and be answered in the same language so that I understand the reply.

**Acceptance criteria:**

- _Given_ a message in English, Filipino, Cebuano, or Ilocano, _when_ it is answered, _then_ the reply is in that language and the Message stores the detected language.
- _Given_ a Taglish or other code-switched message, _when_ it is answered, _then_ the reply follows the customer's dominant language and keeps postal terms as PHLPost writes them.
- _Given_ a message in a language outside the four, _when_ it is answered, _then_ the reply is in English, says which languages are supported, and the Message is tagged `unsupported`.
- _Given_ knowledge that exists only in English, _when_ a Cebuano or Ilocano question matches it, _then_ the answer is given in the customer's language from the English source and cites it.
- _Given_ the widget, _when_ the customer picks a language from the menu, _then_ the fixed interface text switches and later replies use that language.

**In scope:**

- Language detection (from the CNV-2 call); reply-language instruction; query translation for retrieval when the source language differs
- Widget interface strings in the four languages; language stored on `customer_sessions` and `messages`

**Out of scope:**

- The approved per-language test sets and acceptance gate (EVL-1)

**Technical notes:** Cross-language retrieval: translate the query to the article language before hybrid search, since keyword search does not cross languages; embeddings help but are not relied on alone. Glossary of postal terms that must not be translated is a seed file in `packages/contracts`. Public behaviour: no permission key.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-1

---

**Title:** [CNV-5] Block invented official information in answers
**Epic:** `conversation`
**Also touches:**
`evaluation`

**Problem / context:** TS §4.9: the AI shall not fabricate tracking statuses, postal rates, payment instructions, policies, requirements, transaction statuses, or government actions. §4.8: outputs are not the sole basis for consequential decisions.

**User story:** As a user with `settings.assistant.manage` permission, I want answers checked before they reach the customer so that the assistant never states a price, status, or payment instruction PHLPost did not supply.

**Acceptance criteria:**

- _Given_ a drafted answer containing an amount, a tracking status, or a payment instruction, _when_ that value does not appear in the tool result or the cited sources, _then_ the answer is withheld and replaced with the 'not sure' reply, and the block is recorded.
- _Given_ a drafted answer asking the customer to pay, or to share a password, one-time code, or card number, _when_ it is checked, _then_ it is always blocked, whatever the sources say.
- _Given_ the guardrail settings, _when_ a permitted user adds a blocked topic or phrase, _then_ matching drafts are withheld from then on and the change is audited.
- _Given_ the guardrail test cases, _when_ they run in CI, _then_ every case is blocked and the build fails if one passes through.
- _Given_ a user without `settings.assistant.manage`, _when_ they call the guardrail settings endpoint, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Output validator run before the final flush: numeric and status values must trace to sources; hard blocks for payment and credential requests
- Blocked-topics setting; event `answer_blocked`; guardrail cases added to the evaluation set

**Out of scope:**

- Input screening — the template already does it
- The wider safety suite (EVL-2)

**Technical notes:** Flow A — Public chat turn, step 6, extending the template's 'validate output before final flush' stage. Streaming is buffered until the validator passes for answers that contain numbers or tool results. Enforces `settings.assistant.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-3

---

**Title:** [CNV-6] Guide Postal ID applicants without deciding their case
**Epic:** `conversation`
**Also touches:**
`knowledge`

**Problem / context:** TS §3.1 Postal ID Assistant: guidance on application and renewal, documentary requirements, and FAQs; the AI shall not approve, reject, authenticate, or determine eligibility.

**User story:** As a customer on the PHLPost website, I want clear steps and requirements for getting or renewing a Postal ID so that I arrive with the right documents.

**Acceptance criteria:**

- _Given_ approved Postal ID articles, _when_ a customer asks how to apply or renew, _then_ the answer lists the steps and requirements from those articles and cites them.
- _Given_ a customer asking 'am I eligible' or 'will my application be approved' about their own case, _when_ it is answered, _then_ the assistant gives the published requirements, says it cannot decide individual cases, and points to the capturing site or a person.
- _Given_ a customer who shares an ID number or uploads personal details, _when_ the message is stored, _then_ the details are masked and the reply reminds them not to share personal information in chat.
- _Given_ a question about the status of a specific Postal ID application, _when_ it is asked, _then_ the assistant says it has no access to application records and offers the official channel or a person.

**In scope:**

- Postal ID category routing and reply rules; seed article templates for apply, renew, requirements, fees, and locations; eligibility-question cases in the evaluation set

**Out of scope:**

- Any lookup of Postal ID application records — no such integration is in the TS
- The content itself, which PHLPost approves through KB-1

**Technical notes:** Implemented as category-specific instructions plus CNV-5 rules: phrases that assert approval, rejection, or eligibility for an individual are blocked. Public behaviour: no permission key.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-5

---

### Epic KB — `knowledge`

Source: TS §3.1 PHLPost Knowledge Base, Postal Rates and Service Information. Article approval workflow, rate table, knowledge gaps.

---

**Title:** [KB-1] Write, review, approve, and retire knowledge articles
**Epic:** `knowledge`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1 PHLPost Knowledge Base: authorized administrators add, update, review, approve, deactivate, and manage content without source-code changes by the provider.

**User story:** As a user with `knowledge.articles.manage` permission, I want to draft and submit articles, and have a second person approve them, so that the assistant only ever answers from content PHLPost has signed off.

**Acceptance criteria:**

- _Given_ a draft version, _when_ its author submits it and a different user with `knowledge.articles.approve` approves it, _then_ the version becomes `approved`, is indexed, and can be retrieved by the assistant.
- _Given_ a version in review, _when_ its own author tries to approve it, _then_ the API refuses and the attempt is audited.
- _Given_ an approved article, _when_ a permitted user deactivates it, _then_ its chunks are no longer retrievable from that moment and cached answers built on it are cleared.
- _Given_ an approved article that is edited, _when_ the edit is saved, _then_ a new draft version is created and the approved version keeps serving until the new one is approved.
- _Given_ a user without `knowledge.articles.manage`, _when_ they try to create or edit an article, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `knowledge_articles` and `knowledge_article_versions` tables; article list, editor, review queue, and version history screens
- Index on approval and de-index on deactivation through the template ingestion service; response-cache invalidation
- Upload of a DOCX, PDF, or HTML file as the starting text of a draft

**Out of scope:**

- Rate tables (KB-2)
- Suggestions from unanswered questions (KB-3)

**Technical notes:** Flow E — Knowledge approval and indexing. State machine `DOMAIN-MODEL.md` §5.2. Retrieval must filter to chunks whose document belongs to an approved, active version: add the filter in the RAG service metadata filter, not in the UI. Enforces `knowledge.articles.manage` on authoring and `knowledge.articles.approve` on approval.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** FND-2

---

**Title:** [KB-2] Maintain postal rates and answer rate questions from the table
**Epic:** `knowledge`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1 Postal Rates and Service Information: approved information on products, rates, availability, and conditions. §4.9: the AI shall not fabricate postal rates. PRD assumption A3 and decision D4.

**User story:** As a user with `knowledge.rates.manage` permission, I want to keep the rate table current so that every price the assistant quotes is one PHLPost published.

**Acceptance criteria:**

- _Given_ an approved Rate Entry for a service, zone, and weight band, _when_ a customer asks the price for a matching item, _then_ the assistant quotes that price with its effective date and names the service.
- _Given_ a question missing the weight or the destination, _when_ it is asked, _then_ the assistant asks for the missing detail before quoting.
- _Given_ no Rate Entry matching the request, _when_ it is asked, _then_ the assistant says it has no published rate for that case and quotes nothing.
- _Given_ a CSV of rates, _when_ a permitted user imports it, _then_ rows are validated, shown as a preview with errors, and go live only after a second user approves the batch.
- _Given_ a user without `knowledge.rates.manage`, _when_ they call the rates endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `rate_entries` table; rates screen with CSV import, preview, approval, and effective dates
- Rate lookup tool called by the assistant for the `rates` category

**Out of scope:**

- Computing customs duties or taxes
- A live rates API — none is known (PRD assumption A3)

**Technical notes:** Flow E — Knowledge approval and indexing applies to the batch approval. The tool returns the entry or 'none'; the model words the reply but CNV-5 checks the amount against the tool result. Enforces `knowledge.rates.manage`; batch approval enforces `knowledge.articles.approve`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** KB-1, CNV-2

---

**Title:** [KB-3] Turn unanswered questions into knowledge to write
**Epic:** `knowledge`
**Also touches:**
`analytics`

**Problem / context:** TS §3.1 analytics list frequently raised concerns; §5.10 monitors failed or unanswered inquiries; §5.16 requires knowledge base tuning during hypercare.

**User story:** As a user with `knowledge.gaps.view` permission, I want a list of the questions the assistant could not answer, grouped by topic, so that I know which articles to write next.

**Acceptance criteria:**

- _Given_ messages answered as uncertain or refused for lack of content, _when_ the gaps screen is opened, _then_ they appear grouped by similar wording with a count, the category, the language, and example questions with personal data masked.
- _Given_ a gap group, _when_ a user who also holds `knowledge.articles.manage` chooses 'draft article', _then_ a draft is created pre-filled with the example questions and the group is marked in progress.
- _Given_ an article approved from a gap, _when_ the same question is asked again and answered confidently, _then_ the group is marked resolved.
- _Given_ a user without `knowledge.gaps.view`, _when_ they open the gaps screen, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Gap grouping job over uncertain and refused messages; gaps screen; link from gap to draft

**Out of scope:**

- Automatic article writing by the model

**Technical notes:** Grouping uses the template embeddings over masked question text with a simple threshold clustering; no new model. Reads `messages`; writes only its own `knowledge_gaps` table. Enforces `knowledge.gaps.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-3, KB-1

---

### Epic TRK — `tracking`

Source: TS §3.1 Track and Trace Assistance; §3.3; §3.4. Tracking connector interface, status explanations, real adapter.

---

**Title:** [TRK-1] Check a tracking number through a tracking connector
**Epic:** `tracking`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1 Track and Trace Assistance: retrieve and communicate available status from the authorized tracking source. §3.3: the assistant shall not alter, fabricate, or supersede the official record. PRD decision B3.

**User story:** As a customer on the PHLPost website, I want to give my tracking number and be told where my item is so that I do not have to search another page.

**Acceptance criteria:**

- _Given_ the mock connector holding a record for a tracking number, _when_ a customer asks where that item is, _then_ the reply states the status, place, and time exactly as the connector returned them.
- _Given_ a tracking number the connector does not know, _when_ it is asked about, _then_ the assistant says no record was found and suggests checking the number; it does not guess a status.
- _Given_ a message about tracking with no number, or a malformed one, _when_ it is asked, _then_ the assistant asks for the tracking number and performs no lookup.
- _Given_ a connector that does not answer within the timeout, _when_ a lookup is made, _then_ the assistant says the tracking system cannot be reached right now and offers to try again or to reach a person.
- _Given_ any lookup, _when_ it completes, _then_ a Tracking Lookup row stores a hash of the number, the connector, the outcome, and the latency, and never the number itself.

**In scope:**

- `TrackingSource` interface (`lookup`) and a connector registry; `mock` connector with seed data
- Tracking tool in the chat pipeline for the `tracking` category; `tracking_lookups` table

**Out of scope:**

- Customer-friendly explanations per status (TRK-2)
- The real PHLPost adapter (TRK-4)

**Technical notes:** Flow B — Tracking lookup through a connector, steps 1 to 3 and 6. Connectors live in `apps/backend/src/modules/v1/tracking/connectors/<code>/`; no connector-specific type leaves its folder. Tracking-number format rules are configuration. Public behaviour: no permission key.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CHN-1

---

**Title:** [TRK-2] Explain each official status in plain language
**Epic:** `tracking`
**Also touches:**
`knowledge`

**Problem / context:** TS §3.1: communicate status in clear and customer-friendly language; where information shows processing by another agency such as the Bureau of Customs, provide PHLPost-approved guidance, documentary requirements, or next steps.

**User story:** As a user with `tracking.explanations.manage` permission, I want to write the wording and next steps shown for each status code so that customers understand what the status means and what to do.

**Acceptance criteria:**

- _Given_ a Status Explanation for a status code in the customer's language, _when_ a lookup returns that code, _then_ the reply gives the official status followed by the approved explanation and next steps.
- _Given_ a status code with no explanation, _when_ a lookup returns it, _then_ the reply shows the official description unchanged and the code appears in a 'needs explanation' list.
- _Given_ a status that means the item is held at Customs, _when_ it is returned, _then_ the reply includes the approved Customs guidance and required documents, and states that PHLPost does not decide the release.
- _Given_ a user without `tracking.explanations.manage`, _when_ they call the explanations endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `status_explanations` table; explanations screen per status code and language; 'needs explanation' list

**Out of scope:**

- Changing or re-coding the official status

**Technical notes:** Flow B — Tracking lookup through a connector, steps 4 and 5. The explanation is appended to, never substituted for, the official status text. Enforces `tracking.explanations.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** TRK-1

---

**Title:** [TRK-3] Keep tracking lookups safe when the source is slow or down
**Epic:** `tracking`
**Also touches:**
`admin`

**Problem / context:** TS §3.4 API-Based Integration and §4.13 integration logs. §5.3 treats a failed critical integration as a high-severity incident, so failures must be visible.

**User story:** As a user with `tracking.connectors.manage` permission, I want to see the health of each connector and have lookups fail fast when the source is down so that customers get an honest answer instead of a hung chat.

**Acceptance criteria:**

- _Given_ five consecutive failed or timed-out lookups, _when_ the next lookup is made, _then_ it returns `unavailable` at once without calling the source, and the connector shows as 'open' on the connectors screen.
- _Given_ an open breaker, _when_ the wait period passes and a trial lookup succeeds, _then_ normal lookups resume and the recovery is logged.
- _Given_ the connectors screen, _when_ a permitted user opens it, _then_ it shows each connector's status, success rate, median and 95th percentile latency, and the last error, with no customer data.
- _Given_ a permitted user, _when_ they change the active connector, timeout, or credentials reference, _then_ the change applies without a deploy and is audited; secrets are never displayed.
- _Given_ a user without `tracking.connectors.manage`, _when_ they open the connectors screen, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Timeout, retry, and circuit breaker around `TrackingSource`; `integration_log` table and `IntegrationLogService`
- Connectors screen: health, active connector, timeout, credentials reference

**Out of scope:**

- Infrastructure alerting and on-call (DevOps, outside these tickets)

**Technical notes:** Flow B — Tracking lookup through a connector, failure branch. Breaker state in Redis so every replica agrees. Results are cached for at most a short, configurable period and always shown with the source's own timestamp. Enforces `tracking.connectors.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** TRK-1

---

**Title:** [TRK-4] Connect the real PHLPost Track and Trace or MMAS source
**Epic:** `tracking`

**Problem / context:** TS §3.1, §3.3, and §3.4: integrate securely with Track and Trace, MMAS, or another authorized system through documented, controlled APIs. PRD decision B3 and assumption A7: the interface is unknown until PHLPost hands it over.

**User story:** As a user with `tracking.connectors.manage` permission, I want the assistant to read from PHLPost's real tracking system so that customers get their actual item status.

**Acceptance criteria:**

- _Given_ the PHLPost API documentation and test credentials, _when_ the adapter is built against them, _then_ a lookup of a known test item returns the same status, place, and time as PHLPost's own Track and Trace page.
- _Given_ the shared connector contract tests, _when_ they run against the real adapter and the mock, _then_ both pass.
- _Given_ every status code the PHLPost source can return, _when_ the mapping is reviewed, _then_ each is listed for TRK-2 with its official description, and unmapped codes are reported.
- _Given_ a permitted user, _when_ they switch the active connector from `mock` to the PHLPost adapter, _then_ new lookups use it at once and the switch is audited.
- _Given_ a user without `tracking.connectors.manage`, _when_ they try to switch connectors, _then_ the API returns 403 and the denial is audited.

**In scope:**

- One adapter folder for the PHLPost source; credentials through the secret store; field and status-code mapping; contract tests
- ZIP Code or other reference lookups only if PHLPost supplies an API for them, as a second connector of the same kind

**Out of scope:**

- Writing anything back to MMAS or Track and Trace
- Any logistics function (TS §3.3)

**Technical notes:** Blocked on PHLPost handing over API documentation, credentials, and a test environment (PRD open item 1). Flow B — Tracking lookup through a connector, all steps. Only the minimum fields are requested and none are stored beyond the Tracking Lookup row. Enforces `tracking.connectors.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** TRK-3, TRK-2

---

### Epic SCM — `scam-protection`

Source: TS §3.1 AI-Assisted Scam Detection and Customer Protection. Advisory assessment, indicators, report review, known patterns.

---

**Title:** [SCM-1] Assess a suspicious message and give safety guidance
**Epic:** `scam-protection`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1 AI-Assisted Scam Detection and Customer Protection: customers submit suspicious SMS, emails, links, and payment requests for preliminary AI-assisted assessment; assessments are advisory and never conclusive. PRD assumption A4.

**User story:** As a customer on the PHLPost website, I want to paste a message I received in PHLPost's name and be told how risky it looks and what to do so that I do not get scammed.

**Acceptance criteria:**

- _Given_ a pasted message that asks for a fee through a link that is not a PHLPost domain, _when_ it is submitted, _then_ the reply gives a high risk level, names the indicators found, and gives safety guidance, worded as an assessment and never as a finding of fraud.
- _Given_ a submitted link, _when_ it is assessed, _then_ its domain is parsed and compared with the official list, and the system makes no request to that link.
- _Given_ a submission that contains instructions aimed at the assistant, _when_ it is assessed, _then_ the instructions are not followed, and the attempt is counted as an indicator.
- _Given_ a submission the checks cannot judge, _when_ it is assessed, _then_ the risk level is `uncertain`, general safety guidance is given, and reporting to PHLPost is offered.
- _Given_ any assessment, _when_ it is stored, _then_ the Scam Submission is masked for personal data and the Scam Assessment records the indicators, risk level, and Confidence.

**In scope:**

- 'Check a suspicious message' entry in the widget and routing for the `scam` category
- `scam_submissions` and `scam_assessments` tables; deterministic indicator checks then a model assessment limited to approved indicators
- Seeded Risk Indicators and safety-guidance texts in the four languages

**Out of scope:**

- Editing indicators and the official list (SCM-2)
- Staff review (SCM-3)
- Screenshots (SCM-5)

**Technical notes:** Flow D — Scam assessment, steps 1 to 6. The submission is passed to the model inside a delimited data block with an instruction that its content is not to be obeyed. URL handling is parse-only: no fetch, no redirect resolution, no preview. Every reply carries the fixed advisory line required by TS §3.1. Public behaviour: no permission key. Schema: use the table, column, setting-key, and event-kind names exactly as listed in `DOMAIN-MODEL.md` for `scam_submissions`, `scam_assessments`. If this ticket needs a name that is not listed there, add it to `DOMAIN-MODEL.md` in the same pull request first.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-2

---

**Title:** [SCM-2] Maintain risk indicators and the list of genuine PHLPost contacts
**Epic:** `scam-protection`
**Also touches:**
`admin`

**Problem / context:** TS §3.1: the capability assesses PHLPost-approved risk indicators, including suspicious links, payment or information requests, impersonation, urgency, and known patterns.

**User story:** As a user with `scam.indicators.manage` permission, I want to control the indicators the assistant looks for and the genuine PHLPost domains, sender names, and payment channels so that assessments follow PHLPost's own rules.

**Acceptance criteria:**

- _Given_ the indicators screen, _when_ a permitted user adds, weights, or deactivates a Risk Indicator, _then_ new assessments use the change and it is audited.
- _Given_ the official contacts screen, _when_ a permitted user adds a genuine domain or sender name, _then_ submissions from it stop being flagged as unofficial, and look-alike domains are still flagged.
- _Given_ a sample message, _when_ a permitted user runs 'test assessment', _then_ the screen shows the indicators that fired and the resulting risk level without creating a customer record.
- _Given_ a user without `scam.indicators.manage`, _when_ they call these endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `risk_indicators` and `official_contacts` tables; two admin screens; test-assessment tool

**Out of scope:**

- Known scam patterns (SCM-4)

**Technical notes:** Flow D — Scam assessment, steps 3 and 4. Look-alike detection uses edit distance and homoglyph folding against `official_contacts`. Enforces `scam.indicators.manage`. Use the names from `DOMAIN-MODEL.md` for `official_contacts` and `risk_indicators`, and document new domain names there first.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** SCM-1

---

**Title:** [SCM-3] Report a suspected scam to PHLPost and review it
**Epic:** `scam-protection`
**Also touches:**
`escalation`

**Problem / context:** TS §3.1: facilitate reporting and escalation to authorized PHLPost personnel; uncertain, high-risk, or reportable cases shall be capable of escalation for human validation and action.

**User story:** As a user with `scam.reports.validate` permission, I want a queue of reported scams that I can review and mark as confirmed, legitimate, or inconclusive so that PHLPost acts on real threats.

**Acceptance criteria:**

- _Given_ an assessment that is high risk or uncertain, or a customer who chooses to report, _when_ the report is sent, _then_ a Scam Report in `reported` appears in the queue and the customer sees a reference number.
- _Given_ a report in the queue, _when_ a permitted user opens it, _then_ they see the masked submission, the extracted links as text that cannot be clicked, the indicators, and the assessment.
- _Given_ a report under review, _when_ the reviewer records a finding and notes, _then_ the status follows the state machine, the finding is audited, and the customer-facing wording stays advisory.
- _Given_ a user with `scam.reports.view` but not `scam.reports.validate`, _when_ they open a report, _then_ they can read it but cannot set a finding.
- _Given_ a user with neither permission, _when_ they open the queue, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `scam_reports` table; report action in the widget; review queue and report screen; reference number

**Out of scope:**

- Notifying telecoms or law enforcement — a PHLPost process outside the system
- Trend charts (ANL-5)

**Technical notes:** Flow D — Scam assessment, step 7. State machine `DOMAIN-MODEL.md` §5.4. Links render as inert text. A report that needs to speak to the customer creates an Escalation through `EscalationService`. Enforces `scam.reports.view` for reading and `scam.reports.validate` for findings.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** SCM-1, ESC-1

---

**Title:** [SCM-4] Match new submissions against known scam patterns
**Epic:** `scam-protection`
**Also touches:**
`analytics`

**Problem / context:** TS §3.1 lists known or emerging scam patterns among the indicators; §3.2 lists recurring scam indicators among the trends.

**User story:** As a user with `scam.reports.validate` permission, I want to save a confirmed scam as a pattern so that the next customer who receives it is warned at once.

**Acceptance criteria:**

- _Given_ a report marked `confirmed_scam`, _when_ the reviewer saves it as a Scam Pattern, _then_ the pattern stores its domains, sender, key phrases, and a similarity signature, with personal data removed.
- _Given_ an active pattern, _when_ a new submission closely matches it, _then_ the assessment is high risk, cites 'matches a scam PHLPost has confirmed', and links the pattern.
- _Given_ the patterns screen, _when_ a permitted user opens it, _then_ each pattern shows first seen, last seen, and the number of matching submissions.
- _Given_ a pattern that is deactivated, _when_ a matching submission arrives, _then_ it is assessed without the pattern.
- _Given_ a user without `scam.reports.validate`, _when_ they try to create or edit a pattern, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `scam_patterns` table; create-from-report action; pattern matching step; patterns screen

**Out of scope:**

- Sharing patterns with outside parties

**Technical notes:** Flow D — Scam assessment, step 4. Similarity uses the template embeddings over masked text plus exact domain and sender matches; the threshold is an Assistant Setting. Enforces `scam.reports.validate`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** SCM-3, SCM-2

---

**Title:** [SCM-5] Assess a screenshot of a suspicious message
**Epic:** `scam-protection`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1: customers may submit suspicious SMS, emails, links, payment requests, and other communications. PRD assumption A4: a screenshot is the usual way a customer holds an SMS.

**User story:** As a customer on the PHLPost website, I want to upload a screenshot of the text I received so that I do not have to retype it.

**Acceptance criteria:**

- _Given_ a PNG or JPEG screenshot under the size limit, _when_ it is uploaded, _then_ the text and links are read from it and assessed exactly as a pasted message would be.
- _Given_ a file that is not an image, is too large, or fails the malware scan, _when_ it is uploaded, _then_ it is refused with a clear reason and nothing is stored.
- _Given_ an image whose text cannot be read, _when_ it is assessed, _then_ the assistant says so and asks the customer to paste the text.
- _Given_ a stored screenshot, _when_ its Scam Submission is deleted or anonymized, _then_ the image file is deleted in the same operation.

**In scope:**

- Image upload in the scam entry; text and link extraction through the vision model; storage with retention

**Out of scope:**

- Any other file type
- Audio or video

**Technical notes:** Flow D — Scam assessment applies unchanged after extraction. Uses the template's multimodal support for this one path only; the image is content-type checked, re-encoded to strip metadata, and stored privately. Scheduled removal is ADM-5; this ticket makes deleting a submission delete its image. Text found in the image is data, never instructions. Public behaviour: no permission key.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** SCM-1

---

### Epic ESC — `escalation`

Source: TS §3.1 Human Agent Escalation and Handoff; §4.8. Agent inbox, live takeover, rules, external helpdesk connector.

---

**Title:** [ESC-1] Hand a chat over to an agent inbox
**Epic:** `escalation`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1 Human Agent Escalation and Handoff: configurable transfer to authorized personnel, who receive the interaction history so the customer need not repeat themselves. PRD decision B4.

**User story:** As a user with `escalations.queue.view` permission, I want escalated chats to arrive in an inbox with their full history so that I can pick them up without asking the customer to start over.

**Acceptance criteria:**

- _Given_ a customer who asks to talk to a person, _when_ they confirm, _then_ an Escalation in `queued` is created with the reason, the Conversation becomes `escalation_requested`, and the customer is told a person will join.
- _Given_ the inbox, _when_ a permitted user opens it, _then_ queued Escalations are listed oldest first with category, language, waiting time, and reason.
- _Given_ an Escalation, _when_ a permitted user opens it, _then_ the whole Conversation is shown, with the sources and Confidence of each assistant answer and personal data masked.
- _Given_ a user without `escalations.queue.view`, _when_ they open the inbox, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `escalations` table and `EscalationService`; 'talk to a person' action in the widget; inbox list and read-only conversation view

**Out of scope:**

- Claiming and replying (ESC-2)
- Rules, business hours, and offline handling (ESC-3)
- Pushing to an external helpdesk (ESC-4)

**Technical notes:** Flow C — Human handoff, steps 1 and 2. State machines `DOMAIN-MODEL.md` §5.1 and §5.3. `EscalationService` is the only writer of `escalations.status`. Enforces `escalations.queue.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CHN-1

---

**Title:** [ESC-2] Reply to the customer as an agent in the same chat
**Epic:** `escalation`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1: authorized personnel continue handling the inquiry with the interaction history. §4.8 human oversight.

**User story:** As a user with `escalations.conversations.handle` permission, I want to claim an escalated chat and answer the customer live in the same window so that the handover is seamless.

**Acceptance criteria:**

- _Given_ a queued Escalation, _when_ a permitted user claims it, _then_ it becomes `claimed`, the Conversation becomes `agent_active`, and the customer sees that an agent has joined.
- _Given_ two agents claiming the same Escalation at once, _when_ both requests arrive, _then_ one succeeds and the other is told it is already claimed.
- _Given_ an `agent_active` Conversation, _when_ the customer sends a message, _then_ it reaches the agent within two seconds and the assistant posts no answer.
- _Given_ an agent reply, _when_ it is sent, _then_ it appears in the widget marked as from a PHLPost agent and is stored with `sender = agent` and the agent's id.
- _Given_ a user without `escalations.conversations.handle`, _when_ they try to claim or reply, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Claim with a row lock; live two-way messaging between inbox and widget; close with an outcome note
- Assistant silenced while a Conversation is `agent_active`

**Out of scope:**

- Canned replies and agent performance reports
- Transfer between agents

**Technical notes:** Flow C — Human handoff, steps 3 and 4 and the claim race. Live delivery over server-sent events from the backend, with Redis pub/sub so it works across replicas. Agents post through `ConversationService.postAgentMessage` only. Enforces `escalations.conversations.handle`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ESC-1

---

**Title:** [ESC-3] Set escalation rules, business hours, and the offline path
**Epic:** `escalation`
**Also touches:**
`admin` `conversation`

**Problem / context:** TS §3.1: escalate where the AI cannot resolve reliably, falls below the threshold, or the matter is sensitive or exceptional. §4.8 review of high-risk or uncertain outputs.

**User story:** As a user with `settings.escalation.manage` permission, I want to decide which topics always go to a person, when agents are on duty, and what happens outside those hours so that no customer is left waiting for nobody.

**Acceptance criteria:**

- _Given_ a rule listing sensitive topics or keywords, _when_ a customer message matches it, _then_ the assistant does not attempt an answer and offers a person at once.
- _Given_ business hours set in Asia/Manila, _when_ an Escalation is requested outside them, _then_ the customer is told agents are offline and may leave an optional contact; the Escalation becomes `contact_captured`.
- _Given_ an Escalation queued during business hours, _when_ nobody claims it within the wait limit, _then_ the customer is offered the same offline path and the Escalation is flagged as missed.
- _Given_ a contact left by a customer, _when_ it is stored, _then_ it is encrypted, shown only to holders of `escalations.conversations.handle`, and falls under the retention rules of ADM-5.
- _Given_ a user without `settings.escalation.manage`, _when_ they call the rules endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Escalation rules (topics, keywords, categories, repeated low Confidence); business hours and holidays; wait limit; offline contact capture

**Out of scope:**

- Outbound email or SMS to the customer from the system

**Technical notes:** Flow C — Human handoff, steps 1 and 5; Flow A — Public chat turn, step 7. Rules are Assistant Settings read through `SettingsService`. Enforces `settings.escalation.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ESC-2, CNV-3

---

**Title:** [ESC-4] Push escalations to an external helpdesk
**Epic:** `escalation`
**Also touches:**
`admin`

**Problem / context:** TS §3.1 handoff to authorized personnel and §3.4 interoperability. PRD decision B4 and assumption A6: PHLPost's helpdesk tool is unknown, so the connector is a signed webhook plus email.

**User story:** As a user with `escalations.connectors.manage` permission, I want escalations delivered to the helpdesk tool PHLPost already uses so that agents who work there do not need a second inbox.

**Acceptance criteria:**

- _Given_ an enabled webhook connector, _when_ an Escalation is created, _then_ a signed request with the reason, category, language, and a link to the transcript is delivered, and the Escalation shows `pushed_external` with the external reference when one is returned.
- _Given_ a delivery that fails, _when_ it is retried with backoff and still fails, _then_ it is marked failed, stays visible in the inbox, and the failure is in the integration log.
- _Given_ an enabled email connector, _when_ an Escalation is created, _then_ an email with the same summary goes to the configured address, with personal data limited to what the customer chose to leave.
- _Given_ a permitted user, _when_ they send a test delivery from the connector screen, _then_ the result and response code are shown.
- _Given_ a user without `escalations.connectors.manage`, _when_ they call the connector endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `HandoffConnector` interface with `webhook` and `email` implementations; `handoff_connectors` and `handoff_deliveries` tables; outbox worker; connector screen

**Out of scope:**

- A named vendor adapter (Zendesk, Freshdesk, or similar) — added as one more implementation once PHLPost names its tool
- Two-way sync of replies from the external tool

**Technical notes:** Flow C — Human handoff, step 6 and its failure branch. Webhook body is signed with an HMAC secret from the secret store. The transcript link opens the inbox view and needs sign-in; the transcript itself is not sent. Reuses `IntegrationLogService` from TRK-3. Enforces `escalations.connectors.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ESC-3, TRK-3

---

### Epic ANL — `analytics`

Source: TS §3.1 analytics; §3.2; §5.10; §6.14. Events, dashboard, deflection KPI, trends, summaries, reports, AI monitoring.

---

**Title:** [ANL-1] Record interaction events and show live counts
**Epic:** `analytics`
**Also touches:**
`conversation`

**Problem / context:** TS §3.2: analytics use authorized and validated information generated by the customer-service application. PRD decision D9: analytics read only from an append-only event table.

**User story:** As a user with `analytics.dashboard.view` permission, I want every conversation step recorded as an event and a page of today's counts so that reporting rests on one trustworthy source from day one.

**Acceptance criteria:**

- _Given_ a Conversation that starts, receives an answer, and is escalated, _when_ each step happens, _then_ one Interaction Event per step is stored with its kind, category, language, channel, and time, and no free text.
- _Given_ the overview page, _when_ a permitted user opens it, _then_ it shows today's conversations, answers, tracking lookups, and escalations, matching the event table.
- _Given_ an event row, _when_ any code tries to update or delete it, _then_ the database refuses.
- _Given_ a user without `analytics.dashboard.view`, _when_ they open the overview, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `interaction_events` table with an insert-only trigger; `EventService.record`; events for conversation started, message answered, tracking lookup, escalation requested
- Overview page with four counters

**Out of scope:**

- Charts and filters (ANL-2)
- The deflection rate (ANL-3)

**Technical notes:** Flow F — Deflection KPI depends on these events being complete. Event kinds are a Zod enum in `packages/contracts`; later tickets add kinds, never columns of free text. Enforces `analytics.dashboard.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CHN-1

---

**Title:** [ANL-2] Show the management dashboard
**Epic:** `analytics`

**Problem / context:** TS §3.2 Management Dashboard: configurable dashboards presenting inquiry volumes, categories, resolution and escalation rates, response times, frequent concerns, utilization, and availability. §3.1 Customer Interaction and Service Analytics.

**User story:** As a user with `analytics.dashboard.view` permission, I want charts of how the assistant is being used and how it is performing so that I can manage the service from facts.

**Acceptance criteria:**

- _Given_ events over a chosen period, _when_ the dashboard is opened, _then_ it shows inquiry volume over time, volume by category, by language, and by channel, the escalation rate, and median and 95th percentile response time.
- _Given_ the filters, _when_ a permitted user sets a date range, category, language, or channel, _then_ every tile recomputes for that selection.
- _Given_ the layout controls, _when_ a permitted user hides, shows, or reorders tiles and saves, _then_ their layout is kept for them, and a default layout applies to new users.
- _Given_ any tile, _when_ its figure is compared with a direct count of events for the same filter, _then_ the two match.
- _Given_ a user without `analytics.dashboard.view`, _when_ they open the dashboard, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Aggregation queries over `interaction_events`; dashboard page with filters and a saved per-user layout

**Out of scope:**

- Deflection (ANL-3), sentiment and concerns (ANL-4), scam trends (ANL-5), AI health (ANL-8)

**Technical notes:** Extends the template `dashboard` feature. Aggregates are computed in Asia/Manila days. System availability is shown from the template's ops metrics when present, otherwise the tile is hidden; it is not computed here. Enforces `analytics.dashboard.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ANL-1, CNV-2

---

**Title:** [ANL-3] Measure the deflection rate by an approved method
**Epic:** `analytics`
**Also touches:**
`admin`

**Problem / context:** TS §2 and §6.14: target up to 70% automated handling of eligible routine inquiries; Deflection Rate = eligible inquiries resolved by the AI without human intervention ÷ total eligible AI-addressable inquiries × 100; the method must state inclusions, exclusions, periods, escalation criteria, failed interactions, abandoned sessions, and duplicates.

**User story:** As a user with `analytics.kpi.manage` permission, I want to define exactly how deflection is counted and record the baseline and target so that the 70% figure is consistent and auditable.

**Acceptance criteria:**

- _Given_ an approved KPI Definition, _when_ the deflection tile is shown for a period, _then_ it displays the rate, the numerator, the denominator, and the definition version.
- _Given_ Conversations that were escalated, ended on an uncertain answer, or were blocked, _when_ the rate is computed, _then_ none of them counts as resolved by the AI.
- _Given_ the definition's choices for abandoned sessions, duplicates within a time window, and test sessions, _when_ they are changed and approved as a new version, _then_ figures are computed per version and earlier reports keep the version they used.
- _Given_ a period before go-live, _when_ a permitted user enters the baseline volume and handling figures, _then_ the tile shows the rate against the baseline and the 70% target.
- _Given_ a user without `analytics.kpi.manage`, _when_ they try to edit a definition or baseline, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `kpi_definitions` table with versions; definition editor; baseline and target entry; deflection computation and tile; drill-down to the counted Conversations

**Out of scope:**

- Any claim about answer accuracy — the TS says the 70% is not an accuracy rate

**Technical notes:** Flow F — Deflection KPI. The computation is one documented SQL view per definition version over append-only `interaction_events` so an auditor can rerun it. A customer ending a chat closes it as `resolved_by_ai` only when the last eligible inquiry received a grounded or tool answer; uncertain, blocked, failed, and escalated interactions remain unresolved. Enforces `analytics.kpi.manage`; viewing the tile needs `analytics.dashboard.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ANL-2, ESC-1

---

**Title:** [ANL-4] Show sentiment and the concerns customers raise most
**Epic:** `analytics`
**Also touches:**
`channels`

**Problem / context:** TS §3.1 and §3.2: customer sentiment indicators, frequently raised concerns, and Trend and Pattern Analysis of recurring concerns and changes in inquiry volume. PRD assumption A5.

**User story:** As a user with `analytics.dashboard.view` permission, I want to see how customers feel and what they keep asking about so that I can fix the causes.

**Acceptance criteria:**

- _Given_ a closed Conversation, _when_ the nightly job runs, _then_ it is labelled positive, neutral, or negative and the label is stored as an event, with no message text copied.
- _Given_ the sentiment tile, _when_ it is shown, _then_ it gives the share of each label and, separately, the share of 'helpful' ratings from customers.
- _Given_ the concerns tile, _when_ it is shown, _then_ it lists the top recurring topics for the period with counts and the change from the previous period.
- _Given_ a week where a category's volume rises by more than the configured percentage, _when_ the trends panel is opened, _then_ the rise is listed with its size and start date.
- _Given_ a user without `analytics.dashboard.view`, _when_ they open these tiles, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Nightly sentiment labelling job; topic grouping for concerns; week-over-week change detection; three dashboard tiles

**Out of scope:**

- Per-customer profiles or any tracking of individuals

**Technical notes:** Sentiment is one cheap-model call per closed Conversation over masked text; topic grouping reuses the KB-3 clustering. Results are aggregate indicators and are labelled as AI-estimated on the dashboard. Enforces `analytics.dashboard.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ANL-2, CHN-3, KB-3

---

**Title:** [ANL-5] Show scam-reporting trends
**Epic:** `analytics`
**Also touches:**
`scam-protection`

**Problem / context:** TS §3.2: dashboards include scam-reporting trends; the Solution may identify recurring scam indicators. §2 scam-reporting trends for management.

**User story:** As a user with `scam.reports.view` permission, I want to see how many suspicious messages are submitted, what kind, and which patterns recur so that PHLPost can warn the public in time.

**Acceptance criteria:**

- _Given_ scam submissions and reports over a period, _when_ the scam trends page is opened, _then_ it shows submissions over time, by risk level, by indicator, and by review finding.
- _Given_ active Scam Patterns, _when_ the page is opened, _then_ the most matched patterns are listed with first seen, last seen, and match counts.
- _Given_ the most reported look-alike domains, _when_ they are listed, _then_ they appear as plain text that cannot be clicked.
- _Given_ a user without `scam.reports.view`, _when_ they open the page, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Scam events added to `interaction_events`; scam trends page; top patterns and top domains lists

**Out of scope:**

- Public scam advisories — PHLPost publishes those itself

**Technical notes:** Reads events and `scam_patterns` only; no submission text is shown on this page. Enforces `scam.reports.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ANL-2, SCM-3

---

**Title:** [ANL-6] Draft a plain-language management summary for approval
**Epic:** `analytics`

**Problem / context:** TS §3.2 AI-Assisted Management Summaries: plain-language summaries for management, subject to traceability, validation, access controls, and human review. PRD decision D11.

**User story:** As a user with `analytics.summaries.generate` permission, I want a draft summary of a period written from the dashboard figures so that I can review and share it without writing it from scratch.

**Acceptance criteria:**

- _Given_ a chosen period, _when_ a permitted user asks for a summary, _then_ a draft is produced within a minute that states the main figures and changes, and stores the exact figures it was given.
- _Given_ a draft, _when_ it is opened, _then_ every number in the text is shown beside the figure it came from, and any number that does not match a figure is highlighted.
- _Given_ a draft, _when_ a user with `analytics.summaries.approve` edits and approves it, _then_ it becomes `approved`, is marked 'AI-drafted, reviewed by' with their name, and can be exported.
- _Given_ a draft that is not approved, _when_ anyone tries to export it, _then_ the export is refused.
- _Given_ a user without `analytics.summaries.generate`, _when_ they request a summary, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `management_summaries` table; generate, review, edit, approve, and discard; number-to-figure check

**Out of scope:**

- Recommendations about staffing or operations — outside the customer-service scope (TS §3.2)

**Technical notes:** The model receives aggregated figures only, never transcripts. The number check is deterministic: each numeral in the draft must equal a supplied figure. Enforces `analytics.summaries.generate` for drafting and `analytics.summaries.approve` for approval.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ANL-4

---

**Title:** [ANL-7] Generate and export customer-service reports
**Epic:** `analytics`

**Problem / context:** TS §3.2 Reporting and Data Export: authorized users generate and export approved reports in commonly used and machine-readable formats. §6.14 auditable KPI reporting.

**User story:** As a user with `reports.reports.export` permission, I want to run the standard customer-service reports for any period and download them so that I can file them and share them with management.

**Acceptance criteria:**

- _Given_ the reports screen, _when_ a permitted user picks a report and a period, _then_ the report is shown on screen and can be downloaded as CSV, XLSX, PDF, and JSON.
- _Given_ the customer-service performance report, _when_ it is generated, _then_ it contains volumes, categories, deflection with its definition version, escalation rate, response times, sentiment, and scam figures.
- _Given_ a report schedule, _when_ a user with `reports.schedules.manage` sets it to monthly, _then_ the report is produced on the first day of each month and stored for download.
- _Given_ a user with `reports.reports.view` only, _when_ they open a report, _then_ they can read it but the download buttons are not offered.
- _Given_ a user with neither permission, _when_ they open the reports screen, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Report definitions: customer-service performance, inquiry categories, escalations, scam reporting, knowledge gaps; four export formats; monthly schedule

**Out of scope:**

- SLA and incident reports — produced by the service desk, outside these tickets

**Technical notes:** Flow F — Deflection KPI: the report prints the definition version and counts. Adds definitions to the template `reports` module and reuses its rendering, scheduling, and storage. Enforces `reports.reports.view`, `reports.reports.export`, and `reports.schedules.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ANL-3

---

**Title:** [ANL-8] Monitor the health and quality of the AI service
**Epic:** `analytics`
**Also touches:**
`evaluation`

**Problem / context:** TS §5.10 AI Service Performance Monitoring: deflection, escalation, failed or unanswered inquiries, low-confidence and inaccurate responses, latency, model availability, retrieval performance, recurring failures, scam assessment and language performance. §4.8 performance monitoring and periodic review.

**User story:** As a user with `analytics.monitoring.view` permission, I want one screen that shows whether the assistant is answering well and where it is failing so that I can correct it before customers notice.

**Acceptance criteria:**

- _Given_ a chosen period, _when_ the monitoring screen is opened, _then_ it shows the rates of confident, uncertain, blocked, and failed answers, response latency, model provider availability and failovers, and retrieval hit rate.
- _Given_ the breakdown controls, _when_ a permitted user splits by language or category, _then_ each rate is shown per language or category so a weak language is visible.
- _Given_ a rate that crosses its configured limit for the period, _when_ the screen is opened, _then_ it is flagged and listed under 'needs attention' with a link to example Conversations.
- _Given_ an assistant answer, _when_ a permitted user marks it as inaccurate with a note, _then_ the mark is stored, counted, and offered as a candidate for the evaluation set.
- _Given_ a user without `analytics.monitoring.view`, _when_ they open the screen, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Monitoring screen with breakdowns and limits; 'mark inaccurate' action; link to the template ops dashboards for traces

**Out of scope:**

- Paging and on-call alerts (DevOps, outside these tickets)

**Technical notes:** Reads `interaction_events`, message Confidence, and the template's per-request traces and provider metrics. Limits are Assistant Settings. Opening example Conversations also needs `conversations.transcripts.view`. Enforces `analytics.monitoring.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ANL-2, CNV-4

---

### Epic ADM — `admin`

Source: TS §3.1 Administrative and Management Interface; §4.6; §4.13; §4.20. Staff, MFA, transcripts, audit, retention, export, privacy requests.

---

**Title:** [ADM-1] Manage PHLPost staff accounts and their roles
**Epic:** `admin`

**Problem / context:** TS §3.1 Administrative and Management Interface: authorized personnel manage users and roles. §4.10 least privilege and role-based access.

**User story:** As a user with `users.accounts.manage` permission, I want to create, change, and deactivate staff accounts and assign their roles so that only the right people reach each function.

**Acceptance criteria:**

- _Given_ the staff screen, _when_ a permitted user creates an account with an email and one or more roles, _then_ the person receives an invitation to set a password and can sign in with exactly those roles.
- _Given_ an active account, _when_ a permitted user deactivates it, _then_ its sessions end at once, it can no longer sign in, and its past actions stay in the audit trail.
- _Given_ an account's roles, _when_ they are changed, _then_ the new permissions apply on the next request and the change is audited with old and new roles.
- _Given_ the last active System Administrator, _when_ someone tries to deactivate or demote it, _then_ the API refuses.
- _Given_ a user without `users.accounts.manage`, _when_ they call the staff endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Adapt the template user-management screens to PHLPost roles; invitation by email; deactivate and reactivate; last-admin guard

**Out of scope:**

- Customer accounts — customers are anonymous
- Single sign-on with a PHLPost directory

**Technical notes:** Reuses the template `user-management` feature and Better Auth; no self-registration. Enforces `users.accounts.manage`; role assignment also checks `users.roles.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** FND-2

---

**Title:** [ADM-2] Require multi-factor authentication for staff
**Epic:** `admin`

**Problem / context:** TS §4.10: controls shall include multi-factor authentication, role-based access control, and privileged-access management.

**User story:** As a user with `users.accounts.manage` permission, I want every staff member to sign in with a second factor so that a stolen password is not enough to reach customer conversations.

**Acceptance criteria:**

- _Given_ a staff account without a second factor, _when_ the person signs in, _then_ they must enrol an authenticator app before reaching any screen.
- _Given_ an enrolled account, _when_ the person signs in with a correct password, _then_ they must also enter a valid one-time code, and five wrong codes lock the attempt for a period.
- _Given_ a person who lost their device, _when_ a permitted user resets their second factor, _then_ they must enrol again at next sign-in and the reset is audited.
- _Given_ recovery codes, _when_ they are issued at enrolment, _then_ each works once and their use is audited.
- _Given_ a user without `users.accounts.manage`, _when_ they try to reset another person's second factor, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Authenticator-app enrolment and challenge; recovery codes; admin reset; enforcement for every staff role

**Out of scope:**

- SMS codes
- Hardware keys

**Technical notes:** Use the Better Auth two-factor plugin in `packages/auth`. Enforcement is server-side on session creation, not only in the UI. Enforces `users.accounts.manage` on reset.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ADM-1

---

**Title:** [ADM-3] Review conversation transcripts with their AI trace
**Epic:** `admin`
**Also touches:**
`conversation`

**Problem / context:** TS §4.13: maintain AI-interaction logs sufficient for monitoring, investigation, and audit. §4.8: traceability, review of uncertain outputs, and correction mechanisms.

**User story:** As a user with `conversations.transcripts.view` permission, I want to search conversations and see how each answer was produced so that I can investigate a complaint or a wrong answer.

**Acceptance criteria:**

- _Given_ the transcripts screen, _when_ a permitted user filters by date, category, language, outcome, or reference, _then_ matching Conversations are listed with personal data masked.
- _Given_ an assistant answer in a transcript, _when_ it is opened, _then_ it shows the sources used, the tool result if any, the Confidence, the model and provider, and a link to the trace.
- _Given_ a permitted user opening a transcript, _when_ it loads, _then_ an Audit Entry records who viewed which Conversation.
- _Given_ a user without `conversations.transcripts.view`, _when_ they open the screen, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Transcript search and viewer; per-answer provenance panel; view auditing

**Out of scope:**

- Editing or deleting messages
- Unmasking personal data — the masked form is all that is stored

**Technical notes:** Reads `conversations`, `messages`, and the template trace ids; never mutates. Enforces `conversations.transcripts.view`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-3

---

**Title:** [ADM-4] Search and export the audit log
**Epic:** `admin`

**Problem / context:** TS §4.13: administrative, access, security, integration, and operational logs to support audit, accountability, and regulatory compliance; cooperation with audits by PHLPost, COA, NPC, and DICT.

**User story:** As a user with `audit.log.view` permission, I want to search who did what and when across the whole system so that I can answer an audit or investigate an incident.

**Acceptance criteria:**

- _Given_ the audit screen, _when_ a permitted user filters by actor, action, target, outcome, or date, _then_ matching Audit Entries are listed newest first with old and new values where they exist.
- _Given_ a filtered result, _when_ a user with `audit.log.export` downloads it, _then_ a CSV and a JSON file are produced and the export itself is audited.
- _Given_ any Audit Entry, _when_ any user, including a System Administrator, tries to change or delete it, _then_ the database refuses.
- _Given_ a user without `audit.log.view`, _when_ they open the screen, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Audit search screen and export; insert-only trigger on `audit_log` if the template lacks one; sign-in, denial, setting, approval, and export events confirmed present

**Out of scope:**

- Infrastructure and cloud provider logs (DevOps, outside these tickets)

**Technical notes:** Reuses the template `AuditService`. Add a checklist test that each privileged route in this ticket set writes an entry. Enforces `audit.log.view` and `audit.log.export`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** FND-2

---

**Title:** [ADM-5] Apply retention periods and anonymize old conversations
**Epic:** `admin`
**Also touches:**
`conversation` `scam-protection`

**Problem / context:** TS §4.6 Data Minimization, Purpose Limitation and Retention: appropriate retention, archival, anonymization, deletion, and secure disposal. §3.4 Minimum Necessary Data.

**User story:** As a user with `settings.retention.manage` permission, I want to set how long each kind of data is kept and have the system remove it on schedule so that PHLPost holds no customer data longer than it needs.

**Acceptance criteria:**

- _Given_ retention periods set per data class, _when_ the daily job runs, _then_ Conversations, Scam Submissions and their images, and escalation contacts older than their period are anonymized or deleted as configured.
- _Given_ an anonymized Conversation, _when_ analytics are recomputed, _then_ the counts are unchanged because Interaction Events hold no free text.
- _Given_ a data class with no period set, or a Conversation under a legal hold, _when_ the job runs, _then_ nothing in it is touched and held items are listed.
- _Given_ any run, _when_ it finishes, _then_ an Audit Entry records each class, the date range, and the counts removed.
- _Given_ a user without `settings.retention.manage`, _when_ they call the retention endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Retention settings per data class; daily job; legal-hold flag; dry-run preview showing what the next run would remove

**Out of scope:**

- Database backups and their expiry (DevOps, outside these tickets)

**Technical notes:** Flow G — Retention and deletion. The job runs under its own least-privilege database role and deletes in bounded batches. Default periods are empty, so nothing is removed until PHLPost sets them (PRD open item 5). Enforces `settings.retention.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ADM-3

---

**Title:** [ADM-6] Export PHLPost's data and configuration in open formats
**Epic:** `admin`

**Problem / context:** TS §3.4 Data Portability and §4.20: PHLPost shall be able to retrieve its data, knowledge content, configurations, reports, and logs in documented, commonly used, machine-readable formats. §4.21 turnover.

**User story:** As a user with `privacy.exports.create` permission, I want to download everything PHLPost owns in the system in open formats so that PHLPost can move to another provider without our help.

**Acceptance criteria:**

- _Given_ the export screen, _when_ a permitted user selects knowledge, rates, settings, conversations, events, scam data, and audit log and starts an export, _then_ an Export Bundle is built in the background and offered for download with a checksum.
- _Given_ a finished bundle, _when_ it is unpacked, _then_ each data set is JSON Lines or CSV with a schema file, knowledge articles are Markdown with their versions, and prompts and settings are JSON.
- _Given_ an export that includes conversations, _when_ it is built, _then_ the content is the stored masked form and the export is audited with its scope.
- _Given_ a bundle older than the expiry period, _when_ someone tries to download it, _then_ the file is gone and the request record remains.
- _Given_ a user without `privacy.exports.create`, _when_ they call the export endpoints, _then_ the API returns 403 and the denial is audited.

**In scope:**

- `export_bundles` table; background export job; schema files; documented format in `docs/EXPORT-FORMAT.md`

**Out of scope:**

- Source code and repository turnover — a hand-over step, not a screen
- Importing a bundle into another system

**Technical notes:** Streams each table to object storage so a large export does not hold memory. The format document is part of the deliverable set in TS §6.8. Enforces `privacy.exports.create`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ADM-5

---

**Title:** [ADM-7] Handle a customer's request to see or delete their data
**Epic:** `admin`
**Also touches:**
`conversation`

**Problem / context:** TS §4.4: assistance to data subjects under RA 10173. §4.5 privacy by design. §4.21 return or deletion of personal data.

**User story:** As a user with `privacy.requests.manage` permission, I want to find a customer's conversations from the reference they give me and export or delete them so that PHLPost can answer privacy requests on time.

**Acceptance criteria:**

- _Given_ the widget, _when_ a customer opens 'my data', _then_ they are shown a reference for their session and can download their own conversation from that browser.
- _Given_ a Privacy Request with a session reference, _when_ a permitted user fulfils an access request, _then_ a file of that session's conversations is produced and the request is marked fulfilled.
- _Given_ a deletion request, _when_ a permitted user fulfils it, _then_ that session's Conversations, Scam Submissions, and contact are anonymized at once by the same routine as the retention job, and the request is audited.
- _Given_ a reference that matches nothing, _when_ it is searched, _then_ the screen says no data was found and discloses nothing else.
- _Given_ a user without `privacy.requests.manage`, _when_ they open the requests screen, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Session reference in the widget and self-service download; `privacy_requests` table; requests screen with access and delete actions

**Out of scope:**

- Verifying a requester's legal identity — done by the Data Protection Officer outside the system

**Technical notes:** Flow G — Retention and deletion, step 4. Customers are anonymous, so the session reference is the only link to their data; say so in the privacy notice. Enforces `privacy.requests.manage`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** ADM-5

---

### Epic EVL — `evaluation`

Source: TS §3.1 language testing; §6.4 AI testing. Approved test sets per language and use case; safety suite.

---

**Title:** [EVL-1] Prove answer quality per language and use case with approved test sets
**Epic:** `evaluation`
**Also touches:**
`conversation`

**Problem / context:** TS §3.1: language capability and response quality shall be tested using PHLPost-approved test cases prior to production acceptance. §6.4: AI testing covers relevance, grounding, multilingual capability, escalation behaviour, and low-confidence handling. §6.12 acceptance requires AI-performance validation and multilingual testing.

**User story:** As a user with `eval.golden.manage` permission, I want test questions for every use case in every supported language, with the expected outcome, so that we can show PHLPost the assistant is ready and catch regressions.

**Acceptance criteria:**

- _Given_ the golden set, _when_ a permitted user adds an item, _then_ it records the question, language, use case, expected sources or tool result, and the expected behaviour: answer, uncertain, or escalate.
- _Given_ at least 30 approved items per language for tracking, rates, Postal ID, service information, and code-switched input, _when_ an evaluation runs, _then_ results are reported per language and per use case for grounding, correct behaviour, and reply language.
- _Given_ a run that scores below the accepted baseline for any language, _when_ CI evaluates a change, _then_ the deployment is blocked until a user with `eval.gate.approve` accepts a new baseline.
- _Given_ a completed run, _when_ a permitted user exports it, _then_ the report lists every item with its outcome, suitable as acceptance evidence.
- _Given_ a user without `eval.golden.manage`, _when_ they try to edit the golden set, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Golden item fields for language, use case, and expected behaviour; per-language and per-use-case scoring; evidence export; seed items for PHLPost to review and approve

**Out of scope:**

- Writing PHLPost's final approved test cases — PHLPost approves them; the team drafts
- Safety and misuse cases (EVL-2)

**Technical notes:** Extends the template `eval` module, golden items, runs, and CI regression gate. Tool-based cases (tracking, rates) run against the mock connector and a fixture rate table so results are repeatable. Enforces `eval.golden.manage`, `eval.runs.execute`, and `eval.gate.approve`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-4, KB-2, TRK-2

---

**Title:** [EVL-2] Test the assistant against unsafe, false, and hostile inputs
**Epic:** `evaluation`
**Also touches:**
`conversation` `scam-protection`

**Problem / context:** TS §4.9: safeguards against inaccurate, fabricated, misleading, discriminatory, unsafe, unauthorized, or inappropriate outputs. §6.4: AI testing assesses hallucination controls, inappropriate-output controls, and scam-assessment behaviour.

**User story:** As a user with `eval.runs.execute` permission, I want a standing set of hostile and tricky cases run against every change so that the assistant's safety controls are proven, not assumed.

**Acceptance criteria:**

- _Given_ cases that ask for a rate, status, or policy that does not exist, _when_ the suite runs, _then_ the assistant answers uncertain or refuses in every case and fabricates nothing.
- _Given_ prompt-injection cases, including ones hidden inside scam submissions, _when_ the suite runs, _then_ none changes the assistant's behaviour or reveals its instructions.
- _Given_ cases seeking abusive, discriminatory, or off-topic content, _when_ the suite runs, _then_ each is declined politely and logged.
- _Given_ known scam samples and genuine PHLPost notices, _when_ the suite runs, _then_ the scams score high or uncertain and the genuine notices are not called scams, and the miss rates are reported.
- _Given_ a user without `eval.runs.execute`, _when_ they try to start a run, _then_ the API returns 403 and the denial is audited.

**In scope:**

- Safety case library in the four languages; scam sample set; suite wired into the CI gate; results report for the security and UAT evidence pack

**Out of scope:**

- Penetration testing and vulnerability scanning of the infrastructure (QA and DevOps, outside these tickets)

**Technical notes:** Reuses the EVL-1 runner with a 'must not' assertion type. Scam samples are synthetic or fully anonymized. Failures block deployment like any other regression. Enforces `eval.runs.execute`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** EVL-1, CNV-5, SCM-1

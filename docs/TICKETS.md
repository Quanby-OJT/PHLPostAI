# PHLPost AI Customer Support — Tickets

Development-ready vertical slices for the PHLPost AI-Backed Customer Support Solution. Built from the PHLPost Technical Specifications (source pages 90–127, "TS"), `PRD.md`, and `DOMAIN-MODEL.md`. Section references (§) are to the TS.

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

| Backbone → | Set up and secure | Curate knowledge | Reach the assistant | Understand and answer | Look up tracking | Protect from scams | Hand over to a person | Measure and report | Govern and hand back |
|---|---|---|---|---|---|---|---|---|---|
| **Release 1 — walking skeleton** | FND-1, FND-2 | KB-1 | CHN-1 | CNV-1 | TRK-1 | — | ESC-1 | ANL-1 | — |
| **Release 2 — every approved use case** | ADM-1, ADM-2 | KB-2 | CHN-2 | CNV-2, CNV-3, CNV-4, CNV-5, CNV-6 | TRK-2 | SCM-1, SCM-2, SCM-3 | ESC-2, ESC-3 | ANL-2, ANL-3 | ADM-3, EVL-1 |
| **Release 3 — depth and acceptance** | — | KB-3 | CHN-3 | — | TRK-3, TRK-4 | SCM-4, SCM-5 | ESC-4 | ANL-4, ANL-5, ANL-6, ANL-7, ANL-8 | ADM-4, ADM-5, ADM-6, ADM-7, EVL-2 |

## 1. Epic map

| Epic key | Label | TOR / PRD source | Note | Tickets |
|---|---|---|---|---|
| FND | `foundation` | PRD constraints; TS §3.5, §4.10 | Repository from the RAG_AI template, PHLPost permission catalog and roles | 2 |
| CHN | `channels` | TS §3.1 Omnichannel AI Virtual Assistant; §4.8 | Website chat widget, channel interface, customer feedback | 3 |
| CNV | `conversation` | TS §3.1 conversational AI, NLP, Postal ID; §4.8–4.9 | Grounded answers, categories, confidence, languages, output guardrails | 6 |
| KB | `knowledge` | TS §3.1 PHLPost Knowledge Base, Postal Rates and Service Information | Article approval workflow, rate table, knowledge gaps | 3 |
| TRK | `tracking` | TS §3.1 Track and Trace Assistance; §3.3; §3.4 | Tracking connector interface, status explanations, real adapter | 4 |
| SCM | `scam-protection` | TS §3.1 AI-Assisted Scam Detection and Customer Protection | Advisory assessment, indicators, report review, known patterns | 5 |
| ESC | `escalation` | TS §3.1 Human Agent Escalation and Handoff; §4.8 | Agent inbox, live takeover, rules, external helpdesk connector | 4 |
| ANL | `analytics` | TS §3.1 analytics; §3.2; §5.10; §6.14 | Events, dashboard, deflection KPI, trends, summaries, reports, AI monitoring | 8 |
| ADM | `admin` | TS §3.1 Administrative and Management Interface; §4.6; §4.13; §4.20 | Staff, MFA, transcripts, audit, retention, export, privacy requests | 7 |
| EVL | `evaluation` | TS §3.1 language testing; §6.4 AI testing | Approved test sets per language and use case; safety suite | 2 |

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
6. Generate from the tool result or the retrieved chunks; run the groundedness check; compute Confidence
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

- *Given* a fresh clone, *when* I run the README quick start, *then* web, backend, the RAG service, and the pgvector database start locally and `pnpm test` passes.
- *Given* a merge to `staging`, *when* the deploy workflow finishes, *then* the staging URL serves the PHLPost admin sign-in page and the API health endpoint returns 200.
- *Given* the repository, *when* I search for the template's example modules, *then* `todos`, `tickets`, and `feature-preview` are gone from backend, web, contracts, and schema, and the Flutter app is removed from the workspace.
- *Given* the RAG service configuration, *when* it starts, *then* it runs the `agentic` profile with provider keys read from environment variables and no provider name hard-coded outside the provider module.

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

- *Given* a fresh database, *when* `pnpm db:seed` runs, *then* every key in the `DOMAIN-MODEL.md` catalog exists and the ten seeded roles hold the grants listed there.
- *Given* the seed has already run, *when* it runs again, *then* no duplicate rows are created and admin-made changes to role grants are kept.
- *Given* a route that requires a key the signed-in user lacks, *when* it is called, *then* the API returns 403 and an Audit Entry with outcome `denied` records the key, the actor, and the IP address.
- *Given* a user with `users.roles.manage`, *when* they open the roles screen, *then* the new modules appear as groups in the permission checklist and can be granted or removed.

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

- *Given* a page that includes the widget script, *when* the customer opens the chat, *then* a notice says they are chatting with an AI assistant and links the privacy notice before the first message can be sent.
- *Given* an open chat, *when* the customer sends a message, *then* the answer streams into the widget and the Conversation continues across page loads in the same browser tab session.
- *Given* a request from an origin that is not on the allowed list, *when* it calls the public chat API, *then* it is refused and the attempt is logged.
- *Given* a session sending messages faster than the limit, *when* the limit is reached, *then* further messages are refused with a clear 'please wait' notice and an Interaction Event records the throttle.
- *Given* a phone-sized screen or a keyboard-only user, *when* they use the widget, *then* it is fully usable and meets WCAG 2.1 AA for contrast, focus, and labels.

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

- *Given* the channels screen, *when* a permitted user disables `web-widget`, *then* the widget shows an 'assistant unavailable' notice within one minute and no new Conversation can start.
- *Given* the web widget, *when* its messages are processed, *then* they pass through the `ChannelAdapter` interface exactly as a second adapter would, proven by a test adapter registered only in tests.
- *Given* a permitted user, *when* they change the allowed origins or the welcome text for a channel, *then* the change takes effect without a deploy and is audited with old and new values.
- *Given* a user without `channels.channels.manage`, *when* they open or call the channels screen, *then* the API returns 403 and the denial is audited.

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

- *Given* a Conversation that the customer ends or that receives a confident answer, *when* the chat closes, *then* the widget asks 'Did this help?' with yes and no and an optional comment.
- *Given* a submitted rating, *when* it is saved, *then* one Feedback row exists for the Conversation, the comment is masked for personal data, and an Interaction Event is recorded.
- *Given* a Conversation that already has Feedback, *when* the customer rates again, *then* the earlier rating is replaced, never duplicated.
- *Given* a customer who closes the widget without rating, *when* the session ends, *then* nothing is stored and the Conversation is not marked unhelpful.

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

- *Given* at least one approved Knowledge Article, *when* a customer asks a question it covers, *then* a streamed answer is returned with the titles of the articles it used.
- *Given* a question no approved content covers, *when* it is asked, *then* the assistant says it does not have that information and invents nothing.
- *Given* a message containing a phone number, email address, or ID number, *when* it is processed, *then* the stored Message and the trace hold the masked form only.
- *Given* a message that tries to override the assistant's instructions, *when* it is screened, *then* the request is refused or neutralized as configured and the attempt is recorded.
- *Given* an anonymous caller without a valid Customer Session token, *when* they call the public chat endpoint, *then* the API returns 401.

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

- *Given* a customer message, *when* it passes screening, *then* it is stored with one Inquiry Category and `is_eligible` taken from that category's setting at that moment.
- *Given* a message the classifier cannot place, *when* it is classified, *then* it is labelled `other` and is not eligible.
- *Given* the categories screen, *when* a permitted user adds a category or changes whether one is eligible, *then* new messages use the change, earlier messages keep their label, and the change is audited.
- *Given* a labelled test set of at least 100 messages across the seeded categories, *when* the classifier runs in CI, *then* accuracy is reported and the build fails below the agreed floor.
- *Given* a user without `settings.assistant.manage`, *when* they call the categories endpoints, *then* the API returns 403 and the denial is audited.

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

- *Given* an answer whose Confidence is at or above the threshold, *when* it is produced, *then* it is sent normally and stored with its Confidence.
- *Given* an answer whose Confidence is below the threshold, *when* it is produced, *then* the customer instead sees that the assistant is not sure, what it could find, and an offer to talk to a person.
- *Given* the settings screen, *when* a permitted user changes the threshold between 0 and 1, *then* the next message uses it and the change is audited with old and new values.
- *Given* a stored assistant Message, *when* it is inspected, *then* it shows the retrieval score, the groundedness result, and the Confidence derived from them.
- *Given* a user without `settings.assistant.manage`, *when* they call the settings endpoint, *then* the API returns 403 and the denial is audited.
- *Given* the routine-answer length limit, which a permitted user can set to any value up to 200 tokens, *when* an answer in an eligible category is generated, *then* it does not exceed the limit, ends on a complete sentence, offers “more details” when content was left out, and stores its token count on the Message.

**In scope:**

- `assistant_settings` table and `SettingsService` (first consumers: `confidence_threshold`, `max_output_tokens`)
- Confidence calculation; the 'not sure' reply; `confidence`, `answer_kind`, `retrieval_score`, `groundedness_result`, and `output_tokens` columns on `messages`; settings screen
- Routine-answer output limit passed to the model and re-checked after generation; default and ceiling are 200 tokens

**Out of scope:**

- Creating the Escalation and the agent side (ESC-1 exists; rules in ESC-3)
- Sensitive-topic rules (ESC-3)

**Technical notes:** Flow A — Public chat turn, steps 6 and 7. Confidence = a documented function of the top reranked retrieval score and the template's groundedness result; use the agentic verifier verdict when present and citation validation as the baseline groundedness result otherwise. Tool answers (tracking, rates) take the tool's certainty. `SettingsService` is the only reader and writer of `assistant_settings` from here on; the configurable default confidence threshold is 0.7. Enforces `settings.assistant.manage`. The output limit applies to answers in eligible categories (PRD assumption A9), defaults to 200, and is capped at 200 in both the settings API and the model call. Re-check after generation, end at a complete sentence, and offer more details when content was omitted. Buffer streamed draft text until the final Confidence is known so a below-threshold answer cannot leak before the uncertainty reply. Persist `retrieval_score`, `groundedness_result`, `confidence`, and the provider's output token count on the assistant Message, and show the recorded answer metrics in transcript inspection.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** CNV-2

---

**Title:** [CNV-4] Reply in the customer's language
**Epic:** `conversation`

**Problem / context:** TS §2 and §3.1 Localized Natural Language Processing: Philippine English, Filipino/Tagalog, Visayan, Ilocano, code-switching, colloquial expressions, spelling variations, and postal terms. PRD assumption A1: Visayan means Cebuano.

**User story:** As a customer on the PHLPost website, I want to write the way I normally do, in English, Tagalog, Cebuano, Ilocano, or a mix, and be answered in the same language so that I understand the reply.

**Acceptance criteria:**

- *Given* a message in English, Filipino, Cebuano, or Ilocano, *when* it is answered, *then* the reply is in that language and the Message stores the detected language.
- *Given* a Taglish or other code-switched message, *when* it is answered, *then* the reply follows the customer's dominant language and keeps postal terms as PHLPost writes them.
- *Given* a message in a language outside the four, *when* it is answered, *then* the reply is in English, says which languages are supported, and the Message is tagged `unsupported`.
- *Given* knowledge that exists only in English, *when* a Cebuano or Ilocano question matches it, *then* the answer is given in the customer's language from the English source and cites it.
- *Given* the widget, *when* the customer picks a language from the menu, *then* the fixed interface text switches and later replies use that language.
- *Given* a customer asks a tracking question without a tracking number, *when* the widget has a selected language, *then* the request for the number is in that language.
- *Given* a tracking result with an official status description, *when* it is presented, *then* the official description remains unchanged while the surrounding explanation and labels use the selected language.

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

- *Given* a drafted answer containing an amount, a tracking status, or a payment instruction, *when* that value does not appear in the tool result or the cited sources, *then* the answer is withheld and replaced with the 'not sure' reply, and the block is recorded.
- *Given* a drafted answer asking the customer to pay, or to share a password, one-time code, or card number, *when* it is checked, *then* it is always blocked, whatever the sources say.
- *Given* the guardrail settings, *when* a permitted user adds a blocked topic or phrase, *then* matching drafts are withheld from then on and the change is audited.
- *Given* the guardrail test cases, *when* they run in CI, *then* every case is blocked and the build fails if one passes through.
- *Given* a user without `settings.assistant.manage`, *when* they call the guardrail settings endpoint, *then* the API returns 403 and the denial is audited.

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

- *Given* approved Postal ID articles, *when* a customer asks how to apply or renew, *then* the answer lists the steps and requirements from those articles and cites them.
- *Given* a customer asking 'am I eligible' or 'will my application be approved' about their own case, *when* it is answered, *then* the assistant gives the published requirements, says it cannot decide individual cases, and points to the capturing site or a person.
- *Given* a customer who shares an ID number or uploads personal details, *when* the message is stored, *then* the details are masked and the reply reminds them not to share personal information in chat.
- *Given* a question about the status of a specific Postal ID application, *when* it is asked, *then* the assistant says it has no access to application records and offers the official channel or a person.

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

- *Given* a draft version, *when* its author submits it and a different user with `knowledge.articles.approve` approves it, *then* the version becomes `approved`, is indexed, and can be retrieved by the assistant.
- *Given* a version in review, *when* its own author tries to approve it, *then* the API refuses and the attempt is audited.
- *Given* an approved article, *when* a permitted user deactivates it, *then* its chunks are no longer retrievable from that moment and cached answers built on it are cleared.
- *Given* an approved article that is edited, *when* the edit is saved, *then* a new draft version is created and the approved version keeps serving until the new one is approved.
- *Given* a user without `knowledge.articles.manage`, *when* they try to create or edit an article, *then* the API returns 403 and the denial is audited.

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

- *Given* an approved Rate Entry for a service, zone, and weight band, *when* a customer asks the price for a matching item, *then* the assistant quotes that price with its effective date and names the service.
- *Given* a question missing the weight or the destination, *when* it is asked, *then* the assistant asks for the missing detail before quoting.
- *Given* no Rate Entry matching the request, *when* it is asked, *then* the assistant says it has no published rate for that case and quotes nothing.
- *Given* a CSV of rates, *when* a permitted user imports it, *then* rows are validated, shown as a preview with errors, and go live only after a second user approves the batch.
- *Given* a user without `knowledge.rates.manage`, *when* they call the rates endpoints, *then* the API returns 403 and the denial is audited.

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

- *Given* messages answered as uncertain or refused for lack of content, *when* the gaps screen is opened, *then* they appear grouped by similar wording with a count, the category, the language, and example questions with personal data masked.
- *Given* a gap group, *when* a user who also holds `knowledge.articles.manage` chooses 'draft article', *then* a draft is created pre-filled with the example questions and the group is marked in progress.
- *Given* an article approved from a gap, *when* the same question is asked again and answered confidently, *then* the group is marked resolved.
- *Given* a user without `knowledge.gaps.view`, *when* they open the gaps screen, *then* the API returns 403 and the denial is audited.

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

- *Given* the mock connector holding a record for a tracking number, *when* a customer asks where that item is, *then* the reply states the status, place, and time exactly as the connector returned them.
- *Given* a tracking number the connector does not know, *when* it is asked about, *then* the assistant says no record was found and suggests checking the number; it does not guess a status.
- *Given* a message about tracking with no number, or a malformed one, *when* it is asked, *then* the assistant asks for the tracking number and performs no lookup.
- *Given* a connector that does not answer within the timeout, *when* a lookup is made, *then* the assistant says the tracking system cannot be reached right now and offers to try again or to reach a person.
- *Given* any lookup, *when* it completes, *then* a Tracking Lookup row stores a hash of the number, the connector, the outcome, and the latency, and never the number itself.

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

- *Given* a Status Explanation for a status code in the customer's language, *when* a lookup returns that code, *then* the reply gives the official status followed by the approved explanation and next steps.
- *Given* a status code with no explanation, *when* a lookup returns it, *then* the reply shows the official description unchanged and the code appears in a 'needs explanation' list.
- *Given* a status that means the item is held at Customs, *when* it is returned, *then* the reply includes the approved Customs guidance and required documents, and states that PHLPost does not decide the release.
- *Given* a user without `tracking.explanations.manage`, *when* they call the explanations endpoints, *then* the API returns 403 and the denial is audited.

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

- *Given* five consecutive failed or timed-out lookups, *when* the next lookup is made, *then* it returns `unavailable` at once without calling the source, and the connector shows as 'open' on the connectors screen.
- *Given* an open breaker, *when* the wait period passes and a trial lookup succeeds, *then* normal lookups resume and the recovery is logged.
- *Given* the connectors screen, *when* a permitted user opens it, *then* it shows each connector's status, success rate, median and 95th percentile latency, and the last error, with no customer data.
- *Given* a permitted user, *when* they change the active connector, timeout, or credentials reference, *then* the change applies without a deploy and is audited; secrets are never displayed.
- *Given* a user without `tracking.connectors.manage`, *when* they open the connectors screen, *then* the API returns 403 and the denial is audited.

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

- *Given* the PHLPost API documentation and test credentials, *when* the adapter is built against them, *then* a lookup of a known test item returns the same status, place, and time as PHLPost's own Track and Trace page.
- *Given* the shared connector contract tests, *when* they run against the real adapter and the mock, *then* both pass.
- *Given* every status code the PHLPost source can return, *when* the mapping is reviewed, *then* each is listed for TRK-2 with its official description, and unmapped codes are reported.
- *Given* a permitted user, *when* they switch the active connector from `mock` to the PHLPost adapter, *then* new lookups use it at once and the switch is audited.
- *Given* a user without `tracking.connectors.manage`, *when* they try to switch connectors, *then* the API returns 403 and the denial is audited.

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

- *Given* a pasted message that asks for a fee through a link that is not a PHLPost domain, *when* it is submitted, *then* the reply gives a high risk level, names the indicators found, and gives safety guidance, worded as an assessment and never as a finding of fraud.
- *Given* a submitted link, *when* it is assessed, *then* its domain is parsed and compared with the official list, and the system makes no request to that link.
- *Given* a submission that contains instructions aimed at the assistant, *when* it is assessed, *then* the instructions are not followed, and the attempt is counted as an indicator.
- *Given* a submission the checks cannot judge, *when* it is assessed, *then* the risk level is `uncertain`, general safety guidance is given, and reporting to PHLPost is offered.
- *Given* any assessment, *when* it is stored, *then* the Scam Submission is masked for personal data and the Scam Assessment records the indicators, risk level, and Confidence.

**In scope:**

- 'Check a suspicious message' entry in the widget and routing for the `scam` category
- `scam_submissions` and `scam_assessments` tables; deterministic indicator checks then a model assessment limited to approved indicators
- Seeded Risk Indicators and safety-guidance texts in the four languages

**Out of scope:**

- Editing indicators and the official list (SCM-2)
- Staff review (SCM-3)
- Screenshots (SCM-5)

**Technical notes:** Flow D — Scam assessment, steps 1 to 6. The submission is passed to the model inside a delimited data block with an instruction that its content is not to be obeyed. URL handling is parse-only: no fetch, no redirect resolution, no preview. Every reply carries the fixed advisory line required by TS §3.1. Public behaviour: no permission key.

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

- *Given* the indicators screen, *when* a permitted user adds, weights, or deactivates a Risk Indicator, *then* new assessments use the change and it is audited.
- *Given* the official contacts screen, *when* a permitted user adds a genuine domain or sender name, *then* submissions from it stop being flagged as unofficial, and look-alike domains are still flagged.
- *Given* a sample message, *when* a permitted user runs 'test assessment', *then* the screen shows the indicators that fired and the resulting risk level without creating a customer record.
- *Given* a user without `scam.indicators.manage`, *when* they call these endpoints, *then* the API returns 403 and the denial is audited.

**In scope:**

- `risk_indicators` and `official_contacts` tables; two admin screens; test-assessment tool

**Out of scope:**

- Known scam patterns (SCM-4)

**Technical notes:** Flow D — Scam assessment, steps 3 and 4. Look-alike detection uses edit distance and homoglyph folding against `official_contacts`. Enforces `scam.indicators.manage`.

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

- *Given* an assessment that is high risk or uncertain, or a customer who chooses to report, *when* the report is sent, *then* a Scam Report in `reported` appears in the queue and the customer sees a reference number.
- *Given* a report in the queue, *when* a permitted user opens it, *then* they see the masked submission, the extracted links as text that cannot be clicked, the indicators, and the assessment.
- *Given* a report under review, *when* the reviewer records a finding and notes, *then* the status follows the state machine, the finding is audited, and the customer-facing wording stays advisory.
- *Given* a user with `scam.reports.view` but not `scam.reports.validate`, *when* they open a report, *then* they can read it but cannot set a finding.
- *Given* a user with neither permission, *when* they open the queue, *then* the API returns 403 and the denial is audited.

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

- *Given* a report marked `confirmed_scam`, *when* the reviewer saves it as a Scam Pattern, *then* the pattern stores its domains, sender, key phrases, and a similarity signature, with personal data removed.
- *Given* an active pattern, *when* a new submission closely matches it, *then* the assessment is high risk, cites 'matches a scam PHLPost has confirmed', and links the pattern.
- *Given* the patterns screen, *when* a permitted user opens it, *then* each pattern shows first seen, last seen, and the number of matching submissions.
- *Given* a pattern that is deactivated, *when* a matching submission arrives, *then* it is assessed without the pattern.
- *Given* a user without `scam.reports.validate`, *when* they try to create or edit a pattern, *then* the API returns 403 and the denial is audited.

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

- *Given* a PNG or JPEG screenshot under the size limit, *when* it is uploaded, *then* the text and links are read from it and assessed exactly as a pasted message would be.
- *Given* a file that is not an image, is too large, or fails the malware scan, *when* it is uploaded, *then* it is refused with a clear reason and nothing is stored.
- *Given* an image whose text cannot be read, *when* it is assessed, *then* the assistant says so and asks the customer to paste the text.
- *Given* a stored screenshot, *when* its Scam Submission is deleted or anonymized, *then* the image file is deleted in the same operation.

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

- *Given* a customer who asks to talk to a person, *when* they confirm, *then* an Escalation in `queued` is created with the reason, the Conversation becomes `escalation_requested`, and the customer is told a person will join.
- *Given* the inbox, *when* a permitted user opens it, *then* queued Escalations are listed oldest first with category, language, waiting time, and reason.
- *Given* an Escalation, *when* a permitted user opens it, *then* the whole Conversation is shown, with the sources and Confidence of each assistant answer and personal data masked.
- *Given* a user without `escalations.queue.view`, *when* they open the inbox, *then* the API returns 403 and the denial is audited.

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

- *Given* a queued Escalation, *when* a permitted user claims it, *then* it becomes `claimed`, the Conversation becomes `agent_active`, and the customer sees that an agent has joined.
- *Given* two agents claiming the same Escalation at once, *when* both requests arrive, *then* one succeeds and the other is told it is already claimed.
- *Given* an `agent_active` Conversation, *when* the customer sends a message, *then* it reaches the agent within two seconds and the assistant posts no answer.
- *Given* an agent reply, *when* it is sent, *then* it appears in the widget marked as from a PHLPost agent and is stored with `sender = agent` and the agent's id.
- *Given* a user without `escalations.conversations.handle`, *when* they try to claim or reply, *then* the API returns 403 and the denial is audited.

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

- *Given* a rule listing sensitive topics or keywords, *when* a customer message matches it, *then* the assistant does not attempt an answer and offers a person at once.
- *Given* business hours set in Asia/Manila, *when* an Escalation is requested outside them, *then* the customer is told agents are offline and may leave an optional contact; the Escalation becomes `contact_captured`.
- *Given* an Escalation queued during business hours, *when* nobody claims it within the wait limit, *then* the customer is offered the same offline path and the Escalation is flagged as missed.
- *Given* a contact left by a customer, *when* it is stored, *then* it is encrypted, shown only to holders of `escalations.conversations.handle`, and falls under the retention rules of ADM-5.
- *Given* a user without `settings.escalation.manage`, *when* they call the rules endpoints, *then* the API returns 403 and the denial is audited.

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

- *Given* an enabled webhook connector, *when* an Escalation is created, *then* a signed request with the reason, category, language, and a link to the transcript is delivered, and the Escalation shows `pushed_external` with the external reference when one is returned.
- *Given* a delivery that fails, *when* it is retried with backoff and still fails, *then* it is marked failed, stays visible in the inbox, and the failure is in the integration log.
- *Given* an enabled email connector, *when* an Escalation is created, *then* an email with the same summary goes to the configured address, with personal data limited to what the customer chose to leave.
- *Given* a permitted user, *when* they send a test delivery from the connector screen, *then* the result and response code are shown.
- *Given* a user without `escalations.connectors.manage`, *when* they call the connector endpoints, *then* the API returns 403 and the denial is audited.

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

- *Given* a Conversation that starts, receives an answer, and is escalated, *when* each step happens, *then* one Interaction Event per step is stored with its kind, category, language, channel, and time, and no free text.
- *Given* the overview page, *when* a permitted user opens it, *then* it shows today's conversations, answers, tracking lookups, and escalations, matching the event table.
- *Given* an event row, *when* any code tries to update or delete it, *then* the database refuses.
- *Given* a user without `analytics.dashboard.view`, *when* they open the overview, *then* the API returns 403 and the denial is audited.

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

- *Given* events over a chosen period, *when* the dashboard is opened, *then* it shows inquiry volume over time, volume by category, by language, and by channel, the escalation rate, and median and 95th percentile response time.
- *Given* the filters, *when* a permitted user sets a date range, category, language, or channel, *then* every tile recomputes for that selection.
- *Given* the layout controls, *when* a permitted user hides, shows, or reorders tiles and saves, *then* their layout is kept for them, and a default layout applies to new users.
- *Given* any tile, *when* its figure is compared with a direct count of events for the same filter, *then* the two match.
- *Given* a user without `analytics.dashboard.view`, *when* they open the dashboard, *then* the API returns 403 and the denial is audited.

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

- *Given* an approved KPI Definition, *when* the deflection tile is shown for a period, *then* it displays the rate, the numerator, the denominator, and the definition version.
- *Given* Conversations that were escalated, ended on an uncertain answer, or were blocked, *when* the rate is computed, *then* none of them counts as resolved by the AI.
- *Given* the definition's choices for abandoned sessions, duplicates within a time window, and test sessions, *when* they are changed and approved as a new version, *then* figures are computed per version and earlier reports keep the version they used.
- *Given* a period before go-live, *when* a permitted user enters the baseline volume and handling figures, *then* the tile shows the rate against the baseline and the 70% target.
- *Given* a user without `analytics.kpi.manage`, *when* they try to edit a definition or baseline, *then* the API returns 403 and the denial is audited.

**In scope:**

- `kpi_definitions` table with versions; definition editor; baseline and target entry; deflection computation and tile; drill-down to the counted Conversations

**Out of scope:**

- Any claim about answer accuracy — the TS says the 70% is not an accuracy rate

**Technical notes:** Flow F — Deflection KPI. The computation is one documented SQL view per definition version so an auditor can rerun it. Enforces `analytics.kpi.manage`; viewing the tile needs `analytics.dashboard.view`.

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

- *Given* a closed Conversation, *when* the nightly job runs, *then* it is labelled positive, neutral, or negative and the label is stored as an event, with no message text copied.
- *Given* the sentiment tile, *when* it is shown, *then* it gives the share of each label and, separately, the share of 'helpful' ratings from customers.
- *Given* the concerns tile, *when* it is shown, *then* it lists the top recurring topics for the period with counts and the change from the previous period.
- *Given* a week where a category's volume rises by more than the configured percentage, *when* the trends panel is opened, *then* the rise is listed with its size and start date.
- *Given* a user without `analytics.dashboard.view`, *when* they open these tiles, *then* the API returns 403 and the denial is audited.

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

- *Given* scam submissions and reports over a period, *when* the scam trends page is opened, *then* it shows submissions over time, by risk level, by indicator, and by review finding.
- *Given* active Scam Patterns, *when* the page is opened, *then* the most matched patterns are listed with first seen, last seen, and match counts.
- *Given* the most reported look-alike domains, *when* they are listed, *then* they appear as plain text that cannot be clicked.
- *Given* a user without `scam.reports.view`, *when* they open the page, *then* the API returns 403 and the denial is audited.

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

- *Given* a chosen period, *when* a permitted user asks for a summary, *then* a draft is produced within a minute that states the main figures and changes, and stores the exact figures it was given.
- *Given* a draft, *when* it is opened, *then* every number in the text is shown beside the figure it came from, and any number that does not match a figure is highlighted.
- *Given* a draft, *when* a user with `analytics.summaries.approve` edits and approves it, *then* it becomes `approved`, is marked 'AI-drafted, reviewed by' with their name, and can be exported.
- *Given* a draft that is not approved, *when* anyone tries to export it, *then* the export is refused.
- *Given* a user without `analytics.summaries.generate`, *when* they request a summary, *then* the API returns 403 and the denial is audited.

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

- *Given* the reports screen, *when* a permitted user picks a report and a period, *then* the report is shown on screen and can be downloaded as CSV, XLSX, PDF, and JSON.
- *Given* the customer-service performance report, *when* it is generated, *then* it contains volumes, categories, deflection with its definition version, escalation rate, response times, sentiment, and scam figures.
- *Given* a report schedule, *when* a user with `reports.schedules.manage` sets it to monthly, *then* the report is produced on the first day of each month and stored for download.
- *Given* a user with `reports.reports.view` only, *when* they open a report, *then* they can read it but the download buttons are not offered.
- *Given* a user with neither permission, *when* they open the reports screen, *then* the API returns 403 and the denial is audited.

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

- *Given* a chosen period, *when* the monitoring screen is opened, *then* it shows the rates of confident, uncertain, blocked, and failed answers, response latency, model provider availability and failovers, and retrieval hit rate.
- *Given* the breakdown controls, *when* a permitted user splits by language or category, *then* each rate is shown per language or category so a weak language is visible.
- *Given* a rate that crosses its configured limit for the period, *when* the screen is opened, *then* it is flagged and listed under 'needs attention' with a link to example Conversations.
- *Given* an assistant answer, *when* a permitted user marks it as inaccurate with a note, *then* the mark is stored, counted, and offered as a candidate for the evaluation set.
- *Given* a user without `analytics.monitoring.view`, *when* they open the screen, *then* the API returns 403 and the denial is audited.

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

- *Given* the staff screen, *when* a permitted user creates an account with an email and one or more roles, *then* the person receives an invitation to set a password and can sign in with exactly those roles.
- *Given* an active account, *when* a permitted user deactivates it, *then* its sessions end at once, it can no longer sign in, and its past actions stay in the audit trail.
- *Given* an account's roles, *when* they are changed, *then* the new permissions apply on the next request and the change is audited with old and new roles.
- *Given* the last active System Administrator, *when* someone tries to deactivate or demote it, *then* the API refuses.
- *Given* a user without `users.accounts.manage`, *when* they call the staff endpoints, *then* the API returns 403 and the denial is audited.

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

- *Given* a staff account without a second factor, *when* the person signs in, *then* they must enrol an authenticator app before reaching any screen.
- *Given* an enrolled account, *when* the person signs in with a correct password, *then* they must also enter a valid one-time code, and five wrong codes lock the attempt for a period.
- *Given* a person who lost their device, *when* a permitted user resets their second factor, *then* they must enrol again at next sign-in and the reset is audited.
- *Given* recovery codes, *when* they are issued at enrolment, *then* each works once and their use is audited.
- *Given* a user without `users.accounts.manage`, *when* they try to reset another person's second factor, *then* the API returns 403 and the denial is audited.

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

- *Given* the transcripts screen, *when* a permitted user filters by date, category, language, outcome, or reference, *then* matching Conversations are listed with personal data masked.
- *Given* an assistant answer in a transcript, *when* it is opened, *then* it shows the sources used, the tool result if any, the Confidence, the model and provider, and a link to the trace.
- *Given* a permitted user opening a transcript, *when* it loads, *then* an Audit Entry records who viewed which Conversation.
- *Given* a user without `conversations.transcripts.view`, *when* they open the screen, *then* the API returns 403 and the denial is audited.

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

- *Given* the audit screen, *when* a permitted user filters by actor, action, target, outcome, or date, *then* matching Audit Entries are listed newest first with old and new values where they exist.
- *Given* a filtered result, *when* a user with `audit.log.export` downloads it, *then* a CSV and a JSON file are produced and the export itself is audited.
- *Given* any Audit Entry, *when* any user, including a System Administrator, tries to change or delete it, *then* the database refuses.
- *Given* a user without `audit.log.view`, *when* they open the screen, *then* the API returns 403 and the denial is audited.

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

- *Given* retention periods set per data class, *when* the daily job runs, *then* Conversations, Scam Submissions and their images, and escalation contacts older than their period are anonymized or deleted as configured.
- *Given* an anonymized Conversation, *when* analytics are recomputed, *then* the counts are unchanged because Interaction Events hold no free text.
- *Given* a data class with no period set, or a Conversation under a legal hold, *when* the job runs, *then* nothing in it is touched and held items are listed.
- *Given* any run, *when* it finishes, *then* an Audit Entry records each class, the date range, and the counts removed.
- *Given* a user without `settings.retention.manage`, *when* they call the retention endpoints, *then* the API returns 403 and the denial is audited.

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

- *Given* the export screen, *when* a permitted user selects knowledge, rates, settings, conversations, events, scam data, and audit log and starts an export, *then* an Export Bundle is built in the background and offered for download with a checksum.
- *Given* a finished bundle, *when* it is unpacked, *then* each data set is JSON Lines or CSV with a schema file, knowledge articles are Markdown with their versions, and prompts and settings are JSON.
- *Given* an export that includes conversations, *when* it is built, *then* the content is the stored masked form and the export is audited with its scope.
- *Given* a bundle older than the expiry period, *when* someone tries to download it, *then* the file is gone and the request record remains.
- *Given* a user without `privacy.exports.create`, *when* they call the export endpoints, *then* the API returns 403 and the denial is audited.

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

- *Given* the widget, *when* a customer opens 'my data', *then* they are shown a reference for their session and can download their own conversation from that browser.
- *Given* a Privacy Request with a session reference, *when* a permitted user fulfils an access request, *then* a file of that session's conversations is produced and the request is marked fulfilled.
- *Given* a deletion request, *when* a permitted user fulfils it, *then* that session's Conversations, Scam Submissions, and contact are anonymized at once by the same routine as the retention job, and the request is audited.
- *Given* a reference that matches nothing, *when* it is searched, *then* the screen says no data was found and discloses nothing else.
- *Given* a user without `privacy.requests.manage`, *when* they open the requests screen, *then* the API returns 403 and the denial is audited.

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

- *Given* the golden set, *when* a permitted user adds an item, *then* it records the question, language, use case, expected sources or tool result, and the expected behaviour: answer, uncertain, or escalate.
- *Given* at least 30 approved items per language for tracking, rates, Postal ID, service information, and code-switched input, *when* an evaluation runs, *then* results are reported per language and per use case for grounding, correct behaviour, and reply language.
- *Given* a run that scores below the accepted baseline for any language, *when* CI evaluates a change, *then* the deployment is blocked until a user with `eval.gate.approve` accepts a new baseline.
- *Given* a completed run, *when* a permitted user exports it, *then* the report lists every item with its outcome, suitable as acceptance evidence.
- *Given* a user without `eval.golden.manage`, *when* they try to edit the golden set, *then* the API returns 403 and the denial is audited.

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

- *Given* cases that ask for a rate, status, or policy that does not exist, *when* the suite runs, *then* the assistant answers uncertain or refuses in every case and fabricates nothing.
- *Given* prompt-injection cases, including ones hidden inside scam submissions, *when* the suite runs, *then* none changes the assistant's behaviour or reveals its instructions.
- *Given* cases seeking abusive, discriminatory, or off-topic content, *when* the suite runs, *then* each is declined politely and logged.
- *Given* known scam samples and genuine PHLPost notices, *when* the suite runs, *then* the scams score high or uncertain and the genuine notices are not called scams, and the miss rates are reported.
- *Given* a user without `eval.runs.execute`, *when* they try to start a run, *then* the API returns 403 and the denial is audited.

**In scope:**

- Safety case library in the four languages; scam sample set; suite wired into the CI gate; results report for the security and UAT evidence pack

**Out of scope:**

- Penetration testing and vulnerability scanning of the infrastructure (QA and DevOps, outside these tickets)

**Technical notes:** Reuses the EVL-1 runner with a 'must not' assertion type. Scam samples are synthetic or fully anonymized. Failures block deployment like any other regression. Enforces `eval.runs.execute`.

**Definition of done:** Code + tests merged · acceptance criteria pass · audit/permission checks verified · PR reviewed · docs updated.

**Dependencies:** EVL-1, CNV-5, SCM-1

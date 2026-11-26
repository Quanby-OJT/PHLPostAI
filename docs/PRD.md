# PHLPost AI Customer Support — Lean PRD

AI-Backed Customer Support Solution for the Philippine Postal Corporation (PHLPost).
Source: PHLPost Technical Specifications, source pages 90–127, Approved Budget for the Contract Php 7,000,000 ("TS"), as amended by Bid Bulletin Addendum No. 2026-17 dated 2026-11-06 ("Addendum"). Section numbers below (§) refer to the TS.
Prepared 2026-11-14. Companion files: `DOMAIN-MODEL.md`, `TICKETS.md`.

## Problem

PHLPost answers routine questions about tracking, rates, and the Postal ID by hand, and customers receive fake texts, emails, and payment links sent in PHLPost's name (§1). Answers are slow and inconsistent, and nothing measures how inquiries are handled.

## Goal

A PHLPost-owned assistant on the PHLPost website that answers eligible routine inquiries in the customer's language from approved information, reads parcel status from PHLPost's own systems, gives advisory scam assessments, hands over to a person when it should, and reports how it performed (§2, §3). Target: up to 70% of eligible routine inquiries handled without a person, measured by an approved method (§6.14).

## Primary users

| User | What they do | Account |
|---|---|---|
| Customer | Asks questions, tracks an item, submits a suspicious message, asks for a person | none (anonymous) |
| Knowledge manager and approver | Write, review, approve, and retire the content the assistant answers from | staff |
| Customer service agent and supervisor | Take over escalated chats; set escalation rules | staff |
| Scam reviewer | Validates reported scams and maintains indicators and known patterns | staff |
| Management | Reads dashboards, reports, and approved summaries | staff |
| Quality analyst | Runs evaluations and watches AI performance | staff |
| Data Protection Officer | Handles privacy requests, retention, and exports | staff |
| MISD system administrator | Users, roles, channels, connectors | staff |

Roles are data, not code. Every staff check is against a permission key, never a job title. Customers hold no permission.

## Scope

In scope (software): website chat widget, multilingual assistant, knowledge base with approval, postal rates lookup, Postal ID guidance, tracking through a connector, scam assessment and reporting, human escalation with an agent inbox and an outbound helpdesk connector, analytics, dashboards, reports, AI performance monitoring, administration, audit, retention, privacy requests, and data export (§3.1–3.4, §4.5–4.9, §4.13, §4.20, §5.10, §6.14).

Required by the TS but outside the development tickets (DevOps, QA, and services): managed cloud hosting and its disclosures, 99.9% availability, backups and disaster recovery with RTO 24 hours and RPO 4 hours, vulnerability scanning and penetration testing, the service desk and incident process, hypercare, the Privacy Impact Assessment, the Data Processing Agreement, training, documentation, and the third-party licence inventory (§4.1, §4.4, §4.5, §4.10, §4.19, §5, §6.6, §6.10, §6.11). These remain contract obligations and are listed at the end of this file.

## Non-goals

- Any logistics function: routing, dispatch, fleet or rider tracking, address parsing for delivery, shipment events, logistics incidents. These stay in MMAS (§3.3, §3.4).
- Creating, changing, or inferring a tracking status. The assistant only reads and explains the official one (§3.1).
- Deciding Postal ID eligibility, approval, or authentication (§3.1).
- Declaring a message to be fraud. Scam assessments are advisory and a person validates (§3.1, §4.8).
- An enterprise data lake, enterprise analytics, logistics analytics, or autonomous agents (§3, §3.2).
- Customer accounts or sign-in.
- Training or fine-tuning any shared or third-party model on PHLPost data (§4.7).
- Channels other than the website widget in this release. The channel interface lets PHLPost add them later.

## Key constraints

- **Stack.** Quanby `RAG_AI` template: Turborepo + pnpm, Next.js 16 (web and admin), NestJS (API), Python FastAPI RAG service (internal only), Drizzle + PostgreSQL with pgvector, Redis, Better Auth, Zod contracts. The Flutter app in the template is not used.
- **Timeline.** Twelve weeks from Notice to Proceed; development is weeks 4 to 6, testing weeks 7 to 8 (§6). `TICKETS.md` holds 44 tickets of one to two days each, which is 44 to 88 developer-days against 15 working days of development, so the build needs four to six developers in parallel, starting Release 1 during discovery.
- **Systems of record stay authoritative.** Tracking and other operational data are read through connectors and never copied into a second source of truth (§3.4).
- **Grounded or silent.** Official information comes only from approved Knowledge Articles, Rate Entries, or a Tracking Connector. With no reliable source, the assistant says so or escalates (§4.9).
- **No lock-in.** AI model providers, channels, tracking sources, and helpdesk tools each sit behind an interface. The template already routes between OpenAI, Anthropic, and watsonx (§3.4, §3.5, §4.2).
- **Minimum data.** Customers are anonymous; personal data in messages is masked before storage; retention is configurable (§4.6).
- **Customers know it is AI.** The widget says so before the first message (§4.8).
- **Everything privileged is audited** (§4.13).

## Non-functional requirements

| Area | Requirement | Source |
|---|---|---|
| Languages | Philippine English, Filipino/Tagalog, Visayan, Ilocano, code-switching, colloquial spelling | §2, §3.1 |
| Timezone | Asia/Manila for business hours and reports; timestamps stored in UTC | decision |
| Availability | 99.9% monthly | §5.1 |
| Recovery | RTO 24 hours, RPO 4 hours | §5.7 |
| Security | Encryption in transit and at rest, MFA for staff, role-based access, secrets management, API security, audit logging | §4.10 |
| Privacy | RA 10173; NPC Circulars 2023-06 and 2016-03; NPC Advisory 2024-04; privacy by design and by default | §4 |
| AI governance | Human oversight, confidence thresholds, traceability, correction, AI disclosure, no unauthorized training | §4.7–4.9 |
| Incident notice | Notify PHLPost within 24 hours of a suspected incident | §4.12 |
| Portability | PHLPost can export data, knowledge, configuration, reports, and logs in machine-readable formats | §3.4, §4.20 |
| Ownership | Source code, schemas, prompts, configurations, and documentation turn over to PHLPost | §3.5, §6.9, §7 |
| Acceptance | Functional, integration, security, AI, multilingual, and user acceptance tests pass | §6.4, §6.12 |

## Definition of Ready

A ticket may start when its acceptance criteria are in Given/When/Then form, its dependencies are merged, its permission keys exist in the catalog in `DOMAIN-MODEL.md`, and any risky flow it names has been read.

## Definition of Done

Code and tests merged · acceptance criteria pass · permission and audit checks verified · PR reviewed · docs updated.

## Decisions made

### Business-fact decisions (answered by the team on 2026-11-14)

| # | Decision | Rationale |
|---|---|---|
| B1 | Build on `Quanby-IT-Solutions/RAG_AI` | Team template; it already ships ingestion, hybrid retrieval, grounded cited answers, provider routing and failover, input screening, evaluation gate, reports, RBAC, and audit |
| B2 | First release covers the website chat widget only, behind a channel interface | The TS requires the website and allows other channels "as may be included" (§3.1) |
| B3 | No access to Track and Trace or MMAS yet: build against a connector interface with a mock source, and keep the real mapping as a ticket blocked on PHLPost's API hand-over | Integration is mandatory (§3.1, §3.4) but the interface is unknown |
| B4 | Build an agent inbox and also an outbound connector for an external helpdesk | The team chose both; PHLPost's own tool is not yet known |
| B5 | Tickets cover software development only; DevOps, QA, and service obligations are listed, not ticketed | Standing team preference from the QSPS project |

### Best-practice decisions (made without asking)

| # | Decision | Rationale |
|---|---|---|
| D1 | Permission keys keep the template's `module.submodule.action` form | One vocabulary across template and project code |
| D2 | Customers are anonymous; the public chat API is keyed by a random session token, rate limited, and screened | Data minimization (§4.6); no account is required by the TS |
| D3 | Only approved Knowledge Article versions are indexed; deactivation removes them from retrieval at once | "PHLPost-approved information" (§3.1, §4.9) |
| D4 | Postal rates are quoted from a structured rate table by a lookup tool, never generated by the model | The assistant must not fabricate rates (§4.9) |
| D5 | Tracking, rates, and scam assessment run as tools the assistant calls; the model words the answer but cannot change the tool's result | Keeps the system of record authoritative (§3.3) |
| D6 | Confidence combines retrieval strength and the template's groundedness check; below the threshold the assistant states uncertainty and offers a person | §4.9, §2 |
| D7 | Links in scam submissions are parsed and compared, never opened; submitted text is treated as data, never as instructions | Safety and prompt-injection defence |
| D8 | Once an agent claims a chat, the assistant stops answering in it | Avoids two voices and unsafe overrides |
| D9 | Analytics read only from an append-only event table | "Authorized and validated information generated by the customer-service application" (§3.2) |
| D10 | The deflection rate is computed from a versioned KPI definition, and each report cites the version | Auditable KPI reporting (§6.14) |
| D11 | AI-drafted management summaries carry the figures they were built from and need a person's approval before they are shown as final | Traceability and human review (§3.2) |
| D12 | Ticket blocks follow the format parsed by the template's `scripts/tickets-to-issues.mjs` and `scripts/tickets-to-linear.mjs` | `TICKETS.md` imports unchanged |
| D13 | DOMAIN-MODEL table, column, setting-key, and event-kind names are binding. Every ticket that touches a table names it in its technical notes and points to DOMAIN-MODEL; a name a ticket needs is added to DOMAIN-MODEL first, in the same pull request (2026-11-17) | One vocabulary for the whole team and their AI assistants; prevents each pull request inventing its own names |

### Assumptions for items the TS leaves undefined

Each is configurable so PHLPost can adjust it without new development.

| # | TS item | Assumption | Ticket |
|---|---|---|---|
| A1 | "Visayan" (§3.1) | Cebuano, the most widely used Visayan language; other Visayan languages can be added as test sets | CNV-4, EVL-1 |
| A2 | Eligible routine inquiries (§2, §6.14) | Tracking, rates, Postal ID information, service information, and scam guidance are eligible; complaints and anything else are not | CNV-2, ANL-3 |
| A3 | Source of postal rates (§3.1) | PHLPost staff maintain a rate table in the admin portal; no rates API exists | KB-2 |
| A4 | What customers may submit as a suspected scam (§3.1) | Pasted text, a link, an email body, or a screenshot | SCM-1, SCM-5 |
| A5 | "Customer sentiment indicators" (§3.1, §3.2) | A positive, neutral, or negative label per conversation plus the customer's own rating | CHN-3, ANL-4 |
| A6 | PHLPost's helpdesk tool (§3.1) | Unknown, so the outbound connector is a signed webhook plus email | ESC-4 |
| A7 | Track and Trace and MMAS interfaces (§3.1, §3.3) | A lookup by tracking number that returns a status code, description, location, and time | TRK-1, TRK-4 |
| A8 | Customer verification for tracking | None beyond the tracking number, as on the public Track and Trace page | TRK-1 |

### Open items for PHLPost (none block Release 1)

1. Track and Trace and MMAS API documentation, credentials, and a test environment.
2. Confirm or correct assumptions A1 to A8.
3. The approved knowledge content, rate tables, and status explanations.
4. Confidence threshold, business hours, and the list of sensitive topics that always go to a person.
5. Retention periods for conversations, scam submissions, and logs.
6. The genuine PHLPost domains, sender names, and payment channels for the scam checks.
7. Baseline figures and the approved method for the 70% target.
8. Which AI model providers PHLPost accepts, and where data may be processed.

## Non-code deliverables (tracked outside `TICKETS.md`)

| Deliverable | Due | Source |
|---|---|---|
| Project Implementation Plan, requirements validation, architecture set, data inventory, risk register | Weeks 1–3 | §6.2 |
| Managed cloud environment with disclosed provider, locations, and charges | before testing | §4.1 |
| Privacy Impact Assessment; Data Processing Agreement | before production | §4.4, §4.5 |
| Test cases, results, security testing, and UAT report | Weeks 7–8 | §6.4, §6.5 |
| Training and knowledge transfer for MISD and users; manuals | Weeks 9–10 | §6.6 |
| Go-Live Plan and rollback procedure | Weeks 11–12 | §6.7 |
| Third-party software, AI model, and licence inventory | before acceptance | §6.10 |
| Source code, repository, credentials, and documentation turnover | final acceptance | §6.9, §6.17 |
| Backup, disaster recovery, and business continuity documentation and tests | before production | §4.19, §5.7, §5.8 |
| Service desk, SLA reports, root-cause analyses | monthly from go-live | §5.2, §5.18 |
| 90-day hypercare and completion report | from go-live | §5.16 |
| Insurance, where required | contract start | §4.18 |
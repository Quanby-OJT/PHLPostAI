# Running the System

Daily-use guide for starting, testing, and troubleshooting the stack.
First-time setup (installs, `.env` copies, first migration) lives in the
[README Quick Start](../README.md#quick-start).

## Option B — Native dev (recommended for development)

Only the database and Redis run in Docker; apps run natively with hot reload.

> **Ports come from your `.env` files.** Default: backend **:3000**, rag
> **:8000**, web **:3001**. Three values must agree if you change them:
> backend `PORT` (`apps/backend/.env`) = the port in
> `NEXT_PUBLIC_API_BASE_URL` (`apps/web/.env`), and the rag port = the port
> in `RAG_SERVICE_URL` (`apps/backend/.env`). A rag-port mismatch is a fast
> 502 on chat.

```powershell
cd D:\PROJECTS\PHLPostAI

# 1. Infra (postgres/pgvector + redis) + self-hosted Langfuse tracing
docker compose up -d postgres redis langfuse-web langfuse-worker

# 2. Migrations — one-shot container; only needed after schema changes
docker compose up migrate --no-deps

# 3. Seed roles/permissions + bootstrap admin — only on a fresh/empty DB.
#    Without SEED_ADMIN_PASSWORD the seed generates a random password and
#    prints it once. Add --force-password to reset existing seed users.
$env:SEED_ADMIN_PASSWORD = "password123"; pnpm db:seed

# 4. All dev servers (ports per your .env; template default 3000/8000/3001)
pnpm dev
```

> **Note:** `pnpm dev` does **not** start the arq worker — ingestion jobs
> stay `queued` without it. Start it separately (see Terminal C below) or
> run the one-by-one flow.

### One-by-one (separate terminals)

Same stack without the combined `pnpm dev` — useful for isolating logs or
restarting a single service. Steps 1–3 above (infra, migrations, seed)
still apply first.

The rag terminal must serve the port your backend's `RAG_SERVICE_URL`
points at (`8000` on the template default). `pnpm dev:backend` / `dev:web`
read `PORT` / URLs from `.env`, so no port flags there.

```powershell
# Terminal A — backend (PORT from apps/backend/.env)
pnpm dev:backend

# Terminal B — rag API (port MUST match RAG_SERVICE_URL in apps/backend/.env)
cd apps/rag
uv run uvicorn --factory app.main:create_app --host 0.0.0.0 --port 8000 --reload

# Terminal C — arq worker (background ingestion jobs; uploads never index without it)
cd apps/rag
uv run arq app.worker.WorkerSettings

# Terminal D — web (port from apps/web/.env)
pnpm dev:web
```

- `pnpm dev:backend` / `pnpm dev:web` are turbo watch filters that also
  rebuild workspace dependencies, same behavior as inside `pnpm dev`.
- Rag API alternative: `pnpm -F @repo/rag dev` (same command; hardcodes
  `--port 8000` — matches the default `RAG_SERVICE_URL`).
- `RAG_SERVICE_URL` must use `127.0.0.1`, not `localhost` — hostname
  resolution has caused connection failures.
- If the rag API won't bind, check for a zombie process on its port
  (same recipe as the port-3001 fix in Troubleshooting).

URLs below use the template-default ports; substitute your `.env` ports if
you have overridden them.

| Service       | URL                               |
| ------------- | --------------------------------- |
| Web           | http://localhost:3001             |
| Backend API   | http://localhost:3000/api/v1      |
| API reference | http://localhost:3000/api/v1/docs |
| RAG health    | http://localhost:8000/health      |

**Login (seeded admin):** `admin@turbo-template.local` / `password123` (when seeded with
`SEED_ADMIN_PASSWORD=password123` as above; otherwise the password the seed printed)

Requirements: `uv` on PATH for the Python RAG service. `OPENAI_API_KEY` must
be set in the root `.env` (Docker) and `apps/rag/.env` (native) — chat and
indexing fail without it.

**Stop:** `Ctrl+C` on `pnpm dev`, then `docker compose stop postgres redis`.

## Option A — Full Docker (prod-like)

Everything containerized behind the bundled Nginx.

```powershell
docker compose up -d --build
docker compose ps   # wait: migrate exits 0, backend + rag healthy
```

- Single URL via Nginx: http://localhost (port 80 must be free — see
  README "Run on a single port" to disable the bundled proxy)
- Direct ports still published: web :3001, backend :3000
- Outgoing mail (verification, password reset) is caught by Mailpit:
  http://localhost:8025. Set `SMTP_*` in the root `.env` to use a real relay.
- Stop any native `pnpm dev` / uvicorn first: a leftover process on
  :3001 or :8000 shadows the containers.
- Seed on fresh DB: set `DATABASE_URL` at the compose-published Postgres
  port, then `pnpm db:seed`

**Stop:** `docker compose down` (add `-v` to wipe the database volume).

## Shared Supabase database

The team's shared database lives in Supabase. Use it for `pnpm db:migrate`
and the one-time `pnpm db:seed`. Run tests against local Postgres only.

1. In the Supabase dashboard, click **Connect** and copy the **Session pooler**
   URI (port 5432). Use `/postgres` as the database name.
2. Set it as `DATABASE_URL` in `packages/db/.env` and `apps/backend/.env`.
   URL-encode special characters in the password.
3. Set `SEED_ADMIN_PASSWORD` in `packages/db/.env` to a random value.
4. Run migrations: `pnpm db:migrate`. If `vector` fails, enable pgvector under
   Database → Extensions in the dashboard and run it again.
5. Seed once, with the remote override for this command only:
   `ALLOW_REMOTE_SEED=true pnpm db:seed`. Do not keep it in `.env`.
6. Connection caps: the backend pool is `max: 5` and the seed pools are
   `max: 2`. The Supabase pool size is 15, so keep RAG and any other client
   within the remaining budget.
7. Run unit and e2e tests with `DATABASE_URL` pointing at local Postgres, for
   example `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ragai" pnpm test`.

## Health checks

Template-default ports shown; use your `.env` ports if overridden.

```powershell
curl http://localhost:3000/api/v1/health   # backend: {"status":"ok",...}
curl http://localhost:8000/health          # rag: database + redis "up"
```

## Release 1 test checklist

1. **Auth** — login as seeded admin; `/register` does not exist
   (admin-provisioned accounts only, `AUTH_SIGN_UP_ENABLED=false`).
2. **RBAC** — sysadmin nav shows Dashboard/Todos/Users/Corpus/Chat. Create a
   low-permission user in Users panel, login as them: gated nav hidden,
   direct URLs denied, denial rows appear in `audit_log`.
3. **Ingest (Flow A)** — Corpus page → upload PDF → status flips
   `registered → indexed`. Re-upload identical file → "Already ingested",
   no duplicate row (content-hash dedup).
4. **Chat (Flow B)** — question answerable from corpus → grounded answer
   with `[n]` citation chips. Off-corpus question → fixed "I don't know"
   (B1). Rapid sends → 429 rate-limit banner.
5. **Public chat (Flow A, CNV-1)** — open http://localhost:3001/assistant with
   no account. A question covered by an approved article streams an answer and
   names the articles under it; an uncovered question answers "I don't have
   that information" with no sources. See *Public customer chat* below for the
   masking and refusal checks.
6. **Audit** —

   ```powershell
   docker exec philpost_ai-postgres psql -U postgres -d ragai -c "select action, actor_type, created_at from audit_log order by created_at desc limit 20;"
   ```

   Expect `corpus.document.upload`, `chat.query.submit`, `rbac.denied` rows.
7. **Tracing** — self-hosted Langfuse at http://localhost:3100 (login
   `admin@phlpost-assist.local` / `password123` from the root `.env`), project
   `PHLPost Assist` shows one trace per chat and ingestion request.

### Automated tests

```powershell
pnpm lint
pnpm typecheck
pnpm test
```

e2e (Playwright) needs its own backend/web on 3005/3002 with a raised auth
rate limit — see `packages/e2e-web` and the root `test:e2e:web` script.

## Enabling contextual retrieval (CE-2 rollout runbook)

Turning `CONTEXTUAL_CHUNKS_ENABLED` on (or `RAG_PROFILE=contextual`/higher)
changes what every embedding means — roll it out through the IN-8 shadow
path, never by re-ingesting in place:

1. Set the profile/flag on the **rag service and the arq worker** and restart
   both. New ingests enrich immediately; the existing corpus does not.
2. Trigger a re-embed with the **same** embedding model (the CE-2 config
   identity is model + enrichment + prompt version, so same-model is valid):
   `POST /internal/reembed {"targetModel": "<live model>"}` (or the corpus
   console button). The worker enriches every chunk (context cache — re-runs
   are free), builds shadow embeddings of `context + chunk`, and lands
   `context_text` on the rows (the keyword arm picks it up as it lands).
3. Verification runs the golden set against the shadow automatically; the
   migration only reaches `ready` when metrics hold ≥ baseline − tolerance.
4. `POST /internal/reembed/cutover` — one atomic pointer flip switches the
   vector arm to the enriched embeddings and bumps the response-cache
   generation. `POST /internal/reembed/abort` at any earlier point reverts
   shadow AND context (tsv falls back to raw text); serving is never touched.
5. Compare the before/after eval runs — see docs/CONTEXTUAL-RETRIEVAL-RESULTS.md.

## Knowledge base (KB-1)

The assistant answers only from **approved** Knowledge Article versions. The
RAG retrieval filter (`apps/rag/app/chunks.py`, `APPROVED_KNOWLEDGE_PREDICATE`)
returns a chunk only when its document belongs to an `approved` version of an
`active` article, so files uploaded on the Corpus screen are no longer used
for answers.

To try the flow locally you need two different users (the submitter cannot
approve their own version). On **User Management**, give one user the
*Knowledge Manager* role and another the *Knowledge Approver* role, then:

1. As the manager, open **Knowledge base → Articles → New article**, write
   the text (or **Start from a file**: DOCX, PDF, HTML) and **Submit for review**.
2. As the approver, open **Knowledge base → Review queue** and **Approve**.
   The version shows *Indexing…* while the ingestion job runs and becomes
   *Approved* when it finishes (the RAG worker must be running). If indexing
   fails, the version stays in review with the reason, and the previous
   approved version keeps serving.
3. **Deactivate** removes the article from answers at once and clears the
   response cache. If the cache cannot be cleared, nothing changes.

## Public customer chat (CNV-1)

The customer-facing assistant lives at **http://localhost:3001/assistant** and
needs no account — it is the one public write surface in the API. Open it, ask
a question covered by an approved article, and the answer streams in with the
titles of the articles it used underneath.

The page authenticates with a **Customer Session** token, which it fetches on
first use and keeps in `localStorage`. The session row carries no name, email,
or phone; only a SHA-256 hash of the token is stored, and the session lapses
after `CUSTOMER_SESSION_IDLE_MINUTES` (default 30) of silence — after which
the page transparently opens a new one.

Endpoints (no permission key; `x-customer-session` instead of a staff session):

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/customer/session` | Open a session; returns the token once |
| `POST /api/v1/customer/chat/message` | Ask a question, non-streamed JSON |
| `POST /api/v1/customer/chat/stream` | Ask a question, SSE `token` + `final` |

Exercising it from a terminal:

```powershell
# 1. Open a session
$token = (curl -s -X POST http://localhost:3000/api/v1/customer/session `
  -H "content-type: application/json" -d '{}' | ConvertFrom-Json).sessionToken

# 2. Ask something your approved articles cover
curl -s -X POST http://localhost:3000/api/v1/customer/chat/message `
  -H "content-type: application/json" -H "x-customer-session: $token" `
  -d '{"query":"How much is Express Mail up to 500 grams?"}'

# 3. No token -> 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/customer/chat/message `
  -H "content-type: application/json" -d '{"query":"hello"}'
```

What to expect:

- A covered question returns `answerKind: "answer"` with `sources` naming the
  approved articles.
- A question no approved article covers returns the grounded "I don't know"
  with `answerKind: "uncertain"` and no sources — it never invents one.
- Personal data is masked by the RAG service's screen **before** anything is
  stored or traced, so `messages.content` holds `[PHONE]` / `[EMAIL]`, never
  the real values. Check with:
  `docker exec philpost_ai-postgres psql -U postgres -d ragai -c "select sender, answer_kind, content from messages order by created_at desc limit 4;"`
- A question that tries to override the assistant's instructions is refused
  (`answerKind: "refusal"`) and recorded twice: `chat.query.blocked` from the
  RAG service and `chat.query.refused` against the conversation.

Conversations and messages for these turns are written only by
`ConversationService` (`apps/backend/src/modules/v1/customer/`). The RAG
service is called with `persist: false` on this path, since a customer has no
`users` row to key a turn to — `conversations.user_id` stays null and
`customer_session_id` identifies the chat instead.

## Tracking lookups (TRK-1)

A customer question about a tracking number is answered from a **tracking
connector**, not from the model, so it works without an OpenAI key. Flow B
steps 1 to 3 and 6: extract the number, look it up with a hard timeout, reply,
and store a `tracking_lookups` row.

Routing: until CNV-2 classifies messages into categories, a message counts as
a tracking question when it contains a valid tracking number or one of
`TRACKING_KEYWORDS`. Tracking turns are still screened by the RAG service
(`POST /internal/chat/screen`) before anything is stored.

The `mock` connector (`apps/backend/src/modules/v1/tracking/connectors/mock/`)
has these seed records:

| Tracking number | Result |
| --- | --- |
| `RR123456789PH` | In transit, Manila Central Post Office |
| `EE987654321PH` | Out for delivery, Quezon City Post Office |
| `CP111222333PH` | Delivered, Cebu City Post Office |
| `CE444555666PH` | Held by the Bureau of Customs (`HELD_AT_CUSTOMS`) |
| `RR000000000PH` | Never answers (tests the timeout) |
| any other valid number | No record found |

Try it at http://localhost:3001/assistant:

- "Where is RR123456789PH?" shows the status, place and time.
- "Where is RR999999999PH?" says no record was found.
- "Where is my parcel?" or "track RR12345PH678" asks for the tracking number,
  with no lookup.
- "Track RR000000000PH" says the tracking system can't be reached after
  `TRACKING_LOOKUP_TIMEOUT_MS`.

Each lookup stores the connector, outcome, status code, latency and an
HMAC-SHA256 hash of the number, never the number itself. The stored customer
message has the number replaced with `[TRACKING_NUMBER]`. Check with:
`docker exec philpost_ai-postgres psql -U postgres -d ragai -c "select connector_code, outcome, status_code, latency_ms, tracking_number_hash from tracking_lookups order by created_at desc limit 5;"`

Settings (`apps/backend/.env`, all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRACKING_CONNECTOR` | `mock` | Which registered connector answers lookups |
| `TRACKING_LOOKUP_TIMEOUT_MS` | `5000` | Hard timeout for one lookup |
| `TRACKING_NUMBER_PATTERN` | `^[A-Z]{2}[0-9]{9}[A-Z]{2}$` | Valid tracking-number format (UPU S10) |
| `TRACKING_KEYWORDS` | `track,tracking,trace,where is my,…` | Words that mark a tracking question |
| `TRACKING_NUMBER_HASH_SECRET` | `BETTER_AUTH_SECRET` | Key for the tracking-number hash |
| `TRACKING_CUSTOMS_STATUS_CODES` | `HELD_AT_CUSTOMS` | Status codes that mean the item is held by Customs (TRK-2) |

### Status explanations (TRK-2)

Staff with `tracking.explanations.manage` (the Knowledge Manager role by
default) write plain-language wording and next steps per status code and
language on **Status explanations** (`/tracking-explanations`). A tracking reply
shows the official status, place and time first and unchanged, then the
explanation for the customer's chat language. A code with no active explanation
in that language shows only the official status and appears under **Needs
explanation** (built from `tracking_lookups`). For a status in
`TRACKING_CUSTOMS_STATUS_CODES`, the reply always adds that PHLPost does not
decide the release; write the Customs guidance and required documents in that
code's explanation and next steps.

Try it:

1. Track `RR123456789PH` on `/assistant`. `IN_TRANSIT` now appears under
   **Needs explanation**.
2. Click **Write explanation**, save it, and track the number again. The reply
   ends with "What this means" and "Next steps".
3. Track `CE444555666PH` and add an explanation for `HELD_AT_CUSTOMS` with the
   required documents as next steps.

## Inquiry categories (CNV-2)

Every customer message is screened and classified in one RAG call
(`POST /internal/chat/classify`): one cheap-model call returns the Inquiry
Category and the language (`en`, `fil`, `ceb`, `ilo`). The category decides
the route (`apps/backend/src/modules/v1/customer/inquiry-routing.ts`):
`tracking` goes to the TRK-1 tracking tool and `rates` to the KB-2 rate
lookup tool; every other category goes to retrieval until its tool exists
(SCM-1 adds `scam`). If the
model is unavailable, a keyword classifier and the TRK-1 tracking check stand in.

The message is stored with its category and `is_eligible` copied from the
category at that moment, so changing eligibility only affects new messages.

Categories come from `pnpm db:seed` (the seven domain codes). Staff with
`settings.assistant.manage` manage them on **Inquiry Categories**
(`/inquiry-categories`): add a category, change its eligibility, or deactivate
it (`other` is the fallback and stays active). Every change is audited
(`assistant.category.create` / `assistant.category.update`).

Check what was stored:

```powershell
docker exec philpost_ai-postgres psql -U postgres -d ragai -c "select content, inquiry_category, is_eligible, language from messages where sender = 'customer' order by created_at desc limit 5;"
```

### Classifier accuracy (AC4)

`apps/rag/tests/data/classifier_test_set.json` holds 106 labelled messages
across all seven categories, in English, Filipino, Cebuano, and Ilocano. The
**Classifier Eval** workflow runs them through the real cheap model when the
classifier changes (or by hand) and fails below `CLASSIFIER_ACCURACY_FLOOR`
(default `0.85`; set it as a repository variable to change it). Run it locally
with a real `OPENAI_API_KEY` in `apps/rag/.env`:

```powershell
cd apps/rag
uv run python -m app.classifier_eval
```

The JSON report lists accuracy overall and per category, and every mistake.
`pnpm test` checks the test set and the scoring offline, without the model.

## Postal rates (KB-2)

The assistant quotes prices only from approved **Rate Entries** (PRD D4). For
the `rates` category (CNV-2), a cheap-model call reads the service, the
destination zone, and the weight from the question, choosing only from what
the rate table has (`POST /internal/rates/extract`). The backend then looks up
the newest approved entry in effect today (Philippine date) and replies with
fixed wording: the price, the service name, and the effective date. A missing
weight, destination, or service gets a follow-up question; the customer's next
short reply ("2 kg", "to Cebu") completes it. No matching entry means "no
published rate" and no price.

Maintain the table on **Postal rates** (`/rates`):

1. A user with `knowledge.rates.manage` (Knowledge Manager) opens **Import
   CSV**, chooses a file, and clicks **Preview**. Every row is validated and
   errors are listed by line; nothing is stored. A clean file can be
   **submitted for approval**.
2. A different user with `knowledge.articles.approve` (Knowledge Approver or
   admin) opens **Review queue** and approves or rejects the batch (with a
   note). The submitter cannot approve their own batch. Approved rows go live
   at once (from their `effective_from` date).

CSV columns: `service_code`, `service_name`, `zone`, `weight_min_g`,
`weight_max_g`, `price_php`, `effective_from`, `effective_to` (optional), with
dates as `YYYY-MM-DD`. Weight bands for the same service and zone may not
overlap within a file for the same dates. `docs/samples/rates-sample.csv` has
**sample** rows for local testing; they are not official PHLPost rates.

Every step is audited: `rates.batch.submit`, `rates.batch.approve`,
`rates.batch.approve_refused`, `rates.batch.reject`.

Try it with the sample file approved: "How much is Express Mail to Cebu for a
2 kg parcel?" quotes the Visayas rate; "How much to send a parcel?" asks for
the weight and destination; "Express Mail to Visayas for 30 kg?" says there is
no published rate.

## Customer language (CNV-4)

The language from the CNV-2 call decides the reply language
(`apps/backend/src/modules/v1/customer/customer-language.ts`):

| Message | Reply | Stored `messages.language` |
| --- | --- | --- |
| Filipino/Taglish, Cebuano or Ilocano | that language | the detected code |
| English, or not detected | the session language (widget menu, default English) | `en`, or the session's |
| Any other language | English, plus a note naming the four supported languages | `unsupported` |

For knowledge answers the backend sends the reply language, the detected
question language and the glossary (`UNTRANSLATED_POSTAL_TERMS` from
`packages/contracts`) to `/internal/chat`. The RAG service translates a
non-English question into English before hybrid search (the approved articles
are in English), answers in the reply language, keeps the glossary terms as
written, and cites the English articles. Cached answers are kept per reply
language. The grounded "I don't know" is fixed text in each language.

The widget's **Language** menu switches the fixed interface text at once and
stores the choice on the Customer Session (`POST /v1/customer/session/language`),
so later replies use it without starting a new conversation. Tracking replies
use the reply language for the Status Explanation; the fixed tracking, rates
(KB-2) and refusal sentences are still English, with the supported-languages
note added for an unsupported language.

Try it at `/assistant`: ask `Unsaon pagkuha og Postal ID?` (Cebuano reply),
pick **Ilocano** and ask in English (Ilocano reply), or ask in Japanese (English
reply with the supported-languages note).

## Troubleshooting

- **Port 3001 already in use** — stale Next dev server from a previous
  session:

  ```powershell
  Get-NetTCPConnection -LocalPort 3001 -State Listen
  Stop-Process -Id <pid> -Force
  ```

- **Migrations fail on `enable_pgvector_extension`** — `DATABASE_URL` points
  at a host Postgres without pgvector instead of the compose one. Check the
  port matches `POSTGRES_HOST_PORT` in the root `.env` across
  `packages/db/.env`, `apps/backend/.env`, **and** `apps/rag/.env`.
- **Hydration mismatch with `bis_skin_checked` / `bis_register` attributes**
  in the browser console — a browser extension mutating the DOM, not an app
  bug. Verify in an incognito window.
- **Fast 502 on `/api/v1/chat/stream`** (responseTime ~10-20ms) — backend
  can't reach the rag service. Almost always a port mismatch: the rag API
  is on a different port than `RAG_SERVICE_URL` in `apps/backend/.env`.
  Confirm with `Get-NetTCPConnection -State Listen -LocalPort 8000,8001`
  and `curl http://127.0.0.1:<port>/health`; restart rag on the expected
  port. (A timeout-style 502 after ~60s instead is a real rag error —
  check its logs.)
- **Chat returns degraded answers** — OpenAI provider error; check
  `OPENAI_API_KEY` and the rag service logs.
- **429 on login/session during parallel testing** — Better Auth rate limit
  (10/60s default); raise `AUTH_RATE_LIMIT_MAX` on the backend for local
  test runs.

## Chat widget embed (CHN-1)

Add one script tag to any page that should show the assistant:

```html
<script src="https://<web-app-origin>/widget.js" defer></script>
```

The button opens `/assistant` in an iframe. Three lists decide who may use it:

- `ASSISTANT_EMBED_ORIGINS` (web app env, space-separated): sites allowed to frame `/assistant`.
  Default is `http://localhost http://localhost:3001`. Restart the web app after changing it.
- `channels.config.allowedOrigins` for the `web-widget` channel: origins allowed to call the public chat API.
  The widget's requests come from the web app origin, so this list holds the web app origin.
- The backend CORS origin list: add the same web app origin.

Rate limits on the public chat routes: per IP `THROTTLE_STRICT_*`, per customer session `THROTTLE_SESSION_LIMIT` / `THROTTLE_SESSION_TTL`.

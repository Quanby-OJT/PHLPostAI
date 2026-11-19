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

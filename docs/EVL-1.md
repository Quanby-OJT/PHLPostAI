# EVL-1 answer quality evaluation

EVL-1 extends the evaluation workspace at `/eval`. The evaluation gate checks grounding, behavior, and reply language for English (`en`), Filipino (`fil`), Cebuano (`ceb`), and Ilocano (`ilo`). Each language needs at least 30 eligible items, with tracking, rates, Postal ID, service information, and code-switched coverage. The report includes counts and scores for each language, use case, and language–use case pair.

## Requirements and permissions

| Source | Application |
| --- | --- |
| [EVL-1 / QUANBY-113](https://linear.app/quanby/issue/QUANBY-113/evl-1-prove-answer-quality-per-language-and-use-case-with-approved) | Golden-set authoring, evaluation slices, release gate, output limit, export, and denial audit |
| [Lean PRD](https://linear.app/quanby/document/prd-phlpost-ai-customer-support-lean-prd-f1f91f24545c) | Four supported languages, authoritative tools, and the 200-token ceiling |
| [Domain Model](https://linear.app/quanby/document/domain-model-glossary-entities-state-machines-permission-keys-f47d0eb3f21a) | Locale and permission identifiers, evaluation entities, and append-only audit |
| [Tickets, Build Order, and Risky Flows](https://linear.app/quanby/document/tickets-build-order-and-risky-flows-1e1e59329d16) | Existing routing, approved content, and evaluation flow |
| [CNV-4](https://linear.app/quanby/issue/QUANBY-99/cnv-4-reply-in-the-customers-language) | Dominant language for code-switching and preservation of official terminology |
| [KB-2](https://linear.app/quanby/issue/QUANBY-102/kb-2-maintain-postal-rates-and-answer-rate-questions-from-the-table) | Exact table price, service, effective date, and missing-input handling |
| [TRK-2](https://linear.app/quanby/issue/QUANBY-103/trk-2-explain-each-official-status-in-plain-language) | Preserve official status, explain it in plain language, and qualify customs release |
| [CNV-3](https://linear.app/quanby/issue/QUANBY-98/cnv-3-state-uncertainty-and-offer-a-person-when-confidence-is-low) | Low confidence and handoff, completion usage, and routine answer limits |

Golden items retain the template question, ideal answer, source hashes, tags, and active/retired status. EVL-1 adds language, use case, code-switch flag, expected behavior (`answer`, `uncertain`, or `escalate`), and optional structured expected tool outcome and facts. Source hashes identify the exact supporting chunks. A grounding answer needs an expected tool or chunk. Uncertainty and escalation can explicitly expect missing evidence.

`eval.golden.manage` permits creation, editing, retirement, reactivation, import, and recording an external PHLPost decision. Record approval with the approver's identity, evidence reference, and current revision. A subsequent edit clears the current approval and the audit log retains the previous record. The bundled draft candidates use fictional policies and prices and cannot receive approval through the bundled synthetic record. Account holders use the approval form only after receiving authentic external evidence.

`eval.runs.execute` permits running the suite and downloading full run evidence. `eval.gate.approve` permits accepting a baseline with a reason. The approval transaction records the previous run and actor in the append-only audit log. The permissions are independent.

## Dataset and scoring

| Language | Tracking | Rates | Postal ID | Service info | Code-switched | Distinct | Drafts | PHLPost-approved | Simulated approval |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| English | 8 | 8 | 7 | 7 | 9 | 30 | 30 | 0 | 30 |
| Filipino | 8 | 8 | 7 | 7 | 9 | 30 | 30 | 0 | 30 |
| Cebuano | 8 | 8 | 7 | 7 | 9 | 30 | 30 | 0 | 30 |
| Ilocano | 8 | 8 | 7 | 7 | 9 | 30 | 30 | 0 | 30 |
| Total | 32 | 32 | 28 | 28 | 36 | 120 | 120 | 0 | 120 |

Draft and simulated counts refer to the same 120 questions with different eligibility. The simulated suite is an in-memory dataset restricted to the loopback database named `phlpost_evl1_qa`. It uses the existing mock tracking connector, fictional Zone Indigo and Zone Amber rates, and synthetic English source texts seeded in that database. Expected conduct covers a delivery scan, official customs wording, missing/malformed/not-found tracking, timeout, rate-band boundaries, missing rate inputs, out-of-band rates, cross-language grounding, and missing knowledge.

The runner uses the customer classifier, tracking and rate tools, approved-corpus retrieval and generation, and customer answer policy without creating conversation records. The judge grades the visible response and emits three binary dimensions. The runner also checks tool outcome/facts, cited hash matches, and route. Aggregate scores are fractions of all cases in the slice. The behavior check accounts for whether the reply addresses the specific question. The sources describe the three dimensions without a numeric weighting or separate EVL-1 relevance threshold. A model judge can misgrade an item, so inspect its reasoning alongside the expected facts, recorded answer, and trace. Review the drafts with native speakers before using them for PHLPost acceptance.

Provider completion tokens are passed through where available. For the entire visible reply, including deterministic tool messages and post-processed replies, the scorer uses the project’s exact `o200k_base` tokenizer without a character approximation. Either measured count above 200 fails the gate. An unavailable visible count makes the run unevaluable. The JSON retains expected and actual behavior, language, tool facts, hashes, answer, errors, token counts, configured profile, and build identity for each item.

## Release gate

Code review can use the draft set and the isolated fixtures to assess EVL-1. Production acceptance depends on PHLPost approving at least 30 cases per language and a holder of `eval.gate.approve` accepting a compatible release baseline. Local approvals and gate simulations use a separate evaluation profile.

Staging and production deployment jobs depend on the reusable **Answer Quality Gate** workflow. The job starts the checked-out RAG code, builds the checked-out backend, executes a fresh approved-set run, and uploads its evidence. Provision dedicated evaluation PostgreSQL and Redis values and the scoped OpenAI key as `EVAL_DATABASE_URL`, `EVAL_REDIS_URL`, and `EVAL_OPENAI_API_KEY`. Connect the staffed evaluation console to that same database with `EVL1_MODE=evl1` and the mock tracking connector. Apply the Drizzle migrations and prepare authentic golden approvals, the approved baseline, and controlled source data before enabling a release. The job writes evaluation evidence to that database. Pending or missing prerequisites stop the release.

A gate exits `0` on a compatible run that meets or exceeds all three accepted scores in each language, `1` for a language regression, and `2` for missing coverage, incompatible configuration, a failed or incomplete run, no baseline, or a token violation. The release fingerprint includes the approved golden revisions, rubric version, RAG settings, controlled rate table, and tracking fixture configuration. An authorized lower baseline requires explicit acceptance and a recorded reason. The 200-token maximum is still enforced. Baseline history remains available in `eval_baselines` and `audit_log`.

## Local setup and accounts

Use the repository's local PostgreSQL container `philpost_ai-postgres` on port 5433 and Redis on 6380. Create only the dedicated QA database if it does not exist, then build and seed.

```powershell
docker exec philpost_ai-postgres createdb -U postgres phlpost_evl1_qa
pnpm.cmd --filter @repo/db build
pnpm.cmd --filter @repo/backend build
$env:EVL1_QA_PASSWORD = '<your local-only password of 12 or more characters>'
powershell.exe -ExecutionPolicy Bypass -File scripts/evl1-local.ps1 seed
```

Run each service in its own shell. Startup reads process overrides and leaves the existing environment files intact.

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/evl1-local.ps1 provider
powershell.exe -ExecutionPolicy Bypass -File scripts/evl1-local.ps1 rag
powershell.exe -ExecutionPolicy Bypass -File scripts/evl1-local.ps1 backend
powershell.exe -ExecutionPolicy Bypass -File scripts/evl1-local.ps1 web
```

Open [local sign-in](http://127.0.0.1:3031/login) and then [Evaluation](http://127.0.0.1:3031/eval). Use the same loopback hostname for cookies. Set up a separate private window or browser profile for each account. All four accounts use the local-only seed password supplied above.

| Account | Email | Evaluation grant |
| --- | --- | --- |
| A | `evl1.golden@example.test` | `eval.golden.manage` |
| B | `evl1.operator@example.test` | `eval.runs.execute` |
| C | `evl1.approver@example.test` | `eval.gate.approve` |
| D | `evl1.denied@example.test` | None |

Health checks are [API health](http://127.0.0.1:3030/api/v1/health) and [RAG health](http://127.0.0.1:18030/health). Port 8330 is the scripted offline provider. An optional live-model check sends only synthetic questions and reference data to OpenAI using the configured credential. First run `index -LiveModel` to embed the synthetic references. Start `rag -LiveModel` on port 18031 and run `gate -LiveModel -Report <absolute-path>` in another shell. Without a compatible live-run baseline the command still persists the run evidence and exits 2. Live model scoring on the synthetic dataset does not count as PHLPost acceptance.

## Manual verification

All six manual statuses are **NOT TESTED**.

### AC1 · Golden item management

1. Sign in as A and open [Evaluation](http://127.0.0.1:3031/eval).
2. Enter `What mock tracking status is recorded for RR123456789PH?` for Question and `Preserve the official in-transit status and last scan.` for Ideal answer.
3. Check **Answer quality item (EVL-1)**. Choose `en`, `tracking`, and `answer`. In **Expected tool result (JSON)** enter `{"outcome":"found","facts":{"statusCode":"IN_TRANSIT"}}`.
4. Click **Add item**. In DevTools, inspect `POST /api/v1/eval/golden` for HTTP 200, the item ID, metadata, and a null approval reference. In the table, confirm **Draft**. Click **Edit**, change the ideal answer, and save. Check HTTP 200 for `PUT /api/v1/eval/golden/{id}`.
5. Verify the stored revision and the `eval.golden.create` and `eval.golden.update` audit entries with the queries below. Capture the form, the draft row, both HTTP responses, and the audit rows. Use authentic external evidence only if testing approval on a real draft intended for PHLPost.

### AC2 · Per-language and per-use-case evaluation

1. With the QA seed and provider running, sign in as B and open [Evaluation](http://127.0.0.1:3031/eval). Click **Run local fixtures**. The API returns `running` and a run ID. The UI polls this ID until it completes or fails.
2. Open the selected run. Check the 30 items per language, the four use-case totals, and the per-language use-case cells. Check **Show failures only** and expand an item. Compare expected behavior, actual behavior, output language, tool facts, and source hashes. Local scores may show real routing/format differences and offline-provider behavior. Use the real model command for actual model scoring.
3. Verify `GET /api/v1/eval/runs/{id}` and `eval_runs.per_item` contain 120 records with scores or an explicit error per item. Capture the tables, one failed item, and one uncertainty case. Production coverage remains pending until authentic approved questions reach the required counts.

### AC3 · Baseline and deployment dependency

1. Generate controlled scenarios from the workspace root and save the IDs printed as JSON. These scenarios test CI behavior without asserting model quality.

   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File scripts/evl1-local.ps1 simulations
   powershell.exe -ExecutionPolicy Bypass -File scripts/evl1-local.ps1 gate -RunId <pass-id>
   $LASTEXITCODE
   ```

2. Sign in as C at [Evaluation](http://127.0.0.1:3031/eval). Select the `baseline` scenario by ID, provide a reason, and click **Accept baseline**. The API `POST /api/v1/eval/runs/{id}/promote` returns 200. Repeat the pass command and expect 0.
3. Run the gate with `regression` and expect 1 even though overall grounding improves. In B or D's authenticated browser, use the direct approval request below and expect 403. Check the accepted baseline ID stays the same. As C, approve the regressed candidate with an explicit reason and rerun the command. Expect 0 for that candidate on the new reference.
4. Inspect the staging and production workflow files for `needs: [ci, answer-quality]`. Capture the gate exit codes, both promotion entries, and the denied audit entry. No deployment is required for this check.

### AC4 · Output ceiling

1. As B, open a fixture report and expand an item to see visible output and provider completion tokens. Keep the initial compatible simulated baseline accepted for the boundary scenarios.
2. Run the gate with `tokens199`, `tokens200`, `tokens201`, and `missingTokens`. Expect 0, 0, 2, and 2. C's attempt to promote `tokens201` should return 409.
3. From `apps/rag`, run `& ./.venv/Scripts/python.exe -m pytest -q tests/test_answer_quality.py` to exercise the exact tokenizer at those boundaries. Capture the item token evidence, test output, gate report, and promotion response.

### AC5 · Full evidence export

1. As B, open a completed or failed run in [Evaluation](http://127.0.0.1:3031/eval). Click **Download report JSON**.
2. Verify the downloaded `evl1-<id>.json` includes the run configuration, counts, and `perItem`. Compare the number of entries with the database count and the 120-case suite. Verify both unsuccessful and uncertain cases, expected tool/source evidence, actual answer, slice labels, and token counts. Capture the download and relevant records. The read endpoint is `GET /api/v1/eval/runs/{id}` and uses `eval.runs.execute`.

### AC6 · HTTP 403 and audit

1. Sign in as D. Visit [Evaluation](http://127.0.0.1:3031/eval) and confirm the permission message. Record the ID and original state of the AC1 item from Account A's session.
2. In D's DevTools console, submit the direct mutation with an actual item ID. Repeat with `PUT` and `{status:"retired"}`, `POST /eval/golden`, `POST /eval/golden/import`, and `POST /eval/golden/{id}/external-approval` using valid request data. Check each response is 403. Use D's session for the baseline denial check too.

   ```javascript
   await fetch("http://127.0.0.1:3030/api/v1/eval/golden/<item-id>", {
     method: "PUT", credentials: "include",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ question: "This update must be denied" })
   }).then(async response => [response.status, await response.json()]);
   ```

3. Verify the golden item and its revision are unchanged. Verify `rbac.denied` includes D's actor, route, permission, and denial outcome. Capture DevTools Network and the database audit result.

## Database verification

Open `docker exec -it philpost_ai-postgres psql -X -U postgres -d phlpost_evl1_qa` and run the queries using the IDs from your test.

```sql
select id, question, answer_quality, approval_reference, external_approver, updated_at
from golden_items where id = '<item-id>';
select id, status, config->>'profile', jsonb_array_length(per_item) as items
from eval_runs where id = '<run-id>';
select run_id, promoted_by, note, created_at from eval_baselines order by created_at desc;
select actor_id, action, resource_id, "after" from audit_log
where action in ('rbac.denied','eval.golden.create','eval.golden.update',
                 'eval.golden.record-approval','eval.gate.promote')
order by created_at desc limit 24;
```

# Phase 2 — server-owned FRQ grade tickets

**Status: PROPOSED 2026-08-20 — grade-affecting; implementation must ship behind `FRQ_GRADE_MODE`, default `off`**

Scope: the 69 live worksheet pages represented by `data/frq-regrade-manifest.json`, their 212 reflection textareas, roster-server's `source:'frq'` ledger rows, and the curriculum-render AI grader. Fill-in-the-blank semantic grading is not moved in this phase.

---

## 1. TL;DR

| | |
|---|---|
| **Symptom** | A reflection grade exists only if browser JavaScript reaches the grader and then reaches roster-server; the external recovery loop is hourly. |
| **Trust defect** | The grader accepts the page's `prompt`, and roster-server accepts the page's numeric FRQ `score`. A signed-in student does not even need prompt injection today: they can post `source:'frq', score:1` for their own known item id. |
| **Concurrency defect** | The existing FRQ floor is a read followed by an upsert. It is safe for sequential writes, but two writers that both read the old value can race and let the later, lower write win. |
| **Recommendation** | **Option B** — the existing FRQ ledger row is the durable ticket; roster-server rebuilds a committed server-owned prompt; an out-of-request worker claims rows through a PostgreSQL lease and applies verdicts through one atomic floor RPC. Cut direct client FRQ grading in authoritative mode. ★ |
| **Student latency** | `POST /ledger/record` acknowledges the durable ticket immediately; a 2 s worker tick and an explicit blur/Done readiness signal preserve seconds-scale feedback without holding an HTTP request open on the model. |
| **Multi-instance safety** | Claim-by-update in PostgreSQL with `FOR UPDATE SKIP LOCKED`, a response version, a random lease token, and lease expiry. In-memory `running` only prevents overlap inside one process; it is not the distributed lock. |
| **Prompt answer** | **Rebuild on the server. Do not verify a client prompt or prompt-minus-answer hash.** A public hash is not authority, and accepting a client prompt preserves parser/canonicalization attack surface. |
| **Rollback** | One switch: `FRQ_GRADE_MODE=off`. It stops claims/writes and tells rewired clients to use the retained legacy path. No data rollback is needed because authoritative writes are raise-only. |
| **Effort** | About 3–4 focused engineering days plus at least 24 hours of shadow observation; approximately 700–1,000 handwritten lines, one migration/RPC, a generated ~1.21 MB JSON artifact, and tests. |

Two findings make this **CRITICAL grade-path work**, not merely a reliability worker:

1. `POST /ledger/record` verifies the roster token but otherwise takes `score` from the request for FRQs (`roster-server/ledger.js:100-121`) and upserts it (`roster-server/ledger.js:176-186`). The server must stop accepting a student-authored FRQ score in authoritative mode.
2. The floor reads the old score at `roster-server/ledger.js:151-165` and writes later at `:176-187`; `/ledger/frq-regrade` repeats the same read-then-write shape at `:252-276`. Neither sequence is an atomic concurrency proof.

---

## 2. What actually happens today (source-traced, 2026-08-20)

### 2.1 Browser path

For a representative live page:

1. A textarea edit is saved as a scoreless `source:'frq'` draft after a 400 ms debounce (`u1_lesson1_live.html:1268-1283`, `:1580-1584`).
2. The page's graded sink converts E/P/I to `1/0.5/0` and sends that numeric score through `gradebookClient.record` (`u1_lesson1_live.html:1285-1305`).
3. The page constructs the rubric prompt itself and posts `{scenario, answers, prompt}` directly to curriculum-render (`u1_lesson1_live.html:1705-1724`).
4. The injected common block also discovers `window.buildReflectionPrompt*`, calls it in the browser, and sends each resulting prompt to `/api/ai/grade-batch` (`scripts/wire-ai-worksheet-grade.mjs:327-376`).
5. It rejects a verdict if the textarea changed while the call was pending (`scripts/wire-ai-worksheet-grade.mjs:425-429`), persists a first-ever I as well as E/P (`:463-480`), and wraps the graded sink with an in-session/persisted raise-only floor (`:717-735`).
6. Failures get one delayed retry (`scripts/wire-ai-worksheet-grade.mjs:738-763`) and a per-student/per-worksheet localStorage marker (`:764-790`). Input, blur, hidden-page, and pagehide schedule automatic passes; the idle threshold is 20 s (`:792-831`). Load-time hydration searches for prior null-score rows (`:833-873`).
7. Automatic passes are capped at 6 per 10 minutes per page (`scripts/wire-ai-worksheet-grade.mjs:793-813`). Waiting text polls `/api/ai/status` and renders queue length/ETA (`:486-547`).
8. The current batch path uses one call when at least two reflection candidates exist and falls back per item (`scripts/wire-ai-worksheet-grade.mjs:388-418`). Its behavior and codemod invariants are pinned in `tests/ai-worksheet-grade.test.js`, including retry/blur/idle (`:790-877`), stale verdicts and budget (`:898-967`), and batch/fallback behavior (`:988-1059`).

The common block is a viable migration surface: `rewireHtml()` replaces the injected script in place (`scripts/wire-ai-worksheet-grade.mjs:1065-1085`), and the CLI applies it across every file matching the live-worksheet regex (`:1138-1174`). The manifest suite asserts 69 sorted worksheet entries and loads each real prompt builder in a VM (`tests/frq-regrade-job.test.js:78-91`).

The browser already has a durable transport for a draft that cannot reach roster-server. `gradebook-client.record()` captures a failed network write into `OfflineQueue` (`gradebook-client.js:98-143`, `:200-255`) and replays owned rows on reconnect (`:267-288`, `:418-425`). The IndexedDB queue deduplicates by `source|itemId|attempt`, keeps the latest write, and compare-and-deletes after a successful replay (`offline-queue.js:30-57`, `:150-188`). Therefore Phase 2 should reuse `/ledger/record` and this outbox; it should not create a second browser queue.

**Limit:** the ledger row is a ticket only after the draft reaches roster-server. While offline, the honest state is “saved on this device,” not “queued on the server.” No server worker can see an IndexedDB-only row.

### 2.2 Ledger path

`item_ledger` already has the required identity and pending representation:

- `score` is nullable and the unique key is `(student_id, source, item_id, attempt)` (`roster-server/migrations/0002_item_ledger.sql:3-18`).
- `insertLedgerRow()` performs an upsert on that key (`roster-server/ledger-db.js:33-59`).
- Student writes authenticate the body token and derive `studentId` from it (`roster-server/ledger.js:100-116`).
- The current FRQ floor preserves a stored numeric score against a draft and against a lower sequential score (`roster-server/ledger.js:141-165`). Its sequential behavior is pinned by `roster-server/tests/ledger.test.js:219-246`.
- `POST /ledger/frq-regrade` is teacher-gated, requires an existing exact FRQ row, preserves its response, and refuses a score at or below the stored score (`roster-server/ledger.js:232-295`). Its auth/existing-row/floor contract is pinned at `roster-server/tests/ledger.test.js:255-281`.
- The normal student read is self-scoped by bearer token, with teacher-only cross-student access (`roster-server/ledger.js:298-379`). `gradebookClient.fetchPrior()` uses that route (`gradebook-client.js:294-354`).

The proposed “same floor-respecting path” is directionally right, but it must mean **one shared atomic database operation**, not “the worker makes an HTTP call to the existing handler.” Loopback HTTP adds a secret and failure hop without fixing the read/upsert race.

### 2.3 Recovery job and grader

The proven sweep defines pending as exactly a long, allowlisted `source:'frq'` row whose score is null/undefined and whose age is at least 10 minutes (`tools/regrade-ungraded-frqs.mjs:14-15`, `:40-75`). It evaluates the prompt source in a VM (`tools/frq-regrade-manifest.mjs:19-23`), calls the page builder (`tools/regrade-ungraded-frqs.mjs:88-97`, `:143-148`), sends the client-shaped prompt to `/api/ai/grade`, and applies through `/ledger/frq-regrade` (`:208-280`).

The GitHub Actions copy is hourly at minute 37 and serialized by a workflow concurrency group (`.github/workflows/frq-regrade.yml:13-25`); it uses the teacher secret and `--apply` (`:34-54`). Repository comments say the same job runs on a teacher-box systemd timer (`.github/workflows/frq-regrade.yml:3-8`; `tools/regrade-ungraded-frqs.mjs:333-345`), but **the unit file and its actual installed cadence are UNVERIFIED** because no unit is committed here.

Curriculum-render currently:

- pins DeepSeek primary at 120 RPM / concurrency 4 and uses Groq only after an error (`../curriculum_render/railway-server/server.js:455-480`, `:499-542`);
- owns a concurrent `GradingQueue`, per-provider backoff, failover, and ETA (`../curriculum_render/railway-server/server.js:556-718`);
- exposes ETA through `/api/ai/status` (`:720-733`);
- accepts the caller's `prompt` and uses it directly when present (`:735-760`);
- accepts up to 8 client-supplied prompts at `/api/ai/grade-batch` and falls back per omitted item (`:792-896`).

`sidFromRequest()` can verify a roster bearer token (`../curriculum_render/railway-server/server.js:119-124`), but `/api/ai/grade` and `/api/ai/grade-batch` do not require `sid` before queueing (`:736-760`, `:822-848`). This is both the prompt-integrity hole and a direct cost-abuse surface.

The in-process timer precedent is real but not a distributed-lock precedent: doge-wallet starts an unref'd production-only `setInterval`, catches sweep errors, and skips tests (`roster-server/doge-wallet.js:374-392`).

### 2.4 Prompt corpus measurements

Design-time read-only measurements on this checkout:

| Corpus | Measured value |
|---|---:|
| `ai-grading-prompts*.js` files | 70 |
| Raw bytes | 963,141 |
| Manifest worksheets | 69 |
| Manifest reflection ids | 212 |
| Prototype committed JSON, including worksheet lesson context and split prompt recipes | 1,210,731 bytes pretty / 1,194,372 bytes compact |

The builders are not one uniform schema. For example, U1L1 separately renders required and optional lists (`ai-grading-prompts-u1-l1.js:103-150`), while U4L3-5 renders a different expected-element format plus topic vocabulary and different instructions (`ai-grading-prompts-u4-l345.js:170-227`). A runtime “generic rubric formatter” would create avoidable drift.

The measured artifact is about 1.16 MiB on disk and should occupy only low-single-digit MiB after JSON parsing. That is acceptable for roster-server. The implementation must record actual boot heap delta once; a hard artifact budget of **1.5 MiB pretty JSON** prevents accidental bloat.

---

## 3. Non-negotiable invariants

1. The durable work item is the existing ledger row. No queue table is added.
2. Initial pending means `source='frq' AND score IS NULL`; score `0` is a completed I, never pending.
3. The browser may supply response text, an allowlisted item id, and a readiness hint. It may not supply an authoritative score, prompt, rubric, student id, attempt, prior verdict, or response hash.
4. Roster-server rebuilds the prompt from its committed school-year bundle.
5. No request handler waits on the model. Student POSTs perform bounded validation plus one DB operation and return.
6. No in-process failure may terminate roster-server; no bundle/grader failure may silently fall back to trusting a client grade.
7. A worker, legacy client, appeal, and external sweep may collide without lowering a grade, grading stale text, or issuing a receipt for a losing score.
8. The server worker is default-off and multi-instance safe before it is enabled.
9. Existing offline ownership protection remains intact: a queued row is replayed only under the same student id (`gradebook-client.js:267-288`).
10. Rollback is one environment switch and never requires deleting grades.

---

## 4. Design options

### Option A — accept the client prompt after verifying a prompt-minus-answer hash

The bundle stores a hash for each canonical prompt template. The client sends prompt, answer, and hash; roster-server strips/replaces the answer and compares the hash before forwarding.

**Pros**

- Smallest change to the visible client flow.
- A stale legitimate worksheet can be diagnosed by a hash mismatch.

**Cons**

- The hash is public, so it proves version identity, not authorship. A hostile client can pair the expected hash with an altered prompt unless the server correctly parses and canonicalizes the actual submitted prompt.
- “Prompt minus answer” is ambiguous when an answer contains delimiters, repeated text, quotes, or template-looking content.
- Once the server has enough data to validate the prompt, rebuilding it is simpler and safer.
- It does not close the independent direct-score write at `/ledger/record`.

Use a client template hash only as **shadow telemetry**. Never use it as the authorization decision.

### Option B — ledger ticket + server prompt + leased worker; cut the direct FRQ client call  ★ recommended

The student write creates/updates a null-score ledger row. A DB claim RPC leases stable rows. The worker uses the committed prompt recipe, calls curriculum-render, and atomically applies the result if the response version still matches. The page polls roster-server for status and feedback.

**Pros**

- Removes prompt, score, student id, prior result, and attempt from the student's authority.
- A closed laptop does not cancel work after the server acknowledged the row.
- One model grading per response version; no permanent double-call “preview + authority” tax.
- Reuses the current ledger key, hydration, offline outbox, receipts, floor semantics, and proven sweep logic.
- Leases survive crashes and multiple Railway instances.

**Cons**

- Adds a migration/RPC, status metadata, worker lifecycle, and polling UI.
- Adds approximately one worker tick plus debounce to latency.
- Requires moving appeals to a server-authenticated path; otherwise the numeric-score hole remains through the appeal sink.

### Option C — keep direct client grading as a provisional preview, then server-grade again

The client immediately displays its direct verdict but does not write it; the worker independently produces the grade of record.

**Pros**

- Preserves the fastest possible visible response.
- Useful during shadow rollout to compare two paths.

**Cons**

- Approximately doubles model traffic in steady state.
- A provisional E followed by an authoritative P is worse UX than waiting a few extra seconds.
- Two grouping strategies (client batch versus worker batch) create avoidable verdict disagreement.
- More status and stale-verdict state, while still requiring all of Option B.

Use only for sampled shadow comparison, not as the final architecture.

### Option D — synchronous roster-server proxy

`POST /ledger/frq-grade` rebuilds the prompt, waits for curriculum-render, writes, and returns the verdict.

**Pros:** straightforward single endpoint; no browser-supplied prompt.

**Cons:** ties a student request to model queue time, makes proxy/browser timeouts part of grading, duplicates retry logic, and still needs a durable worker after failure. It violates the “never block a request path” requirement.

---

## 5. Recommended architecture (Option B)

```text
textarea / OfflineQueue
        |
        | POST /ledger/record  (student token; response only)
        v
item_ledger row: source=frq, score=null, response_version=N, ready_at=T
        |                                      ^
        | atomic lease                         | GET /ledger/frq-status?prefix=...
        v                                      |
roster FRQ worker -> server prompt -> curriculum GradingQueue
        |
        | atomic version check + max floor + conditional receipt
        v
same item_ledger row: score=0|0.5|1, result JSON, graded_at
```

### 5.1 Row shape: the row is still the ticket

Add nullable/defaulted columns to `item_ledger`; do not add a table:

| Column | Purpose |
|---|---|
| `frq_response_version bigint not null default 0` | Increment whenever the canonical ungraded response changes. |
| `frq_response_hash text` | SHA-256 of the exact trimmed UTF-8 response used in the prompt. |
| `frq_ready_at timestamptz` | Debounce/coalescing boundary. Routine draft = now + 20 s; blur/Done/manual request = now + 2 s. |
| `frq_claim_token uuid` | Unpredictable ownership token returned only to the worker. |
| `frq_claim_owner text` | Diagnostic instance id; never an auth boundary. |
| `frq_claimed_until timestamptz` | Lease expiry; a crashed worker's row becomes claimable again. |
| `frq_retry_count int not null default 0` | Retry/backoff state. |
| `frq_next_attempt_at timestamptz` | Earliest retry time. |
| `frq_last_error text` | Sanitized operational category, not provider payload. |
| `frq_result jsonb` | Sanitized `{score,feedback,matched,missing,suggestion,provider,model}` returned to the student. |
| `frq_rubric_version text` | School-year bundle digest used for this verdict. |
| `frq_appeal_count int not null default 0` | Durable enforcement of the existing maximum of three appeals. |
| `frq_appeal_pending jsonb` | Server-validated `{text,requestedAt,version}`; null unless an appeal is queued. |

Reuse the existing `graded_at` column (`roster-server/migrations/0002_item_ledger.sql:15-17`) rather than adding another completion timestamp.

Status is derived, not separately mutable:

| Derived state | Predicate |
|---|---|
| `draft` | score null, response shorter than 20 or `ready_at` absent |
| `queued` | score null, eligible, no live lease |
| `grading` | score null, live lease |
| `retrying` | score null, no live lease, `next_attempt_at > now` |
| `graded` | score is `0`, `0.5`, or `1` |
| `appeal-queued/grading` | numeric score plus non-null appeal request / live lease |
| `failed` | permanent artifact/item validation error; score remains null and teacher alert is raised |

An ordinary model/network failure is `retrying`, not a terminal I and not “failed forever.” Backoff is 5 s, 15 s, 60 s, then capped at 5 minutes with jitter; retry indefinitely while the row remains valid.

### 5.2 Exact HTTP and auth contract

#### Existing `POST /ledger/record` — student ticket ingress

Keep the current token-in-body shape for cached clients and OfflineQueue compatibility. In `FRQ_GRADE_MODE=authoritative`, when `source === 'frq'`:

1. `verifyToken(token)` determines the only possible `studentId`.
2. Require `itemId` to be an exact key in the server bundle.
3. Require `attempt` absent or exactly `1`; store `1`. Later attempts remain teacher-only until a separate attempt policy exists.
4. Canonicalize `response = String(response).trim()`, cap at 8 KiB, and compute the hash server-side.
5. Ignore any client `score` and return `clientScoreIgnored:true`. Do **not** reject the row: an old cached page or offline record may contain its former numeric result, and its response still needs to become a ticket.
6. Treat a present legacy score or new `requestGrade:true` only as a readiness hint; neither changes the grade.
7. If the exact row is already graded, do not replace its signed response. Return 200 `{ok:true, applied:false, status:'graded'}` so old OfflineQueue entries drain instead of retrying forever.
8. If the row is ungraded, call the atomic draft RPC and return 200 `{ok:true, ledgerId, status, responseVersion}`.

In `off` and `shadow`, preserve the legacy client score behavior for rollback/comparison. This is deliberately less secure; the go-live runbook must say so.

#### New `GET /ledger/frq-status?prefix=WS-...` — self status

Require `Authorization: Bearer <roster token>`. Derive the student from the token; there is no `studentId` parameter. Require an exact worksheet prefix from the bundle and return only that student's allowlisted FRQ rows:

```json
{
  "ok": true,
  "mode": "authoritative",
  "bundleVersion": "SY2627:<sha256>",
  "items": {
    "WS-U1L1-reflect1": {
      "status": "queued",
      "score": null,
      "responseHash": "...",
      "retryAt": null,
      "estimatedWaitMs": 9000
    }
  }
}
```

For `graded`, include sanitized feedback fields and the signed receipt. Never return prompt text, rubric data, claim tokens/owners, provider errors, or another student's row.

#### New `GET /ledger/frq-config` — mode/canary capability

Require a roster bearer token so canary selection can be student-specific. Return only `mode`, `bundleVersion`, `pollMs`, and whether this student is authoritative. The injected client reads this at load and before a manual grade action; cache for at most 60 seconds.

#### New `POST /ledger/frq-appeal` — bounded student appeal

Require a roster bearer token and body `{itemId, appealText}`. The server loads the student's existing row/result, enforces the committed item, numeric prior score, a minimum 10-character appeal, maximum 2 KiB, exact-text dedup, cooldown, and the current maximum of three appeals. It atomically increments the count and queues `frq_appeal_pending`; the request never calls the model.

The worker constructs the appeal prompt from the server-owned rubric, stored response, stored prior result, and appeal text. It may only raise the score. This replaces the current client-supplied appeal scenario/previous result and client-side clamp (`u1_lesson1_live.html:1753-1766`, `:1780-1821`).

An edited answer after a numeric grade does **not** silently open a new automatic model attempt. The page marks the authoritative answer graded and routes disagreement through the bounded appeal path. This intentionally removes unlimited changed-text score farming.

#### Existing `POST /ledger/frq-regrade` — teacher/external net

Keep `requireTeacher` and existing-row-only behavior. Add required `responseHash` and `rubricVersion` in authoritative mode, then call the same atomic verdict service as the worker. A stale external sweep receives `409 stale-response`; a floor-held duplicate receives 200 `applied:false`.

#### Worker — no HTTP auth surface

The worker calls DB methods directly and never calls roster-server through its own teacher endpoint. Its curriculum-render request uses a server-to-server secret. The separate grader must require either that secret or a valid roster token on all public AI grading endpoints, with per-sid/IP limits; merely parsing an optional sid as it does today is insufficient.

### 5.3 Worker lifecycle and claim algorithm

Environment:

| Variable | Default | Contract |
|---|---:|---|
| `FRQ_GRADE_MODE` | `off` | `off`, `shadow`, or `authoritative`; unknown value fails to `off`. |
| `FRQ_GRADE_POLL_MS` | `2000` | Minimum 1,000; interval between claim ticks. |
| `FRQ_GRADE_LEASE_MS` | `120000` | Must exceed grader timeout + queue allowance; expired leases are recoverable. |
| `FRQ_GRADE_CLAIM_LIMIT` | `8` | Matches curriculum batch maximum. |
| `FRQ_GRADE_MAX_IN_FLIGHT` | `4` | Never exceed the grader primary pool. |
| `FRQ_GRADE_MAX_RPM` | `20` initially | Proven sweep rate; may ramp toward 60 only after shadow latency/cost evidence. |
| `FRQ_GRADER_URL` | none | Missing means worker stays disabled/degraded. |
| `FRQ_GRADER_SECRET` | none | Required outside `off`; never sent to a browser. |

`startFrqGradeWorker()` follows the doge timer's production/test/unref precedent but lives in a small module, not inside a request handler. Each tick:

1. Return early if mode is off or a local tick is already running.
2. Call `claim_frq_tickets(workerId, allowlistedItemIds, limit, leaseMs, now)`.
3. The RPC selects eligible null-score rows (or bounded pending appeals) with `FOR UPDATE SKIP LOCKED`, updates each with a fresh claim token/expiry, and returns the claimed snapshot in the same transaction.
4. Group initial claims by `(student_id, worksheet prefix)` so two or more reflections use `/api/ai/grade-batch`; use `/api/ai/grade` for a singleton. Never mix duplicate `questionId` keys from different students in one batch.
5. Build every prompt locally from the server bundle. Do not send the browser prompt/hash.
6. Apply each usable verdict separately through `apply_frq_verdict`; a partial batch failure releases/retries only the missing item. Curriculum's existing per-item fallback remains a second defense (`../curriculum_render/railway-server/server.js:860-868`).
7. On error, call `fail_frq_claim` with an error category and next-attempt time. Catch per item, per batch, and around the whole tick. `finally` clears the local `running` flag.

The interval callback must attach `.catch()`; no floated promise or thrown bundle parse may become an unhandled rejection. Bundle failure reports degraded health and leaves rows pending. It must not take down `/health`, auth, ledger reads, or unrelated writes.

### 5.4 Atomic floor, idempotency, and stale-response proof

The current floor cannot prove concurrency safety. Counterexample:

```text
worker A reads null       sweep B reads null
worker A upserts 1.0      sweep B upserts 0.5  <-- later write lowers to 0.5
```

The same race exists between a draft that read null and a verdict that writes 1.0: the later draft can restore null. Tests that await one request and then the next do not exercise this interleaving.

Phase 2 requires SQL/RPC serialization:

**`record_frq_draft`**

- Locks/upserts the unique row.
- If a numeric score exists, preserves both score and the response bound to its receipt.
- If score is null and canonical response changed, increments version, stores hash/text, resets retry state, invalidates any old claim, and moves `ready_at`.
- Never accepts a score parameter.

**`apply_frq_verdict`**

- Identifies the row by `ledger_id` plus claim token (worker) or exact teacher authorization path.
- Requires the claimed `response_version` and `response_hash` still match.
- Computes the new score atomically:

```sql
case
  when item_ledger.score is null then p_score
  when p_score is null then item_ledger.score
  else greatest(item_ledger.score, p_score)
end
```

- Writes result/`graded_at` only when it applies the initial score or a genuine raise.
- Returns `{applied, stale, previous_score, score, ledger_id}` from the locked row.

**Why duplicates are safe:** the unique key gives one row; the lease normally gives one worker; a second claimant after lease expiry may still finish, but version/hash reject stale text and the atomic `greatest` makes the final score `max(old, all valid incoming scores)` independent of completion order. A score of `0` is numeric, so a duplicate I is floor-held and the row is not selected again.

**Receipts:** issue/persist a receipt only for `applied:true`. Persist it through `updateLedgerReceiptIfScore(ledgerId, score, responseHash)`, not the unconditional current helper. Otherwise a slower 0.5 receipt could overwrite the receipt columns after a faster 1.0 raise even when the numeric floor held. Snapshot verification already binds receipt owner/item/source/score/attempt and primitive response hash (`roster-server/snapshot-verify.js:60-99`).

### 5.5 Server-owned rubric bundle and shared prompt builder

Create:

- `scripts/build-frq-rubrics.mjs`
- `roster-server/data/frq-rubrics.SY2627.json`
- `roster-server/frq-prompt.js`

Do not copy 70 heterogeneous JavaScript builder implementations into roster-server and do not evaluate them at runtime. The generator evaluates them only at build time using the proven VM mechanism.

The committed artifact stores a **materialized rubric recipe** rather than pretending the existing objects have one schema:

```json
{
  "schema": "apstats-frq-rubrics/v1",
  "schoolYear": "SY2627",
  "sourceDigest": "sha256:...",
  "worksheets": {
    "WS-U1L1": {
      "filename": "u1_lesson1_live.html",
      "topic": "AP Statistics - Topic 1.1: Topic 1.1",
      "lessonContext": "...",
      "items": {
        "reflect1": {
          "promptBeforeAnswer": "...",
          "promptAfterAnswer": "...",
          "samplePromptSha256": "..."
        }
      }
    }
  }
}
```

The one runtime builder is deliberately boring:

```js
export function buildServerReflectionPrompt(registry, prefix, textareaId, answer) {
  const item = registry.worksheets[prefix]?.items?.[textareaId];
  if (!item) throw new Error(`unknown FRQ item: ${prefix}-${textareaId}`);
  return item.promptBeforeAnswer + answer + item.promptAfterAnswer;
}
```

Generator hard gates, for every `(prefix, textareaId)`:

1. Load the exact prompts file and page builder named by the current manifest.
2. Call it with a high-entropy fixed sample answer.
3. Require the sample marker to occur **exactly once**. A design-time probe found exactly one occurrence in all 212 current outputs; a future transformed/repeated answer must fail generation.
4. Split before/after that marker, call the shared builder with the same sample, and require byte-for-byte equality with the page builder output.
5. On divergence, fail nonzero and list prefix, textarea id, source file, builder name, first differing byte, expected SHA-256, and actual SHA-256.
6. Rebuild the whole artifact in memory and compare it to the committed JSON in tests; missing regeneration is a failure.
7. Require exactly 69 unique prefixes, 212 unique full item ids, no extra textarea rubric, and pretty artifact size at most 1.5 MiB.

The fixed sample is the required contract. Add a second quote/newline/adversarial sample as defense, but do not relax byte equality by normalizing whitespace or line endings.

**Prompt decision:** roster-server rebuilds. An optional `clientTemplateHash` may be logged in shadow mode to expose stale pages, but it never selects a rubric or authorizes a grade. This gives integrity without accepting drift risk: drift becomes a build failure, not a runtime client/server negotiation.

### 5.6 Client/codemod contract and visible states

Keep the current fill-in-the-blank `/api/ai/grade-worksheet` branch unchanged except for adding required roster auth/rate-limit compatibility. In the FRQ portion of `INJECTED_JS`:

1. Fetch `/ledger/frq-config` after identity/hydration.
2. In `off` or `shadow`, retain the existing direct `_aiBatchGrade` / `_aiGradeWithRetry` path. Shadow clients may send `clientTemplateHash` telemetry.
3. In `authoritative`, `_aiGradeFrqs` does **not** call `_aiGraderFn`, `buildReflectionPrompt*`, `/api/ai/grade`, or `/api/ai/grade-batch`. It calls a new `gradebookClient.requestFrqGrade({itemId,response})`, which uses `/ledger/record` with `requestGrade:true` and the existing OfflineQueue.
4. In authoritative mode, the `recordReflectionToGradebook` wrapper must not call the original numeric sink for a model/appeal result. Old cached clients remain safe because the server ignores their score.
5. Poll `/ledger/frq-status?prefix=...` every 2 s only while at least one visible item is pending; stop on all-terminal, page hidden, or 2 minutes, and resume on visibility/online/manual action.
6. Reuse `showFeedback()` only with roster-server's stored `frq_result`. Never render a direct curriculum verdict as authoritative.
7. Replace/wrap `submitAppeal` so authoritative mode posts only item id + appeal text to roster-server and polls; legacy mode retains the current function.
8. On `blur`, Check Answers, manual Grade with AI, hidden, and pagehide, flush the latest response with `requestGrade:true`. On ordinary input, the existing draft save remains and receives the 20 s readiness debounce.
9. Continue stale-text protection by comparing the status `responseHash` to the current textarea before rendering. A verdict for old text is never painted onto new text.

All worksheet changes remain expressible in the single injected block and are rolled out with:

```text
node scripts/wire-ai-worksheet-grade.mjs --rewire --apply
```

Student-visible copy is contractual:

| State | What the student sees |
|---|---|
| Local only / offline | `Saved on this device · waiting for a connection to queue grading.` Never say “queued.” |
| `draft` | `Answer saved · grading starts after you pause or leave the box.` |
| `queued` | `✓ Saved · queued for grading` plus an honest ETA when available. |
| `grading` | `⏳ Grading… ~N s` (or no ETA if unavailable). |
| `graded` in this session | Existing E/P/I badge and the server-stored feedback/matched/missing/suggestion. |
| Graded while away | `✓ Graded while you were away: Essentially/Partially Correct/Incorrect` and the normal feedback; announce through `aria-live` once. |
| `retrying` | `⚠ Saved. The grader is unavailable; retrying automatically around <time>.` Never display I for infrastructure failure. |
| Permanent artifact failure | `⚠ Saved, but grading needs teacher help.` Include no internal error; send an operational alert. |
| Already graded, edited locally | `This response is already graded. Use Appeal to request review.` Do not imply the edit changed the recorded answer. |

“Graded while away” is determined from `graded_at` versus a per-student/item `lastSeenGradedAt` local marker; the marker is UX only, never grade state.

### 5.7 Curriculum-render boundary

The worker can reuse the existing `/api/ai/grade`, `/api/ai/grade-batch`, and `/api/ai/status` behavior, but the grade endpoints need an auth/rate wrapper in the separate curriculum-render repo:

- Worker calls carry `x-roster-grader-secret`; compare in constant time.
- Legacy browser calls must carry a valid roster bearer token and are limited per sid and per IP. New rewired clients add the header; old cached clients in authoritative mode rely on their roster ticket, not the direct result.
- Enforce prompt/answer/body byte limits before queueing. Keep batch max 8.
- Count batch **items**, not just HTTP requests, against abuse limits.
- Leave provider RPM/concurrency in `GradingQueue`; the roster worker's DB/RPM budgets are the authoritative cost boundary.

Without this change, a hostile student still cannot write a grade after roster hardening, but can call the public grader directly and consume quota. That residual is not acceptable for “cannot DoS the grader.”

---

## 6. Threat model and rate limits

| Hostile action | Required result |
|---|---|
| Grade another student | Impossible through student endpoints: no student id is accepted; token determines sid. Cross-student status is forbidden. |
| Invent an FRQ/item | 400 unless exact bundle item id. Unknown legacy rows are never sent to the model. |
| Submit `score:1` | Ignored in authoritative mode and recorded only as a response/readiness ticket. Structured security counter increments. |
| Supply a malicious prompt/hash/rubric | Fields are not accepted. Optional client hash is telemetry only. |
| Forge attempt 999 | 400; student attempt is fixed at 1. Teacher route may target an existing explicit attempt. |
| Replay identical request | Idempotent: same unique row + same response hash/version; no new version, claim, call, or grade. |
| Edit while grading | Draft RPC increments version and invalidates lease; old verdict returns `stale:true` and is discarded. |
| Regrade unchanged answer to farm model variance | Not claimable after numeric score; identical appeals dedup; maximum three appeals is server-enforced. |
| Submit many changed answers | Only the initial ungraded response auto-grades. After grading, response/receipt binding is immutable; changed answer uses bounded appeal/teacher review. |
| Fill all known worksheets to burn tokens | Per-sid claim budgets, exact one initial grade per item, response byte cap, and global RPM/in-flight limits bound cost. |
| Hit curriculum-render directly | Valid roster token + per-sid/IP limits required; unauthenticated call is 401. Internal secret bypass is server-only and independently RPM-capped. |

Recommended initial limits:

| Limit | Value | Reason |
|---|---:|---|
| Ticket/draft ingress per sid | 30/min | Above normal 400 ms-debounced writing, below a tight loop. |
| Ticket ingress per IP | 300/15 min | A whole class may share one school NAT; IP is a secondary throttle. |
| New claims per sid | 6/10 min and 20/hour | Mirrors the current page's 6/10 min auto budget and allows several worksheets without a burst. |
| Appeals | 3/item, 1/min, exact-text dedup | Preserves current UI maximum but makes it durable/server-enforced. |
| Response | 8 KiB | More than enough for a worksheet reflection; bounds model cost. |
| Appeal text | 2 KiB | Bounds model cost. |
| Worker | 20 requests/min initially, 4 in flight | Matches the proven sweep rate and does not exceed the grader pool. |

The existing `createRateLimiter` is explicitly in-memory/single-instance and not an auth boundary (`roster-server/rate-limit.js:1-17`). It is acceptable for IP ingress shedding, but claim budgets and dedup must be enforced in PostgreSQL so another Railway instance does not multiply the limit.

---

## 7. Cost and volume

The requested planning case is:

```text
37 students × ~70 worksheets × ~3 reflections = ~7,770 item verdicts/year
```

The committed manifest is close: 37 × 212 = **7,844 item verdicts** across 69 worksheets. If all reflections on a page coalesce into one batch, that is about 37 × 69 = **2,553 batch requests**. If students submit reflections far apart, the upper bound is one request per item, **7,844 requests**, before appeals or curriculum's per-item fallback.

Compared with today:

- The current client already batches two or more reflections and falls back per item (`scripts/wire-ai-worksheet-grade.mjs:388-418`). Replacing it with the worker is approximately call-neutral and may be cheaper because the DB dedup survives reloads/devices.
- A permanent client preview plus server authority would approach 2× traffic; this is why Option C is shadow-only.
- Shadow mode deliberately adds sampled duplicate calls. Cap the sample (for example 20% of eligible rows) and include it in the rollout budget.
- The external sweep should normally find zero rows after authority is healthy. It is a recovery cost, not a second steady-state grader.
- Curriculum batch may make extra per-item calls when a model omits results (`../curriculum_render/railway-server/server.js:860-868`); measure `model_calls`, not only roster worker HTTP requests.
- Appeals are extra and remain capped at three per item, matching the current visible maximum (`u1_lesson1_live.html:1753-1766`). Track them separately rather than hiding them in initial-grade volume.

Operational metrics, tagged by bundle version but not raw student answer:

- tickets created, claimed, stale-discarded, retried, graded, floor-held, and permanently failed;
- queue age p50/p95/max and `created_at -> graded_at` p50/p95;
- batch size distribution, curriculum HTTP requests, actual model calls, and tokens/cost;
- client score ignored count (should fall after rewire; attacks/cached pages stay visible);
- response-version churn while claimed;
- external sweep `found` count and oldest age;
- E/P/I distribution and shadow disagreement matrix.

---

## 8. Migration, rollout, and rollback

### Stage 0 — schema/artifact/code deployed, flag off

1. Apply additive columns and RPC migration.
2. Generate and commit `frq-rubrics.SY2627.json`; require 212/212 byte parity and artifact size gate.
3. Deploy roster and curriculum auth/rate changes with `FRQ_GRADE_MODE=off` (the default).
4. Verify health exposes bundle digest, mode off, zero timers/claims, and no behavior change.
5. Rewire the 69 pages; while mode is off they still execute legacy behavior.

### Stage 1 — shadow, no grade writes

Set `FRQ_GRADE_MODE=shadow`. Current client scores remain authoritative. A deterministic sample of recent FRQ rows is rebuilt and graded by the server; shadow may persist operational comparison metadata, but **must not update `score`, `graded_at`, receipt columns, or student feedback**.

Go/no-go gate:

- hard: bundle parity **212/212**, zero unknown item ids, zero prompt-byte divergences;
- sample: at least 100 paired verdicts across at least 10 worksheets and all observed score bands;
- exact score agreement at least 95%, no E↔I two-band disagreement, and human-reviewed server-worse disagreement at most 1%;
- infrastructure: zero permanent failures, retry recovery at least 99%, no process crash/unhandled rejection;
- latency: at least 95% of normally loaded tickets graded within 60 s and p50 within 15 s;
- no atomic-floor/receipt mismatch in concurrency tests or shadow logs.

Model nondeterminism means 100% verdict equality is not realistic; **100% prompt equality is mandatory**. Every E↔I or systematic batch/singleton disagreement blocks rollout.

### Stage 2 — authoritative canary

Use the authenticated config endpoint plus a server allowlist/deterministic canary to enable authority for teacher test accounts, then a small student subset. For canary students, client scores are ignored, ticket/status UI is active, and the worker writes. Run at least one offline/reconnect, close-page, stale-edit, appeal, grader-5xx, and expired-lease exercise.

### Stage 3 — authoritative for all 37 students

Set the canary to 100%. Keep alerting on oldest pending row (>15 minutes), ignored client scores, permanent failures, and external sweep finds. Do not raise worker RPM until cost and p95 evidence justify it.

### One-switch rollback

Set `FRQ_GRADE_MODE=off` and redeploy roster-server. This:

- stops new worker claims/writes;
- makes `/ledger/frq-config` tell rewired pages to use the retained legacy path;
- restores legacy FRQ numeric acceptance for rollback only;
- leaves null tickets for the external sweep and leaves applied grades untouched.

In-flight processes must stop on deploy; any late duplicate is still floor/version guarded. The rollback intentionally reopens the old client-trust risk, so it is an emergency state with an alert, not an acceptable steady state.

### External safety nets

1. **GitHub Action:** keep hourly during shadow and the first 7 authoritative days, updated to use the committed server bundle and send response hash/rubric version through the atomic teacher path. Then reduce to once daily (03:37 JST / 18:37 UTC) as the independent third net. `found > 0` for rows older than 15 minutes alerts.
2. **Teacher-box systemd:** after 7 healthy authoritative days, retire it to avoid a third concurrent secret-bearing executor. Until then it may remain, but it must use the updated hash/version request. Its installed unit/cadence must be inventoried first because it is UNVERIFIED in this repository.
3. **CLI:** keep `tools/regrade-ungraded-frqs.mjs` as a manual/daily recovery tool and dry-run reporter. Remove runtime VM prompt evaluation in favor of the same committed bundle/shared builder.

---

## 9. Edge cases

| # | Case | Required behavior |
|---|---|---|
| E1 | Offline before server acknowledgement | Existing OfflineQueue stores latest owned response. UI says local-only. On replay, `/ledger/record` creates the ticket; only then status becomes queued. |
| E2 | Old offline/cached client includes a numeric score | Authoritative server ignores the score, accepts the response/readiness hint, returns `clientScoreIgnored:true`, and grades server-side. |
| E3 | Response under 20 characters | Save as `draft`, do not claim or spend a model call. This matches the current selection threshold (`tools/regrade-ungraded-frqs.mjs:50-52`). |
| E4 | Pause while still typing | Routine draft sets 20 s readiness. Each changed draft increments version/moves readiness. Blur/Done sends the explicit 2 s readiness hint. |
| E5 | Edit after claim | Draft atomically invalidates claim/increments version. Old verdict is stale and cannot write or render. |
| E6 | Worker and external sweep grade concurrently | Both use atomic apply. Final score is max; losing/equal result does not overwrite result/receipt. |
| E7 | Draft and verdict race | Draft RPC preserves any numeric score; verdict version check rejects old response. Null cannot overwrite numeric. |
| E8 | Score is 0 | Completed I. Never selected as pending; later lower/equal writes floor-hold. |
| E9 | Duplicate delivery/redeploy | Same response hash/version is idempotent. Expired lease may create duplicate model work but not duplicate/lower grade. |
| E10 | Multiple Railway instances | DB `SKIP LOCKED` lease/claim is the arbiter. In-memory flags and timers are not relied on. |
| E11 | Process dies after claim | Lease expires; another instance reclaims. No request or row is permanently stuck. |
| E12 | Process dies after model response before apply | Lease expires and item may be graded again; atomic apply/dedup keeps one outcome/floor. This is at-least-once execution, idempotent application. |
| E13 | Grader 429/5xx/timeout | Release with bounded backoff; keep score null and show retrying. Never convert infrastructure failure to I. |
| E14 | Batch omits/malforms one item | Apply valid siblings; retry only missing item. Reject non-E/P/I exactly as current sweep does (`tools/regrade-ungraded-frqs.mjs:79-85`). |
| E15 | Unknown bundle id / missing rubric | Student ingress 400 for new row. Pre-existing unknown row is not sent to model; permanent alert with no score. |
| E16 | Bundle corrupt/missing at boot | Worker is degraded/off, roster service stays up, client score remains ignored in authoritative mode. Operator may explicitly roll back. |
| E17 | Same item already graded, student edits | Do not mutate response bound to receipt and do not auto-regrade. Return graded status and offer bounded appeal. |
| E18 | Appeal replay/farming | Appeal count/cooldown/dedup enforced in DB; maximum three; server reads prior answer/result and prompt. Only a raise applies. |
| E19 | Attempt > 1 from student | 400. Teacher may regrade only an already-existing explicit attempt. |
| E20 | Huge/adversarial answer | Reject over 8 KiB before DB/model. Treat all answer text as data inserted into a fixed server recipe; never as prompt control metadata. |
| E21 | Graded while page closed | Worker completes. On next authenticated hydration, status renders server result and “graded while you were away.” |
| E22 | Status poll fails | Keep answer/ticket state; show saved/retrying connection copy, back off polling, resume on online/visibility. Do not invoke direct grader in authoritative mode. |
| E23 | Shadow disagreement | Log score matrix/bundle/batch mode without response text; never write grade. E↔I blocks rollout and requires human review. |
| E24 | Rollback with pending leases | Deploy stops worker; leases expire. External sweep may recover. Existing scores remain monotone. |

---

## 10. Required implementation surface

| File/area | Contracted change |
|---|---|
| `roster-server/migrations/0031_frq_grade_tickets.sql` | Add row metadata, indexes for pending/lease scan, atomic draft/claim/apply/fail/appeal RPCs, and grants restricted to the service role. |
| `roster-server/ledger-db.js` | Wrap the RPCs; add conditional receipt update. Do not implement claim as a client-side select+update. |
| `roster-server/frq-prompt.js` | Load/validate frozen bundle and expose the one split-recipe builder plus item lookup/digest. |
| `roster-server/frq-worker.js` | Pure/injectable tick + production unref'd timer, grouping, rate/concurrency gate, retry, health counters. |
| `roster-server/ledger.js` | Authoritative FRQ branch on `/ledger/record`; self status/config; appeal route; teacher route calls shared atomic apply. |
| `roster-server/server.js` | Minimal health/startup wiring only. Avoid changing `createApp`'s already-wide signature; let the ledger mount own injected dependencies or use a stable bundle module. |
| `scripts/build-frq-rubrics.mjs` | Build/check committed bundle from the real manifest/builders; exact parity and loud divergence report. |
| `roster-server/data/frq-rubrics.SY2627.json` | Generated committed artifact; projected 1,210,731 bytes pretty with current schema/data. |
| `scripts/wire-ai-worksheet-grade.mjs` | Mode fetch, authoritative ticket request/status poll, authoritative sink/appeal interception, exact state UI; retain legacy branch for rollback. |
| 69 `u*_lesson*_live.html` files | Mechanical `--rewire --apply` output only; no hand edits. |
| `gradebook-client.js` / `offline-queue.js` | Carry `requestGrade`/ticket result through record/outbox; preserve owner/latest-wins behavior. |
| `tools/regrade-ungraded-frqs.mjs` | Use shared bundle, include response hash/rubric version, consume atomic stale/floor outcomes. |
| `.github/workflows/frq-regrade.yml` | Keep hourly initially, then daily after explicit rollout gate. |
| `../curriculum_render/railway-server/server.js` | Require internal secret or roster token, apply body/per-sid/per-IP limits, preserve queue/status/batch behavior. |

Index the new pending scan on the claim predicate, at minimum `(source, score, frq_ready_at, frq_next_attempt_at, frq_claimed_until)` with a partial `WHERE source='frq' AND score IS NULL`. Confirm the actual Postgres plan before enabling; a table-wide 2 s scan is not acceptable.

The existing snapshot serializes only canonical row/receipt fields (`roster-server/admin-snapshot.js:34-50`). Score/response/receipt remain the recovery authority. Decide explicitly whether `frq_result` is included as optional convenience metadata; losing feedback on disaster restore is acceptable only if documented. Do not put claim/lease/error fields in signed backups.

---

## 11. Test plan (named suites)

| Suite | Required cases |
|---|---|
| `tests/frq-rubric-bundle.test.js` **new** | Rebuild equals committed JSON; 69 prefixes/212 ids; all source builders load; sentinel exactly once; shared builder byte-equals every page builder for fixed + adversarial samples; duplicate/missing/extra ids fail; artifact ≤1.5 MiB. |
| `roster-server/tests/frq-tickets.test.js` **new** | Mode default off; authoritative exact allowlist; token determines sid; no cross-student/status leakage; attempt fixed 1; 8 KiB cap; client score ignored; old cached score becomes ticket; already-graded row returns 200/no mutation; derived status/result redaction. |
| `roster-server/tests/frq-worker.test.js` **new** | No timer in off/test; timer unref; no overlapping local ticks; DB claim injection; group batch/single; max 4; rate gate; partial batch; 429/5xx/bad verdict retry; permanent bundle failure; tick never rejects/crashes. |
| `roster-server/tests/frq-ticket-rpc.integration.test.js` **new, real Postgres** | Two simultaneous claims yield one lease; expired lease reclaim; draft-vs-grade race; 1.0-vs-0.5 race in both orders; score 0 terminal; stale version/hash rejected; identical apply idempotent; conditional receipt cannot regress. Fake sequential DB tests are insufficient for this suite. |
| `roster-server/tests/ledger.test.js` | Preserve existing non-FRQ contracts and sequential floor tests (`:219-281`); add mode-off compatibility and teacher hash/version/stale outcomes. |
| `tests/ai-worksheet-grade.test.js` | Preserve the current 73-test behavior under off/shadow; authoritative path makes zero direct FRQ grader calls, sends readiness ticket, polls, stops polling, renders every contracted state, rejects stale hash, hydrates while-away, and routes appeal server-side. Blanks remain unchanged. |
| `tests/gradebook-client.test.js` | `requestGrade` survives POST and OfflineQueue; queued status is honest; old scored offline row drains successfully when server says score ignored/already graded; ownership and newer-edit compare/delete remain. |
| `tests/offline-queue.test.js` | Latest response/readiness wins for same FRQ key; score field from legacy record cannot affect authoritative server fixture; reconnect and pagehide capture. |
| `tests/frq-regrade-job.test.js` | Replace VM-at-runtime assertions with bundle parity/shared builder; exact hash/version request; stale response; floor-held duplicate; mode-independent external recovery; workflow cadence transition. Preserve current selection/verdict tests (`:103-174`) and HTTP failure coverage (`:176-274`). |
| `roster-server/tests/admin-snapshot.test.js`, `admin-restore.test.js`, `snapshot-verify.test.js` | Grade/response/receipt round trip remains valid; optional result metadata policy pinned; claim tokens/errors never exported; conditional winning receipt verifies. |
| `../curriculum_render/railway-server/* grading tests` | Unauthenticated grade/batch/appeal rejected; valid roster token limited; internal secret accepted; item/body caps; batch max 8; queue concurrency/ETA/failover unchanged. |
| rollout smoke | One real test student: online blur, offline close/reopen, three same-page batch, edit during grading, I verdict, appeal, Railway restart after claim, two worker instances, and GitHub sweep collision. Verify ledger row + receipt after each. |

Before any implementation commit, run GitNexus `detect_changes({scope:'compare', base_ref:'master'})` and confirm only the expected grade-ticket, worksheet injection, offline transport, snapshot, and recovery flows are affected.

---

## 12. Blast radius and effort

GitNexus was current at commit `f961e8c` when this spec was written.

| Target | GitNexus / material risk | Notes |
|---|---|---|
| `roster-server/ledger.js:mountLedger()` | **HIGH — 62 upstream symbols, 2 direct, 1 process, 3 modules** | Central write/read/auth contract. Direct tests plus broad app-mount fanout. |
| `roster-server/server.js:createApp()` | **CRITICAL — 65 upstream symbols, 36 direct, 2 processes, 4 modules** | Avoid a signature change. A one-line mount/health change still requires the broad server suites. |
| `roster-server/ledger-db.js:insertLedgerRow()` | Graph reported LOW/0 upstream, but **materially CRITICAL** | The graph misses dynamic injected DB calls. Do not retrofit generic upsert semantics; add FRQ-specific RPC wrappers. |
| `tools/regrade-ungraded-frqs.mjs:runRegradeJob()` | LOW — 3 upstream, 2 direct, 1 process | External recovery behavior is well-contained by `tests/frq-regrade-job.test.js`. |
| `scripts/wire-ai-worksheet-grade.mjs:rewireHtml()` | Graph LOW — 3 upstream, 1 direct | Material fan-out is 69 generated HTML files and the large injected-block suite. |
| `gradebook-client.js` / `offline-queue.js` | **HIGH grade-durability risk** | Shared by every grade-bearing worksheet record, offline pack, and reconnect drain. Changes must be additive. |
| SQL claim/floor RPC | **CRITICAL grade integrity** | The only concurrency authority. Requires real-Postgres race tests, not just mocked request tests. |
| receipts/snapshot/restore | **HIGH durability risk** | Winning score, response, and receipt must stay bound. Claim metadata must not leak into backup contracts. |
| curriculum-render grader auth | **HIGH cross-repo availability/cost risk** | Queue/model code stays unchanged; auth/rate wrapping can break every current caller if legacy/token handling is incomplete. |
| grade math | Indirect, grade-affecting | E/P/I numeric values remain `1/0.5/0`; the change is who may author them and when they become visible. |

**Effort estimate**

| Work | Estimate |
|---|---:|
| Bundle generator, artifact, shared builder, parity suite | 0.5–1 day |
| Migration/RPC, DB wrappers, concurrency integration suite | 1 day |
| Worker, status/config/appeal routes, health/metrics | 1 day |
| Client/offline/codemod UI + 69-file rewire + tests | 1 day |
| Curriculum auth/rate wrapper + cross-repo tests | 0.5 day |
| Shadow/canary observation | at least 24 clock hours, not engineering time |

Total: **3–4 focused engineering days**, assuming the Supabase migration and curriculum-render deployment credentials are available. Do not compress the database race test or shadow gate to meet the school-year date; the two newly identified trust/concurrency defects are exactly where rushed implementation would create a false sense of safety.


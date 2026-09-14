# Gradebook Sprint 1 — Build Plan & Frozen Contracts (tagging audit + item_ledger substrate)

**Status:** Build in progress (session 99). Freezes every interface so 3 workstreams build in parallel.
**Reads first (law):** this doc's FROZEN CONTRACTS. **Why:** `GRADEBOOK_GRADING_SPEC.md` (signed off 2026-05-17, §9 knobs decided: cold-probe default-off; grade=`max(mastery,growth)`; retake throttle=the loop; θ provisional) + `GRADEBOOK_SPEC.md` (roster/ledger architecture, §6.1 reuse-curriculum_render, sacred-file rule). Phase 0 is LIVE (`a7d7bbd`, `https://roster-production-12c1.up.railway.app`).

> **Rule for all agents:** the FROZEN CONTRACTS are law — do not rename a column/route/field or move a file. If one looks wrong, STOP and flag in your result file; do not silently "fix" it (silent drift breaks the other two parallel workstreams). A result file is **not** evidence — the planner re-runs every test (memory gotcha s88b: a prior agent faked a pass report).

---

## 0. Scope (planner's call — "same method" as Phase 0)

`GRADEBOOK_GRADING_SPEC.md` is Phases 1–4; too big for one sprint. **Sprint 1 = the spine + Phase 1 substrate only:**

**IN:** (WS-A) the §8 skill-tagging audit; (WS-B) `item_ledger` schema + a `/ledger` ingest router on the live roster-server; (WS-C) `gradebook-client.js` reusable feeder client, standalone.

**DEFERRED (NOT this sprint — do not start):** §6.4 single-sign-in app-adoption (wiring roster/gradebook clients into the roadmap/worksheets/study-guide — delicate existing files, sequenced later); Phase 2 (curriculum_render quiz feeder); Phase 3 (skill_mastery BKT rollup + grade calc); Phase 4 (teacher dashboard + remediation). The audit's findings feed the Phase 2/3 build plan.

## 0.1 Decisions (this sprint; rationale for the record)

| ID | Decision | Rationale |
|----|----------|-----------|
| L-A | **Ledger = a `/ledger` router added to the existing `roster-server`**, not a new service or a curriculum_render-repo edit. | roster-server is already deployed, standalone, env-driven, holds the curriculum_render service-role key, and has `verifyToken`. Additive — must not break `/roster/*`. Same principle that kept Phase 0 standalone (don't entangle the separate curriculum_render repo). |
| L-B | **`item_ledger` in the curriculum_render Supabase project** (`<AP_SUPABASE_PROJECT_REF>`), additive migration `0002_item_ledger.sql`, RLS-on/zero-policies (service-role only). FK → `roster.student_id` (same DB, works because §6.1 was revised to reuse this project). | Consistent with Phase 0 posture; cross-project FK would've been impossible — vindicates the §6.1 revision. |
| L-C | **Proctored-write integrity gate (bakes spec decision D from day one).** `evidence_tier='proctored'` requires header `x-proctor-secret == process.env.ROSTER_PROCTOR_SECRET`. Default = `practice`. The server **derives** the tier from the secret and **ignores any client-supplied tier**. | Spec decision D: practice can never certify. A client (worksheet) must be unable to self-declare proctored. New env var `ROSTER_PROCTOR_SECRET` (minor redeploy handoff, documented). |
| L-D | **`gradebook-client.js` composes with Phase 0's `rosterClient.token()`**, is fire-and-forget, no-ops without identity, and can never throw/block a worksheet. | A failed/absent ledger write must never degrade the student worksheet UX (mirrors `railway_client.js` fallback ethos). Pre-adoption, students may be unsigned-in — capture nothing rather than error. |
| L-E | **Audit is strictly read-only.** `curriculum_render/data/curriculum.js` is read-only/sacred — parse, never write. Malformed frameworks (known: `apstat_5_framework.md` has no `## TOPIC` headers) are **flagged, not crashed on**. | Sacred-file rule; the s98 memory records the `apstat_5_framework.md` defect. |

---

## FROZEN CONTRACT 1 — `item_ledger` schema (`roster-server/migrations/0002_item_ledger.sql`)

Postgres / curriculum_render Supabase project. Additive only. Header comment must mirror `0001_roster.sql`'s shared-project discipline note.

```sql
-- 0002_item_ledger.sql — Gradebook Sprint 1. Apply to the curriculum_render Supabase project
-- (<AP_SUPABASE_PROJECT_REF>; §6.1 / D-G). Creates ONLY item_ledger — NEVER ALTER/touch existing tables.
create table if not exists item_ledger (
  ledger_id     uuid primary key default gen_random_uuid(),
  student_id    uuid not null references roster(student_id) on delete cascade,
  source        text not null check (source in ('worksheet','frq','curriculum_quiz')),
  item_id       text not null,
  unit          text,
  topic         text,
  skill         text,
  response      jsonb,
  score         numeric,
  evidence_tier text not null default 'practice' check (evidence_tier in ('practice','proctored')),
  attempt       int  not null default 1,
  recorded_at   timestamptz not null default now(),
  graded_at     timestamptz,
  unique (student_id, source, item_id, attempt)
);
create index if not exists item_ledger_student_idx on item_ledger(student_id);
create index if not exists item_ledger_skill_idx   on item_ledger(skill);
create index if not exists item_ledger_unit_idx    on item_ledger(unit);
alter table item_ledger enable row level security;
-- (Intentionally NO policies. Service-role only. Blooket is excluded by spec — no 'blooket' source.)
```

Column names/types/checks are FROZEN.

## FROZEN CONTRACT 2 — `/ledger` HTTP API (added to `roster-server`, additive)

Mounted inside the existing `export function createApp(db)` in `roster-server/server.js`. `/health` and all `/roster/*` routes stay byte-unchanged. Token reuse: `verifyToken` from `./token.js` (already imported) → `studentId`.

### `POST /ledger/record`
**Body:** `{ token: string (required), source: 'worksheet'|'frq'|'curriculum_quiz' (required), itemId: string (required), response (required, any JSON), unit?, topic?, skill?, score?: number, attempt?: int=1 }`
**Header (optional):** `x-proctor-secret`
**Behavior:** `verifyToken(token)` → studentId (401 `{ok:false,error:"invalid token"}` if absent/expired). `evidence_tier = (header x-proctor-secret === process.env.ROSTER_PROCTOR_SECRET) ? 'proctored' : 'practice'` — **derived server-side; any `evidenceTier` in the body is ignored.** Upsert on `(student_id, source, item_id, attempt)`.
**→ 200** `{ ok:true, ledgerId:"<uuid>", evidenceTier:"practice|proctored" }` · **→ 400** missing required · **→ 401** bad token

### `GET /ledger/student/:studentId`  *(Phase 4 reads this; contract fixed now, minimal impl)*
**Header:** `x-teacher-secret == process.env.ROSTER_TEACHER_SECRET` (reuse Phase 0's). 401 `{ok:false,error:"forbidden"}` otherwise.
**→ 200** `{ ok:true, rows:[ item_ledger rows ] }`

### Env (append to `roster-server/.env.example`, placeholder only)
```
ROSTER_PROCTOR_SECRET=        # gates evidence_tier=proctored writes (decision L-C); never client-side
```
README append: note `ROSTER_PROCTOR_SECRET` must be set on the Railway service before proctored writes work (practice writes work without it).

## FROZEN CONTRACT 3 — `gradebook-client.js` (repo-root sibling)

Repo root, loaded *after* `roster_config.js` + `roster-client.js`. One global:

```js
window.gradebookClient = {
  // Fire-and-forget ledger write. NEVER throws, NEVER blocks the caller.
  async record({ source, itemId, unit, topic, skill, response, score, attempt }):
     { ok:true, ledgerId } | { ok:false, reason:'no-identity'|'network'|'bad-args' }
}
```

- Reads the token via `window.rosterClient && window.rosterClient.token && window.rosterClient.token()` **at call time**. No token → return `{ok:false,reason:'no-identity'}` immediately (no fetch, no throw).
- POSTs `{ token, source, itemId, unit, topic, skill, response, score, attempt }` to `${window.ROSTER_SERVICE_URL}/ledger/record` (read at call time). Any network/HTTP error → `console.warn` + `{ok:false,reason:'network'}` — never reject in a way that breaks the caller; wrap everything.
- **Never sends `x-proctor-secret` and has no proctored path** — proctored is server-secret-gated only (decision L-C). No secrets, no Supabase, no password literals.
- `bad-args` if `source`/`itemId`/`response` missing (validate before fetch).

---

## 1. Owned paths (FROZEN — non-overlapping, safe parallel)

- **WS-A (audit):** `scripts/audit-skill-tagging.mjs`, `tests/audit-skill-tagging.test.js`, `GRADEBOOK_TAGGING_AUDIT.md`
- **WS-B (ledger server):** `roster-server/migrations/0002_item_ledger.sql`, `roster-server/ledger.js`, `roster-server/ledger-db.js`, `roster-server/server.js` (**WS-B is its sole owner this sprint** — mounts the ledger router), `roster-server/tests/ledger.test.js`, `roster-server/.env.example` (append one line), `roster-server/README.md` (append a section)
- **WS-C (client):** `gradebook-client.js`, `gradebook-client-demo.html`, `tests/gradebook-client.test.js`

No file is owned by two workstreams. WS-A/WS-C must not touch `roster-server/`. None may edit `curriculum_render/**`, the worksheets, the study guide, or the roadmap (adoption is deferred). All net-new except `server.js`/`.env.example`/`README.md` which only WS-B extends additively.

## 2. WS-A — skill-tagging audit spec

`scripts/audit-skill-tagging.mjs` (Node ESM, model on the existing `scripts/audit-question-context.mjs`) inventories item→AP-skill coverage across the **4 pools**:

1. **Follow-along worksheets** — the 69 `u*_lesson*_live.html`: count blanks (`data-answer`) + FRQ reflection textareas (cross-ref `ai-grading-prompts*.js` keys); detect whatever AP-skill anchoring exists (framework-injected, sessions 96–97).
2. **curriculum_render bank** — `../curriculum_render/data/curriculum.js` (relative to repo; **READ ONLY, never write — sacred**). Classify whether questions carry AP-skill tags and per-unit coverage. If the path is absent, report it as "pool unavailable", don't crash.
3. **Supplement probes** — `data/formula-probe-supplement.js` (+ `data/frq-decompositions.json` for the 31 FRQ skills). Flag the carry-over-(a) zero-signal probes.
4. **Official AP skill lists** — `apstat_{1..9}_framework.md` at repo root: parse Skill/EU/LO/EK per topic. **`apstat_5_framework.md` has no `## TOPIC` headers (known defect) — flag it as malformed, continue, don't crash.**

Output `GRADEBOOK_TAGGING_AUDIT.md`: a coverage matrix (per unit/topic/AP-skill × pool: item counts, has-tag yes/no), the gap list (skills with no practice items and/or no proctored-mappable items), malformed-source flags, and a blunt **"Phase 3 readiness"** verdict (can per-skill BKT be trusted today? where are the holes?). `tests/audit-skill-tagging.test.js` (vitest): runs the audit on the repo, asserts the report file is produced, its shape/sections exist, counts are deterministic, and malformed `apstat_5` is flagged not fatal.

## 3. Test expectations (each WS ships green; planner re-runs all)

- **WS-B:** `cd roster-server && npm test` — NEW `ledger.test.js` green **AND the 28 existing roster tests still green** (regression — additive must not break `/roster/*`). Cover: record happy-path (token→studentId, returns ledgerId, default tier `practice`); no/invalid token → 401; missing source/itemId/response → 400; `x-proctor-secret` correct → `proctored`; wrong/absent → `practice`; a body-supplied `evidenceTier:'proctored'` WITHOUT the header is still stored `practice` (integrity); upsert on duplicate (student,source,item,attempt); `GET /ledger/student/:id` requires `x-teacher-secret`. Injected fake db (no network).
- **WS-A:** `npx vitest run tests/audit-skill-tagging.test.js` green; report generated; `apstat_5` malformed flagged not fatal.
- **WS-C:** `npx vitest run tests/gradebook-client.test.js` green (jsdom): no-identity no-op (no fetch); happy path posts to `${ROSTER_SERVICE_URL}/ledger/record` with token (fetch mocked) → `{ok,ledgerId}`; network error → `{ok:false,reason:'network'}` and does NOT throw; missing args → `bad-args`; reads URL/token at call time; no secret literals; never sends `x-proctor-secret`.
- Root `npm test` stays green (existing baseline 871/872 — the 1 known pre-existing unrelated `study-guide.test.js` fail is NOT yours; do not touch it).

## 4. Result files

Each agent writes `.batch-gp1-A|B|C.result.md` at repo root: files created, contract adherence (quote the frozen section implemented), EXACT test command + REAL pasted output, anything flagged. Concise. No fabrication — planner re-runs.

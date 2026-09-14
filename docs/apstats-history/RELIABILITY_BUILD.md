# RELIABILITY_BUILD — grade golden master + Desk journey harness

Frozen contract (2026-08-18). **Status 2026-08-19: COMPLETE** — A1–A4 and B0–B4 shipped (a0e81f7, 2d530a8, 1d15756, + B4 commit); see RELIABILITY_PIN_CONVERSION.md and roster-server/docs/{golden-master,answer-key-freeze}.md. Overseer: Claude. Implementers: Codex (gpt-5.6-sol) via
the Agent runner, one task at a time per track. Two independent adversarial Codex
reviews per phase. Overseer runs all three suites and commits/pushes each green phase.

Goal: make the app *more reliable and coherent*, not flashier. Nothing here changes
what a student sees. Nothing here changes a grade (that is the point — the golden
master proves it).

---

## 0. Non-negotiables (both tracks)

- **No grade math changes** in Track A until the golden master is green and committed.
  The only intended math-adjacent change (A4, answer-key freeze) must produce a
  byte-identical golden master.
- **Privacy:** no real student name, username, e-mail, studentId, free-text response,
  or review comment is ever committed. Fixtures are pseudonymized by the builder
  (§2.2) and the builder's INPUT (the raw snapshot under `~/grade-backups/`) is never
  copied into the repo.
- **Determinism:** every golden output must be reproducible on any machine — inject
  a fixed clock (`asOf`), a frozen answer key, frozen grade-context inputs. No
  `Date.now()`, no network, no `data/answer-key.json` reads at test time.
- **Incident-pinned code stays pinned:** journeys ADD executed coverage; when a text
  pin is converted, the new journey must assert the same behavior the pin protected
  (name the pin in the `it` title). Never delete a pin without a replacement journey.
- **Codex never runs tests, never commits, never edits `roster-server/*.js` runtime
  files except where a task explicitly lists them.** Owned paths are per task.
- ES5 in Desk/mobile files (`function NAME(`); tests are ESM/vitest like their
  neighbours; `@vitest-environment node` unless a JSDOM boot is the point.

---

## 1. Track A — grade golden master (roster-server)

### 1.1 Oracle
The oracle is the HTTP surface, not an internal function: `createApp(...)` from
`roster-server/server.js` with fake `db`/`ledgerDb` (pattern: `tests/grade.test.js`
`createFakeLedgerDb`), a frozen answer key, and frozen `productionGradeInputs`
(`resolveProductionGradeInputs('SY2627')` captured INTO the fixture at build time).
For each fixture student: `GET /grade` (student token via `signToken`) and
`GET /class/grades` once (teacher). Snapshot the JSON.

### 1.2 Fixture builder — `roster-server/scripts/build-golden-fixture.mjs`
Input: `--snapshot <path>` (a `apstats-ledger-snapshot/v1` file; default = newest in
`~/grade-backups/snapshots/`), `--asOf YYYY-MM-DD` (default = snapshot `asOfDateNY`),
`--out roster-server/tests/fixtures/golden/` (default).
Output files (all committed):
- `students.json` — `{ schema:'apstats-golden/v1', asOf, builtFrom:{ snapshotSha256, generatedAt }, students:[{ id, section, records:[...], reviews:[...] }] }`
  - `id` = `gm-` + first 12 hex of sha256(studentId + salt from `--salt`, default fixed string) — stable, unlinkable.
  - `section` kept (it selects the period/quarter map). `username`, `realName`, `studentId` DROPPED.
  - `records`: exactly the `item_ledger` columns the engine reads (`source, item_id, unit, topic, skill, score, evidence_tier, attempt, recorded_at, graded_at`) plus `response` ONLY when `source === 'curriculum_quiz'` (normalized to the short answer string the engine compares; see `lesson-grade.js` `normalizeResponse`). For every other source `response` is `null`.
  - `reviews`: only the fields the engine reads for credit (item id, grade E/P/I or numeric credit, timestamps); comment text DROPPED.
- `inputs.json` — the frozen `answerKey` document (as loaded by production for that
  build, i.e. `data/answer-key.json` at that moment), the frozen
  `resolveProductionGradeInputs('SY2627')` result, and `worksheetBlankCounts`
  /`worksheetKey` if the route needs them. Everything `/grade` depends on.
- `expected.json` — `{ perStudent: { [id]: <GET /grade body> }, classGrades: <GET /class/grades body> }`
  with volatile fields removed by ONE shared function `stripVolatile(json)` (exported
  from `roster-server/tests/golden/volatile.js`): timestamps of "now", receipt ids /
  signatures, generatedAt, anything derived from the wall clock. Everything else is
  compared exactly.
- The builder prints a summary (students, records, sha) and exits non-zero on any
  privacy-rule violation (self-check: a scan of the output for `@`, for any
  `username`/`realName` string from the input, and for `response` on non-quiz rows).

### 1.3 Test — `roster-server/tests/golden-master.test.js`
- Boots the app with the fixture inputs; sets the clock to `asOf` (`vi.setSystemTime`
  or the app's own clock injection if one exists — Codex must find which the routes
  honor; `todayInTz(tz, now)` accepts `now`).
- For every fixture student, `GET /grade` → `stripVolatile` → `toEqual(expected)`.
  Failure message must name the student id and the first differing JSON path
  (write a tiny `firstDiffPath(a,b)` helper).
- `GET /class/grades` → same.
- A meta-test: `expected.json` was produced by the current `stripVolatile` (store the
  helper's version string in `expected.json`; mismatch → fail with a "regenerate"
  message).
- Regeneration is EXPLICIT: `node roster-server/scripts/build-golden-fixture.mjs --accept`
  rewrites `expected.json`; the test never writes files.

### 1.4 A4 — answer-key freeze (only after A1–A3 are green + committed)
Status (2026-08-18): **implemented in commit `<pending>`; deployed when the
overseer pushes.**

Before A4, `curriculum_quiz` credit re-derived from the CURRENT
`data/answer-key.json` at read time (`GradeContext` froze
config/schedule/blooket, not the key). Change:
- `grade-contexts.js`: the SY2627 context carries a frozen answer-key document
  (`freezeDir()/answer-key.SY2627.json`, validated like the other freezes) and
  `resolveProductionGradeInputs` returns it; `createApp` prefers the context's key
  over the live loader for grading (live key still served to clients where it is
  today — do not change what worksheets/quiz app fetch).
- Golden master must be byte-identical before/after (the frozen key == today's key).
- Add a test proving that mutating `data/answer-key.json` after boot does NOT change a
  graded quiz item's credit.
- This is a roster-server runtime change → the overseer flags it explicitly before
  push (Railway auto-deploys).

Owned paths, Track A: `roster-server/scripts/build-golden-fixture.mjs`,
`roster-server/tests/golden/**`, `roster-server/tests/golden-master.test.js`,
`roster-server/tests/fixtures/golden/**`; A4 additionally `roster-server/grade-contexts.js`,
`roster-server/server.js` (createApp key threading only), `roster-server/data/**` freeze file,
`roster-server/tests/grade-contexts.test.js`.

---

## 2. Track B — Desk journey harness (frontend, no grade risk)

### 2.1 Harness — `tests/journeys/harness.js`
`bootDesk(opts)` boots the REAL `ap_stats_roadmap_square_mode.html` in JSDOM
(`runScripts:'dangerously'`, `pretendToBeVisual`, `url` = the GH Pages URL) with:
- `fetch` router: local repo files (`roadmap-data.json`, `data/*.json`, `lib/*.js`,
  `*.csv`, `version.json`) served from disk; roster-server routes served by an
  in-memory fake (`tests/journeys/fake-roster.js`: `/roster/verify`, `/roster/open-sections`,
  `/grade`, `/ledger/record`, `/ledger/student/:id`, `/class/*` as needed, `/trainer/state/*`,
  `/donow*`) with a scriptable state; the curriculum-render server (`/api/*`) and
  Supabase REST (`lesson_urls`) as stubs returning `opts.supabase`/`opts.curriculum`.
  Unknown URLs → 404 AND recorded in `harness.unhandled` (a journey may assert it is
  empty).
- Browser shims only where JSDOM lacks them (canvas `getContext` → null-object,
  `IntersectionObserver`, `matchMedia`, `scrollTo`, `navigator.serviceWorker`), each
  documented in the harness header with the Desk line that needs it.
- Fake timers optional (`opts.fakeTimers`), a `flush(n)` helper, `signIn(username)`
  helper that drives the REAL sign-in UI (not a localStorage poke), `readOnly`/`viewAs`
  helpers, and `dom.window.close()` on teardown.
- Deterministic clock (`opts.now`), deterministic `Math.random` seed.
- Boot budget: a bare boot must finish in < 3 s on the CI box; log the actual.
- The harness's own smoke test proves: boot with no console errors (capture
  `console.error`; allowlist NOTHING — fix or stub the source of each), Do Now card
  present, roadmap tiles rendered from `roadmap-data.json`.

### 2.2 Journeys — `tests/journeys/*.journey.test.js` (one file per journey)
J1 sign-in → Do Now renders grades from fake `/grade` → sign out clears the chip.
J2 shared device: sign in as A, mark a worksheet done, sign out, sign in as B → B sees
   none of A's marks / flashcard state / due chip; A's are intact when A returns.
J3 worksheet Done → `WS-…-DESK_DONE` row posted (exact frozen payload) → tile updates.
J4 quick check → 8/10 → `BL-…-DESK_DONE` score 80 posted once; cancel/reopen cannot
   post again (the P0 loophole, by behavior).
J5 timed deck → best-wins: a lower re-run posts nothing; a higher one posts once.
J6 due chip / review mode: log entries → chip count → Review starts → rating writes
   log, never a grade row (assert zero `/ledger/record` calls).
J7 offline: `/grade` fails → the incident behaviors named in
   `tests/incident-progress-reset-cache-relock.test.js` hold (cached grades kept,
   no relock) — reproduce them as behavior, keep the pin file.
J8 view-as (teacher) → no writes of any kind (ledger, localStorage marks, SRS log, sync).
J9 flashcard sync: two harness instances (same fake roster) → practice on one appears
   on the other after `_srsSyncPull({force:true})`.
Each journey `it` title names the pin(s) it supersedes when applicable, e.g.
`'J4 … (supersedes desk-blooket-flashcards it 55–59 loophole pins)'`.

### 2.3 Pin conversion (last)
For each `tests/desk-*.test.js` file whose assertions are pure source-regex pins on
behavior a journey now executes: keep the file, replace the converted `it`s with a
one-line pointer `it.skip('moved to journeys/J4', …)`? — NO: delete the converted `it`s
and add a comment naming the journey; keep pins that protect *structure the journeys
cannot see* (ES5 function names the parity harness slices, script tags, copy strings).
Net: no behavior loses coverage; the count of regex-only pins goes down (report the
before/after count in the task result).

Owned paths, Track B: `tests/journeys/**`, and for 2.3 the specific `tests/desk-*.test.js`
files named in the task. Never `ap_stats_roadmap_square_mode.html` — if a journey
needs a Desk change (a real bug), STOP and report it; the overseer decides.

---

## 3. Task table

| id | track | deliverable | acceptance |
|---|---|---|---|
| A1 | A | fixture builder + `volatile.js` + generated `students.json`/`inputs.json` (overseer runs the builder) | privacy self-check passes; ≥ 30 students; builder is idempotent (same snapshot → same output) |
| A2 | A | `golden-master.test.js` + `expected.json` (overseer runs `--accept`) | green; deliberately perturb `V3_WORK_WEIGHTS` locally → ≥ 1 student differs with a readable path |
| A3 | A | docs: `roster-server/docs/golden-master.md` (regenerate flow, what "accept" means, privacy rules) | reviewed |
| A4 | A | answer-key freeze (§1.4) | golden byte-identical; new mutation test; overseer flags deploy |
| B0 | B | harness + smoke test (§2.1) | boots clean, no console errors, < 3 s |
| B1 | B | J1–J3 | green, deterministic (run 3×) |
| B2 | B | J4–J6 | green |
| B3 | B | J7–J9 | green |
| B4 | B | pin conversion for the files the journeys cover | pin count reported; all suites green |

Verification protocol per phase: `npx vitest run` (root), `cd roster-server && npx vitest run`,
`pytest tests/`; two Codex reviews (read-only) with the full result envelope; overseer
fixes or dispatches fixes; commit + push.

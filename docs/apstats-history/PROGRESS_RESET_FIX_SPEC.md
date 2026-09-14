# PROGRESS_RESET_FIX_SPEC.md — Incident 2026-07-20 durable fix

Companion docs: `INCIDENT_2026-07-20_PROGRESS_RESET.md` (root cause), `PROGRESS_RESET_REGRESSION_MATRIX.md`,
`PROGRESS_RESET_DEPLOYMENT_RUNBOOK.md`. Scope: **client-only** — `ap_stats_roadmap_square_mode.html` + tests.
No server changes, no DB writes, no worksheet-file (69) changes, no mobile-home changes, no backfill.

## 0. Root cause being fixed

The Desk renders "server grade state unknown" as "no completed work". Lessons whose worksheet completion
exists only as ledger correctness (Cws≥60 via `/grade`, no worksheet DESK_DONE row — the normal pattern)
depend entirely on a warm `_gradeLessonsCache`. `renderDoNowGrades` silently swallows HTTP non-ok from
`/grade` (L8436-8448): no cache restore, no re-derive (those fire only on network *throws*), no error UI,
no retry. Cold cache ⇒ `_isLessonComplete` fails for ledger-only lessons ⇒ strict `_isLessonUnlocked`
relocks their successors ⇒ `rProg` prints "0 of N lessons done". Reproduced by
`tests/incident-progress-reset-*.test.js` (20/20 against extracted real code).

## 1. Invariants (each must map to a test)

1. Server ledger + roster `student_id` is authoritative; localStorage is an optimistic cache.
2. UI state is tri-state (loading / available / unavailable). Unknown must NEVER render as 0%, "no work", or a lock.
3. Indeterminate server state ⇒ navigation fails OPEN (no false credit; no stranding).
4. After any successful server read, ledger-qualified completion is durable on that device (survives cold
   caches, empty/forked localStorage, missing DESK_DONE rows, render-before-warm ordering).
5. Identity is roster-UUID anchored; legacy email/username keys alias/migrate, never silently fork to empty.
6. `/grade` HTTP errors are never silent: 401/403 ⇒ explicit re-auth path; 5xx/timeout/network ⇒ truthful
   "temporarily unavailable; your work is preserved" + retry. Never cache an error/empty response.
7. Cache entries carry identity + backend origin + schema version; mismatch ⇒ reject as evidence, never erase.
8. Init/refresh order-independent: any later successful read reconciles ALL surfaces (locks, greying, rProg, strip).
9. No DB backfill required for correctness.
10. Student answers and official grades untouched (this fix never writes grade data anywhere).

## 2. Design — pinned contracts (names are binding for impl + tests)

### D1. Tri-state load state
- `var _gradeLoadState = 'unknown'` → `'loading' | 'available' | 'unavailable'`.
- `var _gradeLoadError = null` → `{ kind: 'auth' | 'server' | 'network', status: number|null }`.
- Set `'loading'` on entry to `renderDoNowGrades`; `'available'` only on a live `res.ok && json.ok` payload;
  `'unavailable'` + classified `_gradeLoadError` otherwise (401/403 → `auth`; other non-ok / `{ok:false}` /
  malformed JSON → `server`; throw/timeout/null-res → `network`).

### D2. `renderDoNowGrades` failure handling (replaces the silent return)
- ALL failure kinds run the evidence-restore branch (today only `network` does):
  `data = (await _phase2ReDeriveGrade()) || _loadGradeCache()`. A restored payload warms
  `_gradeLessonsCache` and paints lessons exactly like today's offline branch, but `_gradeLoadState`
  stays `'unavailable'`.
  Boundary case (nothing to restore): with localStorage cleared AND `/grade` failing, restore yields
  null by definition. The required terminal behavior is `unavailable` state + the truthful banner +
  D5 honest-unknown label + D4 fail-open navigation — never fabricated completion, never 0%, never a
  lock from uncertainty alone.
- Grade-cache envelope v2 in `_persistGradeCache` / `_loadGradeCache`:
  `{ v: 2, origin: <ROSTER_SERVICE_URL>, savedAt: ISO, data: <payload> }`.
  On load: envelope with mismatched `origin` ⇒ reject (return null; do NOT delete). Legacy bare payload
  (no envelope) ⇒ accept once (grandfathered), rewritten as v2 on next success. Key stays
  `apstats_grade_cache_v1:<studentId>` (already identity-scoped + view-as-null).
- Status banner: new host `<div id="donow-grade-status">` adjacent to `#donow-grades`, rendered by
  `_renderGradeStatus()`; hidden when `'available'`/`'unknown'`; suppressed in view-as.
  - `auth` ⇒ "Your sign-in needs a refresh — please sign in again. Your work is saved." + a Sign-in button
    (opens the existing sign-in modal). NEVER auto-clear the roster session.
  - `server`/`network` ⇒ "Grades are temporarily unavailable — your work is saved." + a Retry button
    (re-calls `renderDoNowGrades`). Auto-retry with capped backoff (15s/30s/60s, ≤3 per page load),
    guarded so concurrent calls don't stack.
- Success path must clear `_gradeLoadError`, hide the banner, reset the backoff.

### D3. Server-completion latch (the durable core)
- Key: `'apstats_server_complete_v1:' + rosterClient.studentId()`; `_serverCompleteKey()` returns null in
  view-as / signed-out (mirror `_gradeCacheKey` guards exactly).
- Shape: `{ v: 1, origin: <ROSTER_SERVICE_URL>, updatedAt: ISO, topics: { '<topic>': { ws: true?, bl: true? } } }`.
- `_latchServerComplete(lessons)` — called ONLY on a live successful `/grade`: for each `lessons[]` entry,
  `Cws >= DESK_WORKSHEET_DONE_THRESHOLD` ⇒ set `topics[lessonKey].ws = true`; `blooket >= 80` ⇒ `.bl = true`.
  Monotonic: only ever adds `true`, never removes. Never latch from restored/derived payloads.
- `_serverCompleteFor(topic)` → `{ ws: bool, bl: bool }` (false/false when no latch, wrong origin, wrong
  version, or no key). Origin/version mismatch ⇒ ignore (fail closed as evidence), never delete.
- `_isLessonComplete` gains the third disjunct:
  `wsDone = localMark || Cws>=gate || _serverCompleteFor(topic).ws` (same for `bl`). typeof-guarded like
  the existing synced helpers so isolated vm tests keep passing.

### D4. Gate fails open on indeterminate server state
- `_serverEvidencePresent()` → `Array.isArray(_gradeLessonsCache) || latch-for-current-student has ≥1 topic`.
- `_isLessonUnlocked`: after the teacher/override/first-lesson short-circuits, if
  `!_serverEvidencePresent()` ⇒ return true (fail open; typeof-guarded). Otherwise strict gate as today
  (with D3 folded in). Strictness is preserved whenever the server has affirmatively spoken.

### D5. `rProg` honest-unknown
- If signed in AND no completion evidence at all (empty effective marks + no latch + cold cache) AND
  `_gradeLoadState !== 'available'`: label "Progress loading…" (`unknown`/`loading`) or
  "Progress temporarily unavailable — your work is saved." (`unavailable`) instead of "0 of N lessons done".
- With any evidence present, keep the pace label (latch folds in via `_isLessonComplete`).

### D6. Marks-bucket aliasing (identity fork neutralized)
- `_marksAliasKeys()` → ordered unique `[legacyKey?, username, username + '@roster.local']` derived from the
  CURRENT roster session (+ current legacy key). Never keys from other identities.
- `_migrateMarksAliases()` — one-time-per-load, idempotent, additive: union alias buckets into the primary
  bucket (`getStudentEmail()`); existing entries win; skipped entirely in view-as; try/catch-wrapped.
  Called at boot after roster init and after every sign-in. Sign-in keeps writing the bare username.

### D7. Order-independent reconciliation
- Extend the existing cold→warm escalation: whenever `renderDoNowGrades` obtains lessons (live OR restored)
  and the cache was cold, force the full `rCal()` + `rProg()` repaint (today only the live path in effect).
  A late success after a failure must reconcile locks + greying + label + strip in one pass.

### D8. View-as safety
- Latch key null, migration skipped, banner suppressed, no persistence of any kind in view-as. Mirrors the
  existing `_gradeCacheKey` / `recordProgress` guards.

## 3. Test plan

- INVERT `tests/incident-progress-reset-{cache-relock,identity-fork,donow-hydration}.test.js` to pin FIXED
  behavior (evidence restore + fail-open + honest labels); keep `warm-control` as-is (still the control).
  Keep the fixtures; update BUG comments to FIXED pins.
- NEW matrix suites `tests/progress-reset-matrix-*.test.js` (+ fixtures under
  `tests/fixtures/incident-progress-reset/`) covering every row of `PROGRESS_RESET_REGRESSION_MATRIX.md`
  (the mandated 19-row matrix: affected-account shape, fresh device, cleared storage, identity transitions,
  guest→roster, wrong-user cache, wrong-backend cache, render-before-resolve, delayed success, 401/403/500/
  malformed/timeout/offline + recovery, partial DESK_DONE hydration, refresh idempotency, multi-tab storage
  events, mobile-home non-regression, view-as read-only, strict-gate-still-strict).
- Full suites: root `npm test` (known pre-existing flakies: `teacher-student-console-dashboard-deeplink`,
  `gradebook-feeder-wiring` "empty blank" — pass isolated); `cd roster-server && npm test` with
  `BCRYPT_COST=4` (env-gated test cost).

## 4. Ownership

- Implementer A (Sonnet): `ap_stats_roadmap_square_mode.html` + inversion of the three incident test files.
- Implementer B (Sonnet): new `tests/progress-reset-matrix-*.test.js` + fixture additions only.
- Verifier (Opus): independent diff review + full-suite runs. No file overlap between A and B.
- Nobody stages/commits; the pre-existing dirty worktree files are untouchable.

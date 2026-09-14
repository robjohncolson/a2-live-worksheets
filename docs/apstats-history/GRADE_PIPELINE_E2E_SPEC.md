# GRADE_PIPELINE_E2E_SPEC.md — Work → Grade → Schoology (end-to-end)

> **Authoritative spec for the full auto-grading pipeline**, from a student doing
> work to a grade landing in Schoology. Verified against source **2026-05-30
> (session 123, HEAD `ebb7003`)**. Line numbers drift — re-confirm before editing.
>
> Scope note: `GRADE_PIPELINE_SPEC.md` (Thread 1, s104, shipped) covers Leg A's
> *worksheet-scoring model* (Cws/W/Q weights `1:2:3`). THIS doc is the broader
> end-to-end wiring: the curriculum_render quiz/PC feeder, the v3 delivery, and
> the Schoology connector — and the gaps that stop it being flawless.

## 1. Goal

When a student does a **quiz** (curriculum_render) or a **follow-along worksheet**,
it is auto-graded, flows into the unified ledger → the Grading Model v3 engine →
and is delivered to **Schoology** (the official grade; syncs to PowerSchool SIS).
Everything up to Schoology is automatic + server-side; the Schoology hop is a
**scheduled teacher-laptop batch** (see §4).

## 2. Architecture — two repos, two backends, one Supabase

| Piece | Where | Role |
|-------|-------|------|
| Worksheets | `follow-alongs/u*_lesson*_live.html` | capture + autograde blanks (client) + FRQ (AI). Model = `GRADE_PIPELINE_SPEC.md` |
| Quizzes / PCs | `curriculum_render/data/curriculum.js` (**SACRED, read-only**) via `curriculum_render/index.html` | MC quizzes + progress checks |
| Curriculum backend | `curriculum_render/railway-server/server.js` | `/api/submit-answer` → `answers` table (peer aggregation), `/api/ai/grade` |
| Grade engine | `follow-alongs/roster-server/` | the ledger + Grading Model v3 (`grade.js`, `lesson-grade.js`, `grade-config.js`); deployed at `roster-production-12c1.up.railway.app` |
| Grade ledger | Supabase `item_ledger` table | one row per (student, source, item, attempt); the engine reads ONLY this |
| Schoology sync | `follow-alongs/tools/schoology_*.py` + `tools/cdp/edge.py` | single-host CDP rig (teacher laptop Edge cookie) |

Both backends share the **curriculum_render Supabase**. The grade engine reads
`item_ledger` exclusively (`roster-server/ledger-db.js` `.from('item_ledger')`); it
does NOT read the `answers` table.

**Data contract.** Browser producers POST to roster-server `POST /ledger/record`
(`roster-server/ledger.js:20`) via `window.gradebookClient.record(...)`
(`curriculum_render/gradebook-client.js` — fire-and-forget, no-ops with no
identity). Rows: `{student_id, source, item_id, unit, response, score, attempt}`,
`UNIQUE(student_id, source, item_id, attempt)`. The server re-scores `response`
against bundled `answer-key.json` (`roster-server/scoring.js`). `grade.js::computeGrade`
fans rows into per-lesson `Cws/W/Q`, per-unit PC, per-quarter grade. Endpoints:
`GET /grade` (student token, `grade.js:338`), `GET /class/grades` (teacher secret,
`class.js:57`), `GET /rollup`.

## 3. Current state — VERIFIED: the pipeline is NOT flawless

Marker: ✅ works · 🟡 partial · 🔴 broken · ⬜ missing

```
LEG A — FOLLOW-ALONG WORKSHEET → GRADE
  A1 capture + autograde (blanks; FRQ via /api/ai/grade)                   ✅
  A2 persist to item_ledger (recordBlank/Reflection → gradebookClient.record) 🟡
       fails OPEN if not signed in (silent grade loss, no student error);
       FRQ score persists ONLY on explicit "Grade My Reflections" click
  A3 read into grade (computeGrade → Cws/W/Q)                              ✅

LEG B — CURRICULUM_RENDER QUIZ → GRADE
  B1 capture (submitAnswer)                                                ✅
  B2 persist to GRADE ledger                                              🔴  Break 1
  B3 server re-score vs answer-key.json                                    ✅ (no data reaches it)

LEG C — PROGRESS CHECK → PC-MASTERY TRACK
  C1 capture                                                               ✅
  C2 persist                                                              🔴  Break 1 + Break 2
  C3 score (answer-key.json HAS PC keys, e.g. "U1-PC-MCQ-A-Q01")           ✅ (no data reaches it)

GRADE ENGINE
  D1 computeGrade fan-out                                                  ✅
  D2 v3 two-track (computeQuarterV3)                                       🟡  Break 3 (flag OFF in prod)
  D3 Work feeders (lessons+quizzes only; posters+blooket hardcoded null)   🟡

GRADE → SCHOOLOGY
  E1 producer (/class/grades → fixture)                                    ⬜  Break 4
  E2 roster student_id → Schoology uid bridge                              ⬜  Break 4
  E3 push primitives (write_grade_to_cell, write_override, add_assignment) ✅
  E4 durable sync state (SupabaseStateStore)                               ⬜ (stub; LocalJson works)
  E5 trigger                                                               🟡 manual today → daily batch (§4)
```

### The breaks (verified, with evidence)

- **🔴 Break 1 — quiz & PC grades never reach the ledger.** The feeder
  `gradebookClient.record(...)` exists **only** inside `saveAnswerWithTracking`
  (`curriculum_render/index.html:10892` def; `record` at `:10919/:10922`), and that
  function is **never called** (it appears once in the file — its definition). The
  live submit path (`submitAnswer` ~`index.html:7195`; multi-part FRQ
  `submitPartAnswer` `:8826`) never invokes it. **Net: 0 quiz rows, 0 PC rows in
  `item_ledger`.** The DN2d test (`tests/dn2d-gradebook-feeder.test.js`) is a
  **false-green** — it asserts the block is *inside* the function, never that the
  function *runs*.
- **🔴 Break 2 — PC rows are DB-rejected even when fed.** `item_ledger` CHECK
  (`roster-server/migrations/0002_item_ledger.sql:6`) = `source in
  ('worksheet','frq','curriculum_quiz')` — no `'pc'`. The feeder writes `source='pc'`
  for `/^U\d+-PC-/` ids → Postgres `check_violation`, swallowed by the
  fire-and-forget client. (PCs are otherwise gradable — keys exist.)
- **🔴 Break 3 — v3 grading not on in prod.** `grade-config.js:66`
  `useV3 = process.env.USE_V3_GRADING === 'true'`; **no committed config sets it**,
  so prod runs Phase-6 `mean(lessonGrade)`, not the two-track model. Posters+blooket
  tracks are hardcoded null (`lesson-grade.js:767-768`; `grade.js:234` omits
  `workTracks`) → Work = mean(lessons, quizzes) only.
- **⬜ Break 4 — no grade→Schoology bridge.** `schoology_sync_section.py::_push_grades`
  (`:426`) consumes a hand-authored `--grades-fixture` (`_load_grades_fixture:694`);
  nothing reads `/class/grades` to produce it, and the roster DB has no
  `schoology_uid` column (the push keys on the live Schoology uid). "Auto-graded →
  Schoology" is manual transcription today.
- **🟡 Worksheet soft-fail.** `gradebook-client.js` no-ops (no student-facing error)
  when not signed in → silent grade loss; FRQ persists only on explicit click.

> **Audit correction (do not repeat the error):** PCs ARE gradable —
> `answer-key.json` has the keys (`roster-server/data/answer-key.json:228`
> `"U1-PC-MCQ-A-Q01"`, ~347 PC entries). The PC blockers are Break 1 + Break 2 ONLY,
> NOT a missing answer key.

## 4. Schoology delivery model — DECIDED

The push is a **single-host CDP rig** — only the teacher's laptop Edge profile holds
the Schoology cookie (`tools/cdp/edge.py`). **Real-time / server push is structurally
impossible.**

**DECISION (2026-05-30):** run the sync as a **daily scheduled batch on the teacher's
laptop** (Windows Scheduled Task — same infra pattern as the existing
auto-continuation schtask). The job: (1) the producer (P4) GETs `/class/grades` and
writes the fixture; (2) `schoology_sync_section.py --grades-fixture <file>` runs
(dry-run guard → live). Hands-off once configured; the teacher just keeps Edge signed
in (~90-day cookie).

**The batch is built (P4b).** `tools/daily_schoology_sync.ps1` runs both steps and
tees a timestamped log to `tools/.schoology-sync-logs/`;
`tools/register_schoology_sync_task.ps1` registers it as a daily Scheduled Task.

Setup (one-time):

1. **Set the secret** for the task account (read from the env, never the CLI):
   `setx ROSTER_TEACHER_SECRET <secret>`.
2. **Register the task** (defaults: `-Section PeriodB -Time 16:30 -TaskName
   ApStatsSchoologySync`, **dry-run**):
   `powershell -NoProfile -File tools/register_schoology_sync_task.ps1`.
   Delete with `schtasks /Delete /TN ApStatsSchoologySync /F`.
3. **Dry-run → live gate.** The batch passes `--dry-run` to the connector unless
   `-Live` is given, so it **stays dry-run by design**. Flip to live only once the
   SY26-27 marking periods exist (PARKED to ~Sept-2026; `SCHOOLOGY_SYNC_V1_BUILD.md`
   P2b gate) by re-registering with `-Live`
   (`register_schoology_sync_task.ps1 -Live`), or run it ad hoc:
   `powershell -NoProfile -File tools/daily_schoology_sync.ps1 -Live`.

## 5. Fix plan — sequenced (dependencies matter)

| # | Fix | Effort | Owner | Depends |
|---|-----|--------|-------|---------|
| **P1** | Wire the quiz/PC feeder into the **live** submit path (`submitAnswer`, + `submitPartAnswer` for FRQ) in `curriculum_render/index.html`; move the `gradebookClient.record` block out of the orphaned `saveAnswerWithTracking`. Replace the false-green DN2d test with one asserting the LIVE function fires `record`. | S | **me** | — |
| **P2** | Migration `0011`: drop + re-add the `item_ledger` source CHECK including `'pc'`. | S | I write · **you run** on Supabase | — |
| **P3** | Set `USE_V3_GRADING=true` on the roster-server Railway env. **AFTER P1+P2** + a real-data sanity check (else v3's 40% PC floor punishes students for the still-empty PC track). | S | **you** (Railway) | P1, P2 |
| **P4** | Grade→Schoology connector: producer `tools/build_schoology_fixture.py` (GET `/class/grades?section=` → `{"<schoologyUid>/<lessonKey>": value}`; per-lesson `lessonGrade` → topic columns, `quarterGrade` → `write_override`). Plus roster→Schoology-uid bridge (migration `roster.schoology_uid`, populated via bulk-enroll). Wire into the daily batch (§4). | M | me (+ migration **you run**) | P1–P3 for real values |
| **P5** | Posters + Blooket tracks: add `'poster'`/`'blooket'` ledger sources + capture surface, thread `workTracks` into `computeQuarterV3` (`grade.js:234`). Work renormalizes over present tracks until then. | M | me | — (deferrable) |

Also (opportunistic): harden the worksheet sign-in soft-fail (student-facing error,
not silent loss); fix migration `0010` `schoology_assignment.kind` CHECK to include
`'poster'` before SupabaseStateStore is built.

### Acceptance criteria
- **P1**: after a real Desk quiz submit, a `curriculum_quiz` row is visible via
  `GET /ledger/student/:id?prefix=U`; a PC submit produces a `pc` row (once P2 lands).
  New runtime test asserts the LIVE submit fn calls `record`. cr-repo committed +
  Railway redeploy.
- **P2**: PC rows persist (no `check_violation`); existing rows unaffected.
- **P3**: `/class/grades` returns two-track v3 numbers; spot-check one student.
- **P4**: the scheduled job takes live grades → Schoology cells with zero
  hand-editing; `--dry-run` first.

## 6. Open questions for the teacher

1. **Schoology granularity** — per-lesson columns (`lessonGrade` → "Topic N.N") AND
   the quarter `gp_override`, or just the quarter override?
2. **PC = proctored?** Every row is `evidence_tier='practice'` today
   (`ledger.js:40`; client never sends `x-proctor-secret`), so the 85 cap is never
   lifted. Do PCs need a proctored mode to count as mastery?
3. **Posters/Blooket** capture surface — Desk entry, CSV upload, or Schoology-only?
   (Gates P5.)
4. **Daily batch** — which sections, what time, dry-run review or fully auto?

## 7. Status

- **P1 — DONE** (curriculum_render `cd2ec6d`): feeder wired into the live
  `window.submitAnswer`; 22/22 DN2d tests pin the *live* wiring. ⚠ live e2e (a real
  submit producing a ledger row) still UNCONFIRMED. Scoped to MC + PC-MCQ.
- **P2 — DONE** (teacher ran `0011_item_ledger_pc_source.sql` on Supabase 2026-05-30):
  `'pc'` source now allowed.
- **P3 — DONE** (teacher set `USE_V3_GRADING=true` on Railway). ⚠ **SANITY CHECK
  PENDING** — run `build_schoology_fixture.py --inspect` to confirm v3 is live AND
  real quiz/PC data is flowing before trusting the grades.
- **P4a — DONE** (`tools/build_schoology_fixture.py`, 7 tests): GETs `/class/grades`
  → the `{student/lessonKey: value}` fixture; reads the teacher secret from the env
  (headless-safe). `--inspect` detects v3 (via `pcAvg`/`workAvg`) + data coverage =
  the P3 sanity check.
- **P4b — IN PROGRESS**: roster→Schoology-uid bridge (migration `roster.schoology_uid`
  + populate via bulk-enroll) so fixture keys match Schoology uids; until then pass
  `--uid-map`. **Daily-batch wiring DONE** — `tools/daily_schoology_sync.ps1`
  (producer + `schoology_sync_section.py --grades-fixture`, dry-run by default,
  timestamped logs) + `tools/register_schoology_sync_task.ps1` (daily schtask, §4).
  Stays dry-run until SY26-27 marking periods exist (~Sept-2026); re-register with
  `-Live` to go live.
- **P5 — not started** (posters/blooket tracks).
- Push primitives (E3) + grade engine (D1) are built + verified; the remaining work
  is **wiring**, not new mechanics.

## 8. Related docs

- `GRADE_PIPELINE_SPEC.md` — Thread 1 (Leg A) worksheet-scoring model (Cws/W/Q `1:2:3`).
- `GRADING_MODEL_V3_BUILD.md` — the two-track v3 formula + worked examples.
- `SCHOOLOGY_SYNC_V1_BUILD.md` — CDP sync mechanics (create/delete/write, fast-path,
  `write_override`, the SupabaseStateStore impedance mismatch).
- Memory: `project_grade_pipeline`, `project_grading_model_v3`, `project_schoology_sync`.

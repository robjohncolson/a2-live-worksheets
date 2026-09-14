# BLOOKET_IMPORT_P2_BUILD.md — Blooket CSV-import grade-entry (grade-pipeline Phase 2)

> Build contract for the Blooket half of the v3 Work track. Verified against source
> 2026-06-01 (HEAD `6292eb3`). Line numbers drift — re-confirm before editing.
> ASCII only in roster-server/*.js (LF). curriculum.js is sacred (untouched).

## 0. Why / flow

Each lesson/video has ONE graded Blooket (the in-class warm-up, reviewing the prior
video). The teacher screenshots the Blooket scoreboard, has it turned into a CSV, and
imports it. Scores land in `item_ledger` as `source='blooket'` rows; the v3 engine
reads them into the **Blooket track (10% of Work, renormalized)**.

## 1. The score (authoritative)

Per student per Blooket, given `correct`, `attempted`, and the Blooket's `total`
questions:

```
blooketScore(correct, attempted, total):
  if attempted <= 0: return 0
  acc = correct / attempted
  cov = min(1, attempted / total)        # walkaway penalty
  return clamp(acc * cov, 0, 1)          # == correct/total when attempted <= total
```

Worked: 30/30 of 30 -> 1.0 ; 20/25 of 30 -> 0.6667 ; 15/15 of 30 -> 0.5 ;
33/35 of 30 -> 0.9429 (over-total -> pure accuracy) ; 0 attempted -> 0.
Stored in `item_ledger.score` on **0..1** (the teacher endpoint computes it; the
engine does NOT re-score blooket — there is no answer key).

## 2. Hard constraints

1. **roster-server/** auto-deploys on push; this touches the LIVE grade engine.
2. **Migration is USER-RUN** (like 0011/0013-style). Code must degrade if absent.
3. **NO TANKING.** The Blooket track is **mean of RECORDED blooket scores**; it is
   `null` (excluded, renormalized away) when a student has no recorded blooket in the
   quarter. Do NOT count missing-due lessons as 0 for blooket — that would drop every
   student's Work the instant this deploys, before any blooket exists. A skip is
   penalized only if the teacher imports a `0` row (correct=0, attempted=0).
4. Additive; existing tests stay green; v3 behavior with zero blooket rows is
   byte-identical to today (workAvg renormalizes over lessons+quizzes only).

## 3. Unit A — roster-server core (one agent; coupled)

### A1. Migration `roster-server/migrations/0013_item_ledger_blooket_source.sql` (new)
Mirror `0011`: drop + re-add the source CHECK to include `'blooket'`:
```sql
alter table item_ledger drop constraint if exists item_ledger_source_check;
alter table item_ledger add constraint item_ledger_source_check
  check (source in ('worksheet','frq','curriculum_quiz','pc','blooket'));
```
Header comment: USER-RUN; additive; `'poster'` still excluded (no producer yet).

### A2. `lesson-grade.js::parseItemLesson` — add a blooket item-id pattern
After the `WS-U{N}L{key}-` block, add:
```js
// BLOOKET-U{N}L{key} (per-lesson Blooket, teacher-imported)
const blMatch = itemId.match(/^BLOOKET-U(\d+)L([\d-]+)$/);
if (blMatch) return { unit: Number(blMatch[1]), lessonKey: blMatch[2] };
```
So `BLOOKET-U1L2` -> {unit:1, lessonKey:"2"} -> topic "1.2"; `BLOOKET-U4L1-2` ->
{unit:4, lessonKey:"1-2"} -> expands to 4.1 + 4.2 (same `expandLessonKey` as lessons).

### A3. `lesson-grade.js::computeLessonGrades` — attach the per-topic blooket score
In the row loop (the `if (src === 'frq') ... else if 'worksheet'` chain), add:
```js
} else if (src === 'blooket') {
  // Stored score is the authoritative 0..1 blooketScore (no re-scoring). Latest
  // row wins (rows arrive pre-deduped via latestPerItem). Keep on 0..100 to match
  // the lessonMap convention (lessonGrade/Q are 0..100).
  const s = Number(row.score);
  if (Number.isFinite(s)) acc.blooket = Math.min(1, Math.max(0, s)) * 100;
}
```
Add `blooket: null` to the `ensure()` accumulator shape, and in the per-topic result
(the section ~279+ that emits Cws/W/Q/lessonGrade) carry `blooket: acc.blooket ?? null`
through to each topic's result object so `lessonMap.get(topicKey).blooket` is the
0..100 score (or null).

### A4. `lesson-grade.js::computeQuarterV3` — the Blooket track (mean-of-recorded)
After the lessons/quizzes loop over `dueLessons`, add:
```js
// Blooket track: MEAN OF RECORDED blooket scores over due lessons (NOT /lessonsDue).
// null when nothing recorded -> excluded from workAvg (no tanking before data).
let blooketSum = 0, blooketRecorded = 0;
for (const topicKey of dueLessons) {
  const r = lessonMap.get(topicKey);
  const bl = r && r.blooket != null ? r.blooket : null;
  if (bl != null) { blooketSum += bl; blooketRecorded += 1; }
}
const blooketAvg = blooketRecorded > 0 ? (blooketSum / blooketRecorded) / 100 : null;
```
Then set `tracks.blooket = blooketAvg` (REPLACE the current
`blooket: workTracks ? (workTracks.blooket ?? null) : null` line; keep `posters` on
the workTracks channel). For the ceiling, use `blooket: blooketAvg` in the
`workAvgBest` tracks (no inflation — blooket's best case is its recorded mean; do not
assume future blookets). Leave `combineV3`, `workAvgV3`, `quarterGradeV3` UNCHANGED.

### A5. `grade.js` — completion bump (optional, mirrors pc/quiz)
In the `bySource('pc')`/`bySource('curriculum_quiz')` completion loop, optionally add
`bySource('blooket')` bumping `'blooket'` completion. Non-load-bearing; skip if it
complicates the completion shape.

### A6. Endpoint `POST /class/blooket` (teacher-gated) — mount in `class.js`
Body: `{ lessonKey: "1.2", total: <int>, section?: <str>, entries: [{ studentId,
correct, attempted }] }`. Auth: `requireTeacher` (401 forbidden). For each entry:
- compute `score = blooketScore(correct, attempted, total)` (0..1);
- derive `itemId`: parse lessonKey `"U?<unit>.<lessonKey>"` -> `BLOOKET-U<unit>L<lessonKey>`
  (e.g. "1.2" -> BLOOKET-U1L2; "4.1-2" -> BLOOKET-U4L1-2);
- write via the SAME ledger insert the `/ledger/record` route uses
  (`db.insertLedgerRow({ studentId, source:'blooket', itemId, unit:"U<unit>",
  response:{correct,attempted,total}, score, attempt:1 })` — find the exact db handle
  + signature by reading ledger.js/server.js; attempt=1 so a re-import upserts).
- Validate: `total` a positive int; `correct`/`attempted` finite >=0; bad entry ->
  collect in `errors`, don't 500 the batch.
- DB column-missing (42703 / message has item_ledger_source_check or check constraint)
  -> 503 `{ok:false,error:'blooket source not provisioned'}` (mirror the sprite-hue /
  schoology-uid 503 precedent). Other error -> 500.
- 200 `{ ok:true, recorded:<n>, skipped:<n>, errors:[...] }`.
Define `blooketScore` once in a small shared spot (e.g. export from `scoring.js` or a
new `blooket.js`) so the endpoint + a unit test import the SAME function.

### A7. roster-server tests
- `blooketScore`: the worked cases in 1, plus clamps + attempted=0.
- `parseItemLesson('BLOOKET-U1L2')` and `'BLOOKET-U4L1-2'`.
- `computeLessonGrades`: a blooket row attaches `result.blooket` (0..100); absent -> null.
- `computeQuarterV3`: with one blooket recorded, `tracks.blooket` engages and workAvg
  renormalizes (e.g. lessons .8, quizzes .6, blooket 1.0 -> workAvg = (.30*.8+.30*.6+
  .10*1.0)/(.70) = .52/.70 = .742857); with NO blooket rows, workAvg == today (lessons+quizzes
  only) -> proves NO REGRESSION / no tanking.
- `POST /class/blooket`: 200 records rows (assert insertLedgerRow called with the right
  itemId+score), 401 no-secret, 503 on a fake-db 42703, malformed entry collected not
  fatal. Use the createFakeDb()+TestServer pattern (auth.test.js / class.test.js).

## 4. Unit B — import tool + template (one agent; independent)

### B1. `scripts/import-blooket.mjs` (Node 18 ESM, zero deps; mirror teacher-roster.mjs)
Args: `--csv <file>` (rows `student,correct,attempted`; header auto-detected when the
first cell is in [student,name,nickname,username]); `--lesson <key>` (e.g. "1.2" or
"U1.2"); `--total <int>`; `--section <S>` (scopes the roster lookup); `--url`,
`--secret` (resolve like teacher-roster.mjs: flag -> env -> roster-server/.env);
`--dry-run`.
- `--dry-run`: parse + print the plan (each row: student, correct, attempted, computed
  score via the SAME formula, resolved/unresolved) — NO network.
- live: `GET /roster/list[?section=]`, build login_username->studentId AND
  real_name->studentId (case-insensitive) maps; resolve each CSV "student"; collect
  `entries`. POST `/class/blooket {lessonKey,total,section,entries}`. Print an aligned
  result table + UNMATCHED rows (report, never silently drop). Exit non-zero if any row
  failed/unmatched.
- Include `blooketScore` (copy the 1-formula verbatim) for the dry-run display; a tiny
  parse+formula test is welcome.

### B2. `scripts/blooket-template.csv` (new) — the importable shape:
```
student,correct,attempted
coconut_shark,28,30
maple_otter,20,25
```
Document in `--help`: one row per student; `student` = roster username OR real name;
`correct`/`attempted` from the scoreboard; the lesson + question total are passed as
`--lesson` / `--total`. A BLANK attempted is an invalid row (skipped + reported, never
a silent 0); an explicit `0,0` is a recorded skip that scores 0.

### B3. `import-blooket` test (light): CSV parse, header detection, dry-run plan +
computed score; no network. (Node test, like tests/teacher-roster-uids.test.js.)

## 5. Acceptance
- roster-server vitest green (existing + new); `npx vitest run` in roster-server.
- NO-REGRESSION proof: a v3 computation with zero blooket rows equals the pre-change
  number (renormalize over lessons+quizzes only).
- `import-blooket --dry-run` prints correct computed scores, no network.
- git diff touches only: migrations/0013, lesson-grade.js, grade.js (opt), class.js,
  scoring.js-or-blooket.js, roster-server/tests/*, scripts/import-blooket.mjs,
  scripts/blooket-template.csv, tests/import-blooket*.test.js, this spec.

## 6. Teacher handoff (post-merge)
1. Run `0013_item_ledger_blooket_source.sql` on the shared Supabase.
2. Per Blooket: screenshot -> CSV `student,correct,attempted` -> `node
   scripts/import-blooket.mjs --csv b.csv --lesson 1.2 --total 30 --section <S>`
   (`--dry-run` first).
3. Scores flow into Work (10%) and show live in the start-here Grade Playground.
Open: nickname<->roster matching is best-effort (scoreboards show nicknames); the tool
REPORTS unmatched for the teacher to fix.

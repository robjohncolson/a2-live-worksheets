# GRADE_PIPELINE_BUILD.md

> Frozen implementation contract for `GRADE_PIPELINE_SPEC.md` "Thread 1".
> Planner-frozen 2026-05-21 (session 105). HEAD at freeze = `4708d6f`.
> Decisions locked (spec section 6): D1 `w_ws:w_w:w_q = 1:2:3`,
> D2 partial blank = 0.5, D3 `Cws` over ALL blanks (unattempted = 0),
> D4 client-recorded verdict for v1.
>
> This is the contract. Implement to it exactly. The grading model is
> the teacher's -- do not improvise it.

## 0. Investigation summary (state on disk, verified 2026-05-21)

**Worksheet feeders** (uniform across the 69 live worksheets, wired by
`scripts/dn2b-wire-feeders.mjs`):
- `.blank` inputs: `handleLiveUpdate(blank)` fires on blur + Enter
  (debounced 250ms) -> `recordBlankToGradebook(blank)` ->
  `gradebookClient.record({ source:'worksheet', itemId, unit,
  response, attempt:1 })`. **No `score`.** `checkAnswer(blank)` returns
  `'correct'|'partial'|'incorrect'|'empty'` and is in scope, but its
  verdict is discarded.
- reflection textareas (`reflect1`, `reflect2`, `exitTicket`, ...):
  recorded ONLY at AI-grade time, by `recordReflectionToGradebook(
  textareaId, answer, scoreLetter)` -> `record({ source:'frq', itemId,
  unit, response, score: {E:1,P:0.5,I:0}[scoreLetter] OR undefined,
  attempt:1 })`. Called only from `gradeAllReflections` (success path).

**Grade engine** (`roster-server/`):
- `grade.js` `computeGrade` has two paths. Unit-level (`units{}`,
  lines ~113-150) uses `config.feederWeights {W:1,Q:2}`. Lesson-level
  (lines ~152-291) calls `computeLessonGrades(...)` -> `lessonMap` ->
  `computeQuarterFromLessons` -> `quarters{}.quarterGrade`. The
  student-facing grade of record is the lesson-level path.
- `lesson-grade.js` `computeLessonGrades(rows, frqBand, answerKey,
  schedule)`: per topic accumulates `frqItems`/`quizItems`/
  `worksheetItems`. `worksheetItems` is **completion-only** (`{itemId,
  ts}`, no score). `B` weights are **hardcoded** at line ~206
  (`{W:1,Q:2}`), NOT read from config.
- `grade.js:170` is the single `computeLessonGrades` call.
  `answerKey` <- `roster-server/data/answer-key.json`, `schedule` <-
  `roster-server/data/lesson-schedule.json` (both injected through
  `mountGrade`). `roster-server/data/work-manifest.json` exists and
  enumerates every worksheet's blank itemIds + count, but is NOT read
  by the grade pipeline today.
- The Desk `_studentMarkSave` writes a synthetic completion row
  `WS-U{n}-L{n}-DESK_DONE` with `source:'worksheet'`, `score:null`
  (`ap_stats_roadmap_square_mode.html` ~6118). `parseItemLesson`
  parses it -- so it reaches `computeLessonGrades` as a worksheet row.

**Confirmed W2 defects** (`u1_lesson1_live.html`, representative):
- D-a: a reflection edited but NOT re-graded is never recorded;
  `hydratePriorAnswers` (fill-empty, line ~1176) restores the last
  *graded* text on reload -> the revision is silently lost.
- D-b: `submitAppeal` (lines ~1515-1563) upgrades `state.result` +
  re-renders the UI but **never calls `recordReflectionToGradebook`**
  -> a granted appeal (I->P, P->E) never reaches `item_ledger`; the
  grade keeps the pre-appeal score.
- D-c: `recordReflectionToGradebook` is fire-and-forget; a fast reload
  after grading can race the POST (secondary).
- D-d: `hydratePriorAnswers` restores reflection *text* but not the
  *grade* (no `graded-*` class) -> a restored reflection looks
  ungraded.

**Confirmed W3 defect**: the AI verdict (`result.score` from
`/api/ai/grade`) is used raw. `recordReflectionToGradebook` does
`(scoreLetter in {E,P,I}) ? map : undefined` -- any non-exact value
(lowercase `e`, `"Essentially"`, `null` from a network/parse error,
missing) -> `score:undefined` -> recorded with no score -> silently
dropped from `W`. Prompts say `"score": "E" or "P" or "I"` but do not
mandate exactly one uppercase letter.

## 1. Scope and sequencing

Four work items, three or four commits, in this order (spec section 5):

1. **W2** -- worksheet reflection persistence (bug). Commit 1.
2. **W3** -- unambiguous E/P/I verdict (reliability). Commit 2.
3. **W1** -- score the worksheet blanks (the model change). Commit 3.
4. **W4** -- grade pill refresh. Folded into commit 3 (ships with W1).

Each commit: implement -> Codex read-only eval -> planner re-verify on
disk -> commit + push. W1 touches `roster-server/**` and triggers the
auto-deploy.

## 2. W2 -- FRQ-revision persistence

All W2 changes live in **uniform, wire-scriptable** worksheet code.
`gradeAllReflections` / `gradeReflection` (per-lesson, non-uniform) are
NOT touched.

- **W2.1 -- draft-persist on edit.** Add one debounced (~400ms) `input`
  listener over reflection textareas (`textarea[id]` not inside
  `.appeal-form` -- reuse `_wsReflectionTextareas()`'s rule). On input:
  persist the current text via `recordReflectionToGradebook(ta.id,
  text, null)` (no score = draft). GUARD: skip when `gradingState`
  holds an entry for the id whose `originalAnswer` equals the current
  text (unchanged since grading -- must not clobber a graded row's
  score). Skip empty text.
- **W2.2 -- clear the stale grade on edit.** Same listener: if the
  textarea carries a `graded-{E|P|I}` class and the text now differs
  from `gradingState.get(id).originalAnswer`, remove the `graded-*`
  class, clear `#<id>-feedback`, and delete the `gradingState` entry.
  A revised reflection visibly returns to "ungraded -- re-grade me."
- **W2.3 -- appeals re-record.** In `submitAppeal`, immediately after
  `state.result = appealResult;`, add
  `recordReflectionToGradebook(questionId, state.originalAnswer,
  appealResult.score);`. The anchor line is uniform across worksheets
  even though `submitAppeal` as a whole is not.
- **W2.4 -- hydration restores the grade.** In `hydratePriorAnswers`,
  when a restored reflection textarea's ledger `entry.score` is
  non-null, also apply the `graded-{E|P|I}` class (1->E, 0.5->P, 0->I)
  so the restored reflection reads as graded and
  `updateWorksheetCompletion`'s `reflectionsAllE` is correct.
- `recordReflectionToGradebook`: add an empty-answer skip guard.

**Consequence (intended, per spec).** Editing an already-graded
reflection clears its grade until the student re-grades. The spec calls
"the revision did not re-score" the bug -- a revision must re-score, so
a changed answer must not keep a stale score.

**Acceptance.** Extend `tests/reflection-grader.test.js` (or a new
`tests/grade-pipeline-w2.test.js`): record a graded reflection ->
simulate an edit -> assert (a) the draft persists with no score and
(b) the `graded-*` class is cleared; simulate hydration -> assert the
revised text re-hydrates and a scored entry re-applies `graded-*`;
simulate an appeal upgrade -> assert `recordReflectionToGradebook` is
called with the new score.

## 3. W3 -- unambiguous E/P/I from the AI grader

- **W3.1 -- prompt hardening.** Every `ai-grading-prompts-*.js` prompt
  builder used by the 69 live worksheets must end with an explicit,
  unambiguous verdict instruction: the JSON `score` field must be
  EXACTLY one uppercase letter -- `E`, `P`, or `I` -- no words, no
  lowercase, no surrounding quotes-in-quotes. Rollout mechanism (a
  wire-script keyed on the shared "Respond in JSON" / JSON-block
  anchor, or per-pattern) finalized at W3 implementation after
  confirming builder uniformity.
- **W3.2 -- tolerant parser, never silent.** New uniform helper
  `coerceVerdict(raw)` -> `'E'|'P'|'I'|null`: trim, uppercase, read the
  FIRST character (so `e`, `"E."`, `"Essentially"`, `partial`,
  `incorrect`, `"I."` all map; `''`/`"maybe"`/`"correct"`/`null` ->
  `null` -- a non-E/P/I first character is ambiguous, not coerced).
  Draft writes and graded writes use SEPARATE sinks so a graded write
  whose AI verdict came back `null`/missing is never mistaken for a
  draft:
  - `recordReflectionDraft(textareaId, answer)` -- the W2.1 draft sink.
    Records the in-progress answer with `score:undefined` and runs no
    verdict logic. W2.1's edit listener calls this, not
    `recordReflectionToGradebook`.
  - `recordReflectionToGradebook(textareaId, answer, scoreLetter)` --
    the GRADED/appeal sink. `coerceVerdict(scoreLetter)`: a valid
    `E`/`P`/`I` records the mapped score; `null` (an ambiguous OR
    missing verdict) is NOT silently recorded -- `console.error` the
    raw value + itemId and skip the write (loud, not silent).
  REVISED 2026-05-21 (Codex W3 MAJOR fold): the earlier single-sink
  design keyed the draft branch on `scoreLetter===null`, but the graded
  path passes `null` when the AI returns no score -- that recreated the
  silent no-score write. The two-sink split fixes it.

**Out of W3 v1 scope.** A student-facing retry button requires editing
the non-uniform `gradeReflection`; the hardened prompt + tolerant
coercion + loud logging satisfy the spec's "a retry OR a clear error."

**Acceptance.** `tests/grade-pipeline-w3.test.js` (or extend
`tests/reflection-grader.test.js`): `coerceVerdict` maps `E/e/P/p/I/i`,
`"Essentially"`, `"  P "` correctly and returns `null` for `""`,
`null`, `"maybe"`; `recordReflectionToGradebook` with an uncoercible
verdict logs and does not record. `tests/grading-prompts*.test.js`:
every built prompt contains the mandated verdict instruction.

## 4. W1 -- score the worksheet blanks

### 4.1 Server (`roster-server/`)

- **`grade-config.js`**: add a new knob
  `lessonFeederWeights: { ws: 1, W: 2, Q: 3 }`. LEAVE `feederWeights:
  { W: 1, Q: 2 }` unchanged -- the unit-level `units{}` path keeps its
  model (see section 7).
- **`lesson-grade.js`**:
  - New pure exported helper `buildWorksheetBlankCounts(manifestDoc)`
    -> `{ "<unit>.<lessonKey>": <int> }` -- walks
    `manifest.units[].lessons[].activities[]` (`activity === 'worksheet'`),
    counts `itemIds` matching `/-Q\d+$/`, keyed by the manifest
    `lesson` value (`"1.1"`, `"4.1-2"`).
  - `computeLessonGrades` gains a 5th arg `opts = { worksheetBlankCounts,
    weights }`. Replace the hardcoded line ~206 weights with
    `opts.weights` (`lessonFeederWeights`).
  - Worksheet rows: count ONLY real blank itemIds matching
    `/^WS-U\d+L[\d-]+-Q\d+$/` (this EXCLUDES `...-DESK_DONE`). Push
    `{ itemId, ts, score }`; treat a null/non-numeric `score` as 0.
    Record the worksheet's count key (`<unit>.<lessonKey>` parsed from
    the item) on the accumulator.
  - Per topic: `Cws = clamp((sum of blank scores) / blankCount, 0, 1)
    * 100`, where `blankCount = worksheetBlankCounts[countKey]`. If
    `blankCount` is missing or 0 -> `Cws = null`.
  - `lessonGrade` (`B`) = three-way weighted mean over PRESENT feeders:
    `(Cws*w_ws + W*w_w + Q*w_q) / sum(present weights)`, weights from
    `lessonFeederWeights`. A combined worksheet's `Cws` lands on each
    of its topics, exactly as `W`/`Q` already do.
- **`grade.js`**: thread `worksheetBlankCounts` from `mountGrade` into
  `computeGrade` and the `computeLessonGrades` call; pass
  `lessonFeederWeights`. `computeQuarterFromLessons` is unchanged --
  it consumes `lessonGrade` regardless of how it was composed.
- **`/class/grades`** (Phase 4a, `class.js` / the fan-out): thread
  `worksheetBlankCounts` the same way `lessonSchedule` is threaded.
- **`server.js`**: load `roster-server/data/work-manifest.json`
  (mirror `loadLiveLessonSchedule`, same path-resolution + fault
  tolerance); build `worksheetBlankCounts`; inject into `mountGrade`.
  A missing manifest degrades to `Cws = null` everywhere (worksheet
  term simply absent; W/Q renormalize) -- never a crash.

### 4.2 Client (the 69 live worksheets)

- `recordBlankToGradebook(blank)`: compute the verdict with
  `checkAnswer(blank)`, map `{correct:1, partial:0.5, incorrect:0}`,
  pass it as `score` in the `record(...)` call. Keep the existing
  empty-skip. (`checkAnswer`'s CSS-class side effect is benign -- it
  re-applies the class the blank already has.)
- Rollout: a new EOL-preserving, idempotent `scripts/wire-blank-scores.mjs`
  (or an extension of `dn2b-wire-feeders.mjs`) anchored on the uniform
  `recordBlankToGradebook` body. Pattern-guard to
  `^u\d+_lesson.+_live\.html$`.

### 4.3 Acceptance

`roster-server/tests/` -- extend the lesson-grade suite: worksheet +
W + Q present -> `lessonGrade = round((Cws*1 + W*2 + Q*3)/6, 1)`;
worksheet-only -> `Cws`; renormalization when a feeder is absent;
partial-credit (a 0.5 blank); `Cws` "over all blanks" (unattempted
blanks absent from the ledger, denominator from the manifest);
`DESK_DONE` rows excluded; missing manifest -> `Cws` null, no crash;
`buildWorksheetBlankCounts` over a manifest fixture. Existing
roster-server grade tests stay green. Client: a worksheet test that a
blank records `score` in `{1, 0.5, 0}`.

## 5. W4 -- grade pill refresh

`ap_stats_roadmap_square_mode.html` `_studentMarkSave`, success path
(after the `rCal()` call, line ~6130): add a fire-and-forget,
typeof-guarded `renderDoNowGrades(baseUrl, token)` call -- mirror the
existing call at line ~4361 (`baseUrl` = `window.ROSTER_SERVICE_URL`,
`token` via `rosterClient.token()`; skip when either is absent). So
the Do Now grade pills move when a worksheet or quiz is marked Done.

**Acceptance.** A Desk test asserting `_studentMarkSave`'s success
path invokes `renderDoNowGrades` when signed in, and that the call is
`typeof`-guarded.

## 6. Rollout mechanics (carry-forward gotchas)

- EOL-preserving wire scripts only -- never a hand-edit per file. The
  ~30 older U1-U3 / some U8-U9 worksheets are CRLF; bulk edits must
  detect and preserve per-file EOL. `scripts/dn2b-wire-feeders.mjs` is
  the reference pattern (per-edit sentinel = idempotent; literal/regex
  anchor; non-unique anchor -> report MANUAL, do not force).
- Stage own paths only -- never `git add -A`. The repo carries
  pre-existing untracked scratch (`.ai-tutor-*`, `.codex-*`,
  `state/cross-agent*`, `GRADEBOOK_TAGGING_AUDIT.md`). If
  `data/skill-map.js` shows only a regenerated `// GENERATED:`
  timestamp header, `git checkout` it.
- Codex cross-agent eval: ASCII-only prompts; read the verdict from
  the transcript / `state/cross-agent/<id>.result.json` `notes`, never
  the wrapper. Always re-verify Codex findings on disk.
- The Desk file is the contended ~10k-line single file -- planner
  edits it directly, never a parallel Sonnet on it.

## 7. GREEN gate (the loop gate, per commit)

- follow-alongs root `npm test`: no NEW failures beyond the known
  unrelated `tests/study-guide.test.js` fail.
- `npm --prefix roster-server test`: all green; W1 adds cases and the
  existing grade tests stay green.
- `node scripts/audit-feeder-ids.mjs` -> CLEAN 69 / MISMATCH 0.
- The new W1/W2/W3/W4 test files pass.
- Per-file EOL preserved; Desk file stays LF.

## 8. Out of scope (explicit non-goals)

- The unit-level `units{}` grade path in `grade.js` (~lines 113-150)
  is NOT changed -- it stays FRQ + quiz only, on `feederWeights
  {W:1,Q:2}`. Consequence: the teacher-dashboard per-unit `B` and the
  student `quarterGrade` differ on whether worksheets count. This is
  deliberate (spec section 4 non-goals; the `units{}` path is a
  secondary teacher readout). If the teacher wants them unified, that
  is a follow-up, not Thread 1.
- Cap/uncap, the 85 ceiling, quarter bands, PC anchors -- unchanged.
- A student-facing AI-grade retry button (W3) -- v1 uses the hardened
  prompt + tolerant coercion + loud logging.
- `curriculum_render/data/curriculum.js` -- never written. SACRED.

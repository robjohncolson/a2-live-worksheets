# AI worksheet grading — semantic blanks + folded FRQ pass (build spec)

Decided with the teacher (2026-06-02). Make follow-along grading fairer: a student whose
answer **means the same thing** as the key gets **full credit**, judged **coherently** against
the unit/lesson framework — not punished for not copying the exact words. One AI pass also
(re)grades the FRQ section E/P/I, **upgrade-only**.

## Confirmed decisions
1. **Trigger:** automatic on **Done** + a manual **"✨ AI re-check"** button. MUST dedupe +
   queue so the API isn't spammed (see Anti-spam).
2. **AI on everything**, evaluated as **one coherent whole** vs. the unit/lesson **framework** +
   the answer key (the key shows the perfect answer; concepts holding up = credit). Numeric
   answers: the AI must require the **value** to match (formatting/rounding differences OK),
   never accept a genuinely different number.
3. **Full credit (1.0)** for a synonymous / conceptually-correct answer — no partial penalty.
4. FRQ section: (a) **fold its E/P/I grading into the same one-click pass**, and (b) an
   **upgrade-only re-check** (shift up if the AI now scores higher; otherwise keep the old grade).

## How blanks grade today (baseline — unchanged as the first pass)
`checkAnswer()` → normalize + pipe-split `data-answer` → exact (green, 1.0) / substring
(yellow, 0.5) / none (red, 0) → `recordBlankToGradebook()` → ledger `WS-U{u}L{key}-Q{n}`
(source `worksheet`, attempt 1, latest-wins). The AI is a **second layer on top** — it only
ever **upgrades** a blank that the verbatim pass didn't already give full credit.

## A. cr server — new `POST /api/ai/grade-worksheet`
One batched call grades the WHOLE worksheet's blanks coherently.
- **Request:** `{ scenario: { topic, unitLesson, lessonContext }, blanks: [{ id, question,
  acceptedAnswers:[...], studentAnswer }] }`. (FRQs keep the existing per-item `/api/ai/grade`.)
- Reuse `buildFrameworkContext()` / `getFrameworkForQuestion()` (already in server.js) to ground
  the prompt in the unit/lesson **framework**, plus the passed `lessonContext`.
- **Prompt rules:** judge the answers as a coherent whole; for each blank decide `credit` =
  does the student's answer convey the SAME concept as an accepted answer, in context? Accept
  synonyms/paraphrases/equivalent notation. **Numeric/value answers: require the value to match
  the key (allow only formatting/rounding); never accept a different number.** Be strict, not
  generous — the bar is "a teacher would mark this right."
- **Response:** `{ blanks: [{ id, credit:bool, reason }], _provider, _model }`. `503` if AI off;
  `400` if no blanks.
- Reuse `gradingQueue` (serialized + rate-limited) — exactly like `/api/ai/grade`.

## B. Client — one pass (wired into all 69 worksheets)
`aiGradeWorksheet({ manual })`:
1. **Collect blanks:** every blank → `{ id (questionId), question (DOM-extracted prose),
   acceptedAnswers (split data-answer), studentAnswer, currentScore }`. Send ALL (for coherent
   context); only ACT on ones below full credit (upgrade-only).
2. **Dedup:** `hash(all blank answers + all FRQ answers)`. If `hash === _aiLastGradedHash`, SKIP
   (manual → toast "No changes since the last AI check"; auto-on-Done → silent). Prevents re-grading
   identical content.
3. **Single-flight:** `_aiGradeBusy` guard + button disabled "✨ grading…" while running; auto-on-Done
   no-ops if busy or already graded this hash.
4. **Blanks:** POST `/api/ai/grade-worksheet`. For each `credit:true` blank currently < 1.0:
   mark green, show "✨ AI-accepted: <reason>", and `recordBlankToGradebook` at **1.0** (upgrade-only —
   only re-record if higher than current).
5. **FRQs:** run the EXISTING per-FRQ `gradeReflection()` for each ungraded/changed FRQ; the
   appeal/upgrade path already never downgrades. (Reuses the calibrated rubric system + `/api/ai/grade`.)
6. On success store `_aiLastGradedHash`. Re-render any grade chips / Do-Now pills.

### Trigger wiring
- **Done:** the worksheet's Done flow calls `aiGradeWorksheet({manual:false})` (guarded by hash + busy).
- **Button:** "✨ AI re-check" next to the Done/grade controls → `aiGradeWorksheet({manual:true})`.

## Anti-spam (decision #1 — load-bearing)
- **One AI call for ALL blanks** (not per-blank) → ~1 call/worksheet/pass + N FRQ calls.
- **Hash dedup**: never grade the same answer-set twice.
- **Single-flight** per worksheet: one pass at a time; button disabled while running.
- **Server `gradingQueue`**: serializes + rate-limits across the whole class.
- FRQ calls reuse the existing per-item dedup (only grade changed/ungraded items).

## Guards / non-goals
- AI **never downgrades** — blanks and FRQs are upgrade-only; the verbatim pass + the original
  FRQ grade are the floor.
- Numeric correctness preserved by the strict-value prompt rule + the answer key as ground truth.
- No new ledger source/migration — blanks stay `WS-…-Q{n}` (worksheet), FRQs `WS-…-reflect{n}` (frq).
- v3 grades are LIVE — this MOVES grades upward only. Adversarial review before shipping.

## Tests
- cr `tests/grade-worksheet.test.js` — endpoint registered, prompt carries framework + the
  strict-numeric rule + "same concept" rule, batched-blanks shape, JSON response shape, queue reuse, 503/400.
- follow-alongs `tests/ai-worksheet-grade.test.js` — `aiGradeWorksheet` collects blanks w/ DOM
  question + accepted answers; hash dedup; single-flight guard; upgrade-only (only re-records when
  higher, full credit 1.0); auto-on-Done + manual button wired; FRQ fold; soft-fail (AI down → the
  verbatim grade stands). Static-parse + pure-fn where possible.
- Wire rollout `scripts/wire-ai-worksheet-grade.mjs` — targets `^u\d+_lesson.+_live\.html$`,
  EOL-preserving, idempotent sentinel; dry-run first on 1-2 worksheets.

## Rollout
`node scripts/wire-ai-worksheet-grade.mjs` (dry-run) → verify on u6_lesson1-2 + u8_lesson1 →
`--apply` to all 69 → commit follow-alongs + curriculum_render separately (own paths only).

## 2026-08-19 — FRQ coverage fold (every answered reflection gets graded)

Finding: 44% of `source:'frq'` rows in the 2026-08-17 ledger snapshot had `score = null`
(answer saved as a draft, never graded). Causes and fixes, all in `INJECTED_JS`
(`scripts/wire-ai-worksheet-grade.mjs`, re-applied to all 69 worksheets with `--rewire --apply`):

1. Grading ran only on "Check Answers"/"Grade with AI" → now also on textarea **blur**
   (0.8 s), **10 s idle** after typing, and page hide (all through the same hash/single-flight
   `aiGradeWorksheet({manual:false})`).
2. The auto path refused to persist a first-ever **I** (#10) → it now persists it. Every FRQ
   record path is floored, so a later pass can only raise; not recording left the row null.
3. Grader failures were swallowed → `_aiGradeWithRetry` (2 retries, 2 s / 5 s), failures
   remembered in `localStorage apstats_frq_ungraded_<prefix>` and re-run on the next load.
4. On load, any prior FRQ row with ≥ 20 chars of text and no score is graded automatically
   (`_aiRegradeUngradedPrior`) — this back-fills historical nulls as students revisit.

Not covered: students who never reopen a worksheet keep their historical null rows; a
teacher-side batch regrade needs a server write path (see PC_FRQ_GRADING_SPEC.md §3/§9).

### 2026-08-19 review hardening (same day)
Adversarial review of the coverage fold found real gaps; all addressed:
- **Server floor** (`roster-server/ledger.js` `/ledger/record`, `source:'frq'` only): a draft
  (score undefined) never nulls a stored grade; a lower regrade never lowers it. This closes a
  pre-existing hazard (an edit after grading nulled the ledger score) that the auto path made
  reachable. Grade math untouched.
- Stale verdicts (student kept typing while the grader ran) are neither shown nor recorded; a
  trailing pass grades the current text. Busy passes re-schedule instead of dropping.
- One bounded retry (5 s), E/P/I validated before success; malformed verdicts are remembered as
  ungraded. Auto passes budgeted to 6 per 10 min per page; idle trigger 20 s.
- Recovery memory is student-scoped (`apstats_frq_ungraded_<username>_<prefix>`); on-load regrade
  waits until the textarea holds the exact prior text (hydration), up to 3 checks.
- Inline-grader worksheets (u3_lesson6-7's `ReflectionGrader` instance) are covered via an adapter.
Residual leaks: students who never reopen a worksheet keep historical null rows (needs a
teacher-side batch regrade — PC_FRQ_GRADING_SPEC.md); answers under 20 characters are never graded.

## Server-independent regrade job

`tools/frq-regrade-manifest.mjs` derives the worksheet/prompt contract directly from all 69 live
worksheets and writes the committed `data/frq-regrade-manifest.json`. The batch job reads
`~/grade-backups/config.json` (`rosterUrl` and `teacherKey`), pulls `/admin/snapshot`, and only
selects existing `source:'frq'` rows whose score is null, response is at least 20 trimmed
characters, manifest item ID is exact, and recorded age is at least 10 minutes. It is sequential
and starts at most 20 grader calls per minute. It never prints response text.

Exact commands, from the repository root:

```bash
node tools/frq-regrade-manifest.mjs
node tools/regrade-ungraded-frqs.mjs --dry-run
node tools/regrade-ungraded-frqs.mjs --apply
node tools/regrade-ungraded-frqs.mjs --dry-run --student USERNAME
node tools/regrade-ungraded-frqs.mjs --apply --student USERNAME --limit 10
```

Dry-run is the default and makes no grader calls. Apply mode posts validated E/P/I scores to the
teacher-gated `/ledger/frq-regrade` route with provenance `ai-batch`; the route never creates a row
and its FRQ floor can only hold or raise the stored score. Every run prints `found`, `graded`,
`applied`, `floorHeld`, and `failed`, then appends the same privacy-safe summary as one JSON line to
`~/grade-backups/frq-regrade.log`. A grader HTTP 5xx makes the process exit non-zero.

The overseer installs `~/.config/systemd/user/apstats-frq-regrade.service` with exactly:

```ini
[Unit]
Description=AP Stats hourly server-independent FRQ regrade
[Service]
Type=oneshot
ExecStart=/home/mrcolson/.nvm/versions/node/v24.16.0/bin/node /home/mrcolson/repos/apstats-live-worksheet/tools/regrade-ungraded-frqs.mjs --apply --config /home/mrcolson/grade-backups/config.json
WorkingDirectory=/home/mrcolson/repos/apstats-live-worksheet
```

And `~/.config/systemd/user/apstats-frq-regrade.timer` with exactly:

```ini
[Unit]
Description=Hourly AP Stats server-independent FRQ regrade
[Timer]
OnCalendar=hourly
Persistent=true
[Install]
WantedBy=timers.target
```

Enable it with:

```bash
systemctl --user daemon-reload
systemctl --user enable --now apstats-frq-regrade.timer
systemctl --user list-timers apstats-frq-regrade.timer
```

# SCHEDULE_HANDOFF — the fall SY2627 schedule (start here)

**For the teacher:** §1 is the exact data to hand over. Nothing else is needed.
**For the next Claude/Codex instance:** §2 is the state as of 2026-08-19, §3 the ordered
work, §4 the gates. Read `sy2627-schedule-reframe-spec.md` (Codex-reviewed v2) for the
full design; this file only sequences it and records what changed since.

---

## 0. STATUS 2026-09-03 — the schedule is LIVE (steps 1–3 + 5 done)

Trigger: the Desk told Period B that 1.1 was due Fri 2026-09-04 — a district closure.
The Desk's baked `SCHEDULE_DEFS["SY26-27"]` still had the estimate calendar (start
Sep 1, exam May 14, 8 of 13 closures). Fixed in one pass, one source of truth:

- **`ap_stats_roadmap_square_mode.html` `SCHEDULE_DEFS["SY26-27"]`** now carries the real
  calendar (first day 09-02, exam 05-11, all 13 closures; B Mon/Tue/Thu/Fri, E Mon/Wed/Fri).
  Old `3.7` removed from both pacings (crosswalk: bonus since the 2026-08-07 retag; it was
  never in the Do-Now manifest either) → 66 core topics on the calendar.
- **`scripts/build-lesson-schedule-sy2627.mjs`** (NEW) extracts that block + the Desk's own
  `generateSchedule()` and writes BOTH `lesson-schedule.json` copies from it — so server
  "due" and the student calendar cannot disagree. Self-asserting (meeting days, closures,
  before-exam, core dated / bonus null, core order == the fixture generator's). The file now
  also carries `calendar{firstDay, examDate, breaks, meetingDays, quarters, events, slack}`;
  `progressChecks`/`posters` are keyed by NEW CED unit 1–5 (= Desk `U{n}-PC*` ids) with
  per-period `adminDay2` and `mcqPartA`. `lessons[].unit` stays the OLD id.
  Rerun after ANY change to the Desk calendar/pacing: `node scripts/build-lesson-schedule-sy2627.mjs`.
  `scripts/build-sy2627-schedule.mjs` (even-spread estimate) is SUPERSEDED — do not run it.
- **`roster-server/grade-config.js`** quarters = real LEHS marking periods (Q1 09-02→11-06,
  Q2 11-09→01-22, Q3 01-25→04-14, Q4 04-15→06-17).
- Tests moved with it: `quarters-by-date.test.js` (boundaries + a self-validating sanity block
  that reads the file's own `calendar`), `desk-grade-checkin.test.js` (preseason = Tue 09-01),
  J7 (66 lessons), m2b snapshot regenerated (`UPDATE_M2B_GOLDEN=1`; the Q1 band moved:
  old units 1/2/4 now finish after 11-06 under the CED order, so only old-unit 3 bands to Q1 —
  lesson attribution is per-lesson-date and unaffected).
- Step 4 (Supabase) needed NOTHING: `lesson_urls` keys are unchanged, and `topic_schedule`
  only feeds Schoology folder links/sync status in the Desk — never dates. The Agent repo's
  `config/topic-schedule.json` + `roadmap-data.json` PC/poster dates are still last year's
  (cosmetic; the Desk does not read dates from them). Step 6 (CED gradebook framing) still open.
- 2026-09-03 (later): teacher dropped the Day-2 **Unit 1 Baseline Check** from both pacings — the calendar now opens Welcome → 1.1 (B: 09-03 → 09-08; E: 09-02 → 09-09). Regenerated schedule + snapshots.
- **Grade display decisions (teacher, 2026-09-03 evening) — SHIPPED:**
  (1) "Schoology today" is now a real number: `gradebook-grid.js` `schoologyTotal` averages only
  DUE + COMPLETED cells (blanks never 0, ahead work excluded) and the Schoology sync
  (`tools/schoology_sync_section.py`) gates creation + grading to columns due on/before
  `--through` (default: today in America/New_York; `--no-through` disables). The Desk Do-Now
  strip shows it as a "Schoology today" chip; My Gradebook's "Report-card estimate" was renamed.
  (2) Early-completion bonus: `v3EarlyBonus {perLesson:1, cap:5}` — +1 point on the quarter grade
  per scheduled-due lesson whose LAST worksheet/FRQ submission (`recorded_at`) is ≤ 11:59 PM
  school time on its due day; ahead-of-schedule lessons are reported (`aheadLessons`) and earn
  theirs when due. **The cap of 5 is my placeholder — teacher has not confirmed it.**
  (3) `dueAfterLessonDay: true` — a lesson is due once its lesson day has ENDED (11:59 PM), so
  zeros appear the next morning, not at midnight before class. All three are config-gated; the
  frozen SY2526 config lacks the keys → its grades are byte-identical (m2b SY2526 snapshot).
- **Round-2 reviews (two more adversarial passes) folded in:** the bonus fields are threaded
  into the `/grade` + `/class/grades` payload (`quarterGradeBase`, `earlyBonus`, `earlyLessons`,
  `earlyKeys`, `aheadLessons`, `aheadKeys` — additive keys; the frozen SY2526 values are unchanged
  but its m2b snapshot gained the default-valued keys, and any NEW transcript receipt hashes the new
  shape). "Done by the deadline" = `worksheetCoverageReachedAt`: the k-th earliest blank stamp with
  k = ceil(minComplete×blankCount) — one blank never qualifies, a later edit/appeal/FRQ regrade of a
  row cannot revoke it, FRQ/AI stamps are ignored; a combined worksheet earns ONE bonus at its later
  topic's date; `cap: 0` = off. `reconcileQuarter` now names the bonus. The sync defers (not errors)
  grade targets for not-yet-due columns (`grades_deferred` in the summary), and `today_school_date()`
  falls back to a built-in US-Eastern DST rule when Windows has no `tzdata`.
  **`tools/daily_schoology_sync.ps1` now passes `--granularity component` to BOTH steps** — the
  default `lesson` mode pushed quiz-blended `lessonGrade` into one "Lesson" category and would NOT
  have matched the Desk chip. Run the dry-run once before -Live to see the new column set.
  Known, accepted: on the lesson day itself a completed lesson counts in "Schoology today" (column
  open, `<=`) while the v3 zero-for-missing rule waits until the day ends (`<`); the My Gradebook
  "due, not done yet" badge therefore fires on the lesson day. PC cells enter the chip from the
  unit's first lesson day (PC track is off, so inert). Production must have `USE_V3_GRADING=true`
  for the bonus path (it does); the Phase-6 fallback path has no bonus.
- **Grading-policy change (two adversarial reviews, 2026-09-03):** the v3 Lessons track now
  buckets a lesson by its CALENDAR DATE (`quarterOfLesson`, same as Phase 6) instead of the
  static old-unit band (`lesson-grade.js` computeQuarterV3). Under CED order the unit band put
  December work (old U8) in Q4 and let Q1 keep growing after 11-06 from 2.4–2.8. One-line
  revert if the teacher disagrees; `lesson-grade-v3.test.js` pins the new rule.
  The Desk's `QUARTER_WINDOWS` + `QUARTER_BAND_LABEL` (and start-here's) were also stale — now
  the real dates, labelled "Sep 2 – Nov 6" etc. instead of unit lists.
- **RESOLVED 2026-09-03 (late) — PC path keyed by NEW unit.** lesson-schedule.json's
  `progressChecks`/`posters` (NEW-unit keyed, per-period Day 1 + `adminDay2`) are loaded as an
  `eventSchedule` (grade-contexts `loadEventScheduleWithPriority`, SY2526 → null) and threaded
  through createApp to every grade mount. With it present: the PC band for a quarter = new units
  whose PC Day 1 falls in the quarter window; a PC is due once its Day 2 has ended; its curve is
  that quarter's pcAnchor; `quarters[q].pcUnits` is emitted and the gradebook's PC/Poster columns
  key off it (dated by the event schedule). Without it (frozen year, bespoke tests) the legacy
  old-unit proxy still applies. **`PC_TRACK_ENABLED=true` may now be flipped after the first paper
  PC is scored** (SY2627_ACTIVATION_RUNBOOK step 5). Note `units.U{n}` still merges old-unit
  quiz/FRQ data with new-unit PC data under the same key (Phase-6 `unitGrade` is display-only
  under v3). Two reviews folded in: PCs band by the quarter they become DUE in (Day 2 — E's U5
  is Day 1 04-14 / Day 2 04-16 and lands in Q4, never split across a close); the offline inputs
  (`/grade/offline-inputs`) now ship `eventSchedule` and the Desk's offline re-derive passes it
  (server parity); `tools/schoology_components.py` builds PC/Poster columns from
  `progressChecks`/`posters` (new units, PC Day 1 / poster date) when the schedule carries them;
  the m2b SY2627 snapshot now threads the event schedule like production (bands B: Q1 [1], Q2
  [2,3], Q3 [4,5], Q4 []). Accepted residuals: the gradebook marks a PC column open from Day 1
  (`<=`) while the engine counts it after Day 2 ends; `units.U{n}` still merges old-unit
  quiz/FRQ with new-unit PC data (display only); the Desk's baked `BAKED_REGISTRY`
  progressChecks blob is stale (not read); golden-synthetic `inputs.json` carries no
  eventSchedule, so regenerating it is a deliberate step that will move `pcUnits`.
- **RESOLVED (2026-09-03):** `build_scope` (lesson mode) now keys PC/Poster items
  `PC:U{n}`/`POSTER:U{n}` from the event row's NEW unit via `components.pc_key`/`poster_key` —
  the same string component mode, gradebook-grid.js and the grade producer
  (`units[U{n}].pcRawPct`) use. `tests/test_schoology_sync_section.py::TestPcPosterKeyParity`
  pins lesson == component == producer keys and the no-event legacy path. (The local state
  file's summer-mock `PeriodY/PC{n}` rows keep their old keys; the title pre-flight reuses
  those columns, so no re-keying is needed.)
- **RESOLVED (teacher, 2026-09-04):** Q4 (04-15 → 06-17) grades on nothing new — after the AP exam (2027-05-11)
  every day is a free day, seniors are gone a month early, and every student gets an A for Q4. Q4 = bonus-only
  for B, one PC for E; no Q4-specific engine work is needed.
- MINOR: `lessonsTotal` counts the 11 null-dated bonus topics (they fall back to the unit band),
  so `/grade` says e.g. "of 26" where the Desk says "of 66 lessons" overall. Cosmetic.
- MINOR: old units 1 and 4 (B) finish 11-09/11-10 — one day into Q2 — so a one-day slip flips
  their derived band. Bands only matter for the PC path (above).
- **Watch: Period E slack before the exam is +3 meetings** (B +33). The Desk pacing spends
  E meetings on Welcome, baseline, 2 mid-unit MCQ-A days, 5 poster days, 5×2 PC days and 3
  review days; the intake's +14 assumed only 2 PC days/unit. Any "stop and extend" on E now
  costs a poster/review day — teacher decision.

---

## 1. Data the teacher provides (the intake)

Fill in `sy2627-calendar-intake.md` — it is the form. The minimum that unblocks everything:

| # | Item | Why it is needed |
|---|---|---|
| 1 | **First instructional day** and **AP exam date** | Term window; the generator places 67 core topics + review days inside it |
| 2 | **No-school days / breaks** (date ranges) | Skipped when placing lessons |
| 3 | **Period model**: still B and E? same-day cadence or offset? Any new section names? | `sectionToPeriod()` maps sections → the period whose dates gate "due"; PeriodX is the summer universal section |
| 4 | **Quarter boundaries** (Q1–Q4 start/end dates) — or "same pattern as last year" | `grade-config.js` `quarters[q].start/end`; the engine assigns lessons and (now) units to quarters BY DATE, so these dates are the grading calendar |
| 5 | **Pacing**: per-CED-2026-unit day budgets (recommended) or per-topic meetings | Distributes topics over the window; overflow is flagged, never silently compressed |
| 6 | Review days per new unit (yes/no; extras) | Adds `1.review`…`5.review` keys |
| 7 | Archive last year's `topic-schedule.json`? (yes/no) | Stops SY25-26 dates lingering |

If you already have a per-topic date list (topic → date per period), send that instead of
#5 — it wins over any pacing model.

---

## 2. State as of 2026-08-19 (verified in code, not from memory)

- **Everything is keyed by OLD 9-unit ids** (`1.1`…`9.x`): `roster-server/data/lesson-schedule.json`
  (77 lessons, dates 2026-09-09 → 2027-02-02 = **last year's sequence on this year's dates**, an
  estimate), answer key ids (`U1-L2-Q01`), PC bank, Blooket lists, worksheet files, ledger item ids.
  The CED-2026 view is a per-topic RELABEL (`roadmap-data.json` `ced2026.newUnit/newTopic/newLabel`);
  old→new is many-to-many at the unit level (old U2 → new U2+U5, old U5 → 2/3/4). No unit-level relabel is honest.
- **Quarter assignment is date-driven** for lessons (`quarterOfLesson`) and — since `ff20ee1` — for
  units too (`deriveQuarterBands` in `lesson-grade.js`: a unit belongs to the quarter of its latest
  scheduled lesson date; the static `config.quarters[q].units` list is only the fallback).
  Under the current estimate the dashboard shows Q1 U1–4 · Q2 U5–8 · Q3 U9 · Q4 —.
- **Teacher dashboard** labels quarters from the payload's derived bands and relabels gradebook
  column headers with the CED-2026 topic key (old key on hover). Desk calendar shows old-order
  topics with CED relabels.
- **Grade integrity is guarded**: golden master (`roster-server/tests/golden-master.test.js`;
  committed synthetic oracle + local real-data oracle from `~/grade-backups/`, see
  `roster-server/docs/golden-master.md`), answer key frozen per year (`docs/answer-key-freeze.md`),
  Desk journeys J1–J9 (`tests/journeys/`). Any schedule change WILL move golden outputs — that is
  expected; the gate is that every movement is reviewed before `--accept`.
- **Deploy verification**: `GET /health` on roster-server returns `commit` (Railway SHA).
- The July generator `scripts/build-topic-schedule-sy2627.mjs` produces a SYNTHETIC fixture until
  `CAL` (+ pacing) is filled from the intake (14 baked invariants).

---

## 3. Ordered work once §1 arrives

1. **Generate the real topic schedule** — set `CAL`/pacing in `build-topic-schedule-sy2627.mjs`
   from the intake; regenerate; invariants must pass; overflow flagged, not compressed.
2. **Registry / Do Now** — per the reframe spec §"Key correction": Do Now is manifest-order-driven,
   so the manifest (`roster-server/data/work-manifest.json` + `data/` copy) must be re-sequenced
   too; add registry titles for `N.review` keys. Rebake `roadmap-data.json`.
3. **roster-server schedule + bands** — write `roster-server/data/lesson-schedule.json` from the
   new topic schedule (still old-id keys unless the spec's id decision changes — the spec says NO
   id reindex, NO grade-history rewrite). Set `grade-config.js` `quarters[q].start/end` from #4;
   leave `units` lists as the fallback (they no longer drive anything with a schedule present).
   Also confirm the SY2627 freeze files (`grade-contexts.js` freeze validators) accept the new docs.
4. **Supabase `lesson_urls` overlay** — the table overrides baked URLs at runtime (CLAUDE.md); sync
   any new/renamed keys or the Desk will show stale rows.
5. **Gates (§4)** → commit → push. roster-server auto-deploys; verify `/health.commit`.
6. Then the CED-2026 unit *framing* of the gradebook (buttons in new units) becomes possible
   because the schedule is in new order; do it only after 1–5 are green.

---

## 4. Gates before any push that touches the schedule/grade path

- `cd roster-server && npx vitest run` — golden master WILL fail on the schedule change; run
  `node scripts/build-golden-fixture.mjs --accept` (local) and `node scripts/build-golden-synthetic.mjs`
  ONLY after reading the diff summary (which students/quarters moved and why); the m2b invariance
  snapshot regenerates with `UPDATE_M2B_GOLDEN=1`.
- `node scripts/build-grade-engine.mjs` (offline bundle parity) after any engine edit.
- `npx vitest run` (root) incl. `tests/journeys/` ×3; `pytest tests/`.
- Two adversarial Codex reviews (read-only) for anything under `roster-server/*.js`.
- Tell the teacher explicitly what students will SEE change (Desk calendar order, "due" labels)
  before pushing — the Desk is public on push.

---

## 4b. September env flips (Railway, teacher) — status 2026-08-19
- `PC_FIGURES_SUPABASE_URL/_SERVICE_KEY` — SET ✓. `TRAINER_DECK_ALLOWLIST` includes `ap-stats-flashcards` ✓. `USE_V3_GRADING=true` ✓ (production is V3; build the local golden oracle with the same flag).
- `TEACHER_KEY` — rotate off the published default (then update `~/grade-backups/config.json` teacherKey).
- `PC_TRACK_ENABLED=true` — **only after the first paper PC is scored** (SY2627_ACTIVATION_RUNBOOK.md Step 5); flipping early caps unscored students at 70% of Work. Rebuild the local oracle with the flag afterwards.

## 5. Open decisions (teacher)

- Keep old-id keys internally for SY2627 (spec's recommendation: yes — no history rewrite)?
- Quarter dates: reuse last year's pattern or new?
- Archive SY25-26 topic-schedule (yes/no)?

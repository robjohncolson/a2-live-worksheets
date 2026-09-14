# Calendar CED 2026 relabel — implementation report

Baseline: `93dc38f`. The preceding student-wallet print push (including spec
`9101181`) succeeded. This calendar work is a separate local commit; do not push
it without the orchestrator's review, as required by the relabel prompt.

## Display results (§3)

The shared `cedLabel` / `cedUnitClass` module supplies CED text and colors. Its
synchronous generated fallback exactly matches `2026-crosswalk.json`; hydrated
registry metadata overrides it and invalidates cached labels when it changes.
Every original lesson key, resource URL, completion record, and grade input is
retained. Ten folded groups receive Day suffixes, including all three days of
CED 3.14. Long calendar labels wrap at a 390px viewport.

The requested `9.6` is absent from the authoritative crosswalk and both schedules.
There is no before/after live lesson to report for that key. An unmapped synthetic
`9.6` renders `Lesson`, without inventing a CED placement. The actual bonus `9.5`
renders `★ Beyond the Exam · Slope inference`; it remains undated and is not
inserted into the live calendar or Do Now feed.

Dates and status badges are omitted from the following text samples. Calendar
“before” includes the old heading and its separate subtitle. Resource-header
“before” describes the hydrated registry state.

| OLD key | Calendar before | Calendar after |
|---|---|---|
| 1.1 | `1.1` / `1.1 · What Can We Learn from Data?` | `1.1 · What Can We Learn from Data?` |
| 3.1 | `3.1` / `3.1 → 1.10 · Investigative Question & Data Collection` | `1.10 · Investigative Question & Data Collection · Day 1` |
| 4.10 | `4.10` / `4.10 → 2.10 · The Binomial Distribution` | `2.10 · The Binomial Distribution · Day 1` |
| 9.6 | Absent | Absent; unknown-key fixture displays `Lesson` |

| OLD key | Tooltip before | Student tooltip after |
|---|---|---|
| 1.1 | `1.1 — 1.1 · What Can We Learn from Data?` | `1.1 · What Can We Learn from Data?` |
| 3.1 | `3.1 — 3.1 → 1.10 · Investigative Question & Data Collection` | `1.10 · Investigative Question & Data Collection · Day 1` |
| 4.10 | `4.10 — 4.10 → 2.10 · The Binomial Distribution` | `2.10 · The Binomial Distribution · Day 1` |
| 9.6 | Absent | Absent; unknown-key fixture displays `Lesson` |

| OLD key | Resource header before (after date prefix) | Student resource header after |
|---|---|---|
| 1.1 | `Unit 1 · Lesson 1: What Can We Learn from Data? · CED 1.1 (New Unit 1)` | `1.1 · What Can We Learn from Data? — CED Unit 1` |
| 3.1 | `Unit 3 · Lesson 1: Investigative Question & Data Collection · CED 1.10 (New Unit 1)` | `1.10 · Investigative Question & Data Collection · Day 1 — CED Unit 1` |
| 4.10 | `Unit 4 · Lesson 10: The Binomial Distribution · CED 2.10 (New Unit 2)` | `2.10 · The Binomial Distribution · Day 1 — CED Unit 2` |
| 9.6 | Absent | Absent; unknown-key fixture displays `Lesson` |

Only a signed-in roster teacher who also passes the existing DOK teacher gate
gets the bridge. For 3.1 the header appends
`(old 3.1: video "Unit 3 Lesson 1", worksheet u3_lesson1)` and the tooltip appends
`(old 3.1)`. The same rule applies to 1.1 and 4.10 with their original keys/files.
Student sessions, stale local teacher flags, student preview, and teacher view-as
do not show bridges. Video titles and worksheet filenames remain unchanged, as
the spec explicitly allows.

| OLD key | Do Now location before | Do Now location after |
|---|---|---|
| 1.1 | `U1 1.1` | `1.1 · What Can We Learn from Data?` |
| 3.1 | `U1 3.1` | `1.10 · Investigative Question & Data Collection · Day 1` |
| 4.10 | `U2 4.10` | `2.10 · The Binomial Distribution · Day 1` |
| 9.6 | Absent | Absent |

The surrounding `Do Now: … — worksheet (done/total done)` text, activity,
completion numbers, selected app, and server task object are preserved. Local
calendar/summer recommendations use the same after-label before `— keep going.`
The live work manifest already uses five CED units with OLD lesson keys; unit-only
task values therefore remain as supplied. All 71 live manifest lesson keys,
including combined worksheets, have valid display projections.

| OLD key | Mobile card before | Mobile card after |
|---|---|---|
| 1.1 | `1.1 · What Can We Learn from Data?` | `1.1 · What Can We Learn from Data?` |
| 3.1 | `1.10 · Investigative Question & Data Collection` | `1.10 · Investigative Question & Data Collection · Day 1` |
| 4.10 | `2.10 · The Binomial Distribution` | `2.10 · The Binomial Distribution · Day 1` |
| 9.6 | Absent | Absent |

Other projections use exactly these after-labels:

- Flashcard mode/review/quick/timed headings replace their raw `1.1`, `3.1`, or
  `4.10` title with the corresponding full label above. Deck CSVs, resume IDs,
  rounds, and scoring stay unchanged.
- Due/assigned resource rows replace raw Blooket titles with the referenced
  lesson's label while keeping the parser and link. The due chip remains a count.
  Mixed review deck titles now include the CED ID and folded Day suffix.
- Lesson grade columns and day-grade cards use the corresponding labels;
  component keys, percentages, due flags, quarter selection, and order stay intact.
- Receipt titles project OLD item references into these labels; signed payloads,
  verification QR contents, and worksheet links remain byte-for-byte unchanged.
- Locked-lesson messages and deterministic coach facts use the same labels.
  Locked-dialog labels are escaped before the existing HTML sink. AI prose
  translates explicit Topic/Lesson and Unit 6–9 references, preserving decimal
  grades, request context, and conversation history.

Progress segments are ordered `U1, U2, U3, U4, U5, ★, Rev`; empty segments are
omitted. Existing session counts and pace calculations are unchanged. The live
pacing already had NEW `u` values, so core colors retain those correct values;
the helper now enforces that correspondence and supplies the bonus tone.

Start Here still shows the server's original nine score buckets. Their headings
now describe CED topic coverage rather than suggesting nine current CED units.
For example, the OLD U1 bucket covers both CED Unit 1 topics and 2.11; it is not
misrepresented as a new Unit 1 grade. Quarter counts say “topic groups.” The
grade playground's existing three PC inputs say “PC score 1/2/3”; its input IDs
and calculations are unchanged. The landing page describes five CED units plus
Beyond the Exam.

## Audit disposition (§2.5)

The complete **before-edit** line/symbol inventory and dispositions are in
[the PLAN](calendar-ced2026-relabel-PLAN.md). Follow-up verification corrected
the initial unit-only Do Now assumption: those units are already CED keyed.

The final exact sweep leaves only:

- The frozen SY25-26 definition's U6–U9 labels and source comments describing OLD
  resource/DOK organization.
- NEW-unit PC/poster/orientation/baseline labels and event IDs, which already
  use the current five units.
- OLD persistent completion keys and resource lookups, which are not display text.
- Teacher-only resource/tool bridges, plus frozen-year rendering fallbacks.

Deleted the unused baked `progressChecks` and `posters` blobs, including their
Unit 6–9 titles. No readers merge either blob. Actual calendar rendering passes
with throwing getters installed at both names, proving those paths are not read.
No schedule-packing branch was consulted and no packing change was made.

## Preservation and validation

The SHA256 guard was added and run **before production relabel edits**. Both
`data/lesson-schedule.json` and `roster-server/data/lesson-schedule.json` retain:

`15393ad27a085340248de945239a8a7b7f5a0cfa740593855ba33cc92df6b90c`

The native generator's `--check` reproduces those exact bytes. Its sole change
uses a file URL for the existing `grade-config.js` dynamic import so the command
works on Windows. No generator function, grade configuration, schedule schema,
pacing array, calendar date, or lesson unit changed. The generated browser
crosswalk also passes its separate `--check`.

The requested Desk/calendar/classroom and unchanged grade-engine parity suites,
plus affected mobile and offline-pack suites: **83 files, 1,389 tests passed**.
After final review corrections, the auxiliary label suite passed **15/15**,
including literal HTML-label rendering and explicit AI unit references. The
lesson-gate/unlock suites also passed **52/52** after the dialog fix. These
targeted counts overlap the broad run; they are not added to its total.

Chrome smoke used actual extracted calendar functions, markup, and CSS with
synthetic sessions and blocked network access. At 1280px and 390px, student
headers/tooltips and three-day chi-square labels fit without horizontal overflow
or heading clipping. Teacher bridges were also verified. This is a local browser
check, not a live authenticated deployment test. Artifacts are under
`C:/Users/rober/AppData/Local/Temp/ced-calendar-smoke-pfKjZN/`.

Two independent reviews checked display/identity boundaries, frozen years, live
registry overlays, offline inclusion, and role gates. Findings fixed: narrow
label wrapping, full dotted ranges, locked-dialog escaping, and explicit legacy
unit references in AI prose. Both reviewers rechecked the corrections and report
no remaining findings.

GitNexus upstream impact checks preceded existing-symbol edits. The shared Desk
renderers and locked-dialog caller graph were HIGH/CRITICAL (calendar repaint,
sign-in, completion and year-loading paths), and those warnings were reported
before editing. New helper symbols were unindexed/UNKNOWN and were reviewed by
their explicit call sites. The compare-master change scan found only expected
indexed test/cache symbols; its zero affected-process count does not cover inline
HTML functions or newly added modules. The staged scan and manual source diff
review supplement that limitation; the tests above exercise the affected Desk
flows directly.

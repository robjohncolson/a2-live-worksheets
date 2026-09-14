2026-09-12: the daily/pairing program is deprecated; only misconception-generated sheets are active ? see DOK_DEPRECATE_DAILY_SPEC.md.

# DOK_SELF_PACED_SPEC.md — DOK-3 sheets are self-paced bonus work; everything a student needs is printed on the sheet

**Teacher (2026-09-12), looking at 1.4+1.5 "One Commute, Two Questions":** "it has an exit ticket that mentions 'rules
box' — what is a rules box? We should remove exit tickets from the worksheet, these are meant to be worked on at the
student's own pace and turned in when they please for bonus credit. Make sure all info that is requested on the sheet
is ON the worksheet itself. Nothing refers to videos. Nothing refers to outside stuff such as 'rules box'."

Supersedes the flow parts of `DOK_VIDEO_FREE_SPEC.md` (its "no video" guard stays). The problems themselves
(stem, first take, parts, answers, scoring, visuals) do not change.

## 1. Doctrine

A DOK-3 sheet is a **self-paced bonus problem**. A student picks it up when they choose, works it from the page alone,
and turns it in whenever they please; the teacher hand-scores the starred part E/P/I. Therefore:

- **No class timing anywhere.** No "(5 min)", no "before we discuss", no "at minute 5", no "Minutes: 32", no
  phase headers, no "turn in one sheet at the bell".
- **No exit ticket.** The `EXIT --- turn this in` box is removed from the student sheet and the teacher key; the
  `exit_reflection` field is deleted from every YAML and rejected by the validator.
- **No references to anything not printed on the page.** The guard is a list of exact FLOW PHRASES, not words, so
  problem data such as "45 minutes", "one class", or "3-minute benchmark" is never touched. Forbidden phrases
  (case-insensitive, in any YAML/registry field except `worksheets`/`worksheet` filename metadata, and in every
  emitted tex): `video`, `rules box`, `follow-along`, `scan the code`, `QR code`, `before we discuss`,
  `before the discussion`, `after the discussion`, `at minute`, `at the bell`, `turn in one sheet`, `Explore (`,
  `Do Now`, `class period`, `in class`. (Revised twice on 2026-09-12 after Codex preflights: `Minutes:` and `min)`
  were dropped because they matched problem data — "Over 240 minutes: 9 freshmen", axis labels "Duration (min)".
  The "(5 min)" timing suffix and "Minutes: 32" line are generator copy that this spec deletes outright, so the guard
  does not need them.) Problem data such as "one class of 12 students" or "45 minutes" is always allowed — the guard
  is phrase-exact, so only the listed strings match. If a listed phrase ever collides with problem data, REMOVE the
  phrase from the guard; never edit the problem. The printed callout keeps its OWN title (e.g. "VARIABLES (keep on the page)"); if a prompt must point at
  it, say "the boxed notes on this sheet" — nothing else.
- **Everything requested is on the sheet.** Every part must be answerable from the stem + visual + boxed notes.
  Codex audits every part prompt for a reference to something absent (a table, a graph, a value, a definition) and
  reports each case; fix by adding the missing item to the stem/visual/boxed notes, never by weakening the part.

## 2. Student sheet (`emit_student`)

Order: header (title · unit · topic · **no dates**) → `TODAY'S PROBLEM` banner renamed **`THE PROBLEM`** → stem →
visual → **FIRST TAKE** box titled `FIRST TAKE --- one sentence before you work the parts` (no minutes) → the boxed
notes callout (unchanged, its own title) → page break → `Work (a)--(c).` (letter range from the sheet) → parts with
answer space → sentence frames → **footer line instead of the exit box:**
`\textbf{Turn this sheet in whenever you finish --- bonus credit. Part (c) is scored E / P / I.}` (starred part's
letter). Optional bank items ("Optional --- not collected") stay.

## 3. Board slide (`emit_board`)

Same content minus the follow-along QR/link entirely (it is "outside stuff"). Footer:
`\textbf{Self-paced bonus problem. Work (a)--(c) from this sheet; turn it in whenever you finish.}`
Group sheets: the same, no per-topic QR row.

## 4. Teacher key (`emit_teacher`)

- Drop the `\frameworkphaseheader` (phase tag + minutes) and the EXIT box.
- Replace the per-sheet `teacher_does` / `students_do` / `adult_role` with ONE standard block printed on every key:
  **"Self-paced bonus sheet.** Students take it when they choose and turn it in when they finish. Everything they need
  is printed on the sheet. Score part (c) only, E / P / I, by hand — never AI-graded or auto-scored. (a) and (b) are
  the ladder up; use them to see where a thin (c) came from."
- Keep per-sheet `questions_to_ask`, `watch_for`, `first_take_note` (rewritten once by the codemod to drop "before
  the discussion" → "an ungraded commitment; accept any evidence-based first impression" when it says that), the
  CED tether, the annotated problem, answers, and the scoring table.
- Delete `teacher.phase_tag`, `teacher.teacher_does`, `teacher.students_do`, `teacher.adult_role` and `minutes`
  from every YAML (the standard block replaces them); the loader tolerates their absence; the validator rejects
  their presence so they cannot creep back.

## 5. Sweep + guard

- `scripts/dok-self-paced.mjs`: idempotent, EOL-preserving; deletes the fields in §4, `exit_reflection`, `minutes`;
  rewrites the stock `first_take_note` phrasing; reports any remaining forbidden phrase (§1) in ANY field for hand
  editing. Codex hand-edits the remainder.
- Validator: forbidden-PHRASE guard (the exact §1 list, substring, case-insensitive) over every YAML/registry field
  value except the `worksheets`/`worksheet` filename metadata (needed by the manifest/index, never printed). Whole-word
  bans on `minute`/`class`/`worksheet` are explicitly NOT wanted — they collide with problem data.
- `DOK_DAY_SHEETS_SPEC.md` / `APS_DOK_LADDER_SPEC.md`: one dated note each pointing here; `dok/README.md` flow
  line: "self-paced bonus problem; hand-scored (c)".

## 6. Rebuild + verify

- `python dok/build_ladder.py --validate` green with both guards (video + self-paced).
- `compile.ps1 -All`; all 207 PDFs rebuilt and committed; student sheets ≤ 2 pages (report any that grew).
- `grep -rEil "video|rules box|follow-along|scan the code|QR code|before we discuss|at minute|at the bell|turn in one sheet" dok/tex dok/lessons dok/registry`
  → nothing but `*_live.html` metadata filenames in YAML/manifest. ("minutes" as data, e.g. "45 minutes", is fine.)
- Tests: `tests/test_dok_build.py`, `tests/dok-*.test.js` updated to the new copy; root `npm test` otherwise
  unchanged (pre-existing failures listed by name).
- Spot-check in the report: the 1.4+1.5 student sheet text, page 2, verbatim.

## 7. Out of scope

Problem content, schedule, Desk, grading, the misconceptions panel. The Desk "DOK ladders" window and the dashboard
strip keep working (they read the manifest).

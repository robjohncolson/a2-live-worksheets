2026-09-12: the daily/pairing program is deprecated; only misconception-generated sheets are active ? see DOK_DEPRECATE_DAILY_SPEC.md.

# DOK_VIDEO_FREE_SPEC.md — every DOK-3 sheet stands on its own; no sheet depends on a video

**Teacher (2026-09-12): "Please redo the DOK3 worksheets so they are not dependent on any videos!!!!"**

## 0. What "dependent" means today (measured 2026-09-12)

| Where | Video dependence |
|---|---|
| `dok/build_ladder.py` | student: "FIRST TAKE — before the video", "Finish after the video:" (group: "…after both topics' videos"); board: "Video + follow-along: <url> (scan the code)", "Finish (a)--(c) after the video", group footer "Watch all videos for both topics, then finish (a)--(c)"; only `standalone:true` sheets get video-free copy |
| 69 `dok/lessons/*.yaml` | `exit_reflection` (68 files: "One thing the video changed about my first take"), `teacher.phase_tag` (65: "Explore (video + follow-along)"), `teacher.first_take_note` (14: "…committed before the video"), 115 `teacher_does` / `students_do` bullets ("Start the video follow-along at minute 5", "Do the video follow-along (the DOK-1/2 work of the day)"), `minutes.video_worksheet` (69) |
| `dok/registry/*.jsonl` | 1 stem mentions the video |
| Docs | `APS_DOK_LADDER_SPEC.md` (24 mentions), `DOK_DAY_SHEETS_SPEC.md` (11), `dok/README.md` (2) |
| Tests | `tests/test_dok_build.py` asserts the group board footer "Watch all videos for both topics" |

What is NOT video-dependent and stays: every sheet already has a printed **rules callout** (69/69) and a
**first take**, so the (a)–(c) ladder can be worked from the page alone.

## 1. The new doctrine (replaces "first take → video → finish")

**First take (5 min, before any discussion) → Rules box (printed) → work (a)–(c) from the sheet → turn in.**

- The follow-along worksheets remain linked from the board slide as **optional review** ("Review: 1.6 follow-along"),
  never as a prerequisite. No sheet, key, or slide may say "watch", "after the video", or "video" anywhere.
- The student sheet is complete on its own: stem + visual + first take + rules + (a)(b)(c). Where a part today
  says "after watching…", "from the video…", "as shown in the video…", rewrite it to reference the rules box, the
  stem, or the visual instead (the 1 registry stem; check every part prompt with `grep -i video dok/registry`).
- The teacher key's "teacher does / students do" becomes a video-free flow. Mechanical mapping where the bullet is
  formulaic; hand-rewrite the rest (Codex):
  - "Start the video follow-along at minute 5." → "At minute 5, read the rules box aloud once; students start (a)."
  - "Do the video follow-along (the DOK-1/2 work of the day)." → "Work (a) and (b) from the rules box and the stem."
  - "Play the topic video; pause for the follow-along." → "Read the rules box; take one question on each rule."
  - "Play both topic videos in teaching order…" → "Read the rules box; work (a) then (b) in teaching order."
  - "committed before the video" → "committed before the discussion"
- `phase_tag`: "First take $\rightarrow$ rules + (a)--(c) $\rightarrow$ turn in" (or the sheet's own part range).
- `exit_reflection`: "One thing the rules box changed about my first take: \hrulefill" (keep any sheet-specific
  variant if it does not mention the video).
- `minutes`: rename `video_worksheet` → `explore` in the schema (the loader accepts both; the builder writes/reads
  `explore`; every YAML migrated). Default the value to the existing number (it is the class time budget, not the
  video runtime) — the teacher's 2026-09-05 lesson "video runtime is not class time" stands.
- `standalone:true` keeps its extra meaning (not a calendar day, no ten-minute cap, "remediation sheet" header); the
  copy branches collapse into one because ALL sheets are now video-free.

## 2. Generator (`dok/build_ladder.py`)

- Student: `FIRST TAKE --- before we discuss (N min)`; section head `Work (a)--(c) from the rules box:` (letter range
  from the sheet's parts).
- Board (single): `\textbf{Optional review:} \href{…}{follow-along} (scan the code)` and
  `\textbf{Work (a)--(c) from the rules on your sheet. Turn in your sheet.}`
- Board (group / standalone): QR labels `Review: {topic} follow-along`; footer
  `\textbf{Work (a)--(N) in order from the rules on your sheet. Turn in one sheet.}`
- Teacher key phase header uses the YAML `phase_tag` (already) — no builder-side "video" strings remain:
  `grep -i video dok/build_ladder.py` returns only comments explaining the 2026-09-12 change.
- Validator: reject any YAML/registry field value containing the word "video" (case-insensitive) EXCEPT inside a
  `worksheets`/`worksheet` filename. This is the guard that keeps it fixed.

## 3. Sweep (69 YAMLs + registry)

`scripts/dok-video-free.mjs`: idempotent, EOL-preserving codemod that applies the mechanical mappings in §1, renames
`minutes.video_worksheet` → `minutes.explore`, rewrites `exit_reflection`/`phase_tag`/`first_take_note` when they
match the stock phrasings, and **reports** every remaining line containing "video" for hand rewriting. Codex then
hand-rewrites the remainder (expected: a few dozen bullets) in plain teacher language, one commit for the codemod, one
for the hand edits. Nothing in a `stem`, `first_take`, `parts[].prompt`, `answers`, or `scoring` may change
except the one stem that mentions the video (rewrite it to reference the stem/visual).

## 4. Rebuild + verify

- `python dok/build_ladder.py --validate` (all) green with the new "no video" guard.
- `powershell -NoProfile -File dok/compile.ps1 -All` — every sheet's three editions rebuilt; PDFs committed (they are
  what the teacher prints).
- `grep -ril video dok/tex dok/lessons dok/registry` returns nothing except `*_live.html` filenames.
- `tests/test_dok_build.py` and `tests/dok-*.test.js` updated to the new copy (assert the new strings, assert no
  "video" in any emitted tex); root `npm test` unchanged otherwise (pre-existing failures listed by name).
- Docs: `APS_DOK_LADDER_SPEC.md` gets a dated "video-free doctrine" note at the top pointing here (do not rewrite the
  whole spec); `dok/README.md` flow line updated; `DOK_DAY_SHEETS_SPEC.md` is PARKED — one-line note only.

## 5. Out of scope

No change to the problems themselves (stems, parts, answers, scoring), the schedule, the Desk, or grading.

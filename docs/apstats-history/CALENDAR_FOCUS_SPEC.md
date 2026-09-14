# CALENDAR_FOCUS -- Spec

Session 109, 2026-05-22. Status: DRAFT for implementation.

## 1. Request (teacher, verbatim)

> "as a student I can see the next lesson but the completed lesson should
> be colored obviously (grey scale)."

Diagnostic follow-up: completed lessons "look same as not started"; the
next lesson "directly ahead should be higher contrast coloring instead of
just merely undimmed -- think synthwave style." Observed while using the
Preview-as-student toggle (F1).

## 2. Problem

The Desk calendar (`ap_stats_roadmap_square_mode.html`, `rCal`) has:

- a 4-state `/donow` completion overlay (DN3b): `.dc-partial` /
  `.dc-done` / `.dc-ahead`, applied by `paintDonowCells()` from
  `donowCellState()`.
- a next-task highlight (Thread 2): `.cal-current`.

Two gaps:

**G1 -- the done state is invisible in Preview-as-student.**
The done greyscale (`.dc-done` -> `filter: grayscale(1)`) is driven ONLY
by the `/donow` server ledger. Preview-as-student keeps the TEACHER's
roster session, so `/donow` returns the teacher's (empty) ledger -- no
cell ever gets `.dc-done`, so nothing greys. The student's own local
completion marks (`getStudentMarks()` -> the `apstats_desk_marks_<email>`
store that `recordProgress()` writes on every Done) are not consulted
for the greyscale at all.

**G2 -- the next-up lesson is low-contrast.**
`.cal-current` is a thin blue outline (`outline: 3px solid
var(--accent, #3a6ff0)`). It does not "pop." The teacher wants the
next-up lesson to be the unmistakable focal point ("synthwave style").

## 3. Design -- the calendar cell visual hierarchy

From loudest (pulls the eye) to quietest (recedes):

| State                  | Treatment                                          |
|------------------------|----------------------------------------------------|
| Next-up (`.cal-current`)| Synthwave neon: magenta inner ring + cyan halo + gentle pulse. THE focal point; overrides any `.dc-*` ring. |
| Today (`.cell-today`)  | Black inset border + "TODAY" badge (unchanged).    |
| Done-ahead (`.dc-ahead`)| Celebratory gold ring + pulse (unchanged -- a reward). |
| In-progress            | Amber ring, full unit color (unchanged).           |
| Not-started            | Plain unit color (unchanged).                      |
| Past, undone (`.cell-past`)| Unit color @ 0.5 opacity (unchanged).          |
| Done                   | Greyscale + 0.6 opacity -- RECEDES. Distinct from past/locked, which stay colored. |
| Locked (`.cell-locked`)| Unit color @ 0.4 opacity + lock badge (unchanged). |

## 4. Decisions

- **D1 -- Done greyscale is driven by EITHER `/donow` OR the student's
  own local completion marks.** A new pure helper `localLessonState(
  topic, marks)` rolls a topic up to `''`/`'partial'`/`'done'` from
  `getStudentMarks()` -- the `apstats_desk_marks_<email>` store that
  `recordProgress()` writes on every Done (a Done mark carries a `ts`
  field; a visit-only mark does not). `rCal` calls it (reusing the
  `_gateMarks` it already loads) and adds `.dc-localdone` /
  `.dc-localpartial`. Result: done lessons recede in Preview-as-student,
  offline, and instantly on marking Done -- no `/donow` round-trip.
  **Correction (Codex review, session 109):** the first cut keyed the
  local classes off the `rCal` `worst` value. That was wrong -- `worst`
  comes from `getAllRegistryEntries` / `REGISTRY.lessons[*].status`,
  which is teacher-side lesson-MATERIALS readiness (URLs posted), NOT
  student completion; it would have greyed every fully-set-up lesson.
  The signal is `getStudentMarks()`, never `REGISTRY`.
- **D2 -- `.cal-current` gets a synthwave neon treatment**: a magenta
  (`#ff2e97`) inner ring + glow and a cyan (`#0ff0fc`) outer halo, with a
  1.5s pulse. It is the brightest cell and overrides any `.dc-*` ring
  (CSS source order).
- **D3 -- Done = `filter: grayscale(1)` + `opacity: 0.6`.** Today and the
  next-up cell never grey (the `:not()` chain).
- **D4 -- `.dc-ahead` (done ahead of class) keeps its gold celebratory
  pulse, NOT greyscaled.** The "ahead" reward stands. (`.dc-ahead` is
  `/donow`-only; the local registry yields plain `.dc-localdone`, no
  "ahead" variant -- acceptable.)
- **D5 -- `prefers-reduced-motion` disables the next-up pulse** (matches
  the existing `.dc-ahead` treatment).
- **D6 -- No DOM changes**: no checkmark element. `rCal` adds ONE class;
  all visuals are the stylesheet. `paintDonowCells` / `donowCellState` /
  `donowLessonCovers` / `/donow` are NOT touched.
- **D7 -- Preview-as-student needs no special-casing** -- D1 makes the
  student's local completion marks the signal, which the previewing
  teacher populates by clicking Done in the resource panel.

## 5. Scope

Touched:

- `ap_stats_roadmap_square_mode.html` -- CSS `<style>` block + one line
  in `rCal`.
- `tests/calendar-polish.test.js` -- a new "C5" describe block.

NOT touched: `paintDonowCells`, `donowCellState`, `donowLessonCovers`,
`/donow`, roster-server, `curriculum.js`. No DB migration. Deploy = GH
Pages only (the Desk is not under `roster-server/` -- no backend redeploy).

## 6. Out of scope / follow-ups

- Next-up detection in Preview-as-student still uses the teacher's
  `/donow` nextTask (the teacher previews U1 1.1). Making next-up
  local-registry-aware is a separate change.
- `.cell-past` mild dimming is unchanged.
- A per-cell "completed" checkmark glyph (deferred -- D6 keeps this
  pure-CSS).

## 7. Follow-up fix (session 109, post-ship)

Shipped `ac3a6c3` drove the next-up neon (`.cal-current`) from the
`/donow` server `nextTask` (D2) and deferred local-aware next-up (the
first bullet of section 6). A teacher bug report exposed that as wrong:
a student who completed lesson 1.1 still saw the neon on 1.1. A Desk
"Done" click writes a synthetic `DESK_DONE` ledger row that matches no
manifest item, so `/donow`'s `nextTask` never advanced off 1.1; the
done lesson then carried both `.dc-localdone` and `.cal-current`, and
`:not(.cal-current)` suppressed its greyscale.

Fix (Codex-investigated): `.cal-current` is now owned by `rCal` and
driven by the SAME local signal as the greyscale: the pure helper
`calNextUpTopic` returns the first entry, in calendar order, that is a
real lesson (topic `N.N`; review / off / exam cells excluded -- a Codex
review catch) and is not `'done'` per the local marks; `rCal` tags it.
`paintDonowCells` no longer touches `.cal-current`. `/donow` still
drives the Do Now card and the server `dc-*` rings. This supersedes
D2's `/donow` basis and closes the section-6 deferral.

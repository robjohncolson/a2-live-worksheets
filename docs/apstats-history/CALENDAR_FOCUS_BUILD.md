# CALENDAR_FOCUS -- Build Contract (FROZEN)

Session 109, 2026-05-22. Design: `CALENDAR_FOCUS_SPEC.md`.
This contract is FROZEN -- implement it verbatim. Do NOT improvise CSS
values, class names, or animation timings.

## Correction (Codex review, session 109)

The first implementation of Unit 1b keyed the `.dc-localdone` /
`.dc-localpartial` classes off the `rCal` `worst` value. Codex review
caught that as a MAJOR bug: `worst` derives from `getAllRegistryEntries`
/ `REGISTRY.lessons[*].status`, which is teacher-side lesson-MATERIALS
readiness (URLs posted), NOT student completion -- it would have greyed
every fully-set-up lesson. The shipped fix adds a pure helper
`localLessonState(topic, marks)` that reads the student's own
`getStudentMarks()` store (`apstats_desk_marks_<email>`; a Done mark
carries a `ts` field). The Unit 1b block below is SUPERSEDED by that
helper + the corrected hook; see `CALENDAR_FOCUS_SPEC.md` D1. Codex
MINOR (loose C5 tests) also folded -- A2/A3 now assert `box-shadow`,
A8 is behavioral.

## Dependency analysis

The work is ~30 lines of CSS + a 1-line hook in `rCal` -- both in the
SAME file (`ap_stats_roadmap_square_mode.html`, the contended Desk, never
parallel-edited) -- plus a test block that asserts on that exact output.
This is ONE cohesive implementation unit. There is no honest parallel
split (the CSS and JS share a file; the tests depend on that output).
A single Sonnet subagent implements Unit 1 then Unit 2; Codex then
reviews independently. That is the verification gate.

## Unit 1 -- ap_stats_roadmap_square_mode.html

### 1a. CSS

In the `<style>` section there is a contiguous completion-overlay block
(approximately lines 471-483). It defines, in order: `.dc-partial`,
`.dc-done`, `.dc-ahead`, `@keyframes dcAheadPulse`, a
`prefers-reduced-motion` rule for `.dc-ahead`, a Thread-2 comment + the
`.dc-done` greyscale rule, and `.cal-current`.

REPLACE that entire block (from the `/* DN3b ... */` comment line through
the `.cal-current { ... }` line, inclusive) with EXACTLY this:

```css
        /* DN3b + CALENDAR_FOCUS -- /donow completion overlay (4 states). The
           .dc-local* classes mirror the same states from the LOCAL completion
           registry (set in rCal), so a done lesson recedes even in
           Preview-as-student, where /donow returns the teacher's empty ledger. */
        .dc-partial, .dc-localpartial { box-shadow: inset 0 0 0 3px #d99a00; }
        .dc-done, .dc-localdone { box-shadow: inset 0 0 0 3px #1f8b3b; }
        .dc-ahead { box-shadow: inset 0 0 0 3px #d4af00, 0 0 7px 1px #ffcf33;
                    animation: dcAheadPulse 1.8s ease-in-out infinite; }
        @keyframes dcAheadPulse {
          0%,100% { box-shadow: inset 0 0 0 3px #d4af00, 0 0 5px 0 #ffcf33; }
          50%     { box-shadow: inset 0 0 0 3px #d4af00, 0 0 10px 2px #ffd84d; }
        }
        @media (prefers-reduced-motion: reduce) { .dc-ahead { animation: none; } }
        /* CALENDAR_FOCUS -- a completed lesson RECEDES (greyscale + dim); the
           next-up lesson POPS with a synthwave neon glow. Today and the
           next-up cell itself never grey. */
        .dc-done:not(.cell-today):not(.cal-current),
        .dc-localdone:not(.cell-today):not(.cal-current) {
            filter: grayscale(1); opacity: 0.6;
        }
        .cal-current {
            z-index: 3;
            outline: 2px solid #0ff0fc; outline-offset: -2px;
            box-shadow: inset 0 0 0 3px #ff2e97,
                        inset 0 0 11px 2px rgba(255, 46, 151, 0.55),
                        0 0 9px 2px #ff2e97,
                        0 0 17px 5px rgba(15, 240, 252, 0.5);
            animation: calCurrentPulse 1.5s ease-in-out infinite;
        }
        @keyframes calCurrentPulse {
          0%,100% { box-shadow: inset 0 0 0 3px #ff2e97,
                                inset 0 0 8px 1px rgba(255, 46, 151, 0.45),
                                0 0 7px 1px #ff2e97,
                                0 0 13px 3px rgba(15, 240, 252, 0.4); }
          50%     { box-shadow: inset 0 0 0 3px #ff2e97,
                                inset 0 0 13px 3px rgba(255, 46, 151, 0.7),
                                0 0 12px 3px #ff2e97,
                                0 0 22px 7px rgba(15, 240, 252, 0.62); }
        }
        @media (prefers-reduced-motion: reduce) { .cal-current { animation: none; } }
```

Indentation: 8 spaces for each rule, matching the surrounding CSS.
Read the file region first to confirm the exact existing block before
editing.

### 1b. JS -- the local-completion hook in rCal

Inside `rCal`, the per-cell loop has this exact block:

```js
                if (worst) {
                  c.style.position = 'relative';
                  const dotClass = worst === 'ready' ? 'status-ready' : 'status-partial';
                  c.insertAdjacentHTML('beforeend', '<span class="status-dot ' + dotClass + '"></span>');
                }
```

REPLACE it with EXACTLY:

```js
                if (worst) {
                  c.style.position = 'relative';
                  const dotClass = worst === 'ready' ? 'status-ready' : 'status-partial';
                  c.insertAdjacentHTML('beforeend', '<span class="status-dot ' + dotClass + '"></span>');
                  // CALENDAR_FOCUS -- mirror the local completion state onto the
                  // cell so a done lesson greyscales even in Preview-as-student.
                  c.classList.add(worst === 'ready' ? 'dc-localdone' : 'dc-localpartial');
                }
```

Nothing else in `rCal` changes. Do NOT touch `paintDonowCells`,
`donowCellState`, or `donowLessonCovers`.

## Unit 2 -- tests/calendar-polish.test.js

Append a new describe block AFTER the existing C4 block (end of file).
Match the C1-C4 style: regex assertions on the `html` string, and
`fnBody(html, 'rCal')` for the rCal body. Block name:

```
describe('C5 -- CALENDAR_FOCUS: synthwave next-up + local-done greyscale', () => { ... })
```

Assertions:

- **A1** The done-greyscale rule covers BOTH `.dc-done` and
  `.dc-localdone`, and includes BOTH `grayscale` and `opacity`.
- **A2** `.dc-done` and `.dc-localdone` share the green ring -- a
  `box-shadow` rule with `#1f8b3b` listing both selectors.
- **A3** `.dc-partial` and `.dc-localpartial` share the amber ring
  (`#d99a00`).
- **A4** `.cal-current` uses the synthwave magenta `#ff2e97`, a
  `box-shadow`, AND `animation: calCurrentPulse`.
- **A5** a `@keyframes calCurrentPulse` block exists.
- **A6** the OLD plain `.cal-current` rule is gone -- `html` does NOT
  match `/\.cal-current\s*\{\s*outline:\s*3px solid var\(--accent/`.
- **A7** a `prefers-reduced-motion` media query disables the
  `.cal-current` animation (a rule pairing `prefers-reduced-motion` with
  `.cal-current` + `animation: none`).
- **A8** `fnBody(html, 'rCal')` contains both `dc-localdone` and
  `dc-localpartial`.
- **A9** `.dc-ahead` is preserved -- `html` still has `@keyframes
  dcAheadPulse`, and the greyscale rule does NOT mention `.dc-ahead`.

Keep C1-C4 (including the F2 C3 block) intact and un-renumbered.

## Constraints (ALL units)

- LF line endings. ASCII-only in new content (no em-dash, no smart
  quotes, no arrows -- use `--`, `'`, `->`).
- Edit ONLY the two named files. Do NOT `git add` / commit / push.
- Do NOT touch `curriculum.js`, `roster-server/**`, or any other file.
- After Unit 1 + Unit 2, run `npx vitest run tests/calendar-polish.test.js`
  -- report the pass/fail counts; all of C1-C5 must be green.
- Then run the full root suite `npx vitest run` once. The ONLY acceptable
  failure is the pre-existing unrelated `tests/study-guide.test.js`.
  Report the totals.

## Verification target

`calendar-polish.test.js`: all green (C1-C5). Root suite: baseline
4666 passed / 1 failed (the 1 = known `study-guide.test.js`). No other
regression.

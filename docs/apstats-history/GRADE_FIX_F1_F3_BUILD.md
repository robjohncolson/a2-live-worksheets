# GRADE_FIX_F1_F3_BUILD.md

> Surgical fixes for the perverse incentives the grade simulator found (F1, F3). **Grade-affecting:
> `roster-server/lesson-grade.js` auto-deploys.** Built in-session, verified by the simulator (the F1/F3
> finding-tests must FLIP from "reproduces" to "fixed"), then adversarially reviewed before push.
> Decision (teacher): **surgical per-finding** (minimal targeted changes), not a unifying gate.

All changes are in `computeQuarterV3` (`roster-server/lesson-grade.js`). Phase-6 path untouched.

## Background — the three drivers

| Driver | Mechanism | Symptom |
|---|---|---|
| **F1-B** quiz-zero | The Quiz track iterates `dueLessons` (= scheduled-due **OR** has-work). An ahead-of-schedule lesson you *started* (worksheet) but whose quiz you haven't taken counts that quiz as **0**. | starting a future lesson tanks the Quiz track |
| **F1-A** lesson-denominator | The Lessons track iterates `dueLessons` too. An ahead-of-schedule lesson done *poorly* joins the denominator at its low value. | mediocre future work drags the Lessons track |
| **F3** Cws-reveal | `Cws = sum(blank scores)/blankCount` over **all** blanks. Null (ignored, FRQ carries the lesson) until the *first* blank; then the unfilled blanks count as 0. | your first correct blank drops the lesson 100→75 |

## Fix F1-B (quiz-zero) — make the Quiz track match the Blooket track

The Blooket track already guards this correctly:
```js
if (!(isDue(topicKey) || (r && r.blooket != null))) continue; // bandLessons loop
```
The Quiz track does NOT — it loops `dueLessons` and counts every quiz-bearing lesson. **Change:** a
quiz-bearing lesson enters `quizDue` only when it is **scheduled-due** (`isDue`) OR the student has an
actual quiz attempt (`r.Q != null`). An ahead-of-schedule, un-attempted quiz is skipped (not a 0).

- Loop `bandLessons` (not `dueLessons`), keep the `quizSet`/quiz-bearing filter.
- `if (!(isDue(topicKey) || (r && r.Q != null))) continue;`
- Then the existing `quizDue += 1; if (Q != null) {…} else quizTodo.push(…)`.
- Best-case denominator (`quizBandTotal`) must use the SAME rule, else ceiling ≥ grade (A2) could break.

**Verdict:** clean, symmetric with Blooket, no tension. Rewards a taken quiz on an early lesson;
never penalizes an un-taken one that isn't due.

## Fix F1-A (lesson-denominator) — "early work only helps, never hurts"

This one has a **genuine tension** the teacher should weigh: the "count work that's done even if not
yet due" rule is intentional (rewards working ahead). The perverse part is only that *bad* early work
can LOWER the average. **Proposed surgical rule:** an ahead-of-schedule lesson (has work but NOT
`isDue`) is included in the Lessons track **only if its value is ≥ the average of the scheduled-due
lessons** — i.e., working ahead can pull your grade up but never drag it down.

- Compute `dueOnly` = lessons that are `isDue`. Their mean = `scheduledAvg`.
- For a has-work-but-not-`isDue` lesson, include it (numerator + denominator) only if
  `lessonTrackValue >= scheduledAvg`; otherwise exclude it entirely (its work simply isn't counted
  yet — it'll count normally once the lesson comes due).
- Degenerate case: if there are zero scheduled-due lessons, fall back to today's behavior (include
  all has-work lessons) so an all-early student still gets a grade.

**Alternative (simpler, if you prefer):** drop the "has-work" inclusion from the Lessons-track
denominator entirely — ahead-of-schedule lessons just don't count until due. Cleaner, but stops
rewarding good early work. **Teacher: pick the "only-helps" rule or the "not until due" rule.**
Default implemented = **only-helps**.

## Fix F3 (Cws-reveal) — don't let starting blanks drop below FRQ-only

The discontinuity is between `Cws = null` (lesson = FRQ-only) and `Cws = small` (lesson dragged). The
surgical fix keeps rewarding completeness but removes the cliff: **the Lessons-track value of a lesson
never falls below its FRQ-only (`W`) value.** I.e. `lessonTrackValue = max(blended(Cws,W), W)` when
`W` is present. Doing blanks can only raise the lesson; finishing them still climbs toward the blended
max. (If `W` is absent, no change — Cws stands alone as before.)

- Implement inside `lessonGradeNoQuiz` / `lessonTrackValue`: after computing the blended value, if
  `W != null` return `max(blended, W)`.
- Note: this slightly changes lessons WHERE blanks are partially done AND below the reflection score —
  exactly the perverse region. Fully-done worksheets and FRQ-absent lessons are unaffected.

## Verification (the simulator is the harness)

1. Flip the finding tests:
   - `grade-sim.test.js` A5 → assert the F1 case **no longer drops** (`after >= before - EPS`).
   - `grade-sim-invariants.test.js` A4/F3 → assert the F3 case **no longer drops**; restore the
     original A4 "HOLDS" intent where it now holds.
2. Re-run A1, A2 (ceiling ≥ grade — watch the best-case denominators), A3, A6–A9: all stay green.
3. `cd roster-server && npm test` — the existing lesson-grade / v3 / quarters / blooket suites must
   stay green EXCEPT where a number legitimately changes; eyeball every diff (these pin real grades).
4. Update `GRADE_SIMULATION_FINDINGS.md`: F1/F3 → RESOLVED, with the new numbers.
5. Adversarial review (workflow) before push: focus on A2 ceiling, the best-case denominators, and
   whether F1-A's "only-helps" rule opens any new monotonicity gap.

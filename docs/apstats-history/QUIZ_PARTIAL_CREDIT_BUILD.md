# Quiz Partial-Credit (E/P/I) — Build Spec

**Goal.** Replace binary quiz scoring (item = correct/0) with **graded partial credit**
per item, driven by the AI review's E/P/I. Rewards engagement + partial understanding.

## Model (teacher decision, 2026-06-01)
Per quiz item, credit ∈ {0, ⅓, ⅔, 1}:

| Tier | Credit | How reached |
|------|--------|-------------|
| **E** | 1.0 (3/3) | answered correctly, **or** AI granted an exception (defensible question) |
| **P** | 0.667 (2/3) | wrong, but the AI review scored P (partial understanding) |
| **I** | 0.333 (1/3) | wrong, but the student **engaged the AI review** ("for trying") |
| —    | 0 | wrong and **never asked for an AI review** |

- **AI-review-gated:** a wrong answer with NO review stays 0 (same as today). Engaging
  the review earns ≥ ⅓. This incentivizes reading + responding to AI feedback.
- Quiz score `Q = Σ(per-item credit) / total` (was `#correct / total`). Feeds the v3
  Quizzes track, the Desk quiz button, and the day-modal — same as Q does today.
- Un-attempted items still contribute 0 within their due window (unchanged).

## Recording model — DECISION NEEDED
The AI review (cr appeal) returns `{ score: I/P/E (wrong MCQ capped at P), exceptionGranted }`.
Earned credit = `exceptionGranted ? 1.0 : score==='P' ? 0.667 : score==='I' ? 0.333 : 0`.

**Option A (recommended) — unify into one `quiz_review` source.** On appeal complete,
cr records `{ source:'quiz_review', itemId:'<qid>#rev', score:<credit> }`. The engine
credits each curriculum_quiz item = `max(keyCorrect?1:0, reviewCredit[item]||0)`.
This SUBSUMES the just-shipped `quiz_exception` (an exception = a review with credit
1.0). Reworks the s125 exception recording (cr `recordQuizException` → records
quiz_review; engine `exceptionSet` → reviewCredit map; migration adds `quiz_review`).
Clean single concept; no real exception data exists yet, so the transition is free.

**Option B — keep `quiz_exception` (E only) + add `quiz_review` (P/I).** Less rework but
two sources for one idea; engine takes max(key, exception=1.0, reviewCredit).

## Components (Option A)
1. **Migration `0015_item_ledger_quiz_review.sql`** (USER-RUN): add `'quiz_review'` to the
   source CHECK. (Keep `quiz_exception` in the CHECK for safety; engine can read both.)
2. **Engine `roster-server/lesson-grade.js::computeLessonGrades`:** build a
   `reviewCredit` Map<baseItemId, number> from `quiz_review` rows (strip `#rev`, take the
   row's `score`; if both quiz_exception + quiz_review exist for an item, take the max).
   Per curriculum_quiz item, `credit = max(isCorrect?1:0, reviewCredit||0)`; `Q = Σcredit
   / total * 100`. Keep the un-attempted=null safety. **`items.quiz[].correct` → add a
   `credit` field** so `_quizPerfFor` / the Desk button can show partial credit.
3. **Client `roster`/Desk `_quizPerfFor`:** score = `Σ item.credit / total` (already
   reads items.quiz). Desk button "Done (nn%)" now reflects partial credit.
4. **cr `index.html`:** on appeal complete, record `quiz_review` with the earned credit
   (replaces the `quiz_exception` write). Show the earned tier in `displayAppealResult`.
5. **Tests:** engine (E=1, P=⅔, I=⅓, 0; max over key/review); cr recording shape.

## Grader strength (connected — partial credit leans on accurate P/E)
Because P is now worth ⅔, a lenient grader inflates. Levers (separate decision):
- **Pin grading/appeals to DeepSeek** (`deepseek-chat`, stronger than Llama-70B) instead
  of round-robin → consistent, stronger judgment. (DeepSeek confirmed live on Railway.)
- **Add the unit framework to the regular grade prompt** (already in the APPEAL prompt
  via `getFrameworkForQuestion`/`buildFrameworkContext`; the inline grade prompt lacks it).
- **Tighten the P bar** in the appeal/grade prompt (P only for genuine partial
  understanding, not effort) so ⅔-credit isn't handed out for weak reasoning.

## Notes
- curriculum.js SACRED. roster-server auto-deploys; cr GH Pages + railway-server deploy on push.
- The s125 `quiz_exception` feature is ~hours old with no real data → safe to fold into `quiz_review`.

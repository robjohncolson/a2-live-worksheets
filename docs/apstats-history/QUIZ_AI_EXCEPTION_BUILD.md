# Quiz AI-Exception (Discuss-with-AI) — Build Spec

**Goal.** A student who gets a curriculum_render quiz item wrong can **discuss it with
AI** and argue their reasoning; if the AI grants an **exception**, that item **counts
as correct**, and the quiz score (correct/total) + grade update automatically.

**Teacher decisions (2026-06-01):**
- **Any wrong quiz item is appealable** (incl. plain MCQ).
- **Exception granted ONLY when the AI judges the QUESTION itself defensible** — i.e.
  the question is genuinely ambiguous or the student's choice is valid under a
  reasonable interpretation. NOT merely because the student explains the concept well.
  A clearly-wrong answer to an unambiguous question is NOT forgiven, however good the
  reasoning. (Strictest of the offered bars.)
- **cr's existing guardrail STAYS for the visible score**: a wrong MCQ is still capped
  at P (server prompt + hard cap at server.js:836). The exception is a SEPARATE
  gradebook flip gated on a new strict `exceptionGranted` AI signal — so we don't
  weaken the "wrong MCQ ≠ E" display rule.
- Mirror the worksheet appeal UX: a **cap of 3 appeals per item**; every granted
  exception is **auditable** (the `quiz_exception` ledger row + the AI's reasoning).
- A granted exception = **full credit**; **AI + cap + audit is sufficient** (no
  teacher-approval queue).

## Architecture (reuse-heavy — most pieces already exist)

```
cr quiz item (wrong)
  → "Discuss with AI" box (student reasoning)
  → POST /api/ai/appeal   [EXISTS on cr railway-server: server.js:805]
  → AI re-grades with previous feedback + the student's argument
  → if result score === 'E' (granted):
       gradebookClient.record({ source:'quiz_exception', itemId:`${qid}#exc`, response, attempt })
       → /ledger/record  [EXISTS]
  → roster-server grade engine ORs the exception into the item's `correct`
       → lesson.Q (correct/total) + items.quiz[].correct update
       → Desk quiz Done button + day-modal + v3 Quizzes track all reflect it
```

### Why a distinct `#exc` item id
`latestPerItem` (scoring.js:61) dedupes ledger rows by **item_id alone**. An exception
row reusing the quiz item's id would *replace* the quiz row (item vanishes from
`quizItems`). So the exception row uses **`<itemId>#exc`** (a separate item), and the
engine strips `#exc` to find the base item it forgives. `parseItemLesson('U1-L2-Q03#exc')`
still resolves to the right lesson (harmless); the `quiz_exception` source matches no
scoring branch, so the row is never double-counted.

## Components

### 1. Migration `0014_item_ledger_quiz_exception.sql` (USER-RUN) — DONE
Widen the `item_ledger` source CHECK to admit `'quiz_exception'`. Additive; before it
runs Postgres rejects the rows and the feeder no-ops (no exception is silently counted).

### 2. Grade engine `roster-server/lesson-grade.js::computeLessonGrades` — DONE
- Pre-pass: build `exceptionSet` = base item ids from `source==='quiz_exception'` rows
  (strip `#exc`).
- curriculum_quiz scoring: `correct = isCorrect(response, key) || exceptionSet.has(item_id)`.
- A wholly-unanswered item is unaffected (you can't appeal what you never saw — an
  exception only flips an item that has a quiz row). Tests pin: appeal flips 1 wrong →
  Q rises; exception with no base quiz row is inert.

### 3. cr client (curriculum_render/index.html) — NEXT (not yet built)
- After a quiz item is graded **wrong** (and signed in), show a **"Discuss with AI"**
  affordance under that item (reuse the existing per-question error/success spans +
  reasoning input; cr already has `getAttemptCount`/reasoning plumbing for MCQ retries).
- On submit: POST `/api/ai/appeal` with `{ scenario:{ questionId, topic, ... },
  answers:{ [qid]: studentAnswer }, appealText, previousResults }`.
- Render the AI verdict (mirror `ai-feedback-panel` style: E = granted / P/I = denied +
  feedback). Cap at 3 attempts/item (mirror worksheet `appealCount/3`).
- On **granted (E)**: `gradebookClient.record({ source:'quiz_exception',
  itemId:`${qid}#exc`, unit, response:<original answer>, attempt:1 })` and show
  "Exception granted ✓". Fire-and-forget (never blocks).

### 4. Tests
- roster-server: exceptionSet OR (engine) — DONE.
- cr: appeal UI present, posts to /api/ai/appeal, records quiz_exception on grant, cap=3 — NEXT.

## Out of scope / notes
- Unit-level `qAgg` (grade.js `scoreAgainstKey`) is a legacy/unit display path; the
  graded score the student sees (Desk button, day-modal, v3 grade) flows through
  `computeLessonGrades.lesson.Q`, which IS covered. Revisit qAgg only if a unit-level
  surface must also reflect exceptions.
- curriculum.js is SACRED — only `index.html` (cr) + roster-server change.

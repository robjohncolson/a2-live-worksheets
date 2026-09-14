# Ledger heal + persistent worksheet grade (build spec)

Make a worksheet's **real correctness** reach the gradebook ledger reliably, and show that
official grade **persistently** in the Desk — so the day modal, the coach, and the resource panel
all agree, and a grade never silently "disappears."

Decided with the teacher (2026-06-01): full heal + persistent display.

## The problem (confirmed)

- Worksheet blank answers are **DOM-only** — they survive a reload *only* via ledger hydration
  (`hydratePriorAnswers` → `gradebookClient.fetchPrior`). No localStorage fallback.
- Per-blank correctness scores reach the ledger only via `recordBlankToGradebook` on **blur/Enter
  while signed in**. If that write is dropped (signed-out, failed-open wall, pre-cutover identity,
  or recorded with a `null` score), the worksheet's real score (e.g. 39/40) never lands in the
  ledger → `Cws` stays ~0% → the coach + day modal show ~0% even though the worksheet looks full.
- The resource-panel Done button shows **completion %** (`apstats_ws_completion`, local), not
  correctness, and **drops the number** when it flips to "✓ Completed."

So three surfaces disagree. The fix: get real correctness into the ledger, then show the ledger
grade everywhere.

## Part A — Ledger heal (the core)

When a worksheet is open **signed in**, re-record any answered blank that is **missing from, or
unscored in, the ledger**, reusing the worksheet's own `recordBlankToGradebook` (which computes the
correct score via `checkAnswer`). Deduped via `fetchPrior`. Fire-and-forget; never blocks.

- New `healLocalAnswersToLedger()` injected into every `u*_lesson*_live.html` via a new
  `scripts/wire-ledger-heal.mjs` (clones `wire-hydration.mjs`: idempotent, per-file EOL-preserving,
  anchored on the hydration-trigger IIFE so hydration is guaranteed present first).
- Guards: no-op unless `gradebookClient.fetchPrior`, `rosterClient.token()`, `gbWsPrefix`, and
  `recordBlankToGradebook` are all available.
- Per answered `.blank[data-question-id]` with a non-empty value:
  - `entry = prior.get(itemId)`.
  - **Skip** only when `entry` exists AND `typeof entry.score === 'number'` AND
    `entry.response === blank.value` (already correctly recorded).
  - Otherwise `recordBlankToGradebook(blank)` — covers: not-in-ledger (orphaned/never-saved),
    `null`-score rows (the undefined-score bug), and edited answers. `latestPerItem` (server) keeps
    the newest, so re-records are harmless.
- Trigger: `setTimeout(heal, 400)` on DOMContentLoaded (after hydration settles) + on the
  `apstats_roster.v1` storage event (sign-in in another tab). Reflections (`source='frq'`) are
  AI-graded and out of scope for v1.
- Pilot on `u1_lesson1_live.html`, test, then `--apply` to all 69 (Edgar driller excluded by the
  `^u\d+_lesson.+_live\.html$` filter).

## Part B — Persistent grade in the Desk resource panel

Show the **official ledger correctness** next to each resource, surviving the Done click.

- New helpers in `showResourcePanel` scope: `_getCwsForTopic(topicId)` (search `_gradeLessonsCache`
  → `lesson.Cws`, **0–100** scale, null if none) and reuse `_quizPerfFor(topicId)` (`scorePct`, 0–100)
  for quizzes. The chip rounds to 1 dp; it never rescales.
- After the panel HTML is set (`innerHTML`), append a small read-only **"Grade: NN%"** chip per
  resource row (XSS-safe: `createElement` + `textContent`). Worksheet → `Cws`; quiz → `_quizPerfFor`.
  `null` → "Grade: —" (not 0%).
- Survives Done: the panel already re-renders via `showResourcePanel(_lastResourcePanel...)` in
  `_studentMarkSave`; the chip rebuilds from the (refreshed) ledger cache each render.
- The **completion gate stays** (`_wsCompletionFor` still drives Done eligibility). Only the
  *displayed grade* is the ledger correctness — distinct from the gate.
- Day modal (`openDayGrade`) already shows `lesson.Cws`/`lesson.Q` correctly — no change once the
  ledger heals.

## Tests
- `scripts/wire-ledger-heal.mjs` dry-run: all 69 wire OK (idempotent re-run = SKIP).
- A jsdom test of `healLocalAnswersToLedger` (in the canonical worksheet): records a DOM answer
  missing from the ledger; skips one already scored; re-records a `null`-score row; no-op when
  signed out.
- Desk: `tests/desk-why-so-low`-style static pins for the chip helpers + persistent render.
- Full suites green (only the 3 known pre-existing fails).

## Review
Adversarial review before shipping (heal double-record/identity/scoring + chip XSS/consistency).

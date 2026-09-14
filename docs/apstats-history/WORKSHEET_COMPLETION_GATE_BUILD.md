# WORKSHEET_COMPLETION_GATE_BUILD.md — frozen contract (session 103)

> Goal: the Desk's worksheet "Done" button must require real completion,
> not just a 5-minute visit timer. A student who filled 5/40 inputs can
> currently mark a worksheet done. New gate: the Done button only enables
> when the worksheet is genuinely complete. After a valid Done click the
> button reads "Completed" and is greyed out.
>
> Status: contract frozen 2026-05-20. Sonnet implements the worksheet
> side (§4) + rollout. Planner implements the Desk side (§5) directly
> (contended file). Codex reviews. Planner reverifies before commit.

## §1 — The gate rule (teacher-specified, 2026-05-20)

A worksheet's Done button is **eligible** when EITHER:
- **(a)** every reflection / exit-ticket textarea is AI-graded **E**, OR
- **(b)** at least **80%** of (fill-in-the-blanks + reflection textareas)
  are *attempted* — i.e. filled with non-empty text.

`eligible = reflectionsAllE || attemptPct >= 0.80`

"Attempted" = non-empty, NOT "correct". This is a follow-along worksheet;
the gate measures engagement, not score. The 80% gate **replaces** the
5-minute visit timer for worksheets (a student at 80% has clearly
engaged). The "must have opened the worksheet at least once" check stays.

## §2 — Out of scope

- No change to quiz / blooket / video Done gates (blooket keeps its
  flashcard gate; quiz keeps inline score; video keeps the 5-min timer).
- No server / roster-server change. No migration. Pure client.
- No change to answer validation, AI grading, or `gradebookClient`.
- Sacred `curriculum_render/data/curriculum.js` never touched.

## §3 — The localStorage contract (shared Desk <-> worksheet)

Single localStorage key: **`apstats_ws_completion`**. Value = a JSON
object **nested by student key, then worksheet filename**. Student-scoped
so a shared school browser never leaks one student's completion to the
next (matches how the Desk's `apstats_desk_marks_<email>` is keyed):

```json
{
  "ada@roster.local": {
    "u4_lesson1-2_live.html": {
      "blanksFilled": 16,
      "blanksTotal": 20,
      "reflectionsFilled": 2,
      "reflectionsTotal": 3,
      "reflectionsAllE": false,
      "filled": 18,
      "total": 23,
      "pct": 0.78,
      "eligible": false,
      "ts": "2026-05-21T01:40:00.000Z"
    }
  }
}
```

- The **student key** is `getStudentEmail()` on the Desk side and the
  byte-identical `_wsStudentKey()` on the worksheet side: a legacy
  `localStorage['apstats_desk_student_email']` if set, else
  `<rosterClient username>@roster.local`. Null when nobody is signed in
  → the worksheet skips the write (the Desk's Done button only renders
  for signed-in students anyway).

- `filled = blanksFilled + reflectionsFilled`; `total = blanksTotal + reflectionsTotal`.
- `pct = total > 0 ? filled / total : 0`.
- `reflectionsAllE = reflectionsTotal > 0 && every reflection textarea has CSS class 'graded-E'`.
  (When a worksheet has zero reflections, `reflectionsAllE` is `false` —
  the all-E path cannot be a free pass; eligibility then rests on `pct`.)
- `eligible = reflectionsAllE || pct >= 0.80`.
- `ts` = ISO timestamp of the write (for staleness display only).
- The worksheet OWNS this write; the Desk only READS it.
- Worksheet writes its own filename key via
  `location.pathname.split('/').pop()`.
- Desk reads via the basename of `regEntry.urls.worksheet`
  (strip query / hash, then `.split('/').pop()`).

## §4 — Worksheet side (Sonnet — rolled to all 69)

Add a self-contained completion-tracker block. Insert it AFTER the
`hydratePriorAnswers` / `_markRestored` hydration block (find via the
string `function hydratePriorAnswers` — insert after that whole block's
trigger IIFE). The block:

```js
// ==================== COMPLETION TRACKER ====================
// WORKSHEET_COMPLETION_GATE_BUILD.md §3-§4. Computes this worksheet's
// completion and writes apstats_ws_completion[<filename>] so the Desk's
// Done button can gate on real progress. Pure localStorage; no network.
function _wsCompletionKey() {
    try { return (location.pathname || '').split('/').pop() || null; }
    catch (_) { return null; }
}
function _wsReflectionTextareas() {
    // Reflection / exit-ticket boxes: <textarea id> NOT inside an appeal form.
    var out = [];
    var all = document.querySelectorAll('textarea[id]');
    for (var i = 0; i < all.length; i++) {
        var ta = all[i];
        if (ta.closest && ta.closest('.appeal-form')) continue;
        out.push(ta);
    }
    return out;
}
function updateWorksheetCompletion() {
    try {
        var key = _wsCompletionKey();
        if (!key) return;
        var blanks = document.querySelectorAll('.blank');
        var blanksTotal = blanks.length;
        var blanksFilled = 0;
        for (var i = 0; i < blanks.length; i++) {
            if ((blanks[i].value || '').trim()) blanksFilled++;
        }
        var refs = _wsReflectionTextareas();
        var reflectionsTotal = refs.length;
        var reflectionsFilled = 0;
        var allE = reflectionsTotal > 0;
        for (var j = 0; j < refs.length; j++) {
            if ((refs[j].value || '').trim()) reflectionsFilled++;
            if (!refs[j].classList || !refs[j].classList.contains('graded-E')) allE = false;
        }
        var filled = blanksFilled + reflectionsFilled;
        var total = blanksTotal + reflectionsTotal;
        var pct = total > 0 ? filled / total : 0;
        var eligible = allE || pct >= 0.80;
        var store = {};
        try { store = JSON.parse(localStorage.getItem('apstats_ws_completion') || '{}'); }
        catch (_) { store = {}; }
        store[key] = {
            blanksFilled: blanksFilled, blanksTotal: blanksTotal,
            reflectionsFilled: reflectionsFilled, reflectionsTotal: reflectionsTotal,
            reflectionsAllE: allE,
            filled: filled, total: total,
            pct: pct, eligible: eligible,
            ts: new Date().toISOString()
        };
        localStorage.setItem('apstats_ws_completion', JSON.stringify(store));
    } catch (_) { /* never block the worksheet */ }
}
(function () {
    var _wsCompTimer = null;
    function _wsCompDebounced() {
        if (_wsCompTimer) clearTimeout(_wsCompTimer);
        _wsCompTimer = setTimeout(updateWorksheetCompletion, 400);
    }
    // Manual typing in any blank / textarea.
    document.addEventListener('input', _wsCompDebounced);
    // Reflection grading (adds graded-E) + hydration (sets data-restored)
    // are attribute mutations, not input events — catch them too.
    try {
        var mo = new MutationObserver(_wsCompDebounced);
        mo.observe(document.body, {
            subtree: true, attributes: true,
            attributeFilter: ['class', 'data-restored']
        });
    } catch (_) {}
    // Initial compute on load, plus a delayed pass to catch async hydration.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateWorksheetCompletion);
    } else {
        updateWorksheetCompletion();
    }
    setTimeout(updateWorksheetCompletion, 2500);
})();
```

### Rollout: `scripts/wire-completion-tracker.mjs`

Mirror `scripts/wire-hydration.mjs` exactly:
- Idempotent — skip files that already contain `function updateWorksheetCompletion`.
- EOL-preserving per file.
- Anchor: insert AFTER the hydration block's trigger IIFE. The reliable
  anchor is the LAST line of the hydration block — the line
  `        })();` that closes the hydration trigger IIFE, which is
  immediately preceded by the storage-event listener. Use a multi-line
  byte-exact anchor (the closing lines of the hydration IIFE) so the
  match is unique. If the anchor count != 1 → FAIL (report, don't skip).
- All 69 worksheets now have the hydration block (committed in `1fbfcc1`),
  so the anchor is present in all 69.
- Print per-file OK / SKIP-already / FAIL. Exit 1 on any FAIL.

Hand-pilot `u4_lesson1-2_live.html` first, then roll the other 68.

## §5 — Desk side (planner-direct — `ap_stats_roadmap_square_mode.html`)

### `_doneBtn(artifact)` — worksheet path gets the completion gate

Current worksheet flow: unvisited → waiting (5-min timer) → ready → saved.
New worksheet flow: unvisited → **incomplete** (completion gate) → ready
→ **completed**.

**Scope guard:** the completion gate applies ONLY to instrumented
`u*_lesson*_live.html` worksheets — `scripts/wire-completion-tracker.mjs`
rolls the tracker to exactly those. The Desk's worksheet branch checks
`/^u\d+_lesson.+_live\.html$/` against the worksheet filename; an
off-pattern worksheet (e.g. `edgar_u6_conceptual_driller_live.html`, the
U6 conceptual driller) has no tracker, so it falls through to the legacy
`deskDoneGateMs` visit timer — its Done button behaves exactly as before.
The Desk regex MUST stay in sync with the rollout script's file glob.

- The `entry.ts` (already-marked) branch: label `&#10003; Saved` →
  `&#10003; Completed`.
- The `!entry.visitedAt` branch: unchanged ("open the link first").
- NEW worksheet-only branch (replaces the `gateMs` time check WHEN
  `artifact === 'worksheet'`): read `apstats_ws_completion`, look up the
  worksheet's filename (derive from `regEntry.urls.worksheet` — the
  resource panel already has `regEntry`/`u.worksheet` in scope at the
  `_doneBtn('worksheet')` call site; thread the filename in, e.g. via a
  closure var `_worksheetFile` set just before the call, OR a helper
  `_wsCompletionFor(url)`).
  - If no entry OR `entry.eligible !== true` → disabled button
    `Done (N%)` with tooltip
    `"Complete at least 80% of the worksheet (or get every reflection
    rated E). Currently N% done."` where N = `Math.round(pct*100)`
    (0 if no entry).
  - If `entry.eligible === true` → enabled `&#10003; Done`.
- For `artifact !== 'worksheet'` the existing `deskDoneGateMs` time-gate
  path is UNCHANGED.

### `_studentMarkSave` — optimistic latch label

The optimistic latch currently sets `btn.textContent = '✓ Saved'`. Change
to `'✓ Completed'`. (This is shared by worksheet/quiz/blooket/video; the
word "Completed" reads correctly for all — a marked item is completed.)

### Helper

Add a small `_wsCompletionFor(worksheetUrl)` helper near `_doneBtn` that:
- derives the filename basename from the URL (strip `?`/`#`),
- reads + parses `apstats_ws_completion`,
- returns the entry object or `null`.
XSS-safe (no innerHTML); all numbers.

## §6 — Tests

### NEW `tests/worksheet-completion-tracker.test.js`
- For every `u*_lesson*_live.html`: `function updateWorksheetCompletion`
  present; `apstats_ws_completion` written; the `input` listener + the
  MutationObserver are wired; the block sits AFTER `hydratePriorAnswers`.
- Smoke (extract `updateWorksheetCompletion` is hard — it touches the
  DOM; instead extract the *eligibility math* if factored out, OR pin
  the `eligible = ... || pct >= 0.80` expression by source match).

### `tests/desk-*.test.js` (Desk)
Extend the relevant desk test file (or a new
`tests/desk-completion-gate.test.js`):
- `_doneBtn` worksheet branch reads `apstats_ws_completion`.
- The `entry.ts` branch label is `Completed`, not `Saved`.
- `_studentMarkSave` latch text is `Completed`.
- The completion gate only applies to `artifact === 'worksheet'`
  (quiz/blooket/video still use `deskDoneGateMs`).
- `_wsCompletionFor` derives the filename + tolerates missing/bad JSON.

## §7 — Acceptance (GREEN gate)

- root vitest: prior baseline + new tests pass; only the known unrelated
  `study-guide.test.js` fail remains.
- roster-server untouched (still 291/291).
- `scripts/audit-feeder-ids.mjs` CLEAN 69 (worksheet edits are additive,
  no feeder-id change).
- All 69 worksheets keep their EOL; Desk file stays LF.
- `git status`: only the 69 worksheets, `ap_stats_roadmap_square_mode.html`,
  `scripts/wire-completion-tracker.mjs`, the new test file(s), and this
  build doc.

## §8 — Sonnet sub-agent prompt (worksheet side only)

```
Implement the worksheet-side completion tracker per
WORKSHEET_COMPLETION_GATE_BUILD.md §3, §4, §6. Steps:
1. Read the build doc. Read u4_lesson1-2_live.html around the
   hydratePriorAnswers block to see the insertion anchor.
2. Hand-edit u4_lesson1-2_live.html: insert the §4 completion-tracker
   block immediately AFTER the hydration trigger IIFE.
3. Write scripts/wire-completion-tracker.mjs — idempotent, EOL-safe,
   mirrors scripts/wire-hydration.mjs. Anchor on the close of the
   hydration IIFE. FAIL (not skip) on non-unique anchor.
4. Run it: node scripts/wire-completion-tracker.mjs --apply. Verify
   68 wired + 1 already (the pilot).
5. Write tests/worksheet-completion-tracker.test.js per §6.
6. Run: npx vitest run (repo root) — only the known study-guide.test.js
   fail allowed. node scripts/audit-feeder-ids.mjs — CLEAN 69.
7. Report changed files + test counts + the exact anchor used.

CONSTRAINTS: additive only; preserve per-file EOL; do NOT touch the
Desk file ap_stats_roadmap_square_mode.html (planner owns that);
do NOT touch curriculum_render/data/curriculum.js; do not git-commit.
```

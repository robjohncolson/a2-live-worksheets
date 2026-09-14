# FLASHCARD_REWORK_BUILD.md — frozen contract (session 103)

> See FLASHCARD_V2_BUILD.md (2026-08-18) for the current contract.

> Goal: cut the Blooket-verification flashcard pool from ~28 per lesson
> down to a curated top-10 keyed by difficulty (hard → med → easy),
> with the difficulty tags produced by Codex against each unit's AP
> framework. Add keyboard navigation (a/b/c/d, 1/2/3/4, immediate-commit
> on press) to the modal.
>
> Status: contract frozen 2026-05-20. Codex tags per §3. Planner-direct
> implements §4-§6 in the Desk file (contended single file → planner
> not Sonnet). Codex reviews read-only.

## §1 — Why 10 not 28

- 28 questions × 80% pass = miss ≤5 to advance. Heavy cognitive load
  for a *verification* gate (Blooket is the learning surface; flashcards
  prove the student touched it).
- Top-10 hard-first cuts the verification time to ~3 minutes while
  keeping signal density high (the 10 most lesson-relevant questions
  win, not "lucky 10 random").
- Difficulty tagging produced once by Codex against the AP framework
  for the lesson; teacher can override per-question by editing the JSON.

## §2 — Out of scope (explicit non-goals)

- No change to the 28-question Blooket game itself (the CSV stays the
  same; it's still the source for the live Blooket and the flashcards).
- No change to `BLOOKET_PASS_THRESHOLD = 0.80` (same threshold,
  smaller pool → miss ≤2 of 10 to pass).
- Flashcards launch from an always-available button; there is no visit gate.
- The resume record grows ADDITIVELY only (`answered`, later `roundId`/`seq`/`misses`);
  legacy records without those fields resume unchanged.
- Sacred `curriculum_render/data/curriculum.js` NEVER touched.

## §3 — Difficulty tagging (Codex job)

### Input

- `apstat_1_framework.md` … `apstat_9_framework.md` — read all 9 to
  understand each unit's AP CED skills, EUs, LOs.
- All 69 `u*_l*_blooket.csv` files in repo root (one per lesson).
  Columns: 0=Question #, 1=Question Text, 2-5=Answer 1-4, 6=Time Limit,
  7=Correct Answer # (1-indexed).

### Output: `data/blooket-difficulty.json`

Schema:

```json
{
  "version": 1,
  "generatedAt": "2026-05-20T...",
  "generatedBy": "codex",
  "tags": {
    "u4_l1_l2_blooket.csv": {
      "1": { "difficulty": "hard", "rationale": "tests EK UNC-3.B; common distractor C looks plausible" },
      "2": { "difficulty": "med", "rationale": "..." },
      ...
      "28": { "difficulty": "easy", "rationale": "..." }
    },
    "u4_l7_8_blooket.csv": { ... },
    ...
  }
}
```

- Keys under `tags` are EXACT csv filenames (must match disk).
- Per-question keys are the Question # as a STRING (matches CSV column 0).
- `difficulty` ∈ `{"hard", "med", "easy"}` (lowercase, exact).
- `rationale` is a short string (≤140 chars), one sentence, explains
  why this question is hard/med/easy in the context of the lesson's
  AP framework.

### Tagging rubric for Codex

A question is **HARD** when at least one applies:
- Tests a conceptual subtlety (e.g., conditional probability vs joint,
  independence vs disjoint, parameter vs statistic, conditions for
  inference).
- Has a plausible distractor that students with a partial misconception
  would pick.
- Requires multi-step reasoning over the lesson's learning objectives.

A question is **MEDIUM** when:
- Tests a single LO or vocabulary term correctly used.
- Distractors are reasonable but not strongly tempting.
- One-step calculation or one-step recall.

A question is **EASY** when:
- Pure vocabulary recall.
- Distractors are obviously wrong to anyone who attended the lesson.
- Definitional question with a single canonical answer.

### Distribution guidance

Codex should target roughly:
- 30-50% **hard** (the top-10 will mostly come from here)
- 30-50% **med** (fill the rest)
- 10-30% **easy** (these are the lowest-priority cards)

If a CSV has ≤10 questions total, tag them all but they all get used.

### Output discipline

- **Do NOT modify the CSV files.** They feed the live Blooket game.
- **Do NOT modify any other file** beyond writing
  `data/blooket-difficulty.json`.
- ASCII-only rationales (no em-dashes, no smart quotes, no `§`).
- Valid JSON (parseable by `JSON.parse`).
- If a CSV has malformed rows (no Q#, no text), SKIP that row in
  output (don't tag empty cards).
- If a CSV file cannot be read, omit it from `tags`; do not crash.

### Codex dispatch

Run as a detached background process (CONTINUATION_PROMPT.md gotcha:
long Codex runs MUST be detached or harness kills on suspend). Use:

```bash
python C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py \
  --direction cc-to-codex --task-type implement \
  --working-dir C:/Users/rober/Downloads/Projects/school/follow-alongs \
  --owned-paths "data/blooket-difficulty.json" \
  --timeout 1800 \
  --prompt "<paste the tagging prompt below>"
```

(Or PowerShell `Start-Process -WindowStyle Hidden` wrapper if the
runner blocks the harness.)

## §4 — Deck-builder change (Desk file, planner-direct)

In `ap_stats_roadmap_square_mode.html` near line 6328
(`_bfRowsToDeck`), add a sibling function that selects the curated 10:

```js
// 2026-05-20: load difficulty tags once per session.
var _bfDifficultyTags = null;
async function _bfLoadDifficultyTags() {
    if (_bfDifficultyTags !== null) return _bfDifficultyTags;
    try {
        var res = await fetch('data/blooket-difficulty.json', { cache: 'no-cache' });
        if (!res.ok) { _bfDifficultyTags = {}; return _bfDifficultyTags; }
        var data = await res.json();
        _bfDifficultyTags = (data && data.tags) || {};
    } catch (_) { _bfDifficultyTags = {}; }
    return _bfDifficultyTags;
}

// Build a 10-card deck from the parsed CSV rows + tag data.
// Pure function: rowsToDeck (existing) → cards; then select hard first,
// med, easy, in tag order. If no tags available, fall back to the
// first 10 cards in CSV order (so untagged CSVs still work).
function _bfSelectTop10(allCards, csvFilename, tagsForFile) {
    var TARGET = 10;
    if (!allCards || allCards.length === 0) return [];
    if (allCards.length <= TARGET) return allCards.slice();

    if (!tagsForFile || Object.keys(tagsForFile).length === 0) {
        // No tags — first-10 fallback, preserves existing UX for new lessons.
        return allCards.slice(0, TARGET);
    }

    var hard = [], med = [], easy = [], untagged = [];
    for (var i = 0; i < allCards.length; i++) {
        // _bfRowsToDeck drops the Q# but we need it to look up the tag.
        // Cards must carry q# — add it in _bfRowsToDeck. The tag lookup
        // key is String(card.qnum).
        var qnum = allCards[i].qnum;
        var tag = qnum && tagsForFile[String(qnum)];
        var diff = tag && tag.difficulty;
        if (diff === 'hard') hard.push(allCards[i]);
        else if (diff === 'med') med.push(allCards[i]);
        else if (diff === 'easy') easy.push(allCards[i]);
        else untagged.push(allCards[i]);
    }

    var picked = hard.concat(med, easy, untagged).slice(0, TARGET);
    return picked;
}
```

**`_bfRowsToDeck` modification:** carry the Q# on each card so
`_bfSelectTop10` can look up the tag. Change:

```js
deck.push({ q: qText, choices: choices, correctIdx: correctIdx });
```

to:

```js
deck.push({ qnum: qnum, q: qText, choices: choices, correctIdx: correctIdx });
```

**Wire `_bfSelectTop10` into the deck-build call site.** Find where
`_bfRowsToDeck(rows)` result is assigned to `_bfState.deck` — after that
call, await tags + apply selection:

```js
var allCards = _bfRowsToDeck(rows);
var tags = await _bfLoadDifficultyTags();
var fileTags = tags[csvPath.split('/').pop()] || tags[csvPath] || {};
_bfState.deck = _bfSelectTop10(allCards, csvPath, fileTags);
```

(The exact call-site location is around line 6440-6470 — Sonnet's prior
work pattern is to find it via the `_bfState.deck = ...` assignment.
Planner finds it via Read.)

## §5 — Keyboard navigation (Desk file, planner-direct)

Same pattern as Task #8 Desk modal polish (`63d8559`):
- Modal-scoped keydown listener — attach on flashcard modal open,
  detach on close.
- `a`/`b`/`c`/`d` (case-insensitive) → select that choice index (0-3).
- `1`/`2`/`3`/`4` → mirror mapping (1→0, 2→1, 3→2, 4→3).
- Active-element guard: skip if `document.activeElement` is INPUT,
  TEXTAREA, SELECT, or `isContentEditable`.
- Modifier guard: skip if `ctrl`/`meta`/`alt`/`shift` held.
- Display guard: skip if the flashcard modal isn't visible (defensive).
- **Selection model: immediate-commit on letter/number press.**
  Letter press = "click that choice button." The existing answer-check
  flow runs (feedback shown, auto-advance after the existing delay).
  Enter is reserved for "next card" if there's a delay step; otherwise
  not bound.
- **Visual indicator:** each choice button gets a small `[a]`/`[b]`/...
  badge on the LEFT, OR a number `[1]`/`[2]`/... — pick whichever
  matches the existing flashcard button styling best. Single key
  per choice (not both letter AND number). Recommend letters.

## §6 — Tests

Extend `tests/desk-blooket-flashcards.test.js`:

- **Difficulty plumbing**
  - Desk source contains `_bfLoadDifficultyTags`.
  - Desk source contains `_bfSelectTop10`.
  - `_bfRowsToDeck` adds `qnum` to each card.
  - Deck assignment awaits tags.
  - `_bfSelectTop10` selects hard → med → easy.
  - Untagged CSVs fall back to first-10.

- **Keyboard nav**
  - Modal-open path attaches a keydown listener.
  - Modal-close path detaches it.
  - Active-element guard exists (INPUT/TEXTAREA/SELECT/isContentEditable).
  - Modifier guard exists.
  - Letter-key map (a-d) exists.
  - Number-key map (1-4) exists.
  - Choice badge rendering exists.

- **Smoke test** (jsdom): build a 12-card deck with 3 hard / 5 med /
  4 easy → `_bfSelectTop10` returns 10 cards, with all 3 hard first,
  then 5 med, then 2 easy.

## §7 — Acceptance (GREEN gate)

- `data/blooket-difficulty.json` exists, is valid JSON, covers all 69
  CSVs (with at most 1-2 omissions allowed for malformed CSVs).
- For each CSV: tag count == question count in that CSV (within ±2 for
  malformed rows).
- root vitest: prior baseline + new flashcard tests pass.
- `desk-blooket-flashcards` test count increases by at least 12 (new
  pins for difficulty + keyboard).
- EOL preserved on Desk file (LF).
- `git status` shows ONLY: `data/blooket-difficulty.json`,
  `ap_stats_roadmap_square_mode.html`,
  `tests/desk-blooket-flashcards.test.js`, this build doc.

## §8 — Sequencing within this workstream

1. Codex tagging dispatch (background). Output:
   `data/blooket-difficulty.json`. Wait for completion.
2. Planner-direct (me): modify Desk file per §4-§5.
3. Codex review (read-only).
4. Planner reverify.
5. Commit + push (or iterate).

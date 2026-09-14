# TI-84 Trainer — matrix-entry cell loop

**Status: IMPLEMENTED 2026-08-20 (Option B) — four adversarial review rounds; residual R1 (ROM edit-context after DEL/CLEAR) handled conservatively by blocking arrows while `romEditOpen`; ROM checklist §10 still unverified on hardware**

Closes the known gap in `TI84_TRAINER_FIX_PLAN.md:74` ("matrix-entry repeat loop guides only the first cell").
Scope: `matrix-entry` (U8) and the `enter-matrix` micro-skill it shares with `chi-square-test`.

---

## 1. TL;DR

| | |
|---|---|
| **Symptom** | The authored `{cell value}` + `ENTER` repeat loop guides **one** cell, then the walkthrough ends. |
| **Root cause** | `holdOnStep` at `ti84-trainer-v2/app.js:3579` excludes parameter steps **and** last steps — matrix-entry's loop is both. |
| **Worse than documented** | The one cell it does guide types the **wrong number** (`5`, not `30`), and a student can finish the whole procedure **without typing any cell at all**. |
| **Recommendation** | **Option B** — a stateful cell-cursor loop mode keyed off a new step marker, with the route index pinned (same trick `repeatRouteState()` already uses). ~1 focused session for the engine + data; native-sim matrix editor is a separable phase 2. |

---

## 2. What actually happens today (empirically traced, 2026-08-07)

Driven through the real `app.js` in jsdom (harness copied from `tests/ti84-repeatable-steps.test.js`, CEmu bridge stubbed, canonical `matrix-entry` problem = 3×2, `data: [[30,70],[80,60],[110,50]]`):

```
before 2ND:        note="Step 1 of 11"   banner="Data setup confirmed. Starting procedure."
...
before ENTER:      note="Step 7 of 11"   banner="Filled rows with 3."
before ENTER:      note="Step 9 of 11"   banner="Filled cols with 2."
before ENTER:      note="Step 11 of 11"  banner="Filled cell value with 5."      <-- should be 30
FINAL:             note="Result review mode"   typed values: ["3","2","5"]
```

Three separate defects, all reproducible:

**D1 — one cell, then done.** Steps 10/11 (`ti84-procedures-data.json:7061-7078`) are marked `repeatable`, but:
- step 10 is a **parameter** step → `holdOnStep` false (`app.js:3579`) → `nextRouteState()` advances immediately;
- step 11 is the **last** step → `holdOnStep` false again → advancing hits `routeIndex >= steps.length` (`app.js:3626`) → `enterResultReviewPhase()`.

5 of the 6 cells are never guided. On the 3×3 `chi-square-test` table it would be 8 of 9.

**D2 — the guided cell value is wrong.** `sampleValueForToken('cell value', …)` (`app.js:2015`) looks up aliases `['cell value','cell']` (`app.js:556`); the problem carries `values.data`, not `values['cell value']`, so it falls through to `DEFAULT_VALUE_SAMPLES['cell value'] = '5'` (`app.js:525`). The trainer types a literal `5` into `[A](1,1)` and calls it correct.

**D3 — the cell step can be skipped entirely.** Pressing `ENTER` while sitting on step 10 hits the repeatable lookahead (`app.js:3566-3575`); `minPresses` is undefined → `0 < 0` is false → `routeIndex += 1`, then the same press satisfies step 11 and finishes the walkthrough. Traced result: `typed values: ["3","2"]` — **zero cells entered, full clean pass**, which in recall mode is `errors=0, hints=0` → `recallQuality()` = 5 (`app.js:2759`) → SM-2 promotion and a gradebook write.

**D4 (adjacent, same fix window) — bogus data-setup phase.** `matrix-entry.dataRequirements` is `{"L1":"numeric","L2":"numeric"}` (`ti84-procedures-data.json:7080-7083`). `resolveListData()` (`app.js:2090`) slices the *matrix rows* into lists, so the student is asked to pre-load:

```
L1 (Data): 30, 70      L2: 80, 60          (row 3 — 110, 50 — silently dropped)
```

before hand-entering the same matrix. A procedure whose entire point is typing a matrix should require no data setup.

---

## 3. Why the generic repeatable gate can't be stretched to cover it

| Mechanism | Where | Why it doesn't fit |
|---|---|---|
| `holdOnStep` | `app.js:3579` | A repeatable **parameter** step retypes its whole value on every press (`app.js:3605-3609`). Holding it would retype cell 1 forever — the loop needs a *different value per press*. |
| `minPresses` counter | `app.js:1935` / `1945`, authored in data | Static per step; matrix dims are per **problem** (3×2 canonical for `matrix-entry`, 3×2 and 3×3 for `chi-square-test`). The count can't be authored. |
| `isRepeatBacktrack` | `app.js:1924` | Models arrow overshoot on a choice row (LEFT ⇄ RIGHT). Matrix backtracking is 2-D cursor movement plus an uncommit, not a reverse arrow. |
| `repeatRouteState()` | `app.js:1956` | *Does* fit, and is the piece worth reusing: it pins `routeIndex` while letting the screen state move. |
| Last-step exclusion | `app.js:3579`, comment at `3621` | Deliberate: a held last step could never finish. A cell loop must own its own exit condition instead. |

**Hard constraint:** `routeState.routeIndex` is a *shared* pointer. `app.js` reads it for the current step (`currentStep()` `app.js:1901`, `stepAfterCurrent()` `1910`, `isLastStep()` `1918`), and `ti84-state-machine.js` reads the *same field* to index the authored route (`getNextRouteStep()` `ti84-state-machine.js:1101`, advanced in `advanceRoute()` `:1115`). Any design that inserts synthetic steps must keep those two views consistent.

---

## 4. Design options

### Option A — per-cell step expansion at walkthrough start

Build a materialized step list when the walkthrough starts (`startWalkthrough()` `app.js:2662`), once `problem.values.rows/cols/data` are known: replace authored steps 10–11 with `rows*cols` pairs of `{cell value r,c}` + `ENTER`, each carrying its own literal value and an `authoredIndex` back-pointer.

```
walkthrough.steps = [...steps[0..8],
  {key:'{cell value}', cell:[0,0], value:30, authoredIndex:9},
  {key:'ENTER',        cell:[0,0],           authoredIndex:10},
  {key:'{cell value}', cell:[0,1], value:70, authoredIndex:9},
  ... 12 entries for a 3x2 ...]
```

**Pros**
- The rest of the engine keeps working unchanged: every step is a plain one-press step, no new "hold" semantics, `Step 14 of 21` progress is honest, `physicalBack()` (`app.js:3719`) already walks backwards one step at a time.
- Wrong-key feedback, hints, keypad highlighting (`guidedSuggestions()` `app.js:2567`) all work per cell with zero new branches.

**Cons**
- Requires introducing `walkthrough.steps` as the source of truth and rewriting **every** `currentProcedure().steps[...]` read (`app.js:1901`, `1910`, `1918`, `3626`, `3711`, `3967-3990`, `4237-4340`) — ~12 call sites.
- The synthetic index desyncs from the state machine's `routeIndex`, so `nextRouteState()` (`app.js:2547`) must translate through `authoredIndex` on every advance, or `transition()` silently falls back to `routeFallback` and teleports screens.
- Step counts become problem-dependent ("Step 10 of 11" vs "Step 10 of 21"), which leaks the matrix size into every progress renderer and into recall's neutral prompt (`recallNeutralPrompt()` `app.js:2620`).
- Highest regression surface of the three: it touches the pointer every existing walkthrough test asserts on.

### Option B — stateful repeatable-parameter loop with a cell cursor  ★ recommended

Keep the authored 11 steps. Mark the loop in data, and give the walkthrough a small cursor object that lives only while the loop is active. `routeIndex` stays pinned at step 10/11 exactly like `repeatRouteState()` already pins it.

**Data marker** (`ti84-procedures-data.json`, both `matrix-entry:7061-7078` and micro-skill `enter-matrix:2617-2634`):

```json
{ "stepNumber": 10, "key": "{cell value}", "repeatable": true, "loop": "matrix-cells", "loopMatrix": "[A]" },
{ "stepNumber": 11, "key": "ENTER",        "repeatable": true, "loop": "matrix-cells-commit" }
```

**Runtime state** (initialized in `startWalkthrough()` `app.js:2662-2695`, beside `repeatPressCount`/`repeatPressIndex`):

```js
walkthrough.matrixLoop = {
  name: '[A]', rows: 3, cols: 2,
  grid: [[30,70],[80,60],[110,50]],   // from problem.values.data | .matrix | .observed
  cursor: { row: 0, col: 0 },
  filled: Set<'r,c'>,                  // exit when filled.size === rows*cols
  buffer: '',                          // recall mode: digits the student typed
  cellErrors: Map<'r,c', number>,
};
```

**Key routing inside the loop** (a new branch near the top of `pressButton()` `app.js:3524`, before the existing repeatable lookahead at `:3566`):

| Press | Guided | Recall |
|---|---|---|
| digit / `.` / `(-)` (`PARAMETER_INPUT_KEYS` `app.js:487`) | `bridge.typeValue(cellValue)` — the whole value, as today | append to `buffer`, forward the raw key to the bridge |
| `ENTER` | commit → mark cell filled → advance cursor row-major | commit **only if** `buffer === String(grid[row][col])`; mismatch = one cell error, buffer cleared, cursor stays |
| `DEL` | forward, no-op | buffer backspace |
| `CLEAR` | forward, clear buffer, stay on cell | same |
| arrows | move `cursor` (clamped to dims), forward to bridge | same |
| anything else | existing `wrongFeedback()` path (`app.js:2596`) | existing path |

Exit: when `filled.size === rows*cols`, run the normal `nextRouteState()` advance off step 11 → `routeIndex` 11 ≥ `steps.length` → `enterResultReviewPhase()`. **Not before** — which also closes D3, because `ENTER` can no longer skip an unfilled cell.

**Pros**
- Zero changes to the step pointer; every existing walkthrough test keeps its meaning.
- Dims come from the problem, so 2×2 / 3×2 / 3×3 are all free.
- Naturally supports "right value, wrong cell" detection, which Option A cannot express (Option A's synthetic steps assume the cursor is where the trainer thinks it is).
- Recall mode gets a real answer-entry mechanic instead of the auto-type reveal (§5).

**Cons**
- A genuinely new state machine in `pressButton()` (~110 lines) plus renderer branches — the one place the fix plan warns is a single large IIFE (sequencing rule, `TI84_TRAINER_FIX_PLAN.md:60`).
- `Step 10 of 11` under-reports progress; needs a sub-progress line ("cell 4 of 6") in three renderers.
- The state machine's own matrix cursor (`handleMatrixValueEditor()` `ti84-state-machine.js:824-836`) becomes a second source of truth unless fixed to match (§8, it is currently unbounded: `matrixCol: col + 1` with no row wrap and no clamp).

### Option C — collapse the loop into one confirmed "fill the matrix" step (fallback)

Replace steps 10–11 with a single non-repeatable step whose card shows the full table and one button ("I entered all 6 cells"); the trainer types the whole matrix through the existing `autoFillMatrix()` path (`app.js:2374-2417`) in guided mode, and in recall mode the student types it free-play with the clutch disengaged, then confirms.

**Pros:** ~1 hour. Removes D1/D2/D3 (nothing false is asserted). Reuses a proven ROM key path.
**Cons:** Teaches nothing about cell-by-cell entry — which is the whole micro-skill (`enter-matrix`, `ti84-procedures-data.json:2516`, prerequisite of `chi-square-test:7255`). Recall mode gets no signal at all. Recommend only as a stopgap if the U8 window is closing.

---

## 5. Recall-mode scoring of cell entries

Today every wrong key is `errors += 1` (`app.js:3583-3585`), 3 errors → `recallQuality()` = 1 (`app.js:2764`) and `errors >= 3` demotes to guided (`app.js:2840`). A 6- or 9-cell loop under that rule makes recall mathematically unpassable for a student who mistypes twice.

**Rules (Option B):**

1. **The trainer must stop auto-typing in recall.** Guided keeps `typeValue(cellValue)` (consistent with every other parameter step) and shows the target value on the card. Recall accumulates the student's own digits — otherwise the banner (`Filled cell value with 30.`) hands over the answer, which is exactly the leak A1 closed elsewhere.
2. **At most one error per cell.** `cellErrors` is a per-cell counter; only the *first* wrong commit on a cell contributes to `walkthrough.errors`. Repeated attempts at the same cell are free (mirrors the repeatable-step rule pinned in `tests/ti84-repeatable-steps.test.js:251`).
3. **Cap the loop's contribution at 2.** `errorsFromLoop = min(distinctCellsMissedOnFirstTry, 2)`. Rationale: the loop is 2 of 11 authored steps; it must be able to cost a demotion-worthy score but must not *guarantee* one. A student who fumbles 4 of 9 cells still lands at quality ≤ 3 (no promotion) rather than a hard 1.
4. **Wrong-cell entry counts once, as a cell error** (not as a wrong key) — typing 70 into `[1,1]` is the misconception worth measuring.
5. **Hints inside the loop** reveal only the current cell's value and use the existing accounting (`showHint()` `app.js:3639-3660`: `hints += 1`, `errors += 1`). Cap: one free reveal per walkthrough of *which* cell is current (cursor position), which is never scored — the cursor is on-screen on real hardware anyway.
6. **No leniency shortcut.** `emulatorDataLeniency()` (`app.js:1047`) exists because the emulator's keying is lossy; the loop compares the trainer's own buffer, not the LCD, so the loop's verdict is authoritative in both modes. Do not extend leniency to it.

Recorded score path is unchanged (`recallQuality` → `sm2` → `bestScore` raise-only, A4). Because this makes a previously free pass earnable-only-by-typing, **it is grade-affecting** — flag it in the commit (`TI84_TRAINER_FIX_PLAN.md` deployment rules).

---

## 6. Rendering

### 6a. Native sim (no ROM) — currently renders nothing for this screen

The native sim has **no matrix editor at all**:
- `MENU_ACTIONS` has no entry for `matrix-menu-edit` (`ti84-trainer-v2/native/menu-tables.js:352-402`), so `ENTER` on the EDIT tab does nothing;
- `openEditor()` (`native/ti84-native.js:599`) stubs `activeWizard = null` for anything FormEngine doesn't define, and `EDITORS` (`native/form-engine.js:46`) defines only the four plot editors;
- the `editor` render branch calls `renderWizard` (`native/ti84-native.js:512-520`), while the grid renderer `ScreenRenderer.renderEditor()` (`native/screen-renderer.js:457-497` — columns, rows, `cursorRow`/`cursorCol`, inverted active cell) is **dead code, never called from anywhere**.

**Phase 1 (ships with the loop).** Drive the mock LCD from `screenLinesForMock()` (`app.js:4791-4818`): render the grid as text with the active cell bracketed, e.g.

```
MATRIX[A]  3x2
[  30    70 ]
[  80   [__]]      footer: Expect cell (2,2)
[   .     . ]
```

Cheap, honest, no native changes.

**Phase 2 (recommended follow-up).** Give the native sim a real matrix editor: add `'matrix-menu-edit': { 0: 'matrix-editor-a-dims' }` to `MENU_ACTIONS`, a dims + grid screen model, wire the `editor` render branch to the existing `renderEditor()`, and write committed cells into the native `matrices` store (`native/ti84-native.js:428-431`). Payoff: `chi-square-test` then computes χ² from the matrix **the student typed** — `resolveMatrix('Observed')` (`native/ti84-native.js:88`, used at `:267`) already reads that store, and `syncDataTargetToNative()` (`app.js:2236-2250`) already pushes matrices through `setMatrix` (`native/ti84-native.js:1109`).

### 6b. Real ROM (CEmu)

No screen work — the ROM draws the real editor. The trainer only overlays guidance and forwards keys, which the ROM path already proves works: `autoFillMatrix()` (`app.js:2374-2417`) walks `2ND → x⁻¹ → RIGHT → RIGHT → [n] → typeValue(rows) → ENTER → typeValue(cols) → ENTER`, then per cell `typeValue(cell) → ENTER` with 40/70 ms spacing. Reuse those timings verbatim.

One collision to handle: `bridge.typeValue()` sends a `CLEAR` before typing unless told not to (`ti84-trainer-v2/bridge.js:918-921`). Inside the loop, call `typeValue(value, { clearField: false })` when the student's buffer is empty, so a stray `CLEAR` can't exit the ROM's editor mid-loop.

### 6c. Physical mode (student's own calculator)

Per-cell "I did it" taps (`physicalAdvance()` `app.js:3697`) would be 6–9 taps of noise with no verification value. Render the loop as **one** card in `renderPhysicalStepCard()` (`app.js:4237-4340`): the full table with cell coordinates, and a single advance. `physicalKeyLabel()` (`app.js:4223`) must stop rendering `Type 5` (D2) and show `Enter the 3x2 table into [A]`. Credit still comes from the typed-result verification step (fix plan decision 2).

---

## 7. Edge cases

| # | Case | Required behavior |
|---|---|---|
| E1 | **Non-2×2 matrices** | Dims come from `problem.values.rows/cols`, cross-checked against `data`/`matrix` dims; on disagreement trust the array dims and `console.warn`. Canonical set today: `matrix-entry` 3×2, `chi-square-test` 3×2 and 3×3 (`ti84-pattern-recognition-data.json:981`, `:344`). |
| E2 | **Wrong-cell entry** | Arrows move the cursor freely (the ROM allows it). `ENTER` validates against `grid[cursor.row][cursor.col]`, never against "the next unfilled cell" — so a correct number in the wrong cell is caught, counted once (§5.4), and the banner names the cell: `That's the value for (1,2). The cursor is on (2,1).` |
| E3 | **CLEAR mid-entry** | First `CLEAR` = clear the buffer, stay on the cell, no error. A second consecutive `CLEAR` on an empty buffer exits the editor on real hardware → do not silently advance: disengage guidance and set the existing paused banner (`Guidance paused. Fix your entry, then click Resume.` `app.js:3541`). |
| E4 | **DEL** | Buffer backspace, forwarded to the bridge. (No `DEL` handling exists today anywhere in `pressButton`.) |
| E5 | **ENTER on the last cell** | Loop exits on `filled.size === rows*cols` regardless of what the ROM's cursor does (wrap vs. stay is unverified — §10). Never depend on the ROM's wrap behavior. |
| E6 | **Overshoot / re-edit a filled cell** | Allowed. Re-committing a filled cell with a wrong value un-fills it (`filled.delete`) and counts a cell error; with the right value it stays filled and is free. |
| E7 | **Back / Restart mid-loop** | `physicalBack()` (`app.js:3719`) must step the *cursor* back one cell before it steps `routeIndex`; `restart-walkthrough` and `startWalkthrough()` (`app.js:2662`) must null out `walkthrough.matrixLoop` (same slot as the `repeatPressCount` reset at `app.js:2678`). |
| E8 | **Auto-fill collision** | If the matrix is already loaded by Auto-fill, the loop is busywork. Fix by dropping `dataRequirements` from `matrix-entry` (D4). `chi-square-test` keeps `{"[A]":"matrix"}` (`ti84-procedures-data.json:7353-7355`) — that procedure legitimately assumes a pre-loaded matrix. |
| E9 | **Missing grid data** | If no `data`/`matrix`/`observed` array is resolvable, do **not** fall back to `DEFAULT_VALUE_SAMPLES` (that is D2). Skip the loop, single-cell behavior, and log — a missing grid is a data bug, not a student-facing state. |
| E10 | **Negative / decimal cells** | Not expected for observed counts, but `PARAMETER_INPUT_KEYS` (`app.js:487`) already admits `.` and `(-)`; buffer comparison must use `formatCalculatorValue()` (`app.js:2033`) on both sides so `30` never fails against `30.0`. |

---

## 8. Data + engine changes required (Option B)

| File | Change |
|---|---|
| `ti84-procedures-data.json:7061-7078` | Add `"loop": "matrix-cells"` / `"matrix-cells-commit"` + `"loopMatrix": "[A]"` to `matrix-entry` steps 10–11. |
| `ti84-procedures-data.json:2617-2634` | Same markers on the `enter-matrix` micro-skill (kept identical — the integrity suite treats micro-skills as a parallel collection). |
| `ti84-procedures-data.json:7080-7083` | Delete `matrix-entry.dataRequirements` (D4). |
| `data/ti84-procedures.js` | **Mirror byte-for-byte.** `tests/ti84-procedure-data-integrity.test.js:270-297` asserts full JSON equality; `study_guide_diagnostic.html:600` loads it. |
| `ti84-trainer-v2/app.js` | New `matrixLoop` state + routing branch in `pressButton()` (`:3524`); `sampleValueForToken()` (`:2015`) must resolve `{cell value}` from the cursor, not from `DEFAULT_VALUE_SAMPLES`; renderer branches in `renderWalkthroughPanel()` (`:3967`), `renderPhysicalStepCard()` (`:4237`), `screenLinesForMock()` (`:4791`), `physicalKeyLabel()` (`:4223`), `guidedSuggestions()` (`:2567`), `showHint()` (`:3639`). |
| `ti84-state-machine.js:824-836` | `handleMatrixValueEditor()` currently does `matrixCol: col + 1` with no clamp and no row wrap. Make it row-major with dims from `state.matrixDimensions` (`:249-254`) and clamp at the last cell, so the machine's cursor agrees with the app's. |
| build | `npm run build:ti84` (`node ti84-trainer-v2/build.mjs`) to regenerate `generated/*.js` + `standalone.html` — students load `standalone.html`. |

---

## 9. Test plan (named suites)

Root suite: `npm test` (`vitest.config.js` includes `tests/**` + `lib/**`).
Native suite: `cd ti84-trainer-v2/native && npx vitest run` (`native/vitest.config.js`).

| Suite | Work |
|---|---|
| `tests/ti84-repeatable-steps.test.js` | **Primary.** Add a `matrix-entry cell loop` describe using the existing harness (`bootTrainer`/`dueRecord`/`startWalkthroughFor`, `:98-167`). Pin: (a) guided pass types the six canonical values in row-major order (`typed === ['3','2','30','70','80','60','110','50']`); (b) result review does **not** appear before cell 6 — the D1 regression test; (c) `ENTER` on an empty buffer never advances — the D3 regression test; (d) the first cell's value is `30`, never `5` — the D2 regression test. |
| `tests/ti84-procedure-data-integrity.test.js` | Extend the `repeatable`-shape describes (`:113-135`, `:241-262`): `loop` markers only ever sit on a `{cell value}` / `ENTER` pair; `matrix-entry` carries no `dataRequirements`; the existing full-equality test at `:270` guards the `data/ti84-procedures.js` mirror for free. |
| `tests/ti84-state-machine.test.js` | `procedure traversal` (`:14`) and `micro-skill traversal` (`:31`) walk every authored step and assert `next.id === step.screen` — both must stay green for `matrix-entry` and `enter-matrix` after the marker + cursor changes. Add structural cases for row wrap and last-cell clamp in `handleMatrixValueEditor`. |
| `ti84-trainer-v2/native/tests/ti84-native.test.js` | Phase 2 only: new `Matrix editor` describe next to the existing `Matrix management` block (`:570-582`) — open MATRIX▸EDIT▸[A], set 3×2, type six cells, assert `getMatrix('[A]')` equals the grid, then run χ²-Test off it. |
| `ti84-trainer-v2/native/tests/verify-all-procedures.test.js` | Walks every procedure's authored keys through the native module with `SAMPLE_VALUES['cell value'] = '25'` (`:37-51`). Must not regress; update the sample handling if the loop marker changes key resolution. |
| `tests/ti84-standalone-sync.test.js` | Fails until `npm run build:ti84` is re-run — the reminder that students load `standalone.html`. |
| `tests/ti84-data-trust.test.js`, `tests/ti84-leniency.test.js`, `tests/ti84-plot.test.js`, `tests/ti84-math-prb.test.js` | Regression only — they all drive `pressButton()`, the function being modified. Run before commit. |

---

## 10. Open questions / ROM verification checklist

Same empirical treatment as A9 (booted ROM, OS 5.8.2.0029):

1. **`ENTER` on the last cell** — wrap to `(1,1)`, stay, or exit? (E5 is written to not care, but the mock LCD should match.)
2. **`CLEAR` semantics in the matrix editor** — does one press blank the cell, and does the second exit to HOME? (E3 assumes yes.)
3. **`2ND`+`MODE` (QUIT)** — the authored procedure ends inside the editor with no QUIT step; `chi-square-test` starts from `STAT`, which implies an implicit exit. Decide whether to author steps 12–13 (QUIT) — cheap, but it changes step counts in three suites and the `data/ti84-procedures.js` mirror.

---

## 11. Blast radius

| Target | Depth | Notes |
|---|---|---|
| `app.js:pressButton()` (`:3524`) | **d=1, HIGH** | Every guided/recall key press in the trainer. Guarded by `ti84-repeatable-steps`, `ti84-data-trust`, `ti84-plot`, `ti84-math-prb`, `ti84-leniency`. |
| `app.js:sampleValueForToken()` (`:2015`) | d=1 | Also feeds `showHint()` (`:3654`) and `physicalKeyLabel()` (`:4228`) — every parameter step in every procedure. Change must be additive (cursor-aware only when `matrixLoop` is active). |
| `app.js` walkthrough renderers (`:3967`, `:4237`, `:4791`) | d=2 | Cosmetic, but `ti84-repeatable-steps` asserts on `panel-note` text (`Step N of M`) — keep that string shape and add the cell line separately. |
| `ti84-state-machine.js:handleMatrixValueEditor()` (`:824`) | d=1 | Consumed by `generated/state-machine.js` (rebuild) and the traversal suite. |
| `ti84-procedures-data.json` matrix steps | d=1 | Fan-out: `ti84-trainer-v2/generated/data-procedures.js`, `standalone.html`, `data/ti84-procedures.js` (→ `study_guide_diagnostic.html`), and legacy `ti84_trainer.html` via `scripts/build-ti84-trainer.mjs`. |
| Gradebook / ledger | **grade-affecting** | Recall completion writes `source:'trainer'` items (`recordHandheldMastery()` `app.js:3170-3180` and the recall path). Closing D3 removes a free pass students may already have banked — `bestScore` is raise-only (A4), so nothing is retroactively lowered, but flag it. |
| Desk | none | `TI84_TRAINER_DESK_LINK_SPEC.md:37` maps lesson 8.5 → `matrix-entry`, `chi-square-test`; no code change. |
| roster-server | none | No backend change. |

**Effort (Option B):** engine + data + phase-1 rendering + tests ≈ **one focused session** (~250 lines across `app.js`, `ti84-state-machine.js`, two JSON files, two test files). Native-sim matrix editor (phase 2) ≈ **half a session** (~150 lines in `native/ti84-native.js` + `menu-tables.js`, reusing the already-written `renderEditor`). Option C stopgap ≈ **1 hour**.

**Sequencing:** `app.js` is one large IIFE — per `TI84_TRAINER_FIX_PLAN.md:60`, serialize this against any other `app.js` work, and rebuild `standalone.html` before commit.

# DESK_MODAL_POLISH_BUILD — Done-button latch + keyboard shortcuts

> Frozen contract for Task #8 (queued 2026-05-20).
> Scope: TWO prongs in `ap_stats_roadmap_square_mode.html`'s
> `showResourcePanel` + `studentMark`. No server change. No migration.
> No EOL change (file is LF — preserve).

## 0. Files in scope

| File | Role |
|------|------|
| `ap_stats_roadmap_square_mode.html` | Desk file — only file touched by this task |
| `tests/desk-modal-polish.test.js` | NEW structure test (acceptance pins) |

Out of scope: `recordProgress`, the gradebookClient feeder, server endpoints,
the visit-gate (5-min countdown from `540d168`), any other modal/surface,
`curriculum.js` (sacred), roster-server, migrations.

## 1. PRONG A — inline score + optimistic Done latch

### Symptom (teacher verbatim 2026-05-20)
> "[the Done] button is clicked, it doesn't immediately hold the pressed
> state, only once you click 'okay' and then reclick the square does it
> show 'done'."

### Root cause (planner-verified at line 5479)
`studentMark()` calls native `prompt('Score (0-100)?')` for the quiz
artifact. Native prompts (a) interrupt the click flow synchronously and
(b) on some browsers wipe transient DOM state. After dismissing the
prompt the panel `<div>` is still wired to the *old* render — the
re-render only happens AFTER `await recordProgress(...)`. The teacher
perceives this as "nothing happened" until they reclick the day.

### Required changes

**A1 — Replace the native `prompt()` for the quiz path with an inline
score input rendered IN the resource panel.**

- The Done button for `artifact === 'quiz'` is currently emitted as a
  bare `<button>` by `_doneBtn('quiz')` at line ~5330. Wrap it in a
  span container so we can swap the bare Done button for the score
  input on click without disturbing surrounding markup:
  ```html
  <span class="desk-quiz-done-slot" data-topic="..." data-artifact="quiz">
    <button ... onclick="studentMark(this, '...', 'quiz')">✓ Done</button>
  </span>
  ```
- On click of the quiz Done button, `studentMark()` MUST detect the
  quiz case and, instead of calling `prompt()`, swap the slot's
  innerHTML for an inline form:
  ```
  Score: <input type="number" min="0" max="100" class="desk-quiz-score-input" autofocus>
        <button class="s7btn chicago" onclick="..._save...">Save</button>
        <button class="s7btn chicago" onclick="..._cancel...">Cancel</button>
  ```
- The Save handler reads the numeric value, validates `0 <= n <= 100`,
  and proceeds to A2 (optimistic mutation + recordProgress).
- The Cancel handler restores the previous bare Done button by calling
  `showResourcePanel(...)` to re-render (the localStorage state is
  unchanged so the panel renders the same enabled "✓ Done" button).
- Enter key inside the input MUST submit (Save). Esc key inside the
  input MUST cancel — but ESC closing the modal (prong B) must NOT
  fire while the input is focused (active-element check protects).
- The inline form is **inside the same `<div style="margin:3px 0">`
  row** as the original Done button, so prong B's per-row letter/
  number badges still resolve correctly.

**A2 — Optimistic Done-button mutation.**

- In `studentMark()`, BEFORE the async `recordProgress` call, the
  Done button MUST be DOM-mutated to its saved state directly:
  ```js
  btn.disabled = true;
  btn.textContent = '✓ Saved';
  btn.style.opacity = '0.6';
  ```
  Current code at line 5485 sets `btn.textContent = 'Saving...'` —
  that's an INTERIM state and reads as "not yet done." Drop it; go
  straight to `✓ Saved` since the localStorage write inside
  `recordProgress` happens FIRST (per the `540d168` refactor) and is
  the source of truth.
- The current behavior on `if (ok && _lastResourcePanel)
  showResourcePanel(...)` (line 5515) stays — but now the re-render
  reads the localStorage `entry.ts` and renders the disabled
  `✓ Saved` button identically. Zero flicker.
- On the rare `!ok` path (recordProgress returns false — e.g.
  not-signed-in), the current rollback to `'✓ Done'` (line 5519)
  stays the same.

### Acceptance — prong A (manual smoke)

- Click Done on a WORKSHEET row → button immediately says "✓ Saved"
  (disabled, opacity 0.6), no flicker, no modal interruption.
- Click Done on a QUIZ row → an inline score input appears in the same
  row (NOT a native prompt). Type a score, press Enter or click Save →
  button immediately says "✓ Saved" with the score recorded.
- Click Cancel on the inline score form → bare "✓ Done" button
  returns; no localStorage write; no panel close.
- Saved state persists across modal close/re-open AND across page
  reload (localStorage is source of truth — already true per
  `540d168`).
- The visit-gate latch (5-min countdown from `540d168`) still works:
  Done stays disabled until the gate elapses, regardless of this
  prong's UI changes. (No touch to `_doneBtn`'s waiting/unvisited
  branches.)

## 2. PRONG B — keyboard shortcuts in the resource modal

### Spec (teacher verbatim 2026-05-20)
> "a, b, c, d, e, f, g..for example..to go to that link/etc ..and 1,
> 2, 3, 4 to select either the ap classroom video link, or the alt
> video link, or the done button.. depending on context."

### Required changes

**B1 — Letter keys (a–h) = jump-to-row + open primary link.**

- After the panel renders (just before the `display:block` at line
  5469), walk every `<div style="margin:3px 0">` row inside
  `#resource-body` in document order and assign a sequential
  lowercase letter `a` → `b` → `c` ... up to `h` (cap at 8 — if the
  panel ever has >8 rows, later rows just get no letter; do NOT throw).
- For each lettered row, render a small `[a]` / `[b]` ... badge at
  the **left** of the row (prepend it). Style:
  ```
  font-size:9px; color:var(--plat-lo); margin-right:4px;
  border:1px solid var(--plat-lo); padding:0 3px; border-radius:2px;
  font-family: 'Chicago', monospace;
  ```
- Pressing the lowercase OR uppercase letter (a/A) when the modal is
  open, no input focused, no modifier keys held:
  - Opens the row's **primary link** (first `<a>` in the row) in a
    new tab via `window.open(href, '_blank')`.
  - Fires `recordLinkVisit(topicId, artifact)` so the visit-gate
    counter starts (matches mouse-click parity).
  - Marks this row as the "focused row" (see B2).
  - If the row has no primary link (e.g. an AI-tutor button row with
    only a `<button>`, or a Schoology-status row), the letter MUST
    instead activate the row's first `<button>` via `.click()`.

**B2 — Number keys (1–4) = within-row context actions.**

- The "focused row" is the most recently letter-pressed row. On
  modal open the focused row defaults to the FIRST lettered row
  (`a`).
- The focused row gets a subtle outline:
  ```
  box-shadow: inset 0 0 0 2px var(--accent);
  border-radius: 3px;
  ```
  (Or equivalent — match System 7 aesthetic. `--accent` is already
  defined elsewhere in the file; if not, fall back to `#88f`.)
- Number badges `[1]` / `[2]` / `[3]` are rendered at the **right** of
  the row, immediately to the right of the corresponding control
  (next to the primary link, the alt-video link, and the Done button
  respectively). Style: same monospace badge as letters but slightly
  smaller (`font-size:8px`).
- Mapping:
  - `1` = primary link (first `<a>` in the row) — same as the letter
    activation, but stays on the focused row.
  - `2` = secondary link if the row has one. The only row type with
    a real `[2]` target is **Video rows** with an `altUrl` (search
    `(alt)`). For rows without a secondary link, `2` is a no-op (do
    NOT silently fall through to `1`).
  - `3` = Done button if the row has one (`button` with onclick
    starting with `studentMark`). If the button is disabled (visit-
    gate not elapsed yet), the keystroke still calls `.click()` — the
    button is `disabled` so the native handler won't fire; the
    teacher sees no change, which is correct (matches mouse parity).
  - `4` = reserved; no-op for now. Do NOT render a `[4]` badge for
    any row in this task.

**B3 — Listener lifecycle.**

- Add a private helper `_attachResourcePanelKeyHandler()` that
  attaches a `keydown` listener to `document` and stores the handler
  reference in `_resourcePanelKeyHandler`. Call it at the end of
  `showResourcePanel` after the panel is shown.
- Add a private helper `_detachResourcePanelKeyHandler()` that
  removes the listener and nulls the reference. Call it at the top
  of `closeResourcePanel`.
- Re-attach is idempotent: if a handler is already attached, detach
  first, then re-attach. (`showResourcePanel` is called recursively
  by `recordLinkVisit`'s `setTimeout` re-render and by
  `studentMark`'s success path — re-attach must not stack.)

**B4 — Active-element + modifier guard.**

The handler MUST early-return if ANY of:
- `document.getElementById('resource-overlay').style.display !== 'block'`
  (defensive — handler should always be detached when modal closed,
  but belt-and-suspenders).
- `e.ctrlKey || e.metaKey || e.altKey` (let browser shortcuts pass).
- `document.activeElement` is an `INPUT`, `TEXTAREA`, `SELECT`, or
  has `isContentEditable` set. (Protects the prong-A inline score
  input and any other future inputs.)
- Key is not one of: a-h (lowercase or uppercase), 1-3, Escape.

**B5 — ESC closes the modal.**

The existing global ESC handler at line 8506 only iterates
`.app-overlay` elements. The resource modal is `dialog-overlay`. The
NEW resource-modal-scoped handler MUST also handle ESC by calling
`closeResourcePanel()` and then early-returning. (When the inline
score input is focused, the active-element guard already kicks in —
so ESC inside the input falls through to the script-level ESC
handler. Per prong A, ESC inside the score input cancels the input
WITHOUT closing the modal. So: when the active element is the score
input AND key is Escape, the input's own onkeydown handler cancels
the input and stopsPropagation. Otherwise the panel-scoped ESC
closes the modal.)

### Acceptance — prong B (manual smoke)

- Open any day with a worksheet — see letter badges (a, b, c, ...) at
  the left of each row, and number badges (1, 2, 3) at the right of
  any row with multiple actions.
- Press 'a' on the keyboard → first row's primary link opens in a new
  tab AND the visit-counter starts AND the row gets a focus outline.
- With a row focused, press '3' → its Done button fires (subject to
  the visit-gate from `540d168`).
- Press '2' on a Video row with no altUrl → no-op (no error, no
  panel close).
- Press ESC → modal closes; keydown listener detaches; subsequent
  keyboard input on the Desk page has no surprise side-effects.
- Type a digit in the prong-A inline score input → letter/number
  shortcuts DO NOT fire (active element check protects).
- Press 'A' (uppercase) → same effect as 'a' (case-insensitive).
- Hold Ctrl + press 'a' → browser's "Select All" fires; modal
  handler ignores it.

## 3. Test pins — `tests/desk-modal-polish.test.js`

Structure test (no DOM smoke; static parse of the Desk file). Use the
same `fs.readFileSync` + regex pattern as
`tests/phase5-structure.test.js`. Pins (each = one `it()`):

**Shipped class names / helper names (used in code and pinned in tests):**

| Symbol | Chosen name |
|--------|-------------|
| Quiz slot class | `desk-quiz-done-slot` |
| Quiz Save helper | `_studentMarkQuizSave` |
| Quiz Cancel helper | `_studentMarkQuizCancel` |
| Shared save helper | `_studentMarkSave` |
| Attach handler fn | `_attachResourcePanelKeyHandler` |
| Detach handler fn | `_detachResourcePanelKeyHandler` |
| Letter badge class | `desk-row-letter-badge` |
| Number badge class | `desk-row-number-badge` |

Pins (each = one `it()`):

1. `studentMark` no longer contains `prompt(` — assert the function
   body (comments stripped) contains zero `prompt(` calls.
2. `_studentMarkSave` contains the optimistic mutation BEFORE the
   first `await recordProgress`: the substring
   `btn.textContent = '✓ Saved'` appears BEFORE `await recordProgress`
   in `_studentMarkSave`'s body.
3. An inline-score-input slot is rendered: the Desk HTML contains
   `class="desk-quiz-done-slot"` and `data-artifact="quiz"`.
4. `_studentMarkQuizSave` is defined as a function and referenced
   from the inline form's onclick.
5. `_attachResourcePanelKeyHandler` and
   `_detachResourcePanelKeyHandler` are defined as functions.
6. `_attachResourcePanelKeyHandler` is called from `showResourcePanel`
   AFTER `display = 'block'`.
7. `_detachResourcePanelKeyHandler` is called from
   `closeResourcePanel` BEFORE setting `display = 'none'`.
8. The keydown handler body (`_attachResourcePanelKeyHandler`) contains
   an active-element guard matching `INPUT|TEXTAREA|SELECT|isContentEditable`.
9. The keydown handler body contains a modifier-key guard matching
   `ctrlKey|metaKey|altKey`.
10. The keydown handler body handles `'Escape'` and calls
    `closeResourcePanel()`.
11. The keydown handler body handles digit keys 1, 2, 3 separately
    (checked via `num === 1`, `num === 2`, `num === 3`). No `[4]`
    badge is generated by the row-decoration code.
12. Letter-key badges are rendered: the Desk HTML contains the class
    `desk-row-letter-badge`.
13. Number-key badges are rendered: the Desk HTML contains the class
    `desk-row-number-badge`.
14. The visit-gate (`540d168`) is preserved: `_doneBtn`'s
    `entry.visitedAt` check + the `Done in ~Xm` branch are still
    present (literal substring search for `'Done in ~'` or
    `deskDoneGateMs`).
15. `recordProgress` body is unchanged (fingerprint: 'source of
    truth' comment + `localStorage.setItem` + `/rest/v1/student_progress`
    are all present inside `recordProgress`).
16. AI-tutor buttons (Phase-5 / Phase-5.1) still render: literal
    substrings `copyTutorPrompt(` and `copyTutorPromptPc(` are still
    referenced in `showResourcePanel`'s body.

Note: the test file ships 17 `it()` blocks (pin 01 is a file-exists
check; pins 02–17 correspond to the logical pins above). All 17
pass as of Task #8.

## 4. GREEN gate (loop step 6)

- Root `npx vitest run`: only known pre-existing fail = `tests/study-guide.test.js`
  "v3 structure / loads railway, curriculum, units, frameworks". No
  new failures introduced.
- New `tests/desk-modal-polish.test.js` passes (~16 cases per §3).
- `tests/phase5-structure.test.js` still 32/32 (AI-tutor buttons not
  broken). NOTE: the row-wrapping for the prong-A inline-score slot
  is for the QUIZ Done button only — AI-tutor buttons are in their
  OWN rows and are NOT modified.
- `tests/desk-roster-signin.test.js` still passes (roster prefill
  not broken — this task doesn't touch identity).
- `tests/desk-donow-*` still pass (Do-Now card and coloring not
  touched).
- `node scripts/audit-feeder-ids.mjs`: CLEAN 69 / MISMATCH 0.
- `roster-server` suite NOT run — this task is client-side only.
- EOL: `ap_stats_roadmap_square_mode.html` stays LF (UTF-8, no BOM,
  no CRLF lines introduced).
- `git status --porcelain` after commit: ONLY
  `ap_stats_roadmap_square_mode.html`,
  `tests/desk-modal-polish.test.js`,
  `DESK_MODAL_POLISH_BUILD.md`,
  `CONTINUATION_PROMPT.md`,
  `memory/MEMORY.md` (and the project memory file) staged. No
  unrelated dirty files in the commit.

## 5. Out-of-scope (explicit non-goals)

- No changes to `gradebookClient.record` or its body.
- No changes to `recordProgress`'s async path beyond what prong A
  needs (optimistic UI mutation only).
- No changes to the visit-gate (5-min countdown from `540d168`).
- No changes to other modals (signin, password change, AI-grader, etc.).
- No new server endpoints, no migration, no auto-deploy trigger.
- Letter-key conflicts with browser shortcuts (Ctrl-A, etc.) — leave
  browser defaults intact; only handle UNMODIFIED single-letter /
  single-digit presses.
- No new visual chrome on rows that don't have multiple controls
  (a Schoology-status row gets `[a]` because it's a row in order,
  but NO number badges — it has no clickable controls).
- No telemetry / analytics on the keyboard shortcut usage.

## 6. Manual smoke checklist (loop step 3)

Run against `http://localhost:8000/ap_stats_roadmap_square_mode.html`
(Python static server) with the local roster-server at
`http://localhost:8091` (already running). Sign in as `date_tiger` /
`apstats2026` via the Student menu.

1. Click any tile with a worksheet → resource panel opens.
2. Verify `[a]` `[b]` `[c]` ... letter badges appear at the left of
   each row.
3. Verify `[1]` `[2]` `[3]` number badges appear at the right of
   controls within rows that have them.
4. Verify the first row has the focus outline.
5. Press `b` → second row's primary link opens in new tab, focus
   moves to second row.
6. Press `3` → Done button on focused row fires (or shows "Open the
   link first" if visit-gate not started).
7. Open a tile with a quiz (e.g. any U2+ lesson day that shows a
   quiz row). Click that quiz row's Done button → inline score
   input appears (NOT a native browser prompt).
8. Type `85`, press Enter → button immediately says "✓ Saved",
   panel re-renders with disabled "✓ Saved" button.
9. Reload the page, reopen the same tile → button still says
   "✓ Saved" (localStorage persistence).
10. Press ESC → modal closes. Press `a` → no effect (listener
    detached).
11. Reopen modal, click into a non-existent text input (or use
    devtools to focus an `<input>` if available) → press `a` → no
    effect (active-element guard).

If any step fails, fix and re-smoke before commit.

## 7. Commit message (template)

```
Desk modal polish: inline quiz score input + keyboard shortcuts

- Replace native prompt() with inline score input in resource modal
  so quiz Done button latch is immediate (no perceived delay)
- Optimistic Done-button mutation: '✓ Saved' before the async
  recordProgress write (localStorage is already source of truth
  per 540d168)
- Letter keys a-h jump to/open rows; number keys 1-3 fire within-row
  context actions (primary link / alt video / Done); visual badges
  next to controls; ESC closes modal
- Keydown listener scoped to modal lifecycle (attach on open, detach
  on close); active-element + modifier-key guards prevent surprise
  side-effects
- New tests/desk-modal-polish.test.js (16 structure pins)
- No server change; no migration; no auto-deploy trigger
- EOL preserved (LF); only own paths staged
```

## 8. Lineage

Builds on `8f0ba44` (docs queue) ← `633013c` (per-quarter ceiling).
Does NOT touch any file under `roster-server/` → GitHub auto-deploy
on `roster-server/**` will NOT fire (correct behavior; this task is
client-side only).

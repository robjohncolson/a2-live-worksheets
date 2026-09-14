# MODAL_ESCAPE_AUDIT.md — keyboard-dismissable modals

> Status: Desk pass SHIPPED (session 21, 2026-06-18). From the teacher: "make sure all
> modals can be escaped with the keyboard — the day-material modal can't be."

## The fix

The Desk (`ap_stats_roadmap_square_mode.html`) had a global Escape handler that closed the
six `.app-overlay` System-7 windows + the doge dropdown, and most other modals registered
their own modal-scoped Escape handler on open. But several **content modals had none**, so
Escape did nothing. Added `_escCloseTopModal()` — a safety net wired into the existing global
Escape handler that closes the **topmost visible** gap modal via its own cleanup-aware close
fn (a blanket `display:none` would leak listeners/timers, e.g. the Blooket nav keydown).

## Desk modal inventory

| Modal | Escape before | Now |
|-------|---------------|-----|
| `.app-overlay` ×6 (TI-84, quiz, formulas, progress, **My Ledger**, teacher tools) | ✅ global → `destroyApp` | ✅ |
| `game-overlay` (Study Break) | ✅ own keydown | ✅ |
| `day-grade-overlay` | ✅ `_dayGradeKeyHandler` | ✅ |
| `grade-help-overlay` | ✅ `_gradeHelpKeyHandler` | ✅ |
| `my-gradebook-overlay` (+ class gradebook) | ✅ `_myGradebookKeyHandler` | ✅ |
| `my-receipts-overlay` | ✅ `_myReceiptsKeyHandler` | ✅ |
| `student-dm-modal` | ✅ capture-phase Esc | ✅ |
| **`resource-overlay`** ("material for the day") | ❌ **none** | ✅ `_escCloseTopModal` → `closeResourcePanel` |
| **`donow-bump-overlay`** (Do-Now speed bump) | ❌ none | ✅ → `closeDoNowBump` |
| **`dialog-overlay`** (generic `showDialog`: lesson-locked, baseline, alerts) | ❌ none | ✅ → `closeDialog` |
| **`bf-overlay`** (Blooket flashcards — had nav keys, no Esc) | ❌ none | ✅ → `closeBlooketFlashcards` |
| **`override-gate-modal`** (teacher view-as override) | ❌ none | ✅ → `_hideOverrideGateModal` |
| **`guest-pass-overlay`** (guest pass QR) | ❌ none | ✅ direct hide (opens `display:flex`) |
| **`reconcile-qr-overlay`** (teacher reconcile QR) | ❌ none | ✅ direct hide (`flex`) |
| **`verify-qr-overlay`** (teacher verify QR) | ❌ none | ✅ direct hide (`flex`) |
| **`big-qr-overlay`** (tap-to-enlarge QR) | ❌ none | ✅ direct hide (`flex`) |

### Two fixes from the completeness audit
- **`display:flex` detection.** The QR/guest overlays open as `flex`, not `block`. `_escVisible()`
  treats *any* non-`none` inline display as open (an earlier `block`-only check would have skipped them).
- **Defer guard.** If a self-handled modal is visible, the net returns early and closes nothing — so a
  gap modal stacked UNDER a self-handled one (reachable: dblclick a calendar cell → resource panel opens,
  then day-grade opens on top) is NOT also closed on the same Escape. The top modal closes via its own
  handler; a second Escape then closes the one underneath.

## Deliberately NOT auto-escapable

- **Sign-in WALL** — `signin-overlay` / `signup-overlay` / `pwchange-overlay`. The no-guest
  wall must persist until the student signs in; `closeSignInModal()` already refuses to dismiss
  while the wall is active. These are also part of the in-progress onboarding refactor, so they
  are left untouched.

## Why a registry (not a blanket close)

Each gap modal maps to its OWN close fn so cleanup runs (Blooket detaches its keydown nav; the
others play the close SFX + hide). Self-handled modals (day-grade etc.) are kept OUT of the net
so their handlers aren't double-fired and the wrong (underneath) modal isn't closed when stacked.

## Tests

`tests/desk-modal-escape.test.js` — runs the real `_escCloseTopModal()`: each gap modal closes
via its own fn, no-op when nothing is open, topmost-by-z-index when stacked, the global handler
calls it, and the wall + self-handled modals are excluded.

## Other surfaces (not yet covered)

This pass is the Desk. The completeness audit surveyed the worksheet family and found one real gap:

- **Worksheet aggregate drawer (`#aggregateDrawer`)** — the class-answer slide-out in every
  `u*_lesson*_live.html` (~69 files; `position:fixed; z-index:9999`). It can ONLY be closed by its X
  button or by tabbing to another blank — **no Escape handler**. (Note: CLAUDE.md's "Escape key closes
  drawer" claim is STALE/inaccurate for these files.) A fix is a codemod-style rollout
  (`scripts/wire-*.mjs`) scoped to `^u\d+_lesson.+_live\.html$`, excluding
  `edgar_u6_conceptual_driller_live.html` per the hard rule. **Offered as a follow-up.**

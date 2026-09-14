# Timed full-deck flashcards — a real Blooket substitute (build spec)

> See FLASHCARD_V2_BUILD.md (2026-08-18) for the current contract.

Decided with the teacher (2026-06-02). Make the Desk flashcards a legitimate, rigorous
alternative to the in-class Blooket — so a kid who's absent **or** who just can't stand
Blooket can learn the material and earn the full grade. Lays the foundation for an SRS /
Bayesian-knowledge-tracing layer and an eventual Blooket retirement.

## Two flashcard modes (student picks at launch)

**1. Quick check — UNCHANGED.** Top-10 deck, untimed, early-stop at 8/10. **Caps at 80%.**
Leisurely look-up is fine; the price is you can never beat 80% this way. The "I reviewed
it, give me the floor" path.

**2. Full deck, timed — NEW.** *All* valid cards (e.g. 28 for U1L1), shuffled, **40 s per
question**, no early-stop, can earn up to **100%**. The real Blooket substitute.

## Full-deck scoring (the credit ladder)

Each question starts at **credit = 1.0**. A *miss* is a **wrong answer OR a 40 s timeout**
— both are treated identically:

- On a miss: show a brief note (✗ for wrong, "⏱ too slow" for a timeout), **−⅓ credit**,
  and **re-queue** the card to the back (it comes back later this round). **Do NOT reveal
  the correct answer** (a revealed answer makes the retry trivial).
- A correct answer (in time) **banks the card's current credit** and resolves it.
- **3 misses** on a card → credit **0** (100 % wrong), card **removed for the rest of the round**.

| Misses before correct | Credit earned |
|---|---|
| 0 | 1.00 |
| 1 | 0.67 |
| 2 | 0.33 |
| 3 (struck out) | 0.00 |

**Deck score = Σ(earned credit) ÷ (total cards) × 100** → 0–100 %.

Round ends when every card is resolved (correct or struck out). A timeout **auto-advances**.

### "Review your misses" recap
At the end, show every card that was missed at least once (credit < 1.0), with the
**correct answer** — the learning payoff, after the grade is already locked.

## Per-card logging (SRS / BKT foundation — log now, schedule later)
Every full-deck answer records `{ qnum, correct, latencyMs, wasTimeout, missIndex }` (not just the
final %). As of the V2 build, quick mode and the mobile launcher also write this per-card log with
the additive fields defined in `FLASHCARD_V2_BUILD.md` §3. The log supports SRS/BKT without changing
the final-score contract.

## Grade model change
`blooket = max(real game score, flashcard score)` — the **better of the two efforts**
(was "game wins"). A great timed-deck run beats a mediocre game and vice-versa; learning
is rewarded. Flashcard score may now exceed 80 % (full deck) — quick mode still caps at 80 %.
Engine: `roster-server/lesson-grade.js` `computeLessonGrades` finalize → `Math.max`.

## Resource-panel UX (the colors + always-show-score the teacher asked for)
For every **scored** asset (worksheet, quiz, Blooket): a **score chip always shown, off to
the side, even when complete**, colored by score vs. that asset's gate:
- 🔴 **red** — below the gate (can't advance)
- 🟡 **yellow** — at/above gate but < 100 %
- 🟢 **green** — 100 % (perfected)

Per-asset gate: worksheet 60 %, quiz 40 %, Blooket 80 %. **Video** stays a neutral
"✓ visited" (no score → no color).

Blooket row gets a **Flashcards** launcher that is **always available** (so a student can
re-run the full timed deck to *improve* a score, not just to first-complete it). Clicking it
opens a **mode picker**: Quick check (≤80 %) vs Full deck — timed (up to 100 %).

**Conversion fix:** after a flashcard run, refresh `/grade` so the chip/score updates
immediately (today it can lag behind the cached grade).

## Test plan
- roster-server: `blooket = max(game, flashcard)` (game-wins replaced) + back-compat.
- Desk (static parse + pure-fn): the credit-ladder engine (`_ft*` pure functions) —
  miss = −⅓, 3-strikes = 0/removed, re-queue, deck score = Σcredit/total; mode picker
  present; timer = 40 s; recap built from misses; per-card log shape; score-chip color
  thresholds (red/yellow/green per gate); Blooket launcher always enabled.

## Non-goals (v1)
- No cross-session SRS scheduling (v2). No BKT (v3). No Blooket removal yet — both paths
  run side-by-side; `max()` + per-card logs make a later retirement a config flip, not a rewrite.

## Review folds (adversarial review, 4 dims × verify)
- **Blocker — null-round crash:** closing the modal during the 800 ms auto-advance fired
  `_ftRenderCard` against a torn-down round → `_ftFinish` threw on `round.log`. Fixed: the advance
  is a cancellable `_ftState.advanceId` (cleared in `_ftClearTimer`) + `_ftFinish` bails on a null round.
- **Major — cross-device downgrade:** best-wins was client-only and floored on a possibly-stale
  `/grade` cache, so a worse run on a 2nd device could clobber a better score. Fixed: `_blooketCommit`
  refreshes `/grade` **before** computing the floor (+ the synchronous local `mark.score` floor).
  Residual: a truly-simultaneous two-device finish is still theoretically possible — a server-side
  max-merge on the `BL-…-DESK_DONE` row is the authoritative future hardening if it ever matters.
- **Major — duplicate chip:** the new colored chip collided with the pre-existing `_mkGradeChip`
  "Grade: N%" chip on worksheet/quiz. Fixed: one chip per row — `_mkGradeChip` is colored via a shared
  `_scoreColor(score, gate)` (worksheet 60 / quiz 40); Blooket keeps its inline `_scoreChip` (the
  `_mkGradeChip` block still excludes Blooket per the ledger-heal contract).

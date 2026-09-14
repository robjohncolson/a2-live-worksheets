# Animated Desktop Icons — Motion Spec

Calm, state-distinct motion on the Desk icons so the desktop *expresses* each
app's live state at a glance. Decided 2026-06-14: **calm & state-distinct**
vocabulary, **all icons, Do-Now aware**. Restraint matches the System-7 look;
every gesture maps to real runtime state — nothing invented.

## Where motion lives (and where it must NOT)

- Motion is applied to the inner **`.icon-img`** (the picture bobs; the label
  stays put) and to the **`.wallet-readiness-dot`** — **never** on the draggable
  `.app-icon` container, so it can never fight drag or `top/left` positioning.
- Pixel art stays crisp: bob/rise/hop are **integer `translateY`**; "breathe" is
  a **box-shadow glow on the dot**, not a scale on the PNG. The only scale is a
  half-second one-shot "settle" celebration (transient blur is acceptable).
- **All animations gated** behind `@media (prefers-reduced-motion: reduce)` →
  static (the colored dot still shows; nothing moves).
- `.app-icon.dragging .icon-img { animation: none !important; }` — no motion
  while the student is dragging an icon.

## Wallet — readiness state → gesture

Driven by `data-readiness-state` + `--rdy-hue` set on the wallet `.app-icon` in
`updateWalletReadinessIcon()` (the existing painter; the dot is already
persistent, so the attribute is only rewritten when the state changes → CSS
animation never restarts on a plain `/grade` poll). States come from
`_walletDisplayReadiness()` (summer overlay ∥ fall).

| state | gesture | rationale |
|-------|---------|-----------|
| `nodue` / `notdue` | **static** (neutral grey dot) | no signal to give |
| `behind` | whole-icon **slow bob** (2.6s) | a calm "do some work" nudge |
| `catchingup` | gentle **rise + settle** (2.2s), blue dot | "you're moving" — hopeful, distinct blue |
| `eligible` | **dot breathe** glow (2.4s) | best-of just unlocked |
| `ready` | **dot breathe** glow (2.4s) | on pace, ready for the next lesson |
| `resting` | **slow dot breathe** (4.5s) | "take a breather" — calmest |
| `caughtup` | dot **sparkle** (rare brightness flash, 9s) | content |
| `done` | one-shot **settle** on entering, then sparkle | quiet celebration |

The dot keeps its existing `hsl(hue,70%,45%)` color; the glow uses
`hsl(var(--rdy-hue),80%,55%)`.

## Do-Now aware — the other app icons

`renderDoNow()`'s `show(text, mode)` is the single chokepoint; it calls
`_paintDeskMotionCues(nextApp, caughtUp)`:

- mode `'todo'` → there IS assigned work → **Quiz icon breathes** (`donow-next`,
  a 2.0s up-translate "open me next"). `nextApp` comes from
  `WalletLogic.appForNextTask(nextTask)`.
- mode `'done'` (all caught up) → no assigned work → **Equation Trainer + TI-84
  shimmer** (`tool-idle`, 3.2s opacity breathe) inviting optional practice.
- mode `'signin'` / signed-out / error → **all cues cleared** (a static desktop).

### `WalletLogic.appForNextTask(nextTask)` (pure, tested)

The work manifest only emits `activity ∈ {worksheet, quiz}` (+ progress checks),
and **all** of them are done inside the AP Stats **Quiz** app, so this returns
`'quiz'` today. It is the single extensibility seam: add a case if the manifest
ever introduces a calculator/equation activity, and the matching tool icon will
light up as the "next task" automatically.

```
appForNextTask(nextTask):
  if !nextTask or not an object        -> null
  if activity in {worksheet,quiz,pc,progress_check} -> 'quiz'
  else                                 -> 'quiz'   // curriculum work lives in the Quiz app
```

## Game — peer presence (extends doge-wiggle)

`DogePresence.updateIcon()` already drives the menu-bar doge; extend it to mirror
presence onto the desktop `.app-icon[data-app="game"]`:

- peers online (`connected && players.length > 0`, no challenge) →
  `game-peers` → gentle **hop** (1.8s).
- incoming challenge → `game-challenge` → urgent **throb** (0.6s scale pulse) —
  takes precedence over the hop.
- neither → no class → still.

## Not touched

The 📅 calendar desktop icon is left alone — the calendar window already pulses
the next-up cell (`calCurrentPulse`) and "ahead" cells (`dcAheadPulse`); adding
icon motion on top would double the signal.

## Tests (`tests/wallet-logic.test.js`, extend)

- `appForNextTask`: `{activity:'worksheet'}` → `'quiz'`; `{activity:'quiz'}` →
  `'quiz'`; `{activity:'pc'}` → `'quiz'`; `null`/`{}`/`'x'` handled (null on
  non-object, `'quiz'` default otherwise). Execute the real imported fn.

## Verification

- Node functional check of `appForNextTask` + the full wallet-logic suite green.
- Visual: open the Desk, confirm each readiness state's gesture, the Quiz
  breathe with work pending vs. the tool shimmer when caught up, and the game
  hop/throb. Confirm `prefers-reduced-motion` kills all motion.

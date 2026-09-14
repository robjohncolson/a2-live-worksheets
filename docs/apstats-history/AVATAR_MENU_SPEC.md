# AVATAR_MENU_SPEC.md — Click-to-reveal avatar menu (Live Classroom, student Desk)

> Status: SHIPPED (session 20, 2026-06-18). Student Desk only; the teacher cockpit is
> intentionally untouched.

## Goal (teacher's ask)

In the Desk's Live Classroom scene, usernames currently **float above every avatar at
all times** — hard to read and noisy. Replace that with a **click-to-reveal** flow that
also exposes the two social actions:

1. **No always-on names.** Avatar names do not float above heads.
2. **Click an avatar → see the username.** (Two-stage: first tap shows the name.)
3. **Click again → a small menu:** 🍬 **Send candy** or ⚔️ **Start a game** (Tetris).
4. **Click your OWN avatar → a light "happy bounce"** — the sprite hops + wiggles and a 🍬✨
   puff floats up (no window). My Ledger stays one tap away in the Apps menu + the desktop
   icon. (We tried auto-opening My Ledger on self-tap first; it felt too heavy/intense, so it
   was replaced with the emote.) Classmate = social menu; self = a moment of delight.

"Loop it all together" = one interaction surface (a popover anchored at the tapped head)
carrying the name + both actions.

## Decisions (locked with the teacher)

- **Two-stage reveal** ("name flash, then menu"): tap 1 → name chip; tap 2 (or tapping the
  chip) → the action menu. Not a single combined popover.
- **Scope = student Desk only.** The teacher cockpit (`teacher-classroom.html`) already has
  its own richer click-popup (name + nudge / remediation / gate) plus "Select Students",
  and its **floating real names are kept** for at-a-glance monitoring. We do not touch it.

## What floats / what reveals

The shared engine (`canvas_engine.js`) paints `entity.getLabelSpec().text` above every
entity each frame. Suppressing avatar names is a per-mount flag — coins/keys/goals/etc.
keep their labels (different sprite classes); only `BoardSprite` (avatars, and the local
`PlayerSprite` which extends it) is affected.

## Implementation

### `classroom-board.js`
- `BoardSprite` gains `this.hideLabel = !!opts.hideLabel`; `BoardSprite.getLabelSpec()`
  returns `null` when `hideLabel` (skips the engine's name pass). `PlayerSprite` inherits it.
- `mount()` reads `var hideNameLabels = !!opts.hideNameLabels` and threads it onto every
  avatar via `baseOpts.hideLabel` in `addSprite`.
- The canvas hit-test now forwards click coords + a self flag:
  `onAvatarClick({ username, selectMode, clientX, clientY, isSelf })` (additive — `selectMode`
  stays first-after-username so the cockpit source pin still matches; existing consumers
  ignore the extra fields).
- `selfClickable` mount opt: when set, the local user's own avatar is hittable and fires
  `isSelf:true`. The Desk passes it; the cockpit omits it, so self stays unclickable there
  (a teacher has no wallet panel + must not nudge themselves).

### `ap_stats_roadmap_square_mode.html` (the Desk)
- The student board mount passes `hideNameLabels: true`. The cockpit omits it → names float.
- New `_avatarMenu` controller (object literal, like `DogePresence`) drives the popover:
  - `onAvatarClick(hit)`: same avatar at the `name` stage → advance to `menu` in place;
    otherwise open a fresh name chip at the click coords.
  - `open()` builds a `position:fixed` `.avatar-pop` appended to `<body>` (so the board
    mount's `overflow:hidden` can't clip it), anchored above the head. After each render,
    `_reposition()` measures the box and nudges it fully into the viewport — flipping
    BELOW the head when there's no room above (no-op in jsdom, where there's no layout).
  - Dismissal: a bubble-phase document click closes it unless the click is inside the
    popover or part of the same avatar-hit dispatch (guarded by a short-lived
    `_handlingClick` flag set during `onAvatarClick`). Esc also closes.
  - Actions reuse the proven primitives: **Send candy** → `_candyPoke(username)` (guards
    self / guests / no-wallet / cooldown); **Start a game** → `DogePresence.sendChallenge`
    (the challenge rides the always-on presence socket and auto-opens the match on accept).
    "Start a game" is enabled unless presence positively reports the peer off-Desk.
- `onAvatarClick` in the mount routes a self-click (`hit.isSelf`) to `_avatarSelfEmote(hit)` and
  any other avatar to `_avatarMenu.onAvatarClick(hit)` — **supersedes the old instant
  candy-poke-on-tap** (CANDY_POKE_SPEC.md).

### Self-click emote (AVATAR_SELF_EMOTE)
- **No new sprite art.** The mascot is an armless pink cat-blob (sprite.png, 80×96 frames,
  11 cols × 2 rows; the board only uses idle/walk/jump). A "wave" is unnatural; a **bounce**
  reads as happy. `PlayerSprite.playEmote()` sets a one-shot `_emoteMs` timer; `update()` ticks
  it; `render()` adds a render-space hop (`-|sin|·EMOTE_HOP_PX`) + decaying sway — pure cosmetic
  offsets, never physics. The board handle exposes `selfEmote()` (bounces `spriteEntities[username]`).
- **Nano-banana hook:** `EMOTE_FRAME` (default `null` → bounce the normal frame). Set it to an
  UNUSED sheet column once a "cheer" pose is drawn there (put its left mirror at `EMOTE_FRAME+11`);
  the emote then poses on it mid-hop. Drop-in: 80×96, transparent, pixel-art, salmon-pink palette,
  feet on the existing baseline, right-facing.
- **Desk side:** `_avatarSelfEmote(hit)` calls the board hop (skipped under `prefers-reduced-motion`),
  plays `MacSFX` `wildEep`, and puffs a 🍬 + two ✨ DOM particles up from the click coords (the 🍬 is
  enriched with the live candy balance via the cached wallet fetch). A 600 ms debounce stops click-spam.
- CSS: `.avatar-pop` / `.avatar-pop-name` / `.avatar-pop-hint` / `.avatar-pop-acts`,
  reusing the System-7 `.doge-sub-act` buttons.

## Security

The Live Classroom WS is un-authenticated (the cr server only trims usernames), so peer
usernames are **untrusted**. The popover renders the name with `textContent` and wires
every action with `addEventListener` — **no HTML interpolation / no `onclick=""` sink**, so
there is no stored-XSS surface (the failure mode the s18 doge submenu had to patch).

## Tests
- `tests/desk-avatar-menu.test.js` — runs the real `_avatarMenu` literal in jsdom:
  two-stage reveal, advance-on-re-click, Send candy → `_candyPoke`, Start a game →
  `DogePresence.sendChallenge` (and the off-Desk disable), Esc / outside-click dismissal,
  switching avatars resets to the name stage, the XSS-safe name rendering, and the
  `_reposition()` viewport-fit fold (flip-below + edge-nudge, via a stubbed rect).

## Review (s20)

3-lens adversarial workflow (interaction / security / integration) + per-finding verify:
all three lenses voted **ship**; 5 raw findings → **3 confirmed, all minor**, 0 uncertain.
No correctness / security / state-machine / regression issues (XSS handling and the
cockpit + non-avatar-label scoping passed). The 3 confirmed were one root cause — the
edge-of-viewport popover clamp — folded via `_reposition()`.
- `tests/classroom-board.test.js` — `getLabelSpec` returns `null` under `hideLabel`; the
  hit-test forwards `clientX/clientY`.
- `tests/candy-poke.test.js` — updated: the Desk's `onAvatarClick` now routes to
  `_avatarMenu`, and the candy pipeline is reached via the menu's Send-candy action.

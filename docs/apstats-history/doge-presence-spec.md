# Spec: Multiplayer Bug Fixes & Doge Online Presence System

## Overview

Two-part spec for `ap_stats_roadmap_square_mode.html`:

1. **Fix existing multiplayer bugs** — split-screen rendering is broken (blank panes), and the game can't return to mode-select after closing
2. **Add Doge presence system** — pixel-art Doge icon in the System 7 menu bar for online-presence awareness and non-blocking multiplayer challenges from the calendar view

## Goals

- Fix the three multiplayer bugs so 1v1 actually works
- Move multiplayer discovery **out** of the Tetris lobby into the always-visible menu bar
- Make challenging a classmate feel like a quick, playful interaction — not a workflow interruption
- Keep the System 7 aesthetic consistent (dropdown menus, beveled buttons, retro sounds)
- Minimize server load: reuse the existing Railway WebSocket, lightweight presence only

---

## Part A: Multiplayer Bug Fixes (prerequisite for Part B)

### Bug 1: Split-screen panes are blank — no falling blocks on either side

**Symptoms:** After matching with another player, two canvas panes appear but neither shows a board, pieces, or any rendering. The game is unplayable.

**Root cause: All drawing methods use `this.ctx` (the hidden solo canvas)**

When `startMatch()` fires (line 1640), it:
1. Hides the solo canvas: `this.canvas.style.display = 'none'`
2. Shows the split container: `splitEl.style.display = 'block'`
3. Sets up `this.splitConfig.ctx` (gameCanvas1) and `this.opponentConfig.ctx` (gameCanvas2)

But the game loop calls `this.draw()` with no arguments, and `draw()` falls back to `this.ctx` — which is still the **hidden** solo canvas context. Every sub-drawing method also hardcodes `this.ctx`:

| Method | Line | Uses |
|--------|------|------|
| `draw(cfg)` | 2339 | `cfg.ctx \|\| this.ctx` (top-level only) |
| `drawPanelBox()` | 2409 | `this.ctx` |
| `drawBoardWell()` | 2444 | `this.ctx` |
| `drawBoardCells()` | 2474 | `this.ctx` |
| `drawCell()` | 2502 | `this.ctx` |
| `drawSquareBlock()` | 2525 | `this.ctx` |
| `drawPiece()` | 2549 | calls `drawCell()` → `this.ctx` |
| `drawGhostCell()` | 2568 | `this.ctx` |
| `drawMiniPiece()` | 2574 | `this.ctx` |
| `drawFlashBanner()` | 2593 | `this.ctx` |
| `drawCenterCard()` | 2609 | `this.ctx` |
| `drawModeSelect()` | 2631 | `this.ctx` |

Similarly, `boardToPixel()` (line 2332) uses `this.BOARD_X` and `this.CELL` — the solo-mode constants (155, 12). In split mode these should be (105, 10).

Additionally, `drawOpponentBoard()` (line ~1749) is only called from `updateOpponentState()` on incoming server messages — it is **not** called in the game loop, so the opponent pane only updates sporadically.

**Fix strategy: Swap active rendering context when entering/leaving 1v1**

When entering a match, swap `this.ctx`, `this.CELL`, `this.BOARD_X`, `this.BOARD_Y`, `this.CANVAS_W`, `this.CANVAS_H` to the `splitConfig` values. When leaving (close, gameover), swap back to solo values. This way all existing drawing methods work without changing their signatures.

Concretely:
```
enterSplitMode():
  // Save solo values
  this.soloConfig.ctx = this.ctx
  this.soloConfig.canvas = this.canvas
  // Swap to split values
  this.ctx = this.splitConfig.ctx
  this.CELL = this.splitConfig.CELL          // 10
  this.BOARD_X = this.splitConfig.BOARD_X    // 105
  this.CANVAS_W = this.splitConfig.CANVAS_W  // 215
  this.CANVAS_H = this.splitConfig.CANVAS_H  // 302

exitSplitMode():
  // Restore solo values
  this.ctx = this.soloConfig.ctx
  this.CELL = this.soloConfig.CELL           // 12
  this.BOARD_X = this.soloConfig.BOARD_X     // 155
  this.CANVAS_W = this.soloConfig.CANVAS_W   // 430
  this.CANVAS_H = this.soloConfig.CANVAS_H   // 302
```

Also: call `this.drawOpponentBoard()` at the end of each `draw()` call when `this.mpState` is active, so the opponent pane refreshes every frame (not just on server updates).

---

### Bug 2: Can't return to mode-select (Solo/1v1) after closing the game

**Symptoms:** After playing a solo game and closing the Study Break window, reopening it shows either a frozen game-over screen or a paused game. There's no way to get back to the title screen with Solo/1v1 buttons without a hard page refresh.

**Root cause: `close()` doesn't reset state to `'idle'`; `open()` doesn't either**

The `close()` method (line 1379):
```javascript
if (this.state === 'running') this.state = 'paused';
// 'gameover' state is unchanged
```

The `open()` method (line 1368):
```javascript
this.init();  // bails immediately — if (this.initialized) return;
this.overlay.style.display = 'block';
this.startLoop();
this.draw();  // draws whatever stale state remains
```

So:
- Play solo → game over → close → state stays `'gameover'`
- Reopen → draws `'gameover'` card → click restarts as solo → **never** shows mode select again

**Fix:** In `open()`, after `init()`, always reset to the title screen:

```javascript
open() {
    this.init();
    SFX.init();
    // Always return to mode select on open
    this.mode = 'solo';
    this.state = 'idle';
    this.resetBoardState();
    this.overlay.style.display = 'block';
    this.canvas.style.display = 'block';
    document.getElementById('game-split').style.display = 'none';
    document.getElementById('game-lobby').style.display = 'none';
    this.canvas.focus();
    this.startLoop();
    this.updateHud();
    this.draw();
}
```

---

### Bug 3: Keyboard works but mouse doesn't during multiplayer matches

**Symptoms:** Not directly reported, but discovered during code audit. May contribute to general "unresponsiveness" feel.

**Root cause:** The `mousedown` listener (line 1255) is bound to `this.canvas` — the solo canvas. During a match, that canvas is hidden (`display: none`). The split-screen canvases (`gameCanvas1`, `gameCanvas2`) have no mouse listeners.

In practice this mainly affects:
- Can't click to restart after a multiplayer game-over
- Can't click to pause/unpause during multiplayer

Keyboard input is unaffected (listener is on `document`).

**Fix:** Not critical for initial fix since Tetris is keyboard-driven, but `startMatch()` should attach a click handler to `splitConfig.canvas` for gameover/pause interactions, or the document-level keydown handler covers these cases adequately (Enter to restart, P to pause). Document this as a known limitation or add the handler.

---

### Bug summary table

| # | Bug | Root Cause | Severity |
|---|-----|-----------|----------|
| 1 | Blank split-screen panes | All draw methods use `this.ctx` (hidden solo canvas) | **Critical** — multiplayer unplayable |
| 2 | Can't return to mode-select | `close()`/`open()` don't reset state to `'idle'` | **High** — forces hard refresh |
| 3 | No mouse input in multiplayer | mousedown on hidden solo canvas | **Low** — keyboard still works |

---

## Part B: Doge Presence System (depends on Part A)

## 1. Doge Menu-Bar Icon

### Placement

Insert between the mute button (`#mac-mute`) and the clock (`#mclock`) in the menu bar:

```
[🍎] File  Edit  View  Label  Special        🔊  🐕  9:55 AM
                                                   ^^^
```

### Asset

- **File:** `Doge-Asset.png` (pixel-art doge head, ~32×32 source)
- **Rendering:** Scale to 14×14px in the menu bar, `image-rendering: pixelated` for crisp pixel art
- **Container:** `<span id="doge-presence">` with `cursor: pointer`

### Badge (online count)

- When ≥1 other student is online, show a small red circle badge in the top-right corner of the doge icon with the count (e.g., `3`)
- Badge styling: 8×8px red circle, white text, 7px font, `position: absolute`
- When 0 others are online: no badge (just the plain doge icon)

### States

| State | Appearance |
|-------|-----------|
| Disconnected / 0 online | Doge icon, no badge, slightly dimmed (opacity 0.5) |
| ≥1 player online | Doge icon, red badge with count, full opacity |
| Incoming challenge | Doge icon **wiggles** (CSS animation), badge pulses |
| Dropdown open | Doge icon highlighted (black background, like active menu items) |

---

## 2. WebSocket Lifecycle

### Connection Timing

Connect the WebSocket **when the user clicks the doge icon for the first time** (lazy connect). This avoids unnecessary traffic from students who never interact with multiplayer.

- First click: show "Connecting..." in the dropdown, establish WS connection
- Subsequent clicks: use existing connection (if still open)
- If the connection drops, show "Offline" in the dropdown; re-attempt on next click
- **Do not** auto-connect on page load or boot dismissal

### Reuse Existing Server Infrastructure

The Railway server (`server.js`) already handles:
- `identify` — register username
- `presence_snapshot` — list of online users
- `user_online` / `user_offline` — real-time presence updates
- `game_challenge` / `challenge_accept` / `challenge_decline` — challenge flow
- `match_start` — room creation

No server changes needed. The client just connects earlier (from menu bar instead of from tetris lobby) and stays connected while the page is open.

### Username

Same as current: `localStorage.getItem('student-name') || localStorage.getItem('username') || 'Player' + random`

---

## 3. Doge Dropdown (Presence Panel)

### Trigger

- Click doge icon → dropdown appears (like existing menu dropdowns)
- Click doge again, press Escape, or click elsewhere → dropdown closes
- **Non-blocking:** the rest of the page remains fully interactive underneath

### Appearance

System 7-style dropdown menu, anchored below the doge icon, right-aligned:

```
┌──────────────────────┐
│  Online Now (3)       │
├──────────────────────┤
│  Alice M.        ▸   │  ← hover highlights row (black bg, white text)
│  Bob K.          ▸   │
│  Carlos R.       ▸   │
├──────────────────────┤
│  ⌘2  Open Study Break │  ← shortcut to open tetris directly
└──────────────────────┘
```

- **Width:** 180–200px
- **Header:** "Online Now (N)" in Chicago font, 10px, non-interactive
- **Player rows:** Geneva font, 11px, hover-highlight like menu items
- **Click a player row** → sends challenge to that player (see §4)
- **Footer item:** "Open Study Break" — opens tetris in solo mode (same as Special → Study Break)
- **Empty state:** "No classmates online" in gray text, centered

### Styling

Reuse existing `.menu-dropdown` CSS classes:
- `background: var(--white)`, `border: 1px solid var(--black)`, `box-shadow: 2px 2px 0 var(--black)`
- Right-aligned (anchored to doge icon position)
- `z-index: 100` (same as other dropdowns)

---

## 4. Sending a Challenge (from dropdown)

### Flow

1. Student A clicks a player name in the doge dropdown
2. Dropdown closes
3. Status appears briefly as a flash/tooltip near doge: "Challenging Alice..."
4. WS sends `{ type: 'game_challenge', target: 'Alice M.' }`
5. **Wait for response:**
   - If accepted → `match_start` received → auto-open Tetris in 1v1 mode (see §6)
   - If declined → flash near doge: "Alice declined" (fade after 3s)
   - If timeout (30s) → flash: "Challenge timed out"
   - If error → flash: "Challenge failed"

### Constraint

Only one outgoing challenge at a time. While waiting for a response, clicking another player in the dropdown does nothing (or shows "Already challenging...").

---

## 5. Receiving a Challenge (Doge Notification)

### Animation

When `challenge_received` message arrives:

1. **Doge wiggles:** CSS `@keyframes doge-wiggle` — rapid left-right rotation (±12°) for the duration of the challenge window, or until dismissed
   ```
   @keyframes doge-wiggle {
     0%, 100% { transform: rotate(0deg); }
     25% { transform: rotate(-12deg); }
     75% { transform: rotate(12deg); }
   }
   ```
   Duration: `0.3s`, iteration: `infinite`

2. **Sound:** Play `SFX.play('sosumi', 0.5)` (existing Mac sound) on first wiggle

3. **Click wiggling doge** → opens a small challenge notification panel (not the normal dropdown):

```
┌──────────────────────────┐
│  🐕 Challenge!            │
│  Bob K. wants to play     │
│  Study Break!             │
│                    23s    │
│  [Decline]  [Accept ▸]   │
└──────────────────────────┘
```

- Same System 7 dropdown styling
- 30-second countdown timer displayed
- **Accept:** sends `challenge_accept`, starts match (§6)
- **Decline:** sends `challenge_decline`, panel closes, doge stops wiggling
- **Timeout (30s):** auto-decline, panel closes, doge stops wiggling
- **Ignore (don't click doge):** doge keeps wiggling until timeout, then auto-declines

### Non-blocking

The challenge notification only appears when the student clicks the wiggling doge. The wiggle itself is the notification — it doesn't interrupt whatever they're doing on the calendar. They can choose to ignore it entirely.

---

## 6. Auto-Launch Tetris on Match Start

When `match_start` is received (either as challenger or accepter):

1. Call `openGame()` — this opens the Study Break overlay
2. Skip the mode-select idle screen
3. Skip the lobby
4. Go directly into `startMatch(data)` — sets up split-screen canvases, countdown, game start
5. The Tetris game handles everything from here (existing code)

### State transitions

```
Menu bar challenge accepted
  → openGame()
  → studyBreak.mode = '1v1'
  → studyBreak.startMatch(matchData)
  → countdown 3…2…1…
  → game running (split screen)
```

---

## 7. Disconnection & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Student closes/refreshes page | WS closes, server removes from presence, other students see updated count |
| WS drops mid-challenge-wait | Flash "Connection lost", doge dims, challenge canceled |
| WS drops during active match | Existing `opponentLeft()` handler covers this |
| Student already in tetris solo game | Challenge received → doge wiggles on menu bar; if they close tetris and click doge, they see the challenge. If timeout, auto-decline. |
| Student already in tetris 1v1 match | Server should reject incoming challenges (existing `challenge_error` handling) |
| Two students challenge each other simultaneously | Server resolves first-come (existing behavior) |
| Click doge while WS connecting | Show "Connecting..." spinner in dropdown |

---

## 8. Visual Summary

### Menu bar (idle, 2 online)
```
[🍎] File  Edit  View  Label  Special        🔊  🐕² 10:15 AM
```

### Menu bar (incoming challenge)
```
[🍎] File  Edit  View  Label  Special        🔊  ~🐕~ 10:15 AM
                                                  (wiggling)
```

### Dropdown open
```
[🍎] File  Edit  View  Label  Special        🔊 [🐕] 10:15 AM
                                              ┌──────────────────┐
                                              │ Online Now (2)   │
                                              ├──────────────────┤
                                              │ Alice M.      ▸  │
                                              │ Bob K.        ▸  │
                                              ├──────────────────┤
                                              │ ⌘2 Study Break   │
                                              └──────────────────┘
```

---

## 9. Files Modified

| File | Changes |
|------|---------|
| `ap_stats_roadmap_square_mode.html` | All changes (single-file app) |

### Part A sections affected

| Section | Change |
|---------|--------|
| JS `studyBreak.draw()` and all `draw*()` methods | Use swappable context instead of hardcoded `this.ctx` |
| JS `studyBreak` object | Add `enterSplitMode()` / `exitSplitMode()` helpers |
| JS `studyBreak.startMatch()` | Call `enterSplitMode()` after setting up split canvases |
| JS `studyBreak.close()` | Call `exitSplitMode()` when leaving a match |
| JS `studyBreak.open()` | Reset state to `'idle'`, mode to `'solo'`, restore solo canvas visibility |
| JS `studyBreak.loop()` | Call `drawOpponentBoard()` each frame when `mpState` is active |

### Part B sections affected

| Section | Change |
|---------|--------|
| CSS (lines ~1–552) | Add `.doge-presence`, `.doge-badge`, `.doge-wiggle`, `.doge-dropdown` styles |
| HTML menu bar (line ~619) | Insert doge icon span between mute and clock |
| HTML body (after menu bar) | Add doge dropdown and challenge notification panel markup |
| JS (new section) | `DogePresence` object: WS management, dropdown rendering, challenge flow |
| JS `studyBreak.handleMpMessage()` | Route `challenge_received` to doge notification instead of in-game dialog when tetris is closed |
| JS `studyBreak.startMatch()` | Support being called from menu-bar context (auto-open overlay first) |

### New asset

| File | Purpose |
|------|---------|
| `Doge-Asset.png` | Pixel-art doge head icon for menu bar (already exists in repo) |

---

## 10. Implementation Order

Part A (bug fixes) **must** land before Part B (doge presence). Part B's challenge flow calls `startMatch()` from outside the tetris overlay, which relies on the rendering fixes from Part A to actually display the game.

```
Part A: Bug Fixes
  ├── Bug 1: enterSplitMode/exitSplitMode + draw opponent in loop
  ├── Bug 2: open() resets to idle
  └── Bug 3: (optional) mouse handler on split canvas

Part B: Doge Presence (depends on all of Part A)
  ├── §1–2: Doge icon + lazy WS connect
  ├── §3: Dropdown presence panel
  ├── §4–5: Challenge send/receive flow
  └── §6: Auto-launch tetris on match_start
```

---

## 11. Constraints

- **Single-file HTML** — no imports, no new JS files
- **No server changes** — reuse existing Railway WebSocket protocol exactly
- **Student-facing** — appropriate, non-distracting (wiggle is subtle, no sound loops)
- **System 7 aesthetic** — dropdown looks like a real Mac menu, not a modern tooltip
- **Don't break existing behavior** — tooltip hover on calendar cells, menu dropdowns, tetris solo mode all work as before
- **Lazy WS connect** — only connect when doge is clicked, not on page load

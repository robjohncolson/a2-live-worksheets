# Live Classroom V7.9 -- side-scroll camera + widened level coord

Session 118 (2026-05-26). Author: CC. Status: FROZEN -- dispatching.

V7.9 lands the structural unknown the mechanic-first arc was
deferring: a horizontal scroll engine so each U1.1 zone gets its
own real estate instead of being squished into the same 320-wide
canvas. After V7.9 lands, V7.10/V7.11/V7.12 add Zones 2/3/4/5 as
actors in the wider level.

## Goal

- The level coord space decouples from the canvas pixel space.
  Levels can declare `map.width: 48` (480 level px) or wider; the
  canvas viewport stays 320 px CSS.
- A per-client camera follows the local player with a deadzone.
  When the player approaches the right edge of the viewport
  (screenX > ~220), camera.x slides right. When they approach
  the left edge (screenX < ~100), camera.x slides left. Clamped
  to `[0, levelW - viewportW]`.
- Cockpit role gets a fit-to-width mode (no camera follow; scales
  the level to fit the cockpit canvas). Teacher sees everyone.
- U1.1.json widens from `map.width: 32` to `map.width: 48` with
  decorative Text actors in chips 32-47 so the scroll is visible
  in smoke. Zones 2-5 actors land V7.10+ as actors in chips 16-47.

## Wire shape decision (load-bearing)

Today `player.x` in `classroom_pos` is in CSS pixels relative to
the broadcaster's local canvas. `canvasW` rides alongside so the
server can rescale into level coord space via
`(player.x / canvasW) * levelW`.

**V7.9: the broadcaster sends `canvasW = levelPxWidth` (NOT their
actual canvas CSS width). Player `x` is in LEVEL CSS pixels.** The
server rescale becomes identity (correct: `player.x / levelW * levelW
= player.x`). Anti-cheat math works unchanged.

This is the smallest viable change. No new wire fields; no engine
serialize change. Only the client's "what to broadcast as canvasW"
gets reinterpreted.

## Engine surface -- `cr/railway-server/level-engine.js`

### 1. No cap on map.width

`createLevelState` currently defaults to `mapWidth: 32` when the
level def's `map.width` is missing. Keep the default; verify no
hidden assumption breaks when level def has `map.width > 32`. The
existing `_playerNearActorX` rescale math (`(player.x / senderCw)
* levelW`) is general-purpose -- a `senderCw = levelW` payload
yields identity, which is what we want.

### 2. Optional: emit `levelPxWidth` as derived field in serialize

`serialize` adds `levelPxWidth: state.mapWidth * state.chipSize` for
the client's convenience (avoids the client having to multiply).

### 3. Test coverage -- `cr/railway-server/tests/level-engine-scroll.test.js`

New test file. Pin:

- `createLevelState({map:{width:48,height:8,chipSize:10},...})` returns
  `state.mapWidth = 48`. (Reuse the existing initial-shape pattern.)
- `_handleCoinCollect` with `_playerNearActorX` rescale still passes
  for a coin at chip 40 (level px 400) when player broadcasts
  `canvasW = 480` (level width).
- Same player broadcasting `canvasW = 320` (legacy interpretation)
  hits a coin at chip 8 (level px 80) -- legacy behavior preserved
  for the 79 levels that haven't widened yet.
- `serialize` includes `levelPxWidth` derived field.

Target: 6-10 new test cases. Existing 282 cr tests stay green.

## Client surface -- `fa/classroom-board.js`

### 4. Module-level `_camera` state

Single object at module scope:

```js
var _camera = {
  x:        0,                // CSS-pixel offset into level
  vw:       DEFAULT_BOARD_W,  // viewport width (canvas CSS px)
  levelW:   DEFAULT_BOARD_W,  // level pixel width (camera clamp upper bound)
  enabled:  true,             // false for cockpit fit-to-width mode
  followFn: null              // () => Player | null; supplies local player to follow
};
```

### 5. `_updateCamera(dt)` -- runs each tick

Called from the existing onStateChange handler (or a per-tick hook
in the engine bootstrap). Behavior:

- If `!_camera.enabled`, do nothing.
- Else: read local player's levelX from `_camera.followFn()`. Compute
  `targetCamX` such that `screenX = levelX - targetCamX` lands inside
  the deadzone [100, 220]. Clamp `targetCamX` to `[0, _camera.levelW -
  _camera.vw]`. Smoothly tween `_camera.x` toward `targetCamX` (lerp
  factor like 0.15 per tick for a softness that doesn't feel jerky).

### 6. World vs HUD sprites

Every existing sprite class falls into one of two buckets. Mark
each with `this.isHud = true` (HUD) or `this.isHud = false` (world,
default). The render() path subtracts `_camera.x` from `this.x` for
world sprites only; HUD sprites render at their `.x` unchanged.

| Sprite | Bucket | Notes |
|---|---|---|
| `BoardSprite` (avatars) | world | follows position broadcasts |
| `CoinSprite` | world | chip x in level coord |
| `KeySprite` | world | chip x in level coord |
| `GoalSprite` | world | chip x in level coord |
| `ChoicePadSprite` | world | new V7.8 |
| Doorway visuals (the v3 P4 pillars) | world | chip x in level coord |
| `TallyDisplay` | HUD | screen-anchored top |
| `ResultPanel` | HUD | screen-centered |
| `StageIndicator` | HUD | screen top-right |
| `RevealTextSprite` (floater) | world | follows the coin it spawned at |

Implementation: rather than touching every sprite's render() to do
`this.x - _camera.x`, the cleanest pattern is for each world sprite
to read `_camera.x` once at the top of its render() and adjust the
draw coords. HUD sprites just don't read it. ~12 sprite classes
need adjustment; for each it's 2-4 lines.

Alternative if cleaner: a `_translateForCamera(ctx)` helper that
sprites call as the first line of render(). It does `ctx.save();
ctx.translate(-_camera.x, 0);` and the sprite's existing draw code
works unchanged. The sprite must `ctx.restore()` at the end of
render(). This is a 2-line addition per world sprite instead of
N-line coord arithmetic.

**Use the helper pattern.** Less risk of off-by-one.

### 7. Local player input updates levelX

The existing avatar movement (arrow-key handler in classroom-board.js)
updates the local player's x. For V7.9: the increment grows `levelX`
within `[0, levelW]` instead of within `[0, viewportW]`. The
broadcast `classroom_pos` payload sends `levelX` (just renamed as
`x`) and `canvasW = levelW`.

This is the load-bearing input change. The avatar can now walk past
chip 32; the camera follows; other clients render the avatar at the
broadcast levelX with their own camera offsets.

### 8. Cockpit fit-to-width mode

When `role === 'teacher'` (cockpit), the camera flips to a fit-to-
width mode:
- `_camera.enabled = false`
- The renderer scales the world by `viewportW / levelW` instead of
  applying a translate. All world sprite draw coords are multiplied
  by this scale.
- HUD sprites unchanged.

Cockpit's existing rendering already reads `engine.canvas.width`; the
scale factor adds at the helper level (`_scaleForCockpit(ctx)`).

### 9. Test coverage -- `fa/tests/classroom-board-scroll.test.js`

New test file. Pin:

- Camera idle at 0 when local player at levelX=100 (within deadzone).
- Camera slides right when local player at levelX=240 (past 220 right
  edge of deadzone).
- Camera clamps at `levelW - viewportW` (right-edge stop).
- Camera clamps at 0 (left-edge stop).
- HUD sprites render at unchanged x (no camera offset applied).
- World sprites render with camera offset subtracted.
- Cockpit role disables camera follow + applies fit-to-width scale.

Target: 12-18 new test cases. Existing fa LC subset 424/424 stays
green.

## JSON pilot -- `cr/railway-server/activities/U1.1.json`

### 10. Widen map + add decorative Text actors

- `map.width: 32` -> `map.width: 48`
- Add 1-2 decorative `Text` actors in chips 32-47:
  - `{ type: 'Text', x: 34, y: 0, text: 'Beyond Zone 1 -- more zones coming in V7.10+' }`
  - (Optional) `{ type: 'Text', x: 42, y: 4, text: '...' }` as a placeholder cue
- Everything else unchanged (Zone 1 actors at chips 4-28 stay; voting
  stages stay; Key + Goal stay).

The point is to make the side-scroll visible in PeriodX smoke -- not
to deliver the full 5-zone level. That ships across V7.10-V7.12.

### 11. `min_students` unchanged at 2.

## Recipe doc update -- `LEVEL_DESIGN_RECIPE.md`

### 12. Side-scroll author note

Insert after the existing V7.8 ChoicePad author note:

> V7.9 (side-scroll engine). Levels MAY declare `map.width > 32` to
> get a horizontal scroll. The canvas viewport stays 320 px wide; the
> camera follows the local player with a deadzone. To author multi-
> zone levels, place actors in chip x bands and let the natural
> player movement scroll them through. World actors (Coin, Key, Goal,
> ChoicePad, Doorway) scroll with the camera. HUD actors (TallyDisplay,
> ResultPanel, StageIndicator) stay screen-anchored. Cockpit gets a
> fit-to-width view automatically -- teacher sees everyone at once.

## Constraints carry-forward

- LC features are ADDITIVE OVERLAYS. V7.9 adds a CAMERA layer to the
  renderer that scrolls the existing avatar/doorway scene; it does
  NOT replace the scene. The v3 P4 doorways visual continues to
  render the same way -- just with a camera translate applied.
- `cr/data/curriculum.js` SACRED.
- ASCII only on all new + edited files.
- LF line endings.
- PowerShell `git commit -F-` heredoc.
- Stage own paths only.
- Codex review unreliable on diffs > ~35 KB. V7.9 estimated diff:
  60-80 KB (renderer changes are substantial). Plan to skip Codex
  review entirely; rely on CC self-review of risk areas + iterative
  test-failure fold (the V7.8 pattern that found a real engine bug).

## Dispatch -- 3 file-disjoint parallel agents

| Unit | Owner | Files | Tests |
|---|---|---|---|
| A | CC | `cr/railway-server/level-engine.js` (small additions; mainly remove implicit assumptions + emit levelPxWidth) | `cr/railway-server/tests/level-engine-scroll.test.js` (new) |
| B | Sonnet | `fa/classroom-board.js` (camera abstraction + helper + per-sprite adoption + cockpit fit-to-width + input.x = levelX broadcast) | `fa/tests/classroom-board-scroll.test.js` (new) |
| C | Sonnet | `cr/railway-server/activities/U1.1.json` (widen + decorative text), `fa/LEVEL_DESIGN_RECIPE.md` (side-scroll author note) | (no test file; JSON lint + ASCII check) |

Unit B is the heaviest. Unit B can read this BUILD doc + the existing
KeySprite/CoinSprite/ChoicePadSprite patterns to mirror; doesn't need
to read Unit A's diff because the wire shape stays the same.

## Risk areas for CC self-review (Codex will time out)

1. **Camera clamp correctness.** `levelW - viewportW` must be >= 0
   (if level is 320 wide and viewport is 320 wide, camera.x stays 0).
   Negative clamp upper bound = bug.
2. **canvasW=levelW broadcast.** All existing tests that mock
   `canvasW: 320` continue to work because levelW also defaults to
   320 for legacy single-screen levels. Verify by running the existing
   ChoicePad/Tally/Coin tests post-fold.
3. **HUD sprite leak.** If any HUD sprite accidentally subtracts
   _camera.x, the user sees their HUD scrolling -- visually jarring.
4. **Cockpit zoom mode.** Fit-to-width must scale world sprites, not
   HUD sprites. Mismatched scale = misaligned HUD.
5. **Doorway visuals.** The v3 P4 doorways are rendered by the
   pre-V7 mechanic (`_renderDeskDoorways*` or similar). These need
   camera translate too. Easy to miss.
6. **Deadzone vs latency.** The camera lerp factor (0.15) trades
   smoothness for lag. Too small = laggy follow; too large = jerky.
   Tune in smoke.

## Acceptance criteria

- cr tests: **282 + 6-10 new = 288-292 passing**, zero regression.
- fa LC subset: **424 + 12-18 new = 436-442 passing**, zero
  regression. (May include some pre-existing test updates similar to
  the V7.8 shape-pinning shifts; document if so.)
- U1.1 JSON validates: ASCII, LF, schema, bounds (now x in [0, 48)).
- Backward compat: U1.2 (V7.7 Tally, map.width=32) still works; the
  78 legacy levels still work. ChoicePad + Tally + legacy cascades
  all unchanged.
- Smoke (teacher-driven): refresh student Desk, walk avatar right,
  camera scrolls. Cockpit shows whole level.

## What ships AFTER V7.9

- **V7.10**: Zone 2 (row scanner Gate at chip 30) + Zone 3 (Tally
  Machine RowBlock + TallyChute at chips 35-43). This kills U1.1
  voting -- replaces stages[] with the physical scanner + tally.
- **V7.11**: Zone 4 (Question Door Hall -- three Gates with per-door
  predicates including the perma-locked impossibility doors).
- **V7.12**: Zone 5 (Context Bridge + GoalPad presence timer).
- **V7.13+**: 78 other levels each get their own mechanic-first design
  doc + JSON. Multi-session authoring fan-out per the master spec.

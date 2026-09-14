# LIVE_CLASSROOM V7.1 -- Additive-Overlay Redesign (FROZEN)

Session 115, 2026-05-25 (continuation). V7's scene-replacement design
was rejected by the teacher on visual feel: "the avatars are missing,
the visual language is completely different, and the arrows do not
control... the game interface is meant to be additive on top of the
avatar/doorway visual language."

V7.1 rewrites the renderer + engine layer to be **additive overlays on
top of the existing classroom-board scene**. The avatars, hue tinting,
arrow-key movement, and v3 P4 doorway-vote stay untouched. Level
decorations (Coins, Goal, Text signs) draw on top of the existing
canvas; level QuestionDoors REUSE the existing v3 P4 doorways
mechanic (open + walk-through + press-Up vote).

V7 (committed at cr `061b484`, fa `78d652e`) is REPLACED by V7.1.

## What changes from V7

| Layer | V7 (rejected) | V7.1 (this spec) |
|---|---|---|
| Player rendering | Re-rendered as plain rects in activity-level.js | UNCHANGED. classroom-board's sprite engine owns it. |
| Arrow-key input | Gated for some activity types | UNCHANGED. Existing PlayerSprite handler owns it. |
| classroom-board canvas | Hidden during levels | NEVER hidden. Always visible. |
| Level canvas | Full scene replacement (~808 LoC, 320x180 own canvas) | Transparent overlay on TOP of LC canvas (~200 LoC). Same dims. |
| QuestionDoor visuals | New rect with text label | REUSE v3 P4 doorways (existing visual + vote mechanic). |
| Vote -> open gate | Internal switch+gate logic in level-engine | REUSE v3 P4 `classroom_doorway_tally`. Engine listens to the existing tally close event. |
| Map dims | mapWidth=32, chipSize=24 (~768 px) -- DID NOT FIT LC canvas | mapWidth=32, **chipSize=10** (= 320 CSS px native). Levels author in fixed pixel space matching LC. |
| Reflection room | Server warp + (in v7 fold) time-based auto-clear | UNCHANGED from v7 fold: time-based auto-clear, no physical walk. Reflection panel becomes a DOM overlay. |
| Goal | Walk-onto-Goal coord | UNCHANGED conceptually. Overlay-rendered as a small flag glyph. |

## Locked design dials (CC + teacher session 115)

| Dial | Value |
|---|---|
| Overlay canvas size | Match `classroom-board-mount`'s canvas EXACTLY (read at first updateState). |
| `map.chipSize` | **10 px** (was 24). Levels designed in 320x80 CSS-px space (32 chips x 8 chips). |
| `map.width` | Up to 32 chips (= 320 CSS px). |
| `map.height` | Up to 8 chips (= 80 CSS px). Players walk on the existing LC floor; overlays sit above. |
| Player rendering | NOT in activity-level.js. Owned by classroom-board.js. |
| Arrow-key handling | NOT in activity-level.js. Owned by classroom-board.js PlayerSprite. |
| QuestionDoor -> v3 P4 doorways | Engine calls `openDoorways(...)` at the start of the VOTING phase; listens for `classroom_close_doorways` to determine winning door + advance state machine. |
| Reflection panel | DOM overlay (transparent backdrop + centered text box + countdown). Auto-clears at REFLECTION_DURATION_MS (8 s, unchanged from V7 fold). |
| Goal visual | Small flag glyph (rect + triangle) at the goal coord on the overlay. |
| classroom-board-mount hide | NEVER. Remove the V7 `_boardPrevDisplay` logic. |
| `_activityHandleType` | KEEP (still needed for fast-restart across types per Codex V7 MAJOR 5). |

## Dependency analysis

3 units. A is cr-side; B is fa-side; T is tests across both.

- **Unit A** (cr): rewrite `level-engine.js` to delegate the
  VOTING phase to v3 P4 doorways. Add a state machine PHASE field
  (Codex V7 BLOCKER 1 fold, finally) so SIPPING precedes VOTING
  cleanly. Update `activities/U1.1.json` to chipSize=10.
- **Unit B** (fa): rewrite `activity-level.js` from scratch as an
  additive overlay (~200 LoC). Remove player rendering, remove
  reflection_room actor switching (use DOM overlay instead). Update
  Desk integration: remove the `_boardPrevDisplay` hide/restore + the
  `_activityRendererForType` 'level' branch unchanged.
- **Unit T**: tests both repos.

## C1. Engine -- delegate VOTING to existing v3 P4 doorways

The level engine no longer manages its own switch/gate logic. Instead:

1. On `initActivity`, state starts in `phase = 'SIPPING'`. Coins (SipStations)
   collect normally per V7.
2. When the sipping phase is complete (defined per level -- e.g., for U1.1,
   when `all 4 SipStations collected` OR `after teacher-forced advance`),
   engine transitions to `phase = 'VOTING'` AND triggers `openDoorways`
   for the level's QuestionDoors as options.
3. The existing v3 P4 doorway-vote runs (students walk through doors,
   press Up to vote). When threshold reaches, the doorway closes
   automatically per existing mechanic.
4. Engine watches for `room.closedDoorways` per tick. When set + matches
   the level's doorway id, engine inspects the winning option:
   - If WINNING option's `correct` flag is true: phase -> `GOAL_AVAILABLE`.
     Player walks to Goal coord. On Goal overlap -> `LEVEL_CLEARED`.
   - If WINNING option's `correct` flag is false: phase -> `REFLECTION`.
     Set autoCloseAt, reflectionText. Auto-clear at REFLECTION_DURATION_MS
     returns to `phase = 'VOTING'` (re-fire openDoorways).
5. Reuses existing mutex: doorways already block when other doorways
   exist. Engine sequences ITS doorway calls.

**Phase field state machine**:
```
INIT
  v
SIPPING  -- coin collection
  v       (when 'sipping-complete' condition met)
VOTING   -- openDoorways(level's QuestionDoors as options)
  v       (when classroom_close_doorways event observed)
{REFLECTION (autoCloseAt) -> VOTING}*
  v       (when correct option wins)
GOAL_AVAILABLE  -- Goal becomes reachable
  v       (when any Player overlaps Goal)
LEVEL_CLEARED  -- isComplete returns true
```

**Sipping-complete condition** is per-level: defaults to "all coins
collected" if the level doesn't override. Levels can specify
`sipping_complete: 'count >= N'` or `sipping_complete: 'time >= S'`
for V8.0+ flexibility; V7.1 ships with the default only.

## C2. New level-engine.js shape

The internal switch+gate arrays GO AWAY. State becomes:

```js
state = {
  levelKey, lessonKey, chipSize, mapWidth, mapHeight,
  phase: 'SIPPING' | 'VOTING' | 'REFLECTION' | 'GOAL_AVAILABLE' | 'LEVEL_CLEARED',
  startedAt, spawnX, spawnY,
  players: { [u]: { x, y, _canvasW } },
  coins:   [{ id, x, y, collected, drink }],
  // QuestionDoors raw from the level def (engine reads .correct + .reflection on close):
  doorways:    [{ id, x, y, text, correct, reflection }],
  // Reference to the open v3 P4 doorways instance once VOTING fires:
  liveDoorwaysId: null,                 // matches room.doorways.id while open
  // Reflection state (time-based auto-clear, V7 fold preserved):
  reflection: { active, doorId, reflectionText, autoCloseAt },
  goal: { x, y, reached, reachedBy },
  tally: { sips: { A:0, B:0 } }
}
```

Engine functions:
- `loadLevel(lessonKey)` -- unchanged (loads JSON from
  railway-server/activities/<key>.json per cr `061b484`).
- `createLevelState(def, online)` -- new shape (no switches/gates).
- `tick(state, dt, room)` -- branches on `state.phase`:
  - SIPPING: process coin collection. When done, transition VOTING + call
    `room.openDoorways(...)` via engine API (or set a "request" field
    that classroom.js wraps).
  - VOTING: watch for `room.closedDoorways`; when matches our
    liveDoorwaysId, look up the winning option's `correct` -> next phase.
  - REFLECTION: if now >= autoCloseAt, transition back to VOTING +
    re-fire openDoorways.
  - GOAL_AVAILABLE: process Player-Goal overlap; set goal.reached on hit.
- `isComplete(state)` -> `state.phase === 'LEVEL_CLEARED'`.
- `serialize(state)` -- include `phase` for cockpit observability.

**openDoorways integration**: the engine can't directly call openDoorways
(that's a room-mutating function in classroom.js). Use the existing
pattern: the engine RETURNS a structure like `{ broadcasts: [...],
sideEffects: { openDoorways: { id, question, options } } }` from tick();
classroom.js's activityTick wrapper consumes the sideEffects and calls
openDoorways. Same pattern for closeDoorways if needed.

## C3. New activity-level.js (overlay)

Single IIFE, ~200 LoC. NO player rendering. NO own coordinate scaling
beyond reading classroom-board's canvas dims.

```js
window.ActivityLevel = {
  mount(mountEl, opts) -> handle
};
// handle: { destroy(), updateState(activityState), showOutcome(outcome) }
```

`mount`:
- Reads the EXISTING classroom-board canvas dims (querySelector against
  classroom-board-mount canvas inside opts.boardMountEl, or via global
  selector).
- Creates an absolute-positioned canvas OVER the LC canvas with the
  SAME dimensions. Sets `pointer-events: none` so all interaction
  passes through to the LC scene below.

`updateState(activityState)`:
- Reads `activityState.level` (sent on first call) for actor layout.
- Reads `activityState.state.phase` and `activityState.state.coins[]`
  and `activityState.state.reflection`.
- Renders overlay decorations:
  - **Text actors**: small dark rect + light text. Tooltip
    enhancement: when local Player within proximity, render the
    tooltip box above the player position (read player coord from
    summary's classroom_pos data).
  - **Coin actors (SipStation)**: small cup icon at chip coord *
    chipSize. Greyed out if `collected`.
  - **Goal actor**: flag glyph at chip coord * chipSize. Only
    visible when phase is GOAL_AVAILABLE or LEVEL_CLEARED.
  - **Reflection panel**: when `reflection.active`, full-canvas dim
    overlay + centered text box with the reflection text and a
    countdown.
- DOES NOT render players.
- DOES NOT render question doors (the existing v3 P4 doorway visual
  on the LC canvas handles that).

`showOutcome(outcome)`: same as V7 (overlay flash + label).

## C4. Desk integration (planner-direct, revert hide/restore)

- Remove all `_boardPrevDisplay` write paths.
- Remove `board.style.display = 'none'` when activity.type === 'level'.
- KEEP the `_activityRendererForType('level') -> window.ActivityLevel`
  branch.
- KEEP `_activityHandleType` (Codex V7 MAJOR 5 fast-restart fix).
- The overlay mount's parent must position correctly above
  classroom-board-mount. Create a wrapper `<div
  style="position:relative">` that contains both mounts, or use
  absolute-positioning on activity-mount with the right top/left.

## C5. U1.1.json updates

- chipSize: 24 -> **10**
- All actor x/y values stay in chip units (no semantic change), but
  the resulting pixel positions are now 0-320 px wide instead of
  0-768 px. So coordinates that worked at the wrong scale before now
  fit the LC canvas natively.
- Add `"phase_transitions"` (optional, defaults handled by engine).

Example U1.1 chip layout at chipSize=10:
- SipStations spread at chip x = 4, 12, 20, 28 (width = 32) at chip y = 2
- QuestionDoors at chip x = 6, 16, 26 at chip y = 6 (= 60 CSS px down)
- Goal at chip x = 16, y = 7

## C6. Wire protocol

**Zero new message types.** The engine wraps `openDoorways` and
`closeDoorways` (existing v3 P4 messages) -- these already work.
`classroom_activity_start` carries the level def on first send;
`classroom_activity_state` carries `phase` per tick.

## C7. Tests

- Unit A (cr level-engine): ~25 cases. Phase transitions
  (SIPPING -> VOTING -> REFLECTION -> VOTING -> GOAL_AVAILABLE
  -> LEVEL_CLEARED). openDoorways sideEffect emission. Closed
  doorways event consumption.
- Unit B (fa overlay): ~10 cases. Mount + updateState renders coins
  / goal / text / reflection panel. NO player rendering test (player
  is NOT rendered by overlay).
- Unit E (Desk integration): ~5 cases. classroom-board-mount stays
  visible. Overlay mounted as sibling. fast-restart still works.

## What V7.1 does NOT include (V7.2+)

- Per-level custom sipping-complete predicate (timer / count / vote).
- Pixel-art polish for actor decorations.
- 80-level batch (held -- recipe updates needed first).
- Cross-level scoring or progression.

## Build dispatch

After this spec freezes, single-wave dispatch (3 agents):
- Agent A: cr level-engine rewrite + U1.1.json update + tests
- Agent B: fa activity-level.js rewrite + tests
- Agent E (planner-direct): Desk integration revert

Standard loop: vitest, Codex review, fold, push.

## File index for V7.1

| Path | Action | Owner |
|---|---|---|
| `cr/railway-server/level-engine.js` | REWRITE | Agent A |
| `cr/railway-server/classroom.js` | EDIT (add openDoorways sideEffect handler) | Agent A |
| `cr/railway-server/activities/U1.1.json` | EDIT (chipSize=10) | Agent A |
| `cr/railway-server/tests/level-engine.test.js` | REWRITE | Agent A |
| `cr/railway-server/tests/classroom.activity.level.test.js` | UPDATE | Agent A |
| `fa/activity-level.js` | REWRITE (~200 LoC) | Agent B |
| `fa/tests/activity-level.test.js` | REWRITE | Agent B |
| `fa/ap_stats_roadmap_square_mode.html` | REVERT classroom-board hide; KEEP renderer mapping + _activityHandleType | Planner |
| `fa/tests/desk-level-integration.test.js` | UPDATE | Planner |
| `fa/LEVEL_DESIGN_RECIPE.md` | UPDATE (chipSize=10, no QuestionDoor coords for visual; engine routes to existing doorways) | Planner |

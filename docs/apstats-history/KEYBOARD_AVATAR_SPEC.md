# Keyboard Avatar Control -- Spec

Frozen design for keyboard-controlled student sprites on the Live Classroom
board, with cross-client position sync. Decisions D1-D3 + the controller
+ kinematics + protocol are locked 2026-05-22. Implementation in two phases.

Sibling docs: `LIVE_CLASSROOM_SPEC.md` (board), `classroom-board.js`
(component), `canvas_engine.js` + `sprite_sheet.js` (verbatim cr render
layer, do not edit in place).

## Goal

Turn the Live Classroom presence board into a small interactive room.
Each student's own sprite is keyboard-controlled (Left/Right walk, Space
jump, Up interact). Phase 2 broadcasts position so peers see each other
walk around live.

## Decisions

| ID | Decision                          | Picked                                                                 |
|----|-----------------------------------|------------------------------------------------------------------------|
| D1 | Who can keyboard-control an avatar| Students only -- teacher stays an observer                              |
| D2 | Idle behavior (no keys pressed)   | Stays where last walked; late-joiners + reconnects see them there      |
| D3 | Sprite collisions                  | Soft push -- self-resolution only (each client pushes its OWN player)  |

## Controls

| Input        | Action                                                                                                                                                  |
|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Left / Right | Continuous walk while held; `vx = +/- WALK_SPEED`                                                                                                       |
| Space        | One-shot jump arc; no double-jump while airborne                                                                                                        |
| Up           | Interact: when the player's foot is inside the gate-door x-range AND `state.gate.armed`, fires `classroom_checkin` (re-uses today's WS path); else no-op |
| Down         | Unused this round (reserved for a future sit/wave gesture)                                                                                              |

Input gating (a key is read only when ALL of these are true):

- `document.activeElement` is NOT an `<input>` / `<textarea>`.
- No modal overlay is open
  (`#day-grade-overlay`, `#donow-bump-overlay`, `#signin-overlay`,
  `#pwchange-overlay`, `#resource-panel`).
- For Space + Up only: no open poll the player has yet to vote in
  (let students commit a vote before they jump around).

## Kinematics

| Constant     | Value         | Note                                                                |
|--------------|---------------|---------------------------------------------------------------------|
| `WALK_SPEED` | 120 px/s      | Existing; reused                                                    |
| `JUMP_V0`    | -280 px/s     | Initial vertical velocity (negative = up, screen coords)            |
| `GRAVITY`    | 800 px/s^2    | Constant downward acceleration                                      |
| `PUSH_DELTA` | 0.6 px/tick   | Lateral nudge on overlap (self-push only)                           |

Jump arc: peak ~50 px above `groundY`, airtime ~0.7 s. On landing the
state returns to `'idle'`; horizontal motion during the arc tracks the
held left/right input (so the player can jump forward).

X-bounds: clamp `x` in `[0, canvasWidth - spriteWidth]`. The gate door
(when `state.gate.armed`) blocks walk-through unless the player has just
triggered `classroom_checkin` (then the existing drain animation walks
them through).

## Sprite class structure

```
BoardSprite (existing) -- peer sprites; auto-walk-to-target via walkTo()
PlayerSprite (new)     -- the local player; reads input, applies physics
```

`PlayerSprite` inherits from `BoardSprite` via `Object.create(BoardSprite.prototype)`.

- Overrides `update(dt)`: reads `this.input` (a ref to mount()'s shared
  input-state object), applies vx/vy, soft-push, then calls into the
  inherited animation-frame logic (walk cycle / idle blink).
- Inherits `render()`, `getLabelSpec()`.
- Carries `.input` ref `{ left, right, jump, up }` (booleans).

`repositionSprites`: when iterating sprites, skip any whose
`constructor === PlayerSprite` (i.e., the local player). Peer sprites
still auto-layout in the idle row.

When the WS reducer flips the player's status to `'checkedIn'`, the
existing `syncScene` detects the transition and calls `startDrain`
(`BoardSprite.walkTo(doorX)`). The PlayerSprite's overridden update
checks `this.state === 'walking'` and, if so, defers to the inherited
`_updateWalk` -- i.e., the drain animation runs the auto-walk path and
ignores keyboard input until `onDrained` removes the sprite. One way out
the door.

## Hitbox + gate interaction

Gate door rect (from existing `GateDoor`):

- `x`: `cw - DOOR_W - 10` .. `cw - 10`
- `y`: `groundY - DOOR_H` .. `groundY`

Player foot center: `(x + spriteW/2, y + spriteH * scale)`.

Up arrow pressed AND (foot center is inside door rect's x-range) AND
`state.gate.armed` -> `safeSend({ type: 'classroom_checkin' })`. Outside
the rect or with no gate armed: no-op (no message, no visual).

## Phase 1 -- local motion (follow-alongs only, ONE commit)

Scope: controller + jump + soft-push + door check-in. NO cross-client
position sync. The player sees self walk; peers stay in auto-layout
slots; peers do not yet see the player walk.

Files touched (Phase 1):

- `classroom-board.js`
  - New constants `JUMP_V0`, `GRAVITY`, `PUSH_DELTA`.
  - New `PlayerSprite` class (constructor, update, jump, soft-push,
    hitbox check) -- ~80-100 lines.
  - `mount()`: create a `PlayerSprite` for the local user instead of
    `BoardSprite`; attach `keydown` / `keyup` listeners on `document`;
    own a shared input-state object; pass it into `PlayerSprite`.
  - `repositionSprites`: skip PlayerSprite instances in the idle-row
    pass and the poll-column pass.
  - `destroy()`: detach the keyboard listeners.
- `ap_stats_roadmap_square_mode.html`
  - One small help-text strip below `#classroom-board-mount`:
    "Arrows walk, Space jump, Up to check in".
- `tests/classroom-board.test.js`
  - Press Right: x increases at WALK_SPEED.
  - Press Space (from idle/walking): vy = JUMP_V0; tick gravity to
    ground -> state returns to 'idle' at `y === groundY`.
  - Press Up inside door rect + gate armed: `safeSend` called with
    `classroom_checkin`.
  - Press Up outside the rect: no `safeSend`.
  - Press Up inside the rect but `gate.armed === false`: no `safeSend`.
  - Soft push: peer at the same x as the player -> next tick the
    player's x has moved by `PUSH_DELTA` away.
  - Input gating: when an `<input>` has focus, key presses are no-ops.
- `tests/classroom-structure.test.js`
  - Source pin: the Desk has the help-text strip near the board mount.

## Phase 2 -- WS sync (cross-repo, follow-up commits)

New WS message:

```json
{ "type": "classroom_pos", "x": 123, "y": 200, "state": "walking", "vx": 120 }
```

`y` and `state` carried so peers can visually replicate jumps; `vx` lets
peers extrapolate the next ~100 ms.

Rate:

- 10 Hz while ANY input is held OR `state === 'jumping'` OR `vy !== 0`.
- Once the player rests (idle, no input, on ground): send ONE final
  "rest" snapshot, then 0 Hz until the next input.

Server forwarding (`curriculum_render/railway-server/server.js`):

- `classroom_pos` from a member: forward to all OTHER members in the
  same room. Persist last-known `pos` on the member record.
- `classroom_state` (join snapshot) and any later `classroom_member_update`:
  include each member's `pos` as an additive field. Late joiners then
  start with peer sprites at the peer's last broadcast position.

Reducer (`classroom-board.js` `_reduce`):

- `classroom_pos` is transient -- it is NOT reduced into `state`.
  Handled in the render layer directly: `onmessage` dispatches to a
  new `applyPos(msg)` that updates the named peer's sprite target +
  velocity.
- `classroom_state` / `classroom_member_update`: stash additive `pos`
  on each `WireMember` (so `addSprite` for a late-joined peer starts
  at the peer's actual location, not slot 0).

Peer interpolation: when a `classroom_pos` arrives for a peer, that
peer's `BoardSprite` calls `walkTo(receivedX)` -- the existing target-
based animation walks them at `WALK_SPEED`. At 10 Hz the per-broadcast
displacement is ~12 px at full sprint -- linear chase looks smooth.
Jump y is set directly (`sp.y = receivedY`) since the inherited
animation doesn't do gravity.

Files touched (Phase 2):

- `classroom-board.js`: emit `classroom_pos` in `PlayerSprite.update()`
  via the rate-limited sender; handle inbound `classroom_pos` -> peer
  walkTo + y assignment.
- `curriculum_render/railway-server/server.js`: forward + persist.
- `tests/classroom-board.test.js`: emit + receive paths.
- `curriculum_render/tests/classroom.test.js`: server-side forwarding +
  persistence in `classroom_state`.

## Test strategy

- Phase 1: unit-test `PlayerSprite` in isolation (manual input-state
  flipping; tick `update(dt)` with a controlled dt). No real RAF; no
  real keyboard events -- press/release via the shared input object the
  test owns.
- Phase 2: cross-repo. follow-alongs side asserts emit-on-input +
  apply-on-receive; curriculum_render side asserts the forward + the
  `pos` persistence in `classroom_state`.

## Out of scope

- Real-time physics beyond the jump arc (no horizontal acceleration /
  friction; instant vx switch on key).
- Mobile / touch input.
- Voice or proximity audio.
- Persistent avatar state across sessions (each fresh sign-in starts at
  the auto-layout slot, then walks free as the user moves).
- Cosmetic emotes (sit / wave) -- the D2-extension option not chosen.

## Open Phase 2 knobs (NOT blocking Phase 1)

- Broadcast rate cap (10 Hz nominal; may tune to 5-15 Hz after smoke).
- Reconciliation if a peer's local interpolation lags the broadcast --
  the chase target + 10 Hz suffices for v1; tune later if needed.
- Server-side authoritative bounds (currently each client clamps; if
  trust ever matters, server can re-clamp on receive).
- A small idle-gesture key (Down) -- not in this spec.

## ASCII-only / LF -- contract carry-over

This spec, all new code, and all tests are ASCII-only and LF.
classroom-board.js is LF; the Desk is LF (per the EOL gotcha).

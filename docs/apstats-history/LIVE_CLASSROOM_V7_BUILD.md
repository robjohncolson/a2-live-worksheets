# LIVE_CLASSROOM V7 -- Level Engine + U1.1 "Cola Mystery" (FROZEN)

Session 115, 2026-05-25. Pivots the activity engine from abstract data
visualizations (bridges, colored zones, contingency grids -- V4 / V5 / V6)
to **level-based gameplay** in the spirit of the PicoPark recovery
work (`hermes/old-app/recovered/browser_port`). Each lesson becomes a
small interactive scene with Players, Coins, Switches, Gates, Goals,
Text signs, Warps -- the avatars walk the puzzle.

Per-lesson level files (one JSON per lesson) drive the actor layout;
content from the AP Stats framework (`apstat_*_framework.md`) gets
woven in as in-world `Text` actors + question-door labels +
reflection texts. Mastery still routes through the existing
override-gate (P5).

**V4 / V5 / V6 activity plugins coexist with V7** -- the engine's
plugin registry now supports a new `'level'` activity type alongside
`'bridge-mean'`, `'colorbox-hue'`, `'colorbox-grid'`. The cockpit
dropdown lists everything. Teacher picks per launch.

V7 ships the engine + the FIRST level (`activities/U1.1.json`). V8+
add more level files; the engine doesn't change per-lesson.

This contract is FROZEN -- implement verbatim.

## Pedagogy hook (U1.1 the seed level)

AP Stats Topic 1.1 -- "Introducing Statistics: What Can We Learn from
Data?" Per `apstat_1_framework.md`:

- **Skill 1.A** -- Identify the question to be answered or problem to be solved.
- **Enduring Understanding VAR-1** -- Given that variation may be
  random or not, conclusions are uncertain.
- **Essential Knowledge VAR-1.A.1** -- Numbers may convey meaningful
  information, when placed in context.
- **Named resource** -- Coke vs Pepsi taste-test activity.

The level: "Cola Mystery." Players sample 4 mystery cups (each
secretly Cup A or Cup B). The cockpit shows the live tally. Then
the class walks toward one of three Question Doors:

- "Is Cup A Coke?" -- **wrong** (data doesn't say what's IN cups).
- "Can students tell A from B?" -- **correct** (the right question
  for this data).
- "Is Coke better than Pepsi?" -- **wrong** (statistics observes,
  doesn't decide quality).

Right door => Goal => override-gate unlocks U1.1. Wrong door =>
soft-block: walk through, see a Reflection room with the
explanatory text, walk back, retry.

## Locked design dials (CC + teacher session 115)

| Dial | Value |
|---|---|
| Activity type discriminator | `'level'` (in `room.activity.type`) |
| Level catalog location | `activities/<lessonKey>.json` (lessonKey like `U1.1`, `U1.2`, ...) |
| Authoring format | Hand-authored JSON, one file per lesson |
| Sprites (Players) | Reuse existing LC sprite sheet (already in classroom-board.js) |
| Sprites (Coins / Doors / Goal / Signs) | Programmatic drawing v7: colored rects + labels. Pixel-art polish deferred to V7.1. |
| Lesson content surface | Tiny pop-up tooltip when Player walks within `proximity = 32 px` of a Text actor. No key required. |
| Players-per-student | 1 Player per signed-in online student (matches V1a presence model) |
| Wrong-door behavior | **Soft-block**: walking through a wrong door teleports the class to a Reflection room; reading + walking back to a return Warp restores the main scene; class can re-vote |
| Mastery action | Existing override-gate auto-fires per spec C2 (lessonKey looked up via `room.activity.state.lessonKey`) |
| Min students | 2 online (consistent with V4-V6) |
| Duration | Per-level via `level.duration` (default 180s for U1.1) |
| Mutex | One of `{gate, poll, doorways, activity}` (engine-managed; level activity blocks the others) |

## Dependency analysis

Cross-repo. Six units. A-D file-disjoint and parallel; E and T are
post-Wave 1.

- **Unit A** (cr `railway-server/classroom.js` + `level-engine.js`
  new file + `activities/U1.1.json` new file): server-side level
  engine + the `'level'` activity plugin wrapper + the U1.1 level
  JSON shipped from the cr repo (so the server can read it without
  cross-repo file access). ~400 LoC + JSON.
- **Unit B** (`classroom-board.js`): extend `_reduce` to handle
  level state in `state.activity.state.level` (additive; preserves
  V4-V6 paths). New handle method `sendLevelAction(payload)` to
  cover Switch-walk + Sip-collect events. ~80 LoC.
- **Unit C** (`teacher-classroom.html`): cockpit dropdown adds a
  `'U1.1 Cola Mystery (level)'` option; new "Level Observer" panel
  in renderActivity for `type === 'level'` showing sip tally + door
  votes + which Players are in the Reflection room. ~120 LoC.
- **Unit D** (`activity-level.js` NEW file): the level renderer.
  Scene canvas + actor drawing + actor-Player collision + tooltip
  popup for Text actors. The single biggest file. ~600 LoC.
- **Unit E** (`ap_stats_roadmap_square_mode.html`,
  planner-direct): `_activityRendererForType` adds `'level'` branch;
  arrow-key handler stays unchanged (Players move via the
  existing PlayerSprite path -- the level renderer reuses
  classroom-board.js sprite engine). Soft-block reflection-room
  navigation is server-driven so the Desk just renders what
  state.activity.state tells it.
- **Unit T**: tests both repos.

## C1. Engine extension: the `'level'` plugin

The level plugin is registered like any other:

```js
activityPlugins['level'] = {
  minMembers: 2,
  initActivity(room, online, opts) -> state,
  onStudentInput(state, username, payload) -> nextState | null,
  onTick(state, deltaMs, room) -> nextState,
  isComplete(state) -> bool,
  serializeForBoard(state) -> publicState,
  onMemberLeave(state, username) -> nextState | null,
  onMemberJoin(state, username, room) -> nextState | null
};
```

The plugin's body delegates to a new `level-engine.js` module
(see C2). It takes `opts.levelKey` (e.g., `'U1.1'`); loads the
matching JSON; instantiates Player actors for each online student;
runs the state machine.

`ACTIVITY_LESSON_MAP` is extended: when `room.activity.type ===
'level'`, the lesson key comes from `room.activity.state.lessonKey`
(stamped by the level JSON), not the static map. The existing
`_fireOverrideGateForRoom(room, activityType)` becomes
`_fireOverrideGateForRoom(room, activityType, lessonKeyOverride)`
with an optional override.

## C2. `railway-server/level-engine.js` (NEW)

Module-scope shape:

```js
module.exports = {
  loadLevel(lessonKey) -> LevelDef | null,    // reads activities/<lessonKey>.json
  createLevelState(levelDef, onlineStudents) -> LevelState,
  applyInput(state, username, payload) -> nextState | null,
  tick(state, deltaMs, room) -> nextState,
  isComplete(state) -> bool,
  serialize(state) -> publicState,
  onMemberLeave(state, username) -> nextState | null,
  onMemberJoin(state, username, room) -> nextState | null
};
```

`LevelDef` is the parsed JSON. `LevelState` extends the def with
per-instance runtime data:

```js
{
  levelKey:    string,        // copied from def
  lessonKey:   string,        // copied from def (e.g., '1.1')
  startedAt:   number,
  // World state:
  players:     { [username]: { x, y, vx, vy, inReflection: bool, lastInteracted: timestamp } },
  coins:       [{ id, x, y, collected: bool, payload }],     // SipStation actors
  switches:    [{ id, x, y, pressed: bool, doorId, voteCount, voters: Set }],
  gates:       [{ id, x, y, doorId, opened: bool }],
  goal:        { x, y, reached: bool, reachedBy: username | null },
  // Soft-block:
  reflection:  { active: bool, doorId: string | null, returnedCount: number },
  // Tally (live, exposed to cockpit):
  tally:       { sips: { A: int, B: int }, votes: { d1: int, d2: int, d3: int } }
}
```

### State transitions (level state machine)

```
INIT
  v
SIPPING          -- waiting for sips
  | (any Player walks onto a Coin/SipStation)
  v               -- coin.collected = true; tally.sips[drink]++
SIPPING (continues until per-level threshold or teacher advances)
  v
VOTING           -- doors visible; switches active
  | (Player walks onto a Switch s.t. s.voters does NOT include this user)
  v               -- s.voters.add(username); s.voteCount++; recompute pressed
GATE_OPENING     -- when any door's voteCount/onlineN >= 1/3, gate.opened = true
  v
PLAYER_THROUGH_GATE
  | (a Player walks past an opened Gate's x AND it's a WRONG-door gate)
  v
REFLECTION_ACTIVE -- all players warped to reflection.def coords;
                  --   reflection.active = true; doorId = that door
  | (Player walks onto a Return Warp inside reflection room)
  v               -- reflection.returnedCount++
RETURN_TO_MAIN   -- when reflection.returnedCount >= onlineN
                  -- players warped back to main spawn; reflection.active = false;
                  -- the wrong-door switch is reset (voters cleared)
  v
VOTING (back to)
  | (a Player walks past an opened CORRECT-door Gate AND walks onto Goal)
  v
LEVEL_CLEARED    -- isComplete returns true; server fires override-gate +
                 -- classroom_activity_success
```

### Input messages

The Desk uses the existing `classroom_pos` channel for movement
(no new message). The level engine watches `room.members.get(u).pos`
each tick to detect actor overlaps:

- Coin collection: Player overlaps Coin within 16 px
- Switch press: Player overlaps Switch within 16 px AND username not in voters
- Gate pass: Player overlaps Gate's bounding box AND gate.opened
- Goal reach: Player overlaps Goal within 16 px

NO new student-input message needed. **canvasW per-member (V5 fix)
still applies** -- the engine reads positions in the SENDER's coord
space and rescales actor positions IF the level JSON declares
`map.width` in chip units (24 px each, like the old_app).

### Tick frequency

Same engine tick at 200 ms (`ACTIVITY_TICK_MS`). The level engine's
`tick()` does:
1. For each Player, recompute overlap with each Coin / Switch / Gate / Goal
2. Apply state transitions (collect, press, pass, reach)
3. Check completion criteria
4. Return next state

## C3. Level JSON format

```jsonc
{
  "schema":     "v7-level-1",
  "levelKey":   "U1.1",
  "lessonKey":  "1.1",                              // for override-gate routing
  "title":      "The Cola Mystery",
  "skill":      "1.A",
  "lo":         "VAR-1.A",
  "ek":         ["VAR-1.A.1"],
  "duration":   180,                                // seconds
  "map": {
    "width":    32,                                  // chips wide
    "height":   16,                                  // chips tall
    "chipSize": 24                                   // CSS px per chip
  },
  "actors": [
    { "type": "Text",          "x":  4, "y":  2, "text": "Welcome to AP Stats! The science of asking questions about variable data." },
    { "type": "SipStation",    "id": "s1", "x":  6, "y":  6, "drink": "A" },
    { "type": "SipStation",    "id": "s2", "x": 12, "y":  6, "drink": "A" },
    { "type": "SipStation",    "id": "s3", "x": 18, "y":  6, "drink": "B" },
    { "type": "SipStation",    "id": "s4", "x": 24, "y":  6, "drink": "B" },
    { "type": "PlayerSpawn",   "x":  4, "y": 12 },
    { "type": "TallyDisplay",  "x": 16, "y": 10, "binds": "tally.sips" },
    {
      "type":       "QuestionDoor",
      "id":         "d1",
      "x":           6, "y": 14,
      "text":       "Is Cup A Coke?",
      "correct":    false,
      "reflection": "Notice the data doesn't say what's IN each cup -- only what students preferred."
    },
    {
      "type":       "QuestionDoor",
      "id":         "d2",
      "x":          16, "y": 14,
      "text":       "Can students tell A from B?",
      "correct":    true
    },
    {
      "type":       "QuestionDoor",
      "id":         "d3",
      "x":          26, "y": 14,
      "text":       "Is Coke better than Pepsi?",
      "correct":    false,
      "reflection": "Statistics observes patterns; it doesn't decide quality."
    },
    { "type": "Goal", "x": 16, "y": 15 }
  ],
  "reflection_room": {
    "map":     { "width": 16, "height": 8, "chipSize": 24 },
    "actors":  [
      { "type": "Text",       "x": 8, "y": 2, "text": "[Reflection text placeholder -- filled at runtime from the chosen door's `reflection` field]" },
      { "type": "ReturnWarp", "x": 8, "y": 6 }
    ]
  },
  "completion": {
    "kind": "lock-and-switch-state + goal-overlap",
    "rule": "any correct QuestionDoor switch pressed by >= 1/3 of online players, then any Player walks onto Goal"
  },
  "min_students": 2
}
```

### Actor type contract (v7-level-1)

| `type` | Required fields | Engine behavior |
|---|---|---|
| `Text` | `x, y, text` | Static. Players within `proximity=32 px` see a tooltip popup. |
| `SipStation` | `x, y, drink`, optional `id` | Coin-like collectible. Walking on it (and not yet collected) increments `tally.sips[drink]`. |
| `PlayerSpawn` | `x, y` | Marker only. Engine spawns Players at this coord. |
| `TallyDisplay` | `x, y, binds` | Renders the live value of `state.<binds>` (e.g., `tally.sips`) as text. |
| `QuestionDoor` | `x, y, text, correct, id`, optional `reflection` | A Switch+Gate composite. Walking on the Switch zone votes for that door's `id`. When `voteCount/onlineN >= 1/3`, gate opens. Walking past an opened Gate triggers `correct=true` -> level clear (after Goal), `correct=false` -> Reflection room. |
| `Goal` | `x, y` | Terminal. Walking on it (after at least one correct gate opened) sets `goal.reached = true`. |
| `ReturnWarp` | `x, y` | Only in `reflection_room.actors`. Walking on it increments `reflection.returnedCount`. When `returnedCount >= onlineN`, all Players warp back to main scene; the wrong-door's switch is reset. |

## C4. Wire protocol

**Zero new message types.** V4-V6's `classroom_activity_*` channels
all carry V7 level state.

`classroom_activity_start` payload's `activity.state` block now
contains:

```js
{
  levelKey:   'U1.1',
  lessonKey:  '1.1',
  startedAt:  <ms>,
  durationMs: 180000,
  state: {
    // serialize() output -- public-safe (no internal Sets,
    // username lists redacted where appropriate)
    players:    { [username]: { x, y, inReflection } },
    coins:      [{ id, collected }],
    switches:   [{ id, voteCount, pressed }],
    gates:      [{ id, opened }],
    goal:       { reached, reachedBy },
    reflection: { active, doorId, returnedCount, totalCount },
    tally:      { sips, votes }
  },
  level: { /* full LevelDef from JSON, sent ONCE on start */ }
}
```

The `level` block is sent in the START broadcast so clients have
the actor layout; subsequent `classroom_activity_state` broadcasts
only carry the mutating `state` block (smaller payload).

## C5. Cockpit (`teacher-classroom.html`)

Add to the activity-type dropdown:

```html
<option value="level:U1.1">U1.1 The Cola Mystery (level)</option>
```

The `:variant` parser in `startActivity()` (already present from
V6) extends to handle `'level'` prefix:

```js
if (type === 'level') {
  opts.levelKey = variant;  // 'U1.1'
}
```

`renderActivity` adds a `'level'` branch in the readout that shows:

- `Sips: A=3 B=2`
- `Door votes: d1=1 d2=3 d3=0`
- `Doors opened: [d2]`
- `Players in reflection: 0/N`
- `Goal reached: yes/no`

Plus a small live "level map" diagram (ASCII art? mini canvas?) --
v7 ships a text-only readout; mini map is V7.1.

## C6. Desk renderer -- `activity-level.js` (NEW)

Single IIFE attaching `window.ActivityLevel.mount(mountEl, opts) ->
handle`. `opts.boardHandle` + `opts.currentUsername` per V6 pattern.

The handle:
- `updateState(activityState)` -- on first call (with `state.level`
  block present), build the scene from `level.actors`; on subsequent
  calls, update Coin collected / Switch pressed / Gate opened /
  Player positions / reflection state.
- `showOutcome(outcome)` -- success/timeout/cancel overlay.
- `destroy()` -- remove canvas + tooltip element.

### Scene rendering

A full-size canvas (sized to mountEl) with:

- Map background (light gray; chips drawn as grid lines)
- Actor sprites: programmatic drawing in v7 (colored rects + labels)
  - `Text` -- subtle background + label
  - `SipStation` -- cup icon ([] with the drink letter inside; greyed when collected)
  - `QuestionDoor` -- portal arch + label text; tinted by `correct` only AFTER reveal
  - `Goal` -- gold/checkered rect with "GOAL" label
  - `ReturnWarp` -- swirl icon + "RETURN" label
- Players: re-use the existing LC sprite from `classroom-board.js`'s
  sprite sheet. NOT mounted via classroom-board (that's a separate
  scene); the level canvas renders its own player sprites using the
  same image asset.

### Player movement

The level canvas reads `state.players[username].x/y` (live, from
classroom_pos via the engine's serialize) and draws each player.
Arrow keys are handled by the existing classroom-board.js
PlayerSprite + the V4 capture-phase keydown gate is OFF (we're not
in an activity that needs ↑/↓ remapped -- the Player's
classroom-board-mount canvas is hidden during a level; only the
level canvas is shown).

Wait -- the level needs the player to MOVE. Two implementation
choices for movement:
1. **Hide the classroom-board canvas; level renders its own players
   directly from state.activity.state.players** (clean separation)
2. **Show the classroom-board canvas BEHIND the level canvas; players
   live in classroom-board; level canvas overlays the actors only**
   (reuses sprite engine)

For v7, ship choice **#1**: the level canvas is its OWN scene. The
classroom-board canvas is hidden when activity.type === 'level'.
The level canvas renders players from `state.players`. Movement
broadcasts via classroom_pos (the level engine reads positions from
member.pos as usual).

### Tooltip

When the local Player is within `proximity=32 px` of a `Text` actor,
render a small `<div>` tooltip above the player showing the Text's
content. Re-render on every state update.

## C7. Desk integration (`ap_stats_roadmap_square_mode.html`,
planner-direct)

- Add `<script src="activity-level.js"></script>`
- `_activityRendererForType('level') -> window.ActivityLevel`
- When `summary.activity.type === 'level'`:
  - Hide `#classroom-board-mount` (preserve existing classroom-board
    state, just `style.display = 'none'`)
  - Mount level renderer in a new sibling div
- When the activity ends, restore the classroom-board mount.

## C8. Server-side: file system loader for level JSON

`level-engine.js` reads `path.join(__dirname, '..', 'activities',
'<lessonKey>.json')` at the time `loadLevel()` is called. Cache
the parsed result in a module-scope map (lazy load per first
request per lesson). On JSON parse error, `loadLevel()` returns
`null` and `startActivity` returns
`classroom_activity_error{code:'level-missing'}`.

For v7 the cr repo's `activities/U1.1.json` is the only file. V8
adds U1.2 (just by dropping another JSON in `activities/`).

## C9. Tests

### Unit A (`cr railway-server/tests/level-engine.test.js`)

- `loadLevel('U1.1')` returns a valid LevelDef
- `loadLevel('missing')` returns null
- `createLevelState` spawns Players at PlayerSpawn coords (or first
  PlayerSpawn if multiple)
- `tick` detects Player-Coin overlap and increments `tally.sips`
- `tick` does NOT double-count a Coin already collected
- `tick` records Switch press only for usernames not in voters set
- `tick` opens a Gate when `voteCount / onlineCount >= 1/3`
- `tick` triggers Reflection room when a Player passes a wrong-door
  opened Gate
- `tick` clears Reflection when `returnedCount >= onlineCount`,
  resets the wrong-door switch
- `tick` triggers Goal reach + isComplete when correct-door gate
  open AND Player overlaps Goal
- `isComplete` returns false in REFLECTION_ACTIVE state
- `serialize` output excludes internal Sets (voters becomes a count
  + a username list; not a Set instance)
- `onMemberLeave` removes that player from `state.players` AND from
  any switch's voters set

Acceptance: >=18 cases.

### Unit A2 (`cr railway-server/tests/classroom.activity.level.test.js`)

- Plugin registry resolves `'level'`
- `startActivity('level', {levelKey:'U1.1'})` loads the level + starts
- `startActivity('level', {levelKey:'missing'})` returns
  `classroom_activity_error{code:'level-missing'}`
- Mutex: starting a level while bridge-mean is live rejects
- `classroom_activity_start` payload includes the full LevelDef
- `classroom_activity_state` payload excludes the LevelDef (only
  carries serialized state)
- Override-gate fires on level success with lessonKey from the
  level def
- Member leave during level removes player + cleans voters set
- Snapshot in `buildStatePayload` carries the level state

Acceptance: >=10 cases.

### Unit B (`tests/classroom-board-level.test.js`)

- `_reduce` preserves `state.activity.state` across non-activity cases
- `_reduce` `classroom_activity_start` accepts a `level` block in
  payload.activity and stashes it
- `handle.sendActivityValue` still works (V4 unchanged)
- `buildSummary` exposes the level block via summary.activity.state

Acceptance: >=6 cases.

### Unit D (`tests/activity-level.test.js`)

- mount returns handle with `destroy/updateState/showOutcome`
- updateState on first call (with `level` block) sets up actor layer
- updateState renders Player sprites from `state.players`
- updateState renders Coin/SipStation actors with the right tint
  (uncollected) and grey (collected)
- updateState renders QuestionDoor with text label
- updateState renders Goal at the right grid coord
- Tooltip appears when current Player within proximity of a Text
- Tooltip hides when player moves away
- showOutcome renders the overlay
- destroy removes canvas + tooltip

Acceptance: >=10 cases.

### Unit E (`tests/desk-level-integration.test.js`)

- `_activityRendererForType('level')` returns `window.ActivityLevel`
  when available
- `_handleActivityState` hides classroom-board-mount when activity
  type is `'level'`
- `_handleActivityState` restores classroom-board-mount when activity
  ends

Acceptance: >=4 cases.

## Acceptance (end-to-end smoke)

After Units A-E + T land:

1. Open 3+ student Desks signed in to the same section + the cockpit.
2. Cockpit dropdown: select "U1.1 The Cola Mystery (level)"; click
   Run Activity.
3. Each Desk: classroom-board canvas hides. Level canvas appears:
   welcome text at top, 4 sip stations (cups labeled A or B
   secretly), 3 question doors at bottom, Goal beyond doors. Player
   avatars at PlayerSpawn coords.
4. Students walk to sip stations. Cockpit's "Sips" tally climbs
   live.
5. Once all 4 sip stations collected (or teacher advances), question
   doors light up; Players walk onto a Switch under one of the 3
   doors.
6. Threshold (>=1/3 of N online players agree on one door) opens
   that gate.
7. If WRONG door's gate opens and any Player walks through: all
   Players warp to Reflection room with the door's reflection text;
   when >=N players walk to ReturnWarp, all warp back; wrong
   switch reset.
8. If CORRECT door's gate opens and any Player walks past it then
   onto Goal: success fires; override-gate auto-unlocks U1.1 for
   all present students; Desks display "U1.1 unlocked!"

## What V7 does NOT include (V7.1 / V8 candidates)

- **Pixel-art sprite assets** for non-Player actors (v7 uses
  programmatic colored rects with text labels; v7.1 swaps in proper
  tiles).
- **A second level** (U1.2 or U1.7). V8 = drop one more JSON file
  in `activities/`. Engine doesn't change.
- **Visual level editor**. JSON is hand-authored; future tooling
  optional.
- **Per-level custom completion logic** (e.g., timer-based,
  combo-based). V7 only supports `lock-and-switch-state +
  goal-overlap`. V7.1 adds the other 4 kinds from
  `levelStateMachine.ts` (collectible-state, timer-state,
  transport-state, unknown-extra-criteria).
- **Mini-map / scene preview** in the cockpit readout.
- **AI-tutor integration** on failed levels (deferred since V4).
- **Multi-level sequencing** (lesson with 2-3 levels in a row).

## Carry-forward gotchas from V4-V6

- canvasW per-member (V5 BLOCKER fold) -- the level engine MUST
  read each Player's canvasW from `room.members.get(u).canvasW` for
  all overlap math.
- `fallbackHueForUsername` parity with classroom-board's
  `hashStringToHue` (V5 MAJOR fold) -- still used for Player tint.
- Codex cross-repo review is load-bearing (every V phase caught
  real bugs).

## Build dispatch

Standard loop. **5 parallel waves** for V7 (more units than V4-V6
because the engine layer is bigger):
- Unit A + A2 (cr classroom.js + new level-engine.js + activities/U1.1.json)
- Unit B (classroom-board.js)
- Unit C (teacher-classroom.html)
- Unit D (NEW activity-level.js)
- Unit T (Tests for all of A2/B/C/D)

Unit E (Desk integration) is planner-direct AFTER Wave 1 lands.

Then: vitest both repos, Codex read-only review, fold, commit + push.

## File index for V7

| Path | Status | Owner |
|---|---|---|
| `LIVE_CLASSROOM_V7_BUILD.md` | NEW (this file) | planner |
| `curriculum_render/railway-server/level-engine.js` | NEW | Unit A |
| `curriculum_render/railway-server/classroom.js` | EDIT (register 'level' plugin + level loader integration) | Unit A |
| `curriculum_render/activities/U1.1.json` | NEW | Unit A |
| `curriculum_render/railway-server/tests/level-engine.test.js` | NEW | Unit A |
| `curriculum_render/railway-server/tests/classroom.activity.level.test.js` | NEW | Unit A2 |
| `follow-alongs/classroom-board.js` | EDIT (small extension) | Unit B |
| `follow-alongs/tests/classroom-board-level.test.js` | NEW | Unit B |
| `follow-alongs/teacher-classroom.html` | EDIT (dropdown + render branch) | Unit C |
| `follow-alongs/tests/cockpit-level.test.js` | NEW | Unit C |
| `follow-alongs/activity-level.js` | NEW | Unit D |
| `follow-alongs/tests/activity-level.test.js` | NEW | Unit D |
| `follow-alongs/ap_stats_roadmap_square_mode.html` | EDIT (renderer mapping + hide classroom-board) | Unit E (planner) |
| `follow-alongs/tests/desk-level-integration.test.js` | NEW | Unit E (planner) |

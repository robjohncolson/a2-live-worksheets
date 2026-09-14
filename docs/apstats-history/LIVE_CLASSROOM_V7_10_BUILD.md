# Live Classroom V7.10 -- Gate actor + Zones 2 + 4 (voting dies for U1.1)

Session 118 (2026-05-26). Author: CC. Status: FROZEN -- dispatching.

V7.10 is the biggest pedagogical milestone of the mechanic-first
arc: voting officially dies for U1.1, replaced by physical gates
that embody the "what can data answer" lesson. After V7.10 ships,
U1.1's `stages[]` array is GONE and the level completes via
walking through the data-answerable door at the end of Zone 4,
not via clicking a vote option.

Aligned with Hermes agent strategic note (session 118): "Replace
the ChoicePad voting stages with the two new zones above. Use the
existing KeyGate / Switch / Gate patterns from the recovered code
as the foundation for the scanner and question doors."

## Goal

Two zones land:

- **Zone 2 (Row Scanner Gate)** at chip 30. A single Gate with
  predicate `every_player_row_complete`. Closed = physical block;
  opens when every online player has rowComplete (sampledA AND
  sampledB AND choice). Players with incomplete rows literally
  cannot proceed -- the lesson "complete observation matters" is
  embodied in the wall.

- **Zone 4 (Question Door Hall)** at chips 36 / 40 / 44. Three
  Gates side-by-side, each with a tempting label:
  - Door 1 ("Open if Cup A = Coke") -- predicate `always_false`.
    Permanently blocked. Tempting wrong-question 1.
  - Door 2 ("Open if Coke is better than Pepsi") -- predicate
    `always_false`. Permanently blocked. Tempting wrong-question 2.
  - Door 3 ("Open if data show which cup this class chose more")
    -- predicate `tally_nonzero`. Opens as soon as the class has
    recorded at least 1 row.

  Walking through the OPEN Door 3 fires the level's "advance"
  transition (replaces voting correct-vote). The two wrong doors
  shake + show a brief text bubble on attempted walkthrough --
  no progression, just feedback.

Voting machinery survives in the engine (V7.5 stages[] code path
intact) -- it's used by the 78 legacy levels + U1.2. V7.10's change:
levels with Gate actors short-circuit the VOTING phase entry and
use Gates instead.

## Engine surface -- `cr/railway-server/level-engine.js`

### 1. Gate actor parsing (createLevelState)

After Tally + ChoicePad extraction:

```js
var gateActors = _actorsOfType(levelDef.actors, 'Gate');
var gates      = [];
for (var gi = 0; gi < gateActors.length; gi++) {
  var ga = gateActors[gi];
  gates.push({
    id:        ga.id || ('gate-' + gi),
    x:         ga.x,
    y:         ga.y,
    label:     (typeof ga.label === 'string') ? ga.label : '',
    predicate: (typeof ga.predicate === 'string') ? ga.predicate : 'always_false',
    opened:    false,
    attempts:  0   // analytics: count of wrong-door attempts
  });
}
```

Add `gates: gates` to the returned state object.

### 2. Predicate whitelist + evaluator

NEVER raw-eval predicates. Hard-coded whitelist:

```js
var _PREDICATE_EVALUATORS = {
  'always_false': function (state) { return false; },
  'every_player_row_complete': function (state) {
    var usernames = Object.keys(state.players || {});
    if (usernames.length === 0) return false;
    for (var u = 0; u < usernames.length; u++) {
      if (!_playerRowComplete(state.players[usernames[u]])) return false;
    }
    return true;
  },
  'tally_nonzero': function (state) {
    // V7.10: Door 3 opens when the class has recorded ANY observations.
    // Reads state.tally.sips: sum of all sip counts.
    var sips = (state.tally && state.tally.sips) || {};
    var keys = Object.keys(sips);
    for (var k = 0; k < keys.length; k++) {
      if (typeof sips[keys[k]] === 'number' && sips[keys[k]] > 0) return true;
    }
    return false;
  }
};
```

Unknown predicate -> treated as `always_false` (safe default).

### 3. Per-tick gate update

In `tick()`, before any phase logic, run gate evaluation:

```js
if (Array.isArray(state.gates) && state.gates.length > 0) {
  for (var g = 0; g < state.gates.length; g++) {
    var gate = state.gates[g];
    if (gate.opened) continue;   // one-way; never re-close
    var evaluator = _PREDICATE_EVALUATORS[gate.predicate] || _PREDICATE_EVALUATORS.always_false;
    if (evaluator(state)) {
      gate.opened = true;
    }
  }
}
```

### 4. Phase cascade -- Gates short-circuit VOTING

When the level has Gate actors, SIPPING -> VOTING transition is
REPLACED by "all gates evaluated; wait for walk-through-gate input
on the open advance gate." Levels WITHOUT Gate actors keep V7.5
voting unchanged.

In `tick()` SIPPING phase branch:

```js
if (state.phase === PHASE_SIPPING) {
  // V7.10: if level has Gates, the cascade is gate-driven (no VOTING).
  // _isSippingComplete still fires the ChoicePad cascade for marks
  // to set, but the phase transition is gated by walking through
  // the advance Door (handled in applyInput {kind:'walk-through-gate'}).
  if (Array.isArray(state.gates) && state.gates.length > 0) {
    return state;   // wait for walk-through-gate
  }
  if (_isSippingComplete(state)) {
    state.phase = PHASE_VOTING;
    // ...existing V7.5 voting emit code...
  }
  return state;
}
```

### 5. New applyInput payload: `walk-through-gate`

```js
function _handleWalkThroughGate(state, username, payload) {
  if (state.phase !== PHASE_SIPPING && state.phase !== PHASE_VOTING) return null;
  if (typeof payload.gateId !== 'string') return null;
  var gate = null;
  for (var i = 0; i < (state.gates || []).length; i++) {
    if (state.gates[i].id === payload.gateId) { gate = state.gates[i]; break; }
  }
  if (!gate || !gate.opened) return null;
  if (!_playerNearActorX(state, username, gate.x, OVERLAP_PX * 2)) return null;
  // V7.10: walking through ANY open gate that's the LEVEL'S ADVANCE
  // gate transitions to KEY_HUNT (or GOAL_AVAILABLE if no Key actor).
  // For V7.10 U1.1: the gate with predicate 'tally_nonzero' is the
  // advance gate; the row-scanner Gate is just a soft block.
  // Detection: an advance gate has a predicate that gates progression
  // (tally_nonzero in V7.10; future levels may add more). The row-
  // scanner predicate (every_player_row_complete) is a SOFT BLOCK,
  // not the advance trigger.
  if (gate.predicate === 'tally_nonzero') {
    state.phase = state.key ? PHASE_KEY_HUNT : PHASE_GOAL_AVAILABLE;
    return state;
  }
  return null;   // walking through Zone 2's scanner doesn't advance
}
```

### 6. Optional analytics: `attempt-gate`

```js
function _handleAttemptGate(state, username, payload) {
  if (typeof payload.gateId !== 'string') return null;
  var gate = null;
  for (var i = 0; i < (state.gates || []).length; i++) {
    if (state.gates[i].id === payload.gateId) { gate = state.gates[i]; break; }
  }
  if (!gate) return null;
  if (gate.opened) return null;   // already-open gate isn't an "attempt"
  gate.attempts = (gate.attempts || 0) + 1;   // analytics
  return state;
}
```

Add both to `applyInput` dispatch:

```js
if (payload.kind === 'walk-through-gate') return _handleWalkThroughGate(state, username, payload);
if (payload.kind === 'attempt-gate')      return _handleAttemptGate(state, username, payload);
```

### 7. Serialize wire shape

Add to the returned object:

```js
gates: (state.gates || []).map(function (g) {
  return { id: g.id, x: g.x, y: g.y, label: g.label, predicate: g.predicate, opened: !!g.opened };
}),
```

Don't serialize `attempts` (server-only analytics).

### 8. Test coverage -- `cr/railway-server/tests/level-engine-gate.test.js` (new)

Pin:

- Gate actor parsing -> state.gates[] populated.
- Empty Gate actor list -> state.gates = [] (backward compat).
- Predicate `always_false` never opens regardless of state.
- Predicate `every_player_row_complete` opens only when all online
  players have rowComplete (2-player room: only Alice has rowComplete
  -> stays closed; both have -> opens).
- Predicate `tally_nonzero` opens as soon as ANY sip recorded.
- Per-tick evaluator flips gate.opened (one-way).
- Phase cascade: SIPPING level WITH Gates does NOT transition to
  VOTING even when _isSippingComplete (waits for walk-through-gate).
- Phase cascade: SIPPING level WITHOUT Gates keeps V7.5 VOTING entry
  (backward compat -- regression-pinned).
- walk-through-gate on tally_nonzero open gate transitions to
  KEY_HUNT (with Key) or GOAL_AVAILABLE (without Key).
- walk-through-gate on closed gate is a no-op (return null).
- walk-through-gate on row-scanner predicate gate doesn't advance
  (only tally_nonzero is the advance trigger in V7.10).
- attempt-gate on always_false bumps state.gates[i].attempts (not
  serialized; analytics only).
- serialize emits gates[] with id/x/y/label/predicate/opened
  (NOT attempts).

Target: 15-20 cases.

## Client surface -- `fa/classroom-board.js`

### 9. GateSprite class

Mirror existing ChoicePadSprite + KeySprite shape. World bucket
(camera helper applies).

Visual variants by predicate:
- `always_false`: red pillar with the label text + 'X' overlay.
  Solid; never opens (just sits there). On overlap: shake + send
  attempt-gate input + show text bubble for 1.5 s ("Data doesn't
  measure that").
- `every_player_row_complete` (Zone 2 scanner): gray closed gate with
  3 small checklist icons (A SIP / B SIP / CHOICE). Each icon turns
  green as the LOCAL player completes that mark. When `gate.opened
  === true` (all players done): gate fades out + plays "open" sfx;
  becomes walk-through-able.
- `tally_nonzero` (Zone 4 Door 3): blue door with the label text.
  Closed = locked icon; opens with green glow when tally has any
  rows. On walk-through: fires walk-through-gate input -> phase
  advances to KEY_HUNT.

Collision push-out: when player overlaps a CLOSED gate's bbox,
clamp their level x to the gate's left or right edge depending on
which side they approached from. Mirror the recovered KeyGate.ts
`resolveClosedGateCollision` math but simplified (X-only, since LC
floor is fixed Y).

Walk-through detection: when player overlaps an OPEN gate's bbox,
fire walk-through-gate input ONCE (TTL guard, mirrors V7.5
KeySprite _sentCollect pattern).

### 10. syncLevelGates lifecycle

Mirror syncLevelChoicePads. Spawn one GateSprite per state.activity.
state.gates[] entry. Despawn when phase advances to LEVEL_CLEARED
OR state.gates empties. Each gate's `opened` flag is pushed into the
sprite on every state sync (no diff detection; sprite reads opened
each tick via getOpened closure).

### 11. Test coverage -- `fa/tests/classroom-board-gate.test.js` (new)

Pin:
- GateSprite constructor accepts opts (x, y, value, predicate,
  getOpened, getLocalSprite, getLocalMarks, onAttempt, onWalkThrough).
- 3 visual states by predicate (visual tests via mock ctx +
  draw-call inspection).
- Collision push-out: player walking into closed gate gets clamped
  back (X-only).
- attempt-gate fires ONCE per closed-gate overlap (TTL guard).
- walk-through-gate fires when player overlaps an OPEN gate.
- syncLevelGates spawns + despawns correctly.
- Camera adoption: gate sprite renders with _translateForCamera +
  _restoreFromCamera.

Target: 12-18 cases.

## JSON pilot -- `cr/railway-server/activities/U1.1.json`

### 12. Delete stages[]; add 4 Gates; move Key + Goal

Full level layout post-V7.10:

```jsonc
{
  // ...schema/levelKey/lessonKey/title/skill/lo/ek/duration unchanged...
  "map": { "width": 48, "height": 8, "chipSize": 10 },
  "actors": [
    // Zone 1 -- collect (UNCHANGED from V7.9.1)
    { "type": "Text",         "x":  4, "y":  0, "text": "Cola Mystery: taste both cups, then walk to the pad of the one you preferred. Blind sips show preference, not brand." },
    { "type": "SipStation",   "id": "s1", "x":  4, "y":  2, "drink": "A" },
    { "type": "SipStation",   "id": "s2", "x": 28, "y":  2, "drink": "B" },
    { "type": "ChoicePad",    "id": "cp-A", "x":  8, "y":  4, "value": "A" },
    { "type": "ChoicePad",    "id": "cp-B", "x": 24, "y":  4, "value": "B" },
    { "type": "PlayerSpawn",  "x":  4, "y":  4 },
    { "type": "TallyDisplay", "x": 16, "y":  1, "binds": "tally.sips" },
    // Zone 2 -- Row Scanner Gate (NEW V7.10)
    { "type": "Gate", "id": "g-scanner", "x": 30, "y": 3,
      "label": "A SIP? B SIP? CHOICE RECORDED?",
      "predicate": "every_player_row_complete" },
    // Zone 4 -- Question Door Hall (NEW V7.10)
    { "type": "Gate", "id": "g-brand",  "x": 36, "y": 6,
      "label": "Open if Cup A is Coke",
      "predicate": "always_false" },
    { "type": "Gate", "id": "g-better", "x": 40, "y": 6,
      "label": "Open if Coke is better than Pepsi",
      "predicate": "always_false" },
    { "type": "Gate", "id": "g-data",   "x": 44, "y": 6,
      "label": "Open if data show which cup this class chose more",
      "predicate": "tally_nonzero" },
    // Endgame -- Key + Goal moved to after Zone 4 (NEW V7.10)
    { "type": "Key",  "id": "k1", "x": 46, "y":  4 },
    { "type": "Goal", "x": 47, "y":  7 }
  ],
  "reflection_room": { /* unchanged */ },
  "completion": {
    "kind": "gate-walkthrough-and-key-and-goal",
    "rule": "walk through the open data-answerable Gate, collect the Key, walk onto the Goal"
  },
  "min_students": 2
}
```

**DELETED**: the entire `stages[]` array. Voting is DEAD for U1.1.

**REMOVED**: the V7.9.1 "Beyond Zone 1" Text actor (chip 34). Zone
4 doors now populate that area.

## Recipe doc update -- `LEVEL_DESIGN_RECIPE.md`

### 13. Gate actor row + predicate whitelist note

Add Gate to V7-implemented actors table (after ChoicePad row):

| `Gate` | Physical blocker with a per-instance predicate. Closed gate clamps player X; opens (one-way) when predicate evaluates true. Three predicate types in V7.10: `always_false` (perma-locked tempting question), `every_player_row_complete` (Zone 2 row scanner), `tally_nonzero` (Zone 4 data-answerable door). Walking through the advance gate (tally_nonzero) transitions phase to KEY_HUNT. | `x, y, label, predicate` (one of the whitelist). Optional `id`. |

V7.10 author note (after the existing V7.9 note):

> V7.10 (Zones 2 + 4 of the mechanic-first arc). Gate actors are
> the canonical "this question is / isn't answerable" mechanic.
> Use `always_false` for tempting wrong-question doors (brand,
> value, causation in 1.1). Use `tally_nonzero` for the data-
> answerable door. Use `every_player_row_complete` for completeness
> gates. Levels with Gate actors SHORT-CIRCUIT the V7.5 voting
> path -- delete `stages[]` from such levels. The 78 legacy
> levels + U1.2 keep V7.5 voting.

## Constraints carry-forward

Standard. ASCII-only, LF, additive overlays, Codex review unreliable
on >35KB diffs (V7.10 diff estimated 50-65KB -- skip Codex, CC
self-review on documented risk areas).

## Dispatch -- 3 file-disjoint parallel agents

| Unit | Owner | Files | Tests |
|---|---|---|---|
| A | CC | `cr/railway-server/level-engine.js` | `cr/railway-server/tests/level-engine-gate.test.js` (new) |
| B | Sonnet | `fa/classroom-board.js` (GateSprite + syncLevelGates) | `fa/tests/classroom-board-gate.test.js` (new) |
| C | Sonnet | `cr/railway-server/activities/U1.1.json`, `fa/LEVEL_DESIGN_RECIPE.md` | (JSON lint) |

## Risk areas for CC self-review

1. **Phase cascade correctness.** Gates short-circuit VOTING entry
   ONLY for levels with Gates. Levels without Gates keep V7.5
   voting cascade. Regression-pin both paths.
2. **Predicate whitelist safety.** Unknown predicate strings MUST
   default to always_false (never crash, never raw-eval).
3. **Collision push-out direction.** Player approaches scanner gate
   from left -> push back left. Approaches from right (impossible
   in V7.10 layout but for future levels) -> push back right.
4. **Walk-through TTL guard.** Player overlapping open Door 3
   shouldn't fire walk-through-gate every tick -- one-shot per
   overlap session.
5. **Existing live U1.1 sessions.** Students currently mid-run on
   the V7.9.1 U1.1 (with stages[]) will see a structural change
   on refresh. Server-side: the new U1.1.json has no stages[], so
   loadLevel returns the new shape. Existing room state machines
   in mid-vote get... handled how? Best: server kicks back to
   SIPPING phase on first tick after load. Document this in the
   commit message.
6. **U1.2 backward compat.** U1.2 (V7.7 Tally) has NO Gates.
   Phase cascade should still fire V7.7 Tally threshold ->
   _isSippingComplete -> VOTING. Regression-pinned by existing
   U1.2 tests.

## Acceptance criteria

- cr tests: 291 -> ~310 (+15-20 new gate tests), 0 regression
  beyond expected test-helper folds.
- fa LC subset: 421 -> ~435 (+14-18 new gate tests), 0 regression.
- U1.1.json validates: schema, bounds, no stages[], 4 Gate actors
  with valid predicates, Key+Goal moved to chips 46+47.
- Backward compat: U1.2 (V7.7 Tally) still completes via voting.
  78 legacy levels still complete via voting.
- Smoke: refresh student Desk. Walk avatar right past ChoicePads
  -> scanner Gate blocks until row complete -> opens -> walk right
  past gate -> reach 3-door hall -> try Door 1/2 (locked, shake)
  -> walk through Door 3 -> Key + Goal appear -> collect + reach.

## What ships AFTER V7.10

- **V7.11**: Zone 3 (Tally Machine -- RowBlock + TallyChute, the
  "see the pattern" display) + Zone 5 (Context Bridge + GoalPad
  presence-of-all-players timer). U1.1 reaches full 5-zone
  realization.
- **V7.12+**: 78 other levels each get their own mechanic-first
  design doc + JSON rewrite. Multi-session authoring fan-out per
  the master spec.

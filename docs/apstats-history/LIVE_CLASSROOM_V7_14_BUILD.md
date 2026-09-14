# Live Classroom V7.14 -- Zone 5: ContextSlot + GoalPad

Session 118 (2026-05-26). Author: CC. Status: FROZEN -- dispatching.

V7.14 is the FINAL sprint of the U1.1 mechanic-first arc. Replaces
the legacy Key + Goal endgame with the canonical Zone 5 design
(Context Bridge + whole-class GoalPad) per
`U1_1_MECHANIC_FIRST_DESIGN.md`. After V7.14 ships, U1.1 has the
full 5-zone Cola Mystery Conveyor with NO legacy mechanics
anywhere -- every beat is mechanic-first.

## Design

After walking through Door 3 in Zone 4, students enter a final
corridor with three labeled slots embedded in the bridge:

- **QUESTION**: "Which cup did students prefer?"
- **VARIABLE**: "Blind sip choice (A or B)"
- **CONTEXT**: "This class, this trial, mystery cups"

Players walk past each slot to LIGHT it (UNLIT gray -> LIT green).
The pedagogy: each label names ONE COMPONENT of a complete
statistical claim. Walking past them = physically reading them in
sequence. Lighting them = acknowledging each piece of the claim.

When all 3 slots are lit, the GoalPad at the far right activates
(visual: pulsing green ring). All online players must stand on the
GoalPad for ~1.5 sustained seconds to fire LEVEL_CLEARED. If any
player steps off, the timer resets.

The pedagogy: a complete statistical claim needs Question +
Variable + Context. The CLASS together affirms the claim (whole-
class presence). LEVEL_CLEARED isn't a single-player touch; it's
a collective act.

## Engine surface -- `cr/railway-server/level-engine.js`

### 1. ContextSlot actor parsing (createLevelState)

```js
var slotActors = _actorsOfType(levelDef.actors, 'ContextSlot');
var contextSlots = [];
for (var si = 0; si < slotActors.length; si++) {
  var sa = slotActors[si];
  contextSlots.push({
    id:    sa.id || ('slot-' + si),
    x:     sa.x,
    y:     sa.y,
    label: (typeof sa.label === 'string') ? sa.label : '',
    lit:   false
  });
}
```

Add `contextSlots: contextSlots` to returned state.

### 2. GoalPad actor parsing (createLevelState)

```js
var padActors = _actorsOfType(levelDef.actors, 'GoalPad');
var padDef = padActors[0] || null;
var goalPad = padDef ? {
  id:           padDef.id || 'goal-pad',
  x:            padDef.x,
  y:            padDef.y,
  presenceMs:   0,                              // accumulated sustained-presence time
  triggerMs:    (typeof padDef.triggerMs === 'number') ? padDef.triggerMs : 1500
} : null;
```

Add `goalPad: goalPad` to returned state. Legacy levels (with Goal
actor instead) get `goalPad: null`.

### 3. Per-tick ContextSlot evaluator (in `tick()`)

Before phase logic, evaluate each slot: any player overlap (X-only
collision, same as Gate) → set lit = true (one-way). Runs only when
phase is KEY_HUNT or GOAL_AVAILABLE (not during SIPPING / VOTING).

```js
if (Array.isArray(state.contextSlots) && state.contextSlots.length > 0
    && (state.phase === PHASE_KEY_HUNT || state.phase === PHASE_GOAL_AVAILABLE)) {
  for (var si2 = 0; si2 < state.contextSlots.length; si2++) {
    var slot = state.contextSlots[si2];
    if (slot.lit) continue;
    // Any player within OVERLAP_PX of slot.x lights it.
    var usernames = Object.keys(state.players || {});
    for (var uu = 0; uu < usernames.length; uu++) {
      if (_playerNearActorX(state, usernames[uu], slot.x, OVERLAP_PX)) {
        slot.lit = true;
        break;
      }
    }
  }
}
```

### 4. Per-tick GoalPad presence + transition

When all ContextSlots are lit AND the level has a GoalPad,
GoalPad accumulates presence time when ALL online players are
within OVERLAP_PX of goalPad.x. When `presenceMs >= triggerMs`,
phase -> LEVEL_CLEARED.

```js
if (state.goalPad && state.phase === PHASE_GOAL_AVAILABLE) {
  var allSlotsLit = (state.contextSlots || []).every(function (s) { return s.lit; });
  if (allSlotsLit) {
    var usernames2 = Object.keys(state.players || {});
    var allPresent = usernames2.length > 0;
    for (var uu2 = 0; uu2 < usernames2.length; uu2++) {
      if (!_playerNearActorX(state, usernames2[uu2], state.goalPad.x, OVERLAP_PX * 2)) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) {
      state.goalPad.presenceMs += (deltaMs || 0);
      if (state.goalPad.presenceMs >= state.goalPad.triggerMs) {
        state.phase = PHASE_LEVEL_CLEARED;
      }
    } else {
      state.goalPad.presenceMs = 0;   // reset if any player steps off
    }
  }
}
```

### 5. Phase cascade integration

Currently V7.10 walk-through-gate transitions to KEY_HUNT (if Key
exists) or GOAL_AVAILABLE (no Key). V7.14: when level has a GoalPad
(not legacy Goal), walk-through-gate transitions DIRECTLY to
GOAL_AVAILABLE (skipping KEY_HUNT because there's no Key).

Update `_handleWalkThroughGate`:

```js
if (gate.predicate === 'tally_nonzero') {
  if (state.goalPad) {
    state.phase = PHASE_GOAL_AVAILABLE;     // V7.14: skip KEY_HUNT
  } else {
    state.phase = state.key ? PHASE_KEY_HUNT : PHASE_GOAL_AVAILABLE;
  }
  return state;
}
```

### 6. serialize wire shape

```js
contextSlots: (state.contextSlots || []).map(function (s) {
  return { id: s.id, x: s.x, y: s.y, label: s.label, lit: !!s.lit };
}),
goalPad:      state.goalPad ? {
  id:          state.goalPad.id,
  x:           state.goalPad.x,
  y:           state.goalPad.y,
  presenceMs:  state.goalPad.presenceMs || 0,
  triggerMs:   state.goalPad.triggerMs || 1500
} : null,
```

### 7. NO new applyInput payloads

ContextSlots auto-light per-tick on player overlap (server-side
tick eval, no client input needed). GoalPad presence accumulates
per-tick from broadcast player positions. Pure server-side
mechanics; client just renders state.

### 8. Tests -- `cr/railway-server/tests/level-engine-zone5.test.js`

Pin:
- ContextSlot actor parsing -> state.contextSlots[].
- GoalPad actor parsing -> state.goalPad (or null for legacy).
- Per-tick: slot lit when player overlaps; not lit when not.
- One-way lit (never re-darkens).
- Slots only evaluate in KEY_HUNT or GOAL_AVAILABLE phase.
- GoalPad presence accumulates when all players + all slots lit.
- GoalPad presence RESETS when any player steps off.
- LEVEL_CLEARED fires when presence >= triggerMs.
- Walk-through-gate transitions to GOAL_AVAILABLE (not KEY_HUNT)
  when level has GoalPad.
- Backward compat: levels with legacy Goal actor + Key still use
  V7.5 KEY_HUNT path.
- serialize emits contextSlots[] + goalPad (or null).

Target: 12-16 cases.

## Client surface -- `fa/classroom-board.js`

### 9. ContextSlotSprite class

World bucket. Two visual states:
- UNLIT: gray rect with label text. Pulse alpha when LOCAL player
  near (cue: "walk to me").
- LIT: green rect with label + checkmark glyph ('+' ASCII).

Constructor opts: `{id, x, y, label, size?, getLit, getLocalSprite}`.
Render uses `_translateForCamera` (world bucket).

### 10. GoalPadSprite class

World bucket. Three visual states:
- DORMANT: dim gray pad with "ALL CLASS" label. Renders when
  contextSlots NOT all lit.
- ACTIVE: solid green pad with pulsing ring (4 Hz). Renders when
  contextSlots all lit; awaits presence.
- FILLING: same as ACTIVE + thickening ring corresponding to
  presenceMs / triggerMs progress.

Constructor opts: `{id, x, y, size?, getActive, getPresenceMs,
getTriggerMs, getLocalSprite}`. No collision callbacks (server
auto-detects via tick).

### 11. syncLevelContextSlots + syncLevelGoalPad

Mirror syncLevelGates pattern. Spawn per state.activity.state
fields. Despawn on activity end.

### 12. Tests -- `fa/tests/classroom-board-zone5.test.js`

Pin:
- ContextSlotSprite constructor opts + defaults.
- 2 visual states (UNLIT / LIT).
- GoalPadSprite constructor opts.
- 3 visual states (DORMANT / ACTIVE / FILLING).
- Camera adoption for both sprites.
- syncLevelContextSlots spawn/despawn per state.contextSlots[].
- syncLevelGoalPad spawn when state.goalPad non-null; despawn
  when null.

Target: 14-20 cases.

## JSON pilot -- `cr/railway-server/activities/U1.1.json`

### 13. Drop Key + Goal; add 3 ContextSlots + GoalPad

Current V7.13 U1.1: Key at chip 92, Goal at chip 94, map.width=96.

V7.14 layout (Zone 5 spans chips ~84-95):
- DELETE: Key at (92, 4) + Goal at (94, 7)
- ADD:
  - `{type:'ContextSlot', id:'cs-q', x:84, y:5, label:'QUESTION: Which cup did students prefer?'}`
  - `{type:'ContextSlot', id:'cs-v', x:87, y:5, label:'VARIABLE: Blind sip choice (A or B)'}`
  - `{type:'ContextSlot', id:'cs-c', x:90, y:5, label:'CONTEXT: This class, this trial, mystery cups'}`
  - `{type:'GoalPad', x:94, y:7, triggerMs:1500}`
- 14 actors total (was 13: 13 - Key - Goal + 3 ContextSlots + GoalPad = 14)

### 14. completion.rule update

```json
"completion": {
  "kind": "contextslots-lit-and-goalpad-presence",
  "rule": "light all 3 context slots, then ALL online players stand on the GoalPad together for 1.5 seconds"
}
```

## Recipe doc update -- `LEVEL_DESIGN_RECIPE.md`

### 15. ContextSlot + GoalPad rows + V7.14 author note

Add two rows to V7-implemented actors table (after TallyChute):

| `ContextSlot` | Lights green when ANY player walks within overlap distance (one-way). Use 3+ in a row labeled with statistical-claim components (Question, Variable, Context) for the Zone 5 assembly beat. Per-tick eval in KEY_HUNT or GOAL_AVAILABLE phase. | `x, y, label`. Optional `id`. |
| `GoalPad` | Whole-class presence pad. Replaces legacy Goal for V7.14+ levels. LEVEL_CLEARED fires when ALL online players are within overlap of x for sustained `triggerMs` (default 1500). Resets if anyone steps off. Pair with 1+ ContextSlot actors (GoalPad waits for all slots lit before activating). | `x, y`. Optional `id, triggerMs`. |

V7.14 author note (after existing V7.11 note):

> V7.14 (Zone 5 -- whole-class endgame). Use ContextSlot + GoalPad
> together to replace the legacy Key + Goal "single-player touch
> ends the level" mechanic. Place 2-4 ContextSlots in a row with
> labels that name COMPONENTS of the statistical claim being
> assembled (Question, Variable, Context for Topic 1.1; Sample,
> Distribution, Inference for sigtest topics; etc.). Walking past
> each lights it. After all are lit, the GoalPad activates; the
> CLASS together stands on it to fire LEVEL_CLEARED. Backward
> compat: levels with a Goal actor (no GoalPad) keep V7.5 single-
> player touch.

## Constraints carry-forward

Standard. ASCII-only, LF, additive overlays, world bucket via
camera helper, Codex review unreliable on >35KB diffs (V7.14
diff estimated 40-60 KB).

## Dispatch -- 3 file-disjoint parallel agents

| Unit | Owner | Files | Tests |
|---|---|---|---|
| A | CC | `cr/railway-server/level-engine.js` | `cr/railway-server/tests/level-engine-zone5.test.js` (new) |
| B | Sonnet | `fa/classroom-board.js` (2 sprite classes + sync helpers) | `fa/tests/classroom-board-zone5.test.js` (new) |
| C | Sonnet | `cr/railway-server/activities/U1.1.json` (Zone 5 rewrite), `fa/LEVEL_DESIGN_RECIPE.md` | (JSON lint) |

## Risk areas for CC self-review

1. **Phase cascade.** V7.14 GoalPad-only levels skip KEY_HUNT
   entirely. Legacy Goal-only levels keep V7.5 KEY_HUNT. Verify
   both paths.
2. **Presence reset.** Any player stepping off mid-fill resets
   the timer. Make sure single-player rooms don't auto-fill
   instantly (min_students gate exists; verify).
3. **ContextSlot lit one-way.** Once lit, stays lit. Player can
   walk away + back without re-triggering.
4. **GoalPad triggerMs default.** 1500 ms by default; level can
   override via `triggerMs` field.

## Acceptance criteria

- cr tests: 321 -> ~336 (+12-16 new), 0 regression.
- fa LC subset: 509 -> ~525 (+14-20 new), 0 regression.
- U1.1.json: 14 actors, no Key, no Goal; 3 ContextSlots + 1 GoalPad
  at chips 84-94.
- Backward compat: U1.2 + 78 legacy levels still complete via V7.5
  Key + Goal path.
- Smoke: refresh student Desk. Walk U1.1 end-to-end. After Zone 4
  Door 3, enter Zone 5. Walk past 3 ContextSlots (each lights
  green). GoalPad at end pulses green. Stand on it for 1.5s with
  the rest of the class -> LEVEL_CLEARED.

## What ships AFTER V7.14

- U1.1 is COMPLETE. Every beat is mechanic-first. No legacy code
  paths in this level.
- 78 other levels mechanic-first redesign + JSON rewrites:
  - Each gets its own design doc (per the U1.1 template)
  - Per-unit fan-out via parallel Sonnet authors
  - 1 unit per session estimate -> 9 sessions for the 79-level batch
  (counting U1.1 already done)
- Optional V7.15: PushBox + carry mechanic (the "physically carry
  the BridgePiece into the matching slot" version of Zone 5).
  Polish; not required for the core thesis.

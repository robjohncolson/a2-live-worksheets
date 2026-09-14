# Live Classroom V7.11 -- Zone 3 Tally Machine (visual pattern)

Session 118 (2026-05-26). Author: CC. Status: FROZEN -- dispatching.

V7.11 ships Zone 3 of the U1.1 "Cola Mystery Conveyor" design per
Hermes agent's strategic recommendation (post-V7.10): "the next
high-value move is not necessarily more gates -- it's adding the
visual pattern (Zone 3) so students can see the data shape before
they reach the question doors. That would make the 'which question
can these data answer?' moment land harder."

After V7.11 the U1.1 student flow is:

1. **Zone 1** Sip A, sip B, choose your preferred (ChoicePad)
2. **Zone 2** Scanner Gate blocks until ALL classmates have rowComplete
3. **Zone 3 (NEW)** Watch the data pattern emerge in the Tally Machine
4. **Zone 4** Three doors -- 2 perma-locked, 1 opens because data
   "shows which cup the class chose more"
5. **Endgame** Key + Goal

Zone 3 is **display only, NOT a gate.** Per the canonical design doc:
"Pass condition: enough total rows. NOT balance. If all 10 players
chose A, the tally shows A:10 / B:0 and the level still advances.
That is valid, informative data." The pedagogy is "variation in
one-variable data made physically visible" before the question
doors test interpretation.

## Engine scope -- minimal

The existing `state.tally.sips` ALREADY tracks A/B sip counts (V7.4
TallyDisplay reads it as a HUD chip). V7.11's chutes also read it.
**No new wire fields needed for the count itself** -- the engine
just adds the TallyChute actor parsing + serialize so the client
knows where to render the visualization.

### 1. New `TallyChute` actor parsing (createLevelState)

After Gate parsing:

```js
var chuteActors = _actorsOfType(levelDef.actors, 'TallyChute');
var tallyChutes = [];
for (var ci = 0; ci < chuteActors.length; ci++) {
  var ca = chuteActors[ci];
  tallyChutes.push({
    id:    ca.id || ('chute-' + ci),
    x:     ca.x,
    y:     ca.y,
    label: (typeof ca.label === 'string') ? ca.label : 'A'
  });
}
```

Add `tallyChutes: tallyChutes` to the returned state. Empty array
for legacy levels (backward compat: the 78 legacy + U1.2 + U1.1
pre-V7.11 ship).

### 2. serialize wire shape

Add:

```js
tallyChutes: (state.tallyChutes || []).map(function (c) {
  return { id: c.id, x: c.x, y: c.y, label: c.label };
}),
```

Always emitted (empty for legacy).

### 3. NO new applyInput payloads, NO new tick logic

The chutes are pure visualization. The client reads
`state.tally.sips[label]` to determine each chute's count; the
existing tally machinery (V7.4 _handleCoinCollect + V7.7 tally
bump + V7.8 per-player marks) drives the count. Zero new engine
state machine work.

### 4. Tests -- `cr/railway-server/tests/level-engine-tally-chute.test.js`

Pin:
- createLevelState parses TallyChute actors into state.tallyChutes[].
- Levels without TallyChute actors get state.tallyChutes = [].
- serialize emits tallyChutes[] (populated for chute levels, []
  for legacy).

Target: 5-8 cases. Existing 310 cr tests stay green.

## Client scope -- TallyChuteSprite

### 5. TallyChuteSprite class

World bucket (V7.9 _translateForCamera adoption). Mirrors KeySprite
shape but with a `getCount` closure that reads `state.tally.sips[label]`
each tick.

Visual:
- Vertical column at the chute's chip x, extending from floor up to
  `count * BLOCK_H` pixels tall.
- Each block is ~6 px tall, colored per label (A = warm amber to
  match ChoicePad-A; B = cool blue to match ChoicePad-B).
- Label glyph at the top of the column ("A" or "B").
- Total count number rendered above the label ("3").
- Max ~12 visible blocks; overflow shows as "12+" indicator.

Constructor opts: `{id, x, y, label, getCount}`.

### 6. RowBlockSprite (ephemeral animation -- optional polish)

When `state.tally.sips[label]` increments (count delta = 1),
spawn an ephemeral RowBlock at the player's exit-from-Zone-2 x
position; animate it sliding horizontally to the matching chute
over ~800 ms; despawn on arrival. The block visually "lands" on
top of the existing stack in the chute.

Mirrors the V7.4 RevealTextSprite ephemeral pattern (self-removing
via `_id` + engine.removeEntity).

**Out-of-scope for V7.11 MVP if engineering cost balloons. The
chute count display alone delivers the pedagogy.** RowBlock
animation is polish.

### 7. syncLevelTallyChutes lifecycle

Mirror syncLevelChoicePads / syncLevelGates. Spawn one
TallyChuteSprite per `state.activity.state.tallyChutes[]` entry.
Despawn when phase advances past SIPPING (or LEVEL_CLEARED) OR
state.tallyChutes empties.

Each TallyChuteSprite gets a getCount closure:

```js
getCount: (function (capturedLabel) {
  return function () {
    var s = state && state.activity && state.activity.state;
    var sips = (s && s.tally && s.tally.sips) || {};
    return (typeof sips[capturedLabel] === 'number') ? sips[capturedLabel] : 0;
  };
}(c.label))
```

Call site added in onStateChange alongside the other syncLevel*
calls.

### 8. Tests -- `fa/tests/classroom-board-tally-chute.test.js`

Pin:
- Constructor opts shape.
- render() draws `count` stacked blocks + label + count number.
- getCount = 0 -> empty column with label only.
- getCount = 5 -> 5 stacked blocks visible.
- getCount = 13 -> 12 blocks + "12+" overflow indicator.
- Camera adoption: TallyChuteSprite uses _translateForCamera +
  _restoreFromCamera (world bucket).
- syncLevelTallyChutes spawn / despawn / per-tick count refresh.

Target: 10-14 cases.

## JSON pilot -- `cr/railway-server/activities/U1.1.json`

### 9. Add 2 TallyChute actors

Current U1.1 V7.10 layout (chips 0-47):
- Zone 1 actors: 0-28
- Zone 2 scanner Gate: chip 30
- Zone 4 doors: chips 36 / 40 / 44
- Key + Goal: chips 46 / 47

Insert Zone 3 between scanner (chip 30) and Zone 4 (chip 36):
- TallyChute A at chip 32
- TallyChute B at chip 34

That gives 2 chips between scanner and Zone 4 doors -- tight but
workable. The chutes are visually vertical so x-spacing of 2 chips
(20 px) doesn't crowd. If smoke shows overlap, V7.11.1 can widen
U1.1 to map.width=54 to give more breathing room.

Updated U1.1 actor list:

```jsonc
{
  // ...unchanged through Gate g-scanner...
  { "type": "Gate", "id": "g-scanner", "x": 30, "y": 3, ... },
  // Zone 3 -- Tally Machine (NEW V7.11)
  { "type": "TallyChute", "id": "tc-A", "x": 32, "y": 5, "label": "A" },
  { "type": "TallyChute", "id": "tc-B", "x": 34, "y": 5, "label": "B" },
  // Zone 4 -- Question Door Hall (unchanged)
  { "type": "Gate", "id": "g-brand",  "x": 36, "y": 6, ... },
  // ...etc...
}
```

Everything else unchanged from V7.10 -- the chutes are additive.

### 10. NO completion.rule change

Voting is already dead (V7.10). Zone 3 doesn't gate anything; it
just visualizes. completion.rule stays:
`"gate-walkthrough-and-key-and-goal"`.

## Recipe doc update -- `LEVEL_DESIGN_RECIPE.md`

### 11. TallyChute row + V7.11 author note

Insert after the Gate row in the V7-implemented actors table:

| `TallyChute` | Pure-visual data column. Reads `state.tally.sips[label]` and renders a vertical stack of blocks (count = stack height). NOT a gate; doesn't affect phase. Pair with SipStation actors of matching drink letter. | `x, y, label` (drink letter to bind to). Optional `id`. |

Author note (after V7.10 Gate note):

> V7.11 (Zone 3 visual pattern). Use TallyChute pairs when the level
> needs students to SEE the data shape emerge before interpreting it
> (e.g., comparing A:B counts pre-Zone-4-doors). Place 2-4 chutes
> vertically aligned in a corridor between the row scanner Gate and
> the question doors. Each chute reads its own sip count -- no engine
> state required; pure client-side visualization. Heights scale 1:1
> with sip count (cap visible at 12; overflow shows "N+").

## Constraints carry-forward

Standard. ASCII-only, LF, additive overlays, world bucket via
camera helper, Codex review unreliable on >35KB diffs (V7.11
diff estimated 35-50 KB).

## Dispatch -- 3 file-disjoint parallel agents

| Unit | Owner | Files | Tests |
|---|---|---|---|
| A | CC | `cr/railway-server/level-engine.js` (TallyChute parsing + serialize) | `cr/railway-server/tests/level-engine-tally-chute.test.js` (new) |
| B | Sonnet | `fa/classroom-board.js` (TallyChuteSprite + syncLevelTallyChutes + 1 call site) | `fa/tests/classroom-board-tally-chute.test.js` (new) |
| C | Sonnet | `cr/railway-server/activities/U1.1.json` (add 2 chutes), `fa/LEVEL_DESIGN_RECIPE.md` (TallyChute row + V7.11 note) | (JSON lint) |

V7.11 is the LIGHTEST sprint in the arc (no engine state machine
change, no new applyInput, no phase logic). Most of the work is
client-side visualization.

## Risk areas for CC self-review

1. **Chute count read-through.** TallyChuteSprite's getCount
   closure walks state.activity.state.tally.sips[label]. Null-safe?
   Triple-checked path with || {} fallback.
2. **Chute overlap with player walking through.** Chutes at chip
   32/34 are in the player's walkway (between Zone 2 and Zone 4).
   Player walks under/through the chute visualization. NOT a wall
   -- pure render. Confirm no collision logic added.
3. **Overflow rendering.** Count > 12 -> "12+" indicator. Off-by-one
   off-by-zero edge tested.
4. **Backward compat.** U1.2 (no TallyChute actors) gets
   state.tallyChutes = []. Sprite never spawns. No regression.

## Acceptance criteria

- cr tests: 310 -> 315-318 (+5-8 new chute tests), 0 regression.
- fa LC subset: 459 -> 469-473 (+10-14 new chute tests), 0 regression.
- U1.1.json validates: ASCII, LF, schema, bounds (chutes at x=32/34
  within [0, 48)), 2 new TallyChute actors, all other actors
  unchanged.
- Smoke: refresh student Desk. Complete Zone 1. Walk past Zone 2
  scanner (after it opens). See 2 vertical chute columns labeled A
  and B in Zone 3 -- heights match the class's recorded preference
  counts. Walk past chutes to Zone 4. Door 3 opens. Endgame.

## What ships AFTER V7.11

- **V7.12**: Zone 5 (Context Bridge -- assemble Question + Variable +
  Context tiles + whole-class GoalPad presence timer). Replaces the
  legacy Key + Goal endgame with the assembly mechanic per the
  canonical design doc.
- **V7.13**: Optional RowBlock spawn animation (if Zone 3 visual
  feels too static without it).
- **V7.14+**: 78 other levels mechanic-first redesign + JSON
  rewrites. Multi-session authoring fan-out per the master spec.

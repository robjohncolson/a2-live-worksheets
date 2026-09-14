# Live Classroom V7.8 -- Zone 1 (per-player marks + ChoicePad)

Session 118 (2026-05-26). Author: CC. Status: FROZEN -- ready to
dispatch on user "go".

V7.8 is sprint 1 of the mechanic-first arc per the revised master
spec (`LIVE_CLASSROOM_V7_PICO_PARITY_SPEC.md`). Implements Zone 1
of the U1.1 "Cola Mystery Conveyor" design
(`U1_1_MECHANIC_FIRST_DESIGN.md`) plus a stub Zone 2 (the row-
complete state gates SIPPING -> VOTING).

## Scope -- explicit

IN SCOPE for V7.8:
- Per-player mark state extension (server-side authoritative).
- New `ChoicePad` actor type (player overlap records preference).
- SipStation as switch-like trigger that sets `player.marks.sampledX`.
- New `rowComplete` derived per-player flag.
- Modified `_isSippingComplete` with a cascade (ChoicePad >
  Tally-threshold > all-coins) so U1.1, U1.2 (V7.7 Tally), and the
  78 legacy levels all keep working.
- U1.1.json pilot: replace Zone-1 actors with the new SipStation +
  ChoicePad setup. KEEP the existing V7.5 4-stage voting in
  `stages[]` -- voting stays as the lesson driver until V7.9 ships
  Zone 3 + Zone 4.
- Test coverage on both sides.

OUT OF SCOPE (deferred to V7.9+):
- Zone 3 Tally Machine (RowBlock + TallyChute actors).
- Zone 4 Question Door Hall (Gate actor with per-door predicates).
- Zone 5 Context Bridge + GoalPad.
- True horizontal scrolling. V7.8 stays on the existing single-screen
  canvas; the 5 zones are conceptually distinct but visually share
  one canvas in this sprint.
- Per-player mark BADGE rendering above the avatar. The marks are
  authoritative server-side and visible in the cockpit summary, but
  no per-avatar badge in V7.8. Defer to V7.8.1 polish.
- Real Gate physics (KeyGate.ts `resolveClosedGateCollision`-style
  push-out). The Zone 2 stub gate is a SIPPING -> VOTING phase guard,
  not a physical block.

## Engine surface -- `cr/railway-server/level-engine.js`

### 1. Per-player mark state extension

In `createLevelState`, after the existing `players[u] = { x, y }`
loop, attach a `marks` object to each player:

```js
players[u].marks = { sampledA: false, sampledB: false, choice: null };
```

The mark categories (`sampledA`/`sampledB`/`choice`) are HARDCODED for
V7.8 -- they match U1.1's per-category drink letters and the binary
ChoicePad. Future levels with different categories (W/N, R/B, etc.)
get a per-level mark schema in V7.8.1+. For now: `sampledA`,
`sampledB`, `choice` is the universal vocabulary.

### 2. New `ChoicePad` actor type in `createLevelState`

After Goal + Key + Tally actor extraction, add:

```js
var choicePadActors = _actorsOfType(levelDef.actors, 'ChoicePad');
var choicePads = [];
for (var cp = 0; cp < choicePadActors.length; cp++) {
  var cpa = choicePadActors[cp];
  choicePads.push({
    id:    cpa.id || ('choicepad-' + cp),
    x:     cpa.x,
    y:     cpa.y,
    value: (typeof cpa.value === 'string') ? cpa.value : 'A'
  });
}
```

Add `choicePads: choicePads` to the returned state object.

### 3. New `applyInput` payload kind: `record-choice`

The client fires `classroom_activity_value { kind: 'record-choice',
choicePadId }` when the local player walks onto a ChoicePad WITH both
sampledA AND sampledB true. Server validates + records.

```js
function _handleRecordChoice(state, username, payload) {
  if (state.phase !== PHASE_SIPPING) return null;
  if (typeof payload.choicePadId !== 'string') return null;
  var player = state.players && state.players[username];
  if (!player || !player.marks) return null;
  if (!player.marks.sampledA || !player.marks.sampledB) return null;
  var pad = null;
  for (var i = 0; i < (state.choicePads || []).length; i++) {
    if (state.choicePads[i].id === payload.choicePadId) {
      pad = state.choicePads[i];
      break;
    }
  }
  if (!pad) return null;
  if (!_playerNearActorX(state, username, pad.x, OVERLAP_PX * 2)) return null;
  player.marks.choice = pad.value;
  return state;
}
```

Add the dispatch case in `applyInput`:

```js
if (payload.kind === 'record-choice') return _handleRecordChoice(state, username, payload);
```

### 4. Extend `_handleCoinCollect` to set per-player sampledX marks

The existing `_handleCoinCollect` flips `coin.collected = true` +
bumps `state.tally.sips[drink]++`. Add ALONGSIDE (not instead of):

```js
// V7.8: also set the collecting player's sampledX mark. drink letter
// (A/B) maps to mark category sampledA/sampledB. Coins with non-A/B
// drinks (W, N, etc.) skip the mark set (level uses the Tally-
// threshold cascade instead -- e.g. U1.2 with W/N coins).
var player = state.players && state.players[username];
if (player && player.marks) {
  if (coin.drink === 'A') player.marks.sampledA = true;
  if (coin.drink === 'B') player.marks.sampledB = true;
}
```

Order: AFTER the existing tally bump. The tally remains authoritative
for V7.7 Tally levels (U1.2); marks are additive for V7.8 ChoicePad
levels (U1.1).

### 5. Derived `rowComplete` predicate

Add a pure helper:

```js
function _playerRowComplete(player) {
  if (!player || !player.marks) return false;
  return !!(player.marks.sampledA && player.marks.sampledB && player.marks.choice);
}
```

### 6. `_isSippingComplete` cascade

Replace the V7.7 body with a cascade. Order of precedence:

1. If level has any ChoicePads -> every online player has rowComplete.
2. Elif level has Tally actor with non-empty threshold -> V7.7 logic.
3. Else -> V7.5 "all coins collected" (legacy).

```js
function _isSippingComplete(state) {
  // V7.8 cascade -- ChoicePad gate (mechanic-first).
  if (Array.isArray(state.choicePads) && state.choicePads.length > 0) {
    var usernames = Object.keys(state.players);
    if (usernames.length === 0) return false;
    for (var u = 0; u < usernames.length; u++) {
      if (!_playerRowComplete(state.players[usernames[u]])) return false;
    }
    return true;
  }
  // V7.7 cascade -- Tally-threshold gate.
  if (state.tallyConfig && state.tallyConfig.threshold) {
    var sips   = (state.tally && state.tally.sips) || {};
    var thresh = state.tallyConfig.threshold;
    var keys   = Object.keys(thresh);
    if (keys.length > 0) {
      for (var k = 0; k < keys.length; k++) {
        var need = thresh[keys[k]];
        var have = (typeof sips[keys[k]] === 'number') ? sips[keys[k]] : 0;
        if (have < need) return false;
      }
      return true;
    }
  }
  // V7.5 legacy: all coins collected.
  if (!state.coins || state.coins.length === 0) return true;
  for (var i = 0; i < state.coins.length; i++) {
    if (!state.coins[i].collected) return false;
  }
  return true;
}
```

### 7. `serialize` wire shape additions

Add to the returned object:

```js
choicePads: (state.choicePads || []).map(function (p) {
  return { id: p.id, x: p.x, y: p.y, value: p.value };
}),
```

And add per-player marks to the `players` map projection:

```js
players[u] = {
  x: p.x,
  y: p.y,
  marks: p.marks ? {
    sampledA: !!p.marks.sampledA,
    sampledB: !!p.marks.sampledB,
    choice:   p.marks.choice || null
  } : null
};
```

The marks are wire-visible so the client can render badges (V7.8.1+)
and the cockpit can show per-student progress.

### 8. `onMemberJoin` initializes marks

In `onMemberJoin`, after spawning the new player, attach a fresh marks
object so the player isn't stuck with `marks=undefined`:

```js
state.players[username].marks = { sampledA: false, sampledB: false, choice: null };
```

### 9. Test coverage -- `cr/railway-server/tests/level-engine-choicepad.test.js`

New test file. ASCII-only, LF line endings. Pin:

- `createLevelState` populates `player.marks = {sampledA:false, sampledB:false, choice:null}` for every spawn.
- `createLevelState` recognizes `ChoicePad` actors into `state.choicePads`.
- `applyInput {kind:'collect'}` on an A-drink coin sets the collecting
  player's `marks.sampledA = true`.
- Same for B-drink coin.
- `applyInput {kind:'record-choice'}` requires both sampledA AND
  sampledB true; rejects otherwise.
- `applyInput {kind:'record-choice'}` requires player to be near the
  ChoicePad (X anti-cheat).
- `_isSippingComplete` cascade: ChoicePad level requires EVERY player
  rowComplete (regression: 2-player room, only 1 player done -> still
  SIPPING).
- ChoicePad-cascade level with 0 online players returns false (no
  premature advance on empty room).
- Backward compat: Tally-only level (U1.2 shape) keeps V7.7 cascade.
- Backward compat: legacy level (no ChoicePad, no Tally) keeps V7.5
  cascade.
- `serialize` includes `choicePads` array + per-player `marks` object.
- `onMemberJoin` mid-level initializes marks for the joiner (no crash
  on rowComplete check).

Target: 14-18 new test cases. Existing 260 cr tests stay green.

## Client surface -- `fa/classroom-board.js`

### 10. New `ChoicePadSprite` entity

Mirror the existing `KeySprite` pattern (V7.5). On the avatar canvas,
zIndex 5 (same band as Coin/Key/Goal). Two visual states:

- IDLE: small platform with a centered letter (A or B) painted on
  it. Color = light gray border + white interior.
- HOVERED-WITHOUT-MARKS: pulse-fade alpha if the local player is
  near but doesn't have both sampledA + sampledB (visual cue: "sip
  both first").
- RECORDED (this player set their choice): solid color (A = warm
  amber, B = cool blue), checkmark glyph.

`update()` runs collision detection (X+Y within tolerance, same as
existing KeySprite). On collision:

- If local player has `marks.sampledA && marks.sampledB` and hasn't
  set `marks.choice` yet, fire `classroom_activity_value
  { kind: 'record-choice', choicePadId: this.id }` (with a `_sentChoice`
  TTL guard, mirroring V7.4's `_sentCollect` Codex-fold pattern --
  600 ms TTL, clear on server-confirmed state change).
- If local player is missing a sample mark, do NOTHING (just visual
  pulse). The Zone 1 sign tells them what to do.

### 11. `syncLevelChoicePads` lifecycle

Mirror existing `syncLevelKey` / `syncLevelCoins` pattern. On every
state change, ensure one `ChoicePadSprite` exists per
`state.activity.state.choicePads[]`. Spawn/despawn based on
`activityState.choicePads` array changes. Rescale chip x into canvas
px (same mapping coins use).

### 12. Renderer reads per-player marks from wire

The avatar renderer (existing `BoardSprite` / per-member rendering)
gains an OPTIONAL marks read for V7.8.1 badge rendering. In V7.8:
just store the marks in state for the cockpit + ChoicePadSprite
collision logic to read. No avatar overlay yet.

### 13. Test coverage -- `fa/tests/classroom-board-choicepad.test.js`

New test file. ASCII-only, LF line endings. Pin:

- `ChoicePadSprite` constructor accepts `{x, y, value, getLocalMarks,
  onChoose}`.
- `update()` does NOT fire `onChoose` when local player lacks marks.
- `update()` fires `onChoose` when local player has both samples + no
  choice yet AND is overlapping.
- `update()` is idempotent -- second overlap after fire does NOT
  re-send (TTL guard pattern).
- `syncLevelChoicePads` spawns one entity per state.activity.state.
  choicePads[] entry.
- `syncLevelChoicePads` despawns when phase advances past SIPPING.

Target: 10-12 new test cases. Existing LC subset 376/376 stays green.

## JSON pilot -- `cr/railway-server/activities/U1.1.json`

### 14. Replace Zone-1 actors

Current U1.1 has 4 hidden SipStations (`hidden: true`, drinks A/A/B/B)
+ TallyDisplay + Goal + Key + PlayerSpawn.

V7.8 replacement:

- Keep 2 SipStations (drink: A and drink: B), NOT hidden. The cola-
  blind-test mystery is preserved by the SipStation labels ("?"
  before collect, "A" / "B" after) -- the `hidden` flag still works
  client-side per V7.4. But for V7.8 we use 1 A + 1 B (per player
  needs both for rowComplete).
- ADD 2 ChoicePads: `{type: 'ChoicePad', id: 'cp-A', x: 8, y: 4,
  value: 'A'}` and `{type: 'ChoicePad', id: 'cp-B', x: 24, y: 4,
  value: 'B'}`.
- KEEP TallyDisplay at (16, 1) -- it now shows live "Sips - A: N
  B: N" of the AGGREGATE class sips (not per-player).
- KEEP Goal and Key for the V7.5 KEY_HUNT phase (Zone 4-5 will
  replace this in V7.9+).
- KEEP the existing 4-stage voting in `stages[]`. Voting is still
  the level driver until V7.9 ships Zone 3 + Zone 4. V7.8 only
  changes the SIPPING-phase mechanic; VOTING/KEY_HUNT/GOAL stay.

### 15. Welcome Text update (the "data reveals what kind" fix)

The current welcome text says:

> "Cola Mystery: 4 mystery cups. Sip each -- data reveals what kind."

Replace with:

> "Cola Mystery: taste both cups, then walk to the pad of the one
> you preferred. Blind sips show preference, not brand."

Per the do-NOT list in `U1_1_MECHANIC_FIRST_DESIGN.md`: data does NOT
reveal what kind of soda is in the cup. It reveals preference.

### 16. `min_students` stays at 2

The cascade requires `every online player has rowComplete` -- so a
1-player room (only the teacher signed in as a student) would auto-
satisfy after 1 round of sip + choose. The `min_students: 2` baseline
guards against trivial completion.

## Recipe doc update -- `LEVEL_DESIGN_RECIPE.md`

### 17. Add ChoicePad to V7-implemented actors table

| `ChoicePad` | Per-player preference recorder. Player must have both sampledA and sampledB marks; walking onto a ChoicePad sets `player.marks.choice = value`. Pair with SipStation actors. Engine cascade: ChoicePad presence overrides V7.7 Tally threshold + V7.5 all-coins gate. | `x, y, value` (string -- 'A' or 'B' for binary preference). Optional `id`. |

One-paragraph V7.8 note for level authors:

> V7.8 (sprint 1 of mechanic-first arc). Use ChoicePad when the level
> teaches "what does the data measure?" -- the act of CHOOSING is the
> variable. Pair with 1 A-SipStation + 1 B-SipStation (per-player
> required) and one ChoicePad per choice value. The level advances
> from SIPPING to VOTING only when EVERY online player has a complete
> row (sampledA + sampledB + choice). Do NOT also use a Tally actor on
> a ChoicePad level -- the ChoicePad cascade overrides the Tally one.

## Constraints carry-forward (re-read every dispatch)

- LC features are ADDITIVE OVERLAYS -- ChoicePad lives on the avatar
  canvas at zIndex 5 (same band as existing Coin/Key/Goal). Never on
  the activity-overlay canvas (per V7.6.1 lesson).
- `cr/data/curriculum.js` is SACRED.
- ASCII-only on all new + edited files.
- LF line endings on new files.
- PowerShell: `git commit -F-` heredoc, never `-m`.
- Stage own paths only: `git add cr/railway-server/level-engine.js
  cr/railway-server/activities/U1.1.json cr/railway-server/tests/...`
  + `fa/classroom-board.js fa/tests/... fa/LEVEL_DESIGN_RECIPE.md`.
- Codex review unreliable on diffs > ~35 KB (V7.5/V7.6/V7.7 all
  pushed this limit). V7.8 estimated diff: 35-45 KB. Plan to either
  (a) try one combined Codex review, or (b) split per-file. Either
  way, fall back to CC self-review for the documented risk areas if
  Codex times out.

## Dispatch -- 3 file-disjoint parallel agents

| Unit | Owner | Files | Tests |
|---|---|---|---|
| A | CC | `cr/railway-server/level-engine.js` | `cr/railway-server/tests/level-engine-choicepad.test.js` |
| B | Sonnet | `fa/classroom-board.js` (ChoicePadSprite + syncLevelChoicePads) | `fa/tests/classroom-board-choicepad.test.js` |
| C | Sonnet | `cr/railway-server/activities/U1.1.json` (Zone 1 rewrite), `fa/LEVEL_DESIGN_RECIPE.md` (Tally row already added in V7.7 -- ADD ChoicePad row in V7.8) | (no test file; JSON lint only) |

Same dispatch pattern as V7.7. Unit B can trust the wire shape from
this BUILD doc (state.choicePads[] + per-player marks object).

## Risk areas for review (Codex or CC self-review fallback)

1. **Cascade ordering correctness.** ChoicePad presence MUST short-
   circuit before Tally threshold check; Tally MUST short-circuit
   before legacy all-coins. Mis-ordering would break U1.2 (V7.7
   Tally) or the 78 legacy levels.
2. **`record-choice` anti-cheat.** Verify both sampledA AND sampledB
   are server-validated. A client that fakes a record-choice payload
   without sipping must be rejected.
3. **`marks.choice` mutation timing.** Once set, can it be re-set?
   For V7.8: NO (one-shot). A player who steps on A-pad then B-pad
   keeps the FIRST choice. Document this.
4. **Empty room safety.** ChoicePad cascade returns false for 0
   online players (rather than `every` predicate vacuously true).
   Else: SIPPING -> VOTING fires the moment the cockpit launches the
   activity before any student has signed in.
5. **`marks=null` from wire.** If the server emits marks=null for a
   player whose marks somehow weren't initialized, client must not
   crash. Existing player render path doesn't read marks in V7.8
   (badge deferred), so this is hypothetical -- but defensive null-
   safety in any client mark consumer.
6. **`onMemberJoin` mid-level.** New player lands with marks reset
   to false -- so `_isSippingComplete` flips back to false for the
   room. Is that desirable? For V7.8: YES -- the new player needs to
   sip + choose like everyone else. The class waits for them. This
   is the cooperative pedagogy.

## Acceptance criteria

- cr tests: **260 + 14-18 new = 274-278 passing**, zero regression.
- fa tests: **376 (LC subset) + 10-12 new = 386-388 passing**, zero
  regression.
- U1.1 JSON validates against the existing lint (ASCII, LF, schema,
  bounds, etc.) and the new pilot shape (2 SipStations + 2
  ChoicePads + per-player marks gate).
- Backward compat: U1.2 (V7.7 Tally) still completes via the Tally
  cascade. The other 78 legacy levels still complete via all-coins.
- Codex review (or CC self-review fallback): 0 BLOCKER unresolved
  post-fold.

## What ships AFTER V7.8

- V7.9: Zone 3 (Tally Machine -- RowBlock + TallyChute actors) + Zone
  4 (Question Door Hall -- Gate actor with per-door predicates). This
  kills voting for U1.1.
- V7.10: Zone 5 (Context Bridge + GoalPad).
- V7.11+: Side-scrolling camera (if classroom feedback demands more
  visual zone separation than the single-screen mode gives).
- V7.12-15: The 6 other Pico-Park mechanic actors (PushBox properly
  multiplayer; WeightedLift moving carrier; StopWatch full timer;
  TrafficLight; Bound; Seesaw) per the revised master spec.
- Authoring fan-out: 78 other levels each get their own mechanic-
  first redesign per the master spec's per-unit assignments. This is
  a multi-session effort that runs AFTER the engine actors all exist.

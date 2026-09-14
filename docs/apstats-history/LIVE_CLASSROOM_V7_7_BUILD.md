# Live Classroom V7.7 -- Tally actor (engine + client + U1.2 pilot)

Session 118 (2026-05-26). Author: CC. Status: FROZEN -- dispatching.

Sprint 1 of the V7 Pico Parity arc (see
`LIVE_CLASSROOM_V7_PICO_PARITY_SPEC.md`). Scope: one new engine actor
type (`Tally`) that threshold-gates the SIPPING -> VOTING transition,
plus one client render extension (existing `TallyDisplay` shows
threshold progress), plus the U1.2 pilot level rewrite.

## Goal

Replace the engine's hard-coded "all coins collected" precondition
for the SIPPING -> VOTING transition with a flexible threshold rule
driven by a new optional `Tally` actor in the level JSON. Pedagogy:
levels can require students to sample AT LEAST N of each category
(not just "everything that's there"), making the data-collection
phase a deliberate per-category sampling beat instead of a sweep.

Backward compat: levels without a `Tally` actor keep the existing
"all coins collected" behavior. The 79 non-U1.1 / non-U1.2 levels
ship unchanged this sprint.

## Engine surface -- `cr/railway-server/level-engine.js`

### 1. Recognize new `Tally` actor type in `createLevelState`

After the existing Coin/Doorway/Goal/Key parsing, add:

```js
var tallyActors = _actorsOfType(levelDef.actors, 'Tally');
var tallyDef    = tallyActors[0] || null;
var tallyConfig = tallyDef ? {
  threshold: (tallyDef.threshold && typeof tallyDef.threshold === 'object')
    ? Object.assign({}, tallyDef.threshold)
    : null,
  binds:     (typeof tallyDef.binds === 'string') ? tallyDef.binds : 'tally.sips'
} : null;
```

Add `tallyConfig: tallyConfig` to the returned state object.

`threshold` is a `{ categoryKey: minCount }` map (e.g.
`{ "W": 3, "N": 3 }`). `binds` is reserved for future tally sources
(currently only `tally.sips` is supported; V7.7 ignores other values
but doesn't reject them).

### 2. Extend `_isSippingComplete` with threshold rule

Replace the body with:

```js
function _isSippingComplete(state) {
  if (state.tallyConfig && state.tallyConfig.threshold) {
    var sips = (state.tally && state.tally.sips) || {};
    var thresh = state.tallyConfig.threshold;
    var keys = Object.keys(thresh);
    for (var k = 0; k < keys.length; k++) {
      var need = thresh[keys[k]];
      var have = (typeof sips[keys[k]] === 'number') ? sips[keys[k]] : 0;
      if (have < need) return false;
    }
    return true;
  }
  if (!state.coins || state.coins.length === 0) return true;
  for (var i = 0; i < state.coins.length; i++) {
    if (!state.coins[i].collected) return false;
  }
  return true;
}
```

Note: levels with `tallyConfig.threshold` DO NOT require every coin
to be collected -- they can have, say, 10 W-coins and 10 N-coins
and the level advances as soon as ANY 3 W-coins and ANY 3 N-coins
are collected (whichever 3). Wider coin scatter + lower threshold =
richer sampling experience.

If `tallyConfig.threshold` is null/missing, fallback to the
"all coins collected" precondition (current behavior).

### 3. Add `tallyConfig` to serialize wire

In `serialize(state)`, add:

```js
tallyConfig: state.tallyConfig ? {
  threshold: state.tallyConfig.threshold
    ? Object.assign({}, state.tallyConfig.threshold)
    : null,
  binds: state.tallyConfig.binds || 'tally.sips'
} : null
```

to the returned object. Always serialized (null for legacy levels).

### 4. Test coverage -- `cr/railway-server/tests/level-engine-tally.test.js`

New test file. ASCII-only, LF line endings. Pin:

- `createLevelState` recognizes `Tally` actor and produces
  `state.tallyConfig.threshold`.
- `createLevelState` without Tally actor produces
  `state.tallyConfig === null`.
- `_isSippingComplete` returns true only when ALL threshold keys
  meet their min count.
- Level with Tally actor + threshold `{A: 2}` advances to VOTING
  after 2 A-coins collected (NOT requiring B-coins or remaining
  A-coins).
- Level WITHOUT Tally actor uses the legacy "all coins collected"
  rule unchanged (regression pin -- existing 79 levels stay green).
- `serialize` includes `tallyConfig` field (null for legacy, populated
  for Tally levels).

Target: 12-15 new test cases. Existing 246 cr tests stay green.

## Client surface -- `fa/classroom-board.js`

### 5. Extend `TallyDisplay._buildText` to render threshold progress

Current `_buildText` returns `"Sips - A: 2  B: 1"`. Extend to
optionally render threshold progress: `"Sips - A: 2/3  B: 1/3"`.

Add a `getThreshold` opts field (parallel to `getTally`):

```js
function TallyDisplay(opts) {
  this.x           = opts.x;
  this.y           = opts.y;
  this.getTally    = (typeof opts.getTally === 'function')    ? opts.getTally    : function () { return null; };
  this.getThreshold = (typeof opts.getThreshold === 'function') ? opts.getThreshold : function () { return null; };
  this.zIndex      = 5;
  this.engine      = null;
}
```

`_buildText` reads `getThreshold()`; if present + an entry exists for
this letter, append "/N" to the count:

```js
TallyDisplay.prototype._buildText = function () {
  var sips   = this.getTally()    || {};
  var thresh = this.getThreshold() || null;
  var parts = [];
  function fmt(letter) {
    var have = (typeof sips[letter] === 'number') ? sips[letter] : 0;
    var need = (thresh && typeof thresh[letter] === 'number') ? thresh[letter] : null;
    return letter + ': ' + have + (need != null ? '/' + need : '');
  }
  parts.push(fmt('A'));
  parts.push(fmt('B'));
  // Append any other non-A/non-B letter that's present in tally or threshold.
  var seen = { A: true, B: true };
  function appendLetters(obj) {
    if (!obj) return;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (seen[k]) continue;
      var v = obj[k];
      if (typeof v === 'number' && v > 0) {
        parts.push(fmt(k));
        seen[k] = true;
      }
    }
  }
  appendLetters(sips);
  appendLetters(thresh);
  return 'Sips - ' + parts.join('  ');
};
```

Backward compat: levels without threshold still render
`"Sips - A: 2  B: 1"` exactly as before (no "/N" suffix).

### 6. Wire `getThreshold` in `syncLevelTally`

In the existing `syncLevelTally` (line 3594), pass a `getThreshold`
closure when instantiating `TallyDisplay`:

```js
tallyEntity = new TallyDisplay({
  x: tx, y: ty,
  getTally: function () {
    var s = state && state.activity && state.activity.state && state.activity.state.tally;
    return (s && s.sips) ? s.sips : null;
  },
  getThreshold: function () {
    var cfg = state && state.activity && state.activity.state && state.activity.state.tallyConfig;
    return (cfg && cfg.threshold) ? cfg.threshold : null;
  }
});
```

The `state.activity.state.tallyConfig` field is the wire field added
by the engine's serialize() in step 3.

### 7. Test coverage -- `fa/tests/classroom-board-tally-threshold.test.js`

New test file. ASCII-only, LF line endings. Pin:

- `TallyDisplay._buildText` with `getTally=()=>({A:2,B:1})` AND no
  `getThreshold` returns `"Sips - A: 2  B: 1"` (regression).
- Same `getTally` with `getThreshold=()=>({A:3,B:3})` returns
  `"Sips - A: 2/3  B: 1/3"`.
- Threshold entry without a tally entry (e.g. tally `{A:0}` +
  threshold `{A:3,B:3}`) shows `"Sips - A: 0/3  B: 0/3"`.
- Tally entry without a threshold entry falls back to no-slash form
  for that letter (mixed regression).
- `syncLevelTally` passes `getThreshold` callback that reads
  `state.activity.state.tallyConfig.threshold`.

Target: 10-12 new test cases. Existing 363 fa tests stay green.

## JSON pilot -- `cr/railway-server/activities/U1.2.json`

### 8. Rewrite U1.2 from single-stage to V7.5+Tally shape

Current U1.2 (Variables / Individuals): flat single-stage with
5 SipStations all carrying labels "Right" / "Left", one Text actor,
Goal, PlayerSpawn. No Key, no Tally, no stages[].

New U1.2:

- Add `Tally` actor with threshold `{ "W": 3, "N": 3 }` (3 word-typed
  + 3 number-typed cups required to advance).
- Replace SipStation drinks with categorical labels: 4 cups with
  `drink: "W"` (word-typed values like names, colors) + 4 cups with
  `drink: "N"` (numerical values like ages, heights).
- Add `Key` actor for KEY_HUNT phase (per V7.5 cooperative beat).
- Add `TallyDisplay` actor bound to `tally.sips` so students see
  threshold progress live.
- Wrap voting in `stages: []` array (4 stages) per V7.5 multi-stage:
  - Stage 1: "What KIND of thing does each cup carry?"
    - correct: "data values measured on individuals"
    - wrong: "the names of the individuals themselves" (reflection
      explains: a cup's VALUE is the measurement, not the unit)
    - wrong: "experimental conditions" (reflection explains: those
      come later, in Unit 3 experimental design)
  - Stage 2: "The cups labeled W carry..."
    - correct: "categorical (word-typed) variables"
    - wrong: "numerical variables that happen to be words"
      (reflection explains how to tell them apart)
    - wrong: "names of individuals" (reflection: names are LABELS
      for the units, not measured variables)
  - Stage 3: "The cups labeled N carry..."
    - correct: "quantitative (numerical) variables"
    - wrong: "rankings" (reflection: rankings are ordinal but
      qualitative -- not the same)
    - wrong: "categorical variables" (reflection: numbers can be
      categorical if used as codes, but here they're measurements)
  - Stage 4: "An *individual* is..."
    - correct: "the unit on which the variables are measured"
    - wrong: "a single measurement" (reflection: that's a value,
      not the individual)
    - wrong: "the dataset" (reflection: the dataset is the COLLECTION
      of all individuals)

- Reflection text on every wrong door uses `{N}/{TOTAL}/{PCT}` for
  V7.6 dynamic-reflection compat ("{N} of {TOTAL} of you ({PCT}%)
  reached for ... -- but ...").

- `min_students: 2` (keep V7.1 baseline).

### 9. Map / dimensions

- `chipSize: 10`, `map.width: 32`, `map.height: 8` (unchanged budget).
- Coin/SipStation x positions span the full map width so students
  must walk between them (not all clustered at spawn).
- Tally HUD actor at chip (16, 1) -- top-center of the map.
- Key actor at chip (10, 4) -- mid-floor, requires walking from
  spawn (at chip 4, 4).
- Goal at chip (16, 7) -- bottom-center floor.

## Recipe doc update -- `LEVEL_DESIGN_RECIPE.md`

### 10. Add `Tally` to V7 actors table

Move `Tally` from the V7.1-candidates section to the V7-implemented
section. Update the table entry:

| `Tally` | Threshold gate for SIPPING -> VOTING. Reads `tally.sips`; advances when every key in `threshold` meets its min count. Pair with `TallyDisplay` actor for live progress UI. | `x, y`, `threshold` (object mapping drink letter -> min count). Optional `binds` (default `"tally.sips"`). |

Add a one-paragraph note: "V7.7 (sprint 1 of Pico Parity arc).
Authors should pair a `Tally` actor with a `TallyDisplay` actor at
the same chip position when the level uses per-category coins
(W/N, R/B, etc.) and wants students to feel the sampling threshold.
Levels without a `Tally` actor keep the legacy 'all coins collected'
trigger."

## Constraints carry-forward (re-read every dispatch)

- LC features are ADDITIVE OVERLAYS -- the V7.7 engine + client
  changes add a new actor TYPE, extend existing serialize/render
  paths; they do NOT replace the avatar/doorway scene. The Tally
  HUD lives at zIndex 5 on the SAME canvas as coins/goal/key
  (existing TallyDisplay z-band).
- Activity overlay canvas (DOM-above avatar canvas) is NOT touched
  in V7.7 -- the HUD is on the avatar canvas via the sprite engine
  (per V7.6.1 lesson -- entities, not overlay paints).
- `cr/data/curriculum.js` is SACRED -- not touched.
- ASCII-only in level JSON + tests (s112/s113 lesson).
- LF line endings on all V7.7 files (engine.js, classroom-board.js
  is already LF, U1.2.json should re-save as LF). EOL-preserve for
  older worksheets (CRLF).
- PowerShell: never `git commit -m`; use `git commit -F-` heredoc.
- Stage own paths only -- `git add cr/railway-server/level-engine.js
  cr/railway-server/activities/U1.2.json cr/railway-server/tests/...`.
- Cross-agent prompts ASCII-only.

## Dispatch -- 3 file-disjoint parallel agents

| Unit | Owner | Files | Tests |
|---|---|---|---|
| A | CC | `cr/railway-server/level-engine.js` | `cr/railway-server/tests/level-engine-tally.test.js` |
| B | Sonnet | `fa/classroom-board.js` (TallyDisplay + syncLevelTally) | `fa/tests/classroom-board-tally-threshold.test.js` |
| C | Sonnet | `cr/railway-server/activities/U1.2.json`, `LEVEL_DESIGN_RECIPE.md` | (validation lint only; no test file) |

A, B, C are file-disjoint and parallel-safe. No shared mutations.

### Per-agent prompt template

Each agent receives:
1. This V7.7 BUILD doc (path).
2. Their Unit's section + the constraint carry-forward.
3. Their own files-to-touch list + a "do NOT touch outside this list"
   line.
4. Reference: U1.1.json for the V7.5 multi-stage + Key pattern,
   `LIVE_CLASSROOM_V7_PICO_PARITY_SPEC.md` for the broader arc.

## Codex review

After all 3 units land + tests green, run a Codex review via
`cross-agent.py codex-to-cc` against the combined fa + cr diff.
Codex pattern: BLOCKER + MAJOR + MINOR call-out per file. Fold
inline. Per the V7.5/V7.6 lesson: if the combined diff exceeds
~35 KB, fall back to CC self-review of documented risk areas
(threshold gate, TallyDisplay backward compat, U1.2 ASCII safety,
wire field nullability).

## Acceptance criteria

- cr tests: **246 + 12-15 new = 258-261 passing**, zero regression.
- fa tests: **363 (subset) + 10-12 new = 373-375 passing**, zero
  regression.
- U1.2 JSON validates against the existing per-level lint:
  - parses as JSON
  - `schema: "v7-level-1"`
  - `chipSize: 10`, `map.height <= 8`, `map.width <= 32`
  - actors x in [0, 32), y in [0, 8)
  - exactly ONE `correct: true` per stage
  - reflection strings on all wrong doors
  - ASCII-only, LF line endings
- Backward compat: U1.1.json still loads + plays end-to-end through
  V7.5/V7.6 logic unchanged (the Tally gate is opt-in).
- Codex review: 0 BLOCKER unresolved post-fold.

## Out of scope for V7.7

- The other 78 levels stay unchanged this sprint. They get Tally
  (where mapped) during the Tier 3 authoring fan-out batch AFTER
  the engine sprints all ship.
- `Watch`, `WeightedLift`, `Seesaw`, `Switch+Block`, `TrafficLight`,
  `Bound` actors -- those are V7.8-V7.12.
- Cockpit UI changes for the Tally HUD (the cockpit just renders
  whatever the Desk classroom-board does; no separate cockpit code
  path for HUDs).
- Telemetry / per-tally analytics -- no new fields beyond the
  existing classroom_activity_state broadcast.

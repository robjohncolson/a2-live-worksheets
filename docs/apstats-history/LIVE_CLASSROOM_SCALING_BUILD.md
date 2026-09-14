# LIVE_CLASSROOM_SCALING -- Build Contract (FROZEN)

Session 111, 2026-05-23. Design: `LIVE_CLASSROOM_SCALING_SPEC.md` (Knob 1
only -- Knob 2 is "already in place / docs only" and Knob 3 is "out of
scope while one section == one room"). This contract is FROZEN --
implement it verbatim. Do NOT improvise constant names, helper
signatures, or threshold values.

## Correction (planner-verify, session 111)

The Unit C threshold-map and boundary `it(...)` blocks (as originally
frozen below) anchored `n1` with a leading `t.advance(100); t.p.update(...)`.
That holds for the 100 ms row but produces `n1 = 0` for any row whose
interval > 100 ms -- the gate never opens at the 100 ms mark, so the
very next `t.advance(...)` then fires the FIRST emit and breaks the
`expect(t.emitted.length).toBe(n1)` assertion. Planner-verify caught it
on the first vitest run (7 / 13 new tests failed; the 100 ms row + the
back-compat case passed). The folded pattern advances past the FIRST
gate of the row under test before anchoring `n1`:

```js
t.advance(GATE_MS); t.p.update(0.016);
var n1 = t.emitted.length;
expect(n1).toBeGreaterThanOrEqual(1);
t.advance(GATE_MS - 1); t.p.update(0.016);
expect(t.emitted.length).toBe(n1);
t.advance(1); t.p.update(0.016);
expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
```

The verbatim Unit C block below is left as-frozen (history). The
in-tree tests reflect the folded pattern.

## Correction (Codex read-only review, session 111)

Codex found one MAJOR + two MINOR; all folded.

- **MAJOR (`classroom-board.js`:moving branch):** `_restEmitted` was
  cleared only INSIDE the gate-open path. At the scaled 200/300/500 ms
  intervals a brief move (press + release inside the gate) emitted
  NEITHER a moving frame NOR a rest snapshot -- the next idle tick
  suppressed the rest path because `_restEmitted` was still `true` from
  the prior idle. Observers missed the entire displacement. **Folded:**
  clear `_restEmitted` unconditionally on every moving tick, BEFORE the
  gate check; the rest path is then guaranteed to emit once when motion
  ends. Pre-existing latent bug that the scaled cadence made hit-able.
- **MINOR 1:** the new describe block did not exercise the brief-move
  case the MAJOR describes. **Folded:** added a new `it(...)` "rest
  snapshot fires after a brief move that does not trip the cadence gate
  (large room)" that drives a sub-gate burst and asserts exactly one
  rest snapshot fires on release.
- **MINOR 2:** the boundary suite tested 1/8/9/21/41 but never the
  exact upper bounds of rows 2 and 3 (20 and 40). **Folded:** added
  `boundary: 20 members ...` and `boundary: 40 members ...` `it`s.

Post-fold vitest baseline: 4899 / 4900 (the one fail is the unrelated
long-standing `tests/study-guide.test.js`).

## Goal

Scale the `classroom_pos` emit interval to the observed room size so the
WS traffic stays bounded as a section's roster grows. Today the rate is
a constant `POS_RATE_MS = 100` (10 Hz while moving, one rest snapshot,
then 0 Hz until the next input). After this work the rate is a
threshold-mapped lookup on `members.length`. No protocol change.

## Dependency analysis

The change touches THREE files, each in DIFFERENT directories:

- `classroom-board.js` -- the implementation (Unit A).
- `tests/classroom-structure.test.js` -- structure pins (Unit B).
- `tests/classroom-board.test.js` -- behaviour tests (Unit C).

Units B and C do NOT depend on Unit A's actual output -- they pin /
exercise the contract spelled out below. All three units can run in
PARALLEL, reading only this contract for their source of truth. The
planner re-verifies on disk after all three land.

## The contract -- verbatim text

Every Sonnet unit reads from this block. Every symbol name, every
threshold, every comment is part of the contract. Do not paraphrase.

### C1. Threshold table

REPLACES the existing `var POS_RATE_MS = 100;` line at
`classroom-board.js:106`.

```js
  // LIVE_CLASSROOM_SCALING knob 1 -- emit cadence scales to room size.
  // Each row is [memberCountUpperBound, intervalMs]; the LAST row's bound
  // is Infinity so any larger room maps to its interval. Tuning is
  // one-line: edit a row's intervalMs to widen/narrow the cadence.
  var POS_RATE_TABLE = [
    [8,        100],   // <= 8 members         -> 10 Hz   (was POS_RATE_MS)
    [20,       200],   //  9 - 20 members      ->  5 Hz
    [40,       300],   // 21 - 40 members      ->  3.33 Hz
    [Infinity, 500]    // > 40 members         ->  2 Hz
  ];
```

### C2. Module-scope helper

ADDED immediately after the `POS_RATE_TABLE` block.

```js
  // Look up the broadcast interval for a given room size. Linear scan --
  // POS_RATE_TABLE has 4 rows, branch-prediction-friendly. Falls through
  // to the last row's value (the Infinity bound guarantees a match).
  function _currentEmitRateMs(memberCount) {
    var n = (typeof memberCount === 'number' && memberCount > 0) ? memberCount : 1;
    for (var i = 0; i < POS_RATE_TABLE.length; i++) {
      if (n <= POS_RATE_TABLE[i][0]) { return POS_RATE_TABLE[i][1]; }
    }
    return POS_RATE_TABLE[POS_RATE_TABLE.length - 1][1];
  }
```

### C3. PlayerSprite opts plumbing

ADDED to the PlayerSprite constructor in the same block as `this.onPos`
/ `this._now`, immediately after the existing
`this._restEmitted = false;` line (currently `classroom-board.js:679`).

```js
    // LIVE_CLASSROOM_SCALING knob 1 -- room-size source. mount() supplies
    // a closure over state.members so the emit gate can read the live
    // count each tick. Default returns 1 -- a sprite with no roommates
    // is just the local player, so 10 Hz is the right back-compat rate
    // for tests / harness code that omits this opt.
    this._getMemberCount = (typeof opts.getMemberCount === 'function')
      ? opts.getMemberCount
      : function () { return 1; };
```

### C4. Emit gate

REPLACES the current `if (now - this._lastPosMs >= POS_RATE_MS) {` line
(currently `classroom-board.js:885`).

```js
        if (now - this._lastPosMs >= _currentEmitRateMs(this._getMemberCount())) {
```

The TWO surrounding lines (the `if (moving) {` opener two lines above
and the `try { this.onPos(...); ... this._lastPosMs = now; ...` body)
are UNCHANGED. Only the comparison's right-hand side changes.

### C5. mount() / addSprite wiring

ADDED to the `isLocal` branch of `addSprite` in `mount()`, immediately
after the existing `baseOpts.canvasW = function () { ... };` block and
BEFORE the existing `baseOpts.onPos = function (msg) { ... };` block
(currently around `classroom-board.js:1595`).

```js
        // LIVE_CLASSROOM_SCALING knob 1 -- live room-size source.
        // Reads state.members through the mount-scope closure on each
        // tick; no protocol change, no caching (Object.keys is cheap at
        // class scale).
        baseOpts.getMemberCount = function () {
          return Object.keys(state.members).length;
        };
```

## Unit A -- classroom-board.js

Apply C1, C2, C3, C4, C5 verbatim. Preserve EOL (this file is LF). No
other change. No removal of the existing `Phase 2 -- broadcast position`
comment in `update()`; the gate comment remains the same.

A grep `POS_RATE_MS` in `classroom-board.js` AFTER your edit must return
ZERO hits (the constant is removed; no transitional alias). `git diff`
must touch only this file and only these regions.

## Unit B -- tests/classroom-structure.test.js

REPLACE the two existing pins:

- L699-L701: the `defines POS_RATE_MS (100 ms = 10 Hz)` `it(...)` block.
- L708-L713: the `PlayerSprite.update emits at 10 Hz while moving + one
  rest snapshot` `it(...)` block (keep its OUTER `it(...)` text identical
  but replace its body so the second `expect` reads
  `_currentEmitRateMs(this._getMemberCount())`).

Use this REPLACEMENT block (entire `it`s replaced; surrounding describe
header and the L703-706 `onPos + _now` test are UNTOUCHED):

```js
  it('defines POS_RATE_TABLE (size -> interval, ms) replacing POS_RATE_MS', () => {
    expect(BOARD).toMatch(/var\s+POS_RATE_TABLE\s*=\s*\[/);
    expect(BOARD).toMatch(/\[\s*8\s*,\s*100\s*\]/);
    expect(BOARD).toMatch(/\[\s*20\s*,\s*200\s*\]/);
    expect(BOARD).toMatch(/\[\s*40\s*,\s*300\s*\]/);
    expect(BOARD).toMatch(/\[\s*Infinity\s*,\s*500\s*\]/);
    // The pre-scaling constant must be GONE -- no transitional alias.
    expect(BOARD).not.toMatch(/var\s+POS_RATE_MS\b/);
  });

  it('exposes _currentEmitRateMs(memberCount) -> intervalMs helper', () => {
    expect(BOARD).toMatch(/function\s+_currentEmitRateMs\s*\(\s*memberCount\s*\)/);
  });

  it('PlayerSprite reads opts.getMemberCount (default returns 1)', () => {
    expect(BOARD).toMatch(/this\._getMemberCount\s*=\s*\(\s*typeof\s+opts\.getMemberCount\s*===\s*['"]function['"]\s*\)/);
  });

  it('PlayerSprite.update emits at the room-size-scaled cadence + one rest snapshot', () => {
    // Emit gate reads the threshold-mapped interval; rest-snapshot rule unchanged.
    expect(BOARD).toMatch(/now\s*-\s*this\._lastPosMs\s*>=\s*_currentEmitRateMs\(\s*this\._getMemberCount\(\)\s*\)/);
    expect(BOARD).toMatch(/this\._restEmitted\s*=\s*true/);
  });

  it('addSprite wires baseOpts.getMemberCount on the local PlayerSprite branch', () => {
    expect(BOARD).toMatch(/baseOpts\.getMemberCount\s*=\s*function\s*\(\s*\)\s*\{\s*\n?\s*return\s+Object\.keys\(\s*state\.members\s*\)\.length\s*;\s*\}/);
  });
```

Acceptance: the existing `PlayerSprite carries onPos + an injectable _now
clock` pin (L703-706) MUST still pass unmodified. The four
`mount() wires onPos`, `applyMessage dispatches`, `applyPos ignores
self echoes`, etc. pins below MUST still pass unmodified.

## Unit C -- tests/classroom-board.test.js

Extend the existing `makePSpec(extra)` helper (around L4499-L4518) so the
caller can override `getMemberCount`. The shape of the harness is
unchanged; just add a default `getMemberCount` to the inline `opts`
object so existing callers keep emitting at 10 Hz.

CHANGE inside `makePSpec`:

```js
    var opts = {
      x: 100, y: 200, scale: 0.25, hue: 0, online: true, label: 'me',
      input:   { left: false, right: false, jump: false, up: false },
      peers:   function () { return {}; },
      canvasW: function () { return 400; },
      onPos:   function (msg) { emitted.push({ x: msg.x, y: msg.y, state: msg.state, vx: msg.vx, t: stubClock }); },
      now:     function () { return stubClock; },
      getMemberCount: function () { return 1; }   // default: small room => 10 Hz (back-compat)
    };
```

Then ADD a NEW describe block AT THE END of the file (after the last
existing `describe` / `}` -- preserve a trailing newline). The block:

```js
// =============================================================
// LIVE_CLASSROOM_SCALING knob 1 -- room-size-scaled emit cadence
// =============================================================

describe('classroom-board -- scaling: rate adaptation by room size', () => {

  // Re-declare the helpers needed by this block; they mirror the harness
  // used by the Phase-2 emit-cadence tests above so the cadence math is
  // exercised end-to-end through the real PlayerSprite.update path.
  function makeBoardLocal() { return makeBoard(); }
  function makePSpecMembers(memberCount) {
    var m  = makeBoardLocal();
    var ss = new m.win.SpriteSheet('sprite.png', 80, 96, {});
    var emitted   = [];
    var stubClock = 0;
    var opts = {
      x: 100, y: 200, scale: 0.25, hue: 0, online: true, label: 'me',
      input:   { left: false, right: false, jump: false, up: false },
      peers:   function () { return {}; },
      canvasW: function () { return 400; },
      onPos:   function (msg) { emitted.push({ x: msg.x, y: msg.y, state: msg.state, vx: msg.vx, t: stubClock }); },
      now:     function () { return stubClock; },
      getMemberCount: function () { return memberCount; }
    };
    var p = new m.ClassroomBoard._PlayerSprite(ss, opts);
    return {
      p: p, opts: opts, emitted: emitted,
      advance: function (ms) { stubClock += ms; }
    };
  }

  // -- threshold map --

  it('threshold map: <=8 members -> 100 ms (10 Hz)', () => {
    var t = makePSpecMembers(8);
    t.opts.input.right = true;
    // First moving tick: emits immediately (lastPosMs starts at 0).
    t.advance(100); t.p.update(0.016);
    var n1 = t.emitted.length;
    expect(n1).toBeGreaterThanOrEqual(1);
    // After 99 ms, gate must NOT release (100 ms threshold).
    t.advance(99);  t.p.update(0.016);
    expect(t.emitted.length).toBe(n1);
    // After +1 ms (total 100 ms since last emit), it WILL release.
    t.advance(1);   t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  it('threshold map: 9-20 members -> 200 ms (5 Hz)', () => {
    var t = makePSpecMembers(15);
    t.opts.input.right = true;
    t.advance(100); t.p.update(0.016);
    var n1 = t.emitted.length;
    t.advance(199); t.p.update(0.016);
    expect(t.emitted.length).toBe(n1);
    t.advance(1);   t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  it('threshold map: 21-40 members -> 300 ms (3.33 Hz)', () => {
    var t = makePSpecMembers(30);
    t.opts.input.right = true;
    t.advance(100); t.p.update(0.016);
    var n1 = t.emitted.length;
    t.advance(299); t.p.update(0.016);
    expect(t.emitted.length).toBe(n1);
    t.advance(1);   t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  it('threshold map: >40 members -> 500 ms (2 Hz)', () => {
    var t = makePSpecMembers(50);
    t.opts.input.right = true;
    t.advance(100); t.p.update(0.016);
    var n1 = t.emitted.length;
    t.advance(499); t.p.update(0.016);
    expect(t.emitted.length).toBe(n1);
    t.advance(1);   t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  // -- boundary values: confirm the table is left-closed (n <= bound) --

  it('boundary: 1 member maps to 100 ms (10 Hz)', () => {
    var t = makePSpecMembers(1);
    t.opts.input.right = true;
    t.advance(100); t.p.update(0.016);
    var n1 = t.emitted.length;
    t.advance(99);  t.p.update(0.016);
    expect(t.emitted.length).toBe(n1);
    t.advance(1);   t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  it('boundary: 9 members maps to 200 ms (just past the 10 Hz row)', () => {
    var t = makePSpecMembers(9);
    t.opts.input.right = true;
    t.advance(100); t.p.update(0.016);
    var n1 = t.emitted.length;
    t.advance(150); t.p.update(0.016);
    expect(t.emitted.length).toBe(n1);          // still below 200 ms
    t.advance(50);  t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  it('boundary: 21 members maps to 300 ms (just past the 5 Hz row)', () => {
    var t = makePSpecMembers(21);
    t.opts.input.right = true;
    t.advance(100); t.p.update(0.016);
    var n1 = t.emitted.length;
    t.advance(250); t.p.update(0.016);
    expect(t.emitted.length).toBe(n1);          // still below 300 ms
    t.advance(50);  t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  it('boundary: 41 members maps to 500 ms (just past the 3.33 Hz row)', () => {
    var t = makePSpecMembers(41);
    t.opts.input.right = true;
    t.advance(100); t.p.update(0.016);
    var n1 = t.emitted.length;
    t.advance(400); t.p.update(0.016);
    expect(t.emitted.length).toBe(n1);          // still below 500 ms
    t.advance(100); t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

  // -- the rest-snapshot rule is independent of the cadence --

  it('rest snapshot still fires exactly once when motion stops (large room)', () => {
    var t = makePSpecMembers(30);
    t.opts.input.right = true;
    t.advance(100); t.p.update(0.016);
    var nMoving = t.emitted.length;
    expect(nMoving).toBeGreaterThanOrEqual(1);
    // Release; one rest snapshot expected.
    t.opts.input.right = false;
    t.advance(100); t.p.update(0.016);
    expect(t.emitted.length).toBeGreaterThanOrEqual(nMoving + 1);
    var nAfterRest = t.emitted.length;
    // Long quiet -- no re-emit regardless of cadence row.
    t.advance(2000); t.p.update(0.016);
    expect(t.emitted.length).toBe(nAfterRest);
  });

  // -- back-compat: no getMemberCount supplied --

  it('back-compat: PlayerSprite without opts.getMemberCount defaults to 10 Hz', () => {
    var m  = makeBoardLocal();
    var ss = new m.win.SpriteSheet('sprite.png', 80, 96, {});
    var emitted   = [];
    var stubClock = 0;
    var opts = {
      x: 100, y: 200, scale: 0.25, hue: 0, online: true, label: 'me',
      input:   { left: false, right: false, jump: false, up: false },
      peers:   function () { return {}; },
      canvasW: function () { return 400; },
      onPos:   function (msg) { emitted.push({ x: msg.x, y: msg.y, state: msg.state, vx: msg.vx, t: stubClock }); },
      now:     function () { return stubClock; }
      // NOTE: getMemberCount intentionally omitted.
    };
    var p = new m.ClassroomBoard._PlayerSprite(ss, opts);
    opts.input.right = true;
    stubClock += 100; p.update(0.016);
    var n1 = emitted.length;
    expect(n1).toBeGreaterThanOrEqual(1);
    stubClock += 99;  p.update(0.016);
    expect(emitted.length).toBe(n1);             // gate at 100 ms not yet open
    stubClock += 1;   p.update(0.016);
    expect(emitted.length).toBeGreaterThanOrEqual(n1 + 1);
  });

});
```

## Acceptance

After A + B + C land:

1. `git diff` touches ONLY: `classroom-board.js`,
   `tests/classroom-structure.test.js`, `tests/classroom-board.test.js`,
   and this contract file (untracked -> tracked).
2. Root vitest baseline pre-change is **4883 / 4884** (the one fail is
   the long-standing unrelated `tests/study-guide.test.js`). Post-change
   must be **>= 4883 + new-test-count** passing, with the same single
   long-standing fail untouched.
3. Grep `POS_RATE_MS` in `classroom-board.js` returns ZERO hits.
4. Grep `POS_RATE_TABLE` and `_currentEmitRateMs` in `classroom-board.js`
   each return >=1 hit.
5. Grep `_getMemberCount` in `classroom-board.js` returns >=2 hits (the
   constructor assignment + the emit-gate read).
6. Grep `baseOpts.getMemberCount` in `classroom-board.js` returns >=1
   hit (the mount/addSprite wiring on the isLocal branch).

## Out of scope (Knobs 2 + 3 of the spec)

Knob 2 (idle suppression) is already implemented (the `_restEmitted`
one-shot is unchanged by this work). Knob 3 (interest filtering) is
out of scope while one section == one room and is a future, multi-zone
follow-up. This contract implements ONLY Knob 1.

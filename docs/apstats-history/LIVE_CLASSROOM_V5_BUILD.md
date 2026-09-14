# LIVE_CLASSROOM V5 -- ColorBox-Hue Plugin (FROZEN)

Session 114, 2026-05-24. Second activity-engine plugin after the V4
bridge-mean. Demonstrates the plugin architecture by adding a category
sort activity at ~150 LoC of plugin code + a single Desk renderer file
+ a one-line engine extension. **Depends on V4 landing first.**

The `colorbox-hue` plugin is the kindergarten-of-categorical-data: each
student's pre-existing avatar `sprite_hue` (the color they picked at
sign-in via cr's hue picker) IS their categorical assignment. Four
colored zones render along the Desk's LC canvas; students physically
walk their avatar into the zone matching their own color; the cockpit
live-renders a bar chart of zone counts via the existing
`Ti84Plot.drawBarChart`. Mastery = every present student standing in
their CORRECT zone for 5 sustained seconds. On success, the override-
gate auto-fires for the U1.3 lesson (Categorical Variables).

This contract is FROZEN -- implement verbatim. **Land V4 first.**

## Pedagogy

U1 Topic 1.3 lesson opener (Displaying Categorical Data). Students
experience that EVERY student is a data point with a category, and
that a frequency table is the count of how many fall in each
category. The activity makes the *colorful sort* the data ritual
itself: the same hue that's been tinting their sprite all session
becomes the variable.

Why hue-as-variable beats auto-assigned:
- Uses pre-existing identity (the color was their choice)
- No "where's my color tag?" cognitive load -- look at your sprite
- Replays cleanly: every class session uses each student's same color
  consistently
- Sets up U1 Topic 1.4 (two-way tables) trivially -- add a second
  axis (e.g., dominant hand) and the same mechanic produces a
  contingency table

## Locked design dials (CC, session 114)

| Dial | Value |
|---|---|
| Number of zones | **4** (color-wheel quadrants) |
| Zone definition | Red (0°-89°), Yellow (90°-179°), Green (180°-269°), Blue (270°-359°) |
| Per-student category | Determined by `sprite_hue / 90` floor; NULL hue falls back to username-hash hue (same as the LC's render fallback) |
| Zone arrangement | Horizontal row of 4 rectangular zones along the bottom of the LC canvas, each `(canvas_width / 4)` wide |
| Mastery semantics | EVERY present student standing in their CORRECT zone (matching their hue's quadrant) for **5 sustained seconds** |
| Tick rate | 5 Hz (200 ms), same as V4 engine |
| Duration | 60 seconds default (shorter than bridge's 90; walking is faster than coordinating numerical nudges) |
| Failure flow | Same as V4: cockpit panel offers `Manual Advance / Show Hint / Retry`. No AI-tutor wiring. |
| Min class size | 2 online students |
| Mutex | One of `{gate, poll, doorways, activity}` at a time (engine-managed) |

## Dependency analysis

Cross-repo. Three units; A and B are file-disjoint and parallel; C is
tests.

- **Unit A** (cr `railway-server/classroom.js`): one engine signature
  extension (pass `room` to `onTick`) + the `colorbox-hue` plugin
  registration. ~120 LoC.
- **Unit B** (`activity-colorbox.js` new file + `ap_stats_roadmap_square_mode.html`):
  Desk renderer for the four colored zones + handle wiring + the
  cockpit dropdown adds one option. ~180 LoC.
- **Unit T**: tests both repos.

## Engine extension (single change to V4)

V4 plugin interface adds ONE optional method and ONE signature change:

```js
// Plugin interface v5:
{
  // ...all V4 methods unchanged...
  onTick(state, deltaMs, room) -> nextState,  // CHANGED: room is now the 3rd arg
}
```

V4 engine update:

```js
// In activityTick(now):
var nextState = plugin.onTick(room.activity.state, 200, room);  // <- room added
```

The bridge-mean plugin in V4 ignores `room` (signature compatible).
The colorbox-hue plugin USES `room` to read live avatar positions
from `room.members.get(username).pos`.

No new WS messages, no new room state slots, no new mutexes. The
engine architecture from V4 carries V5 without further change.

## C2. The colorbox-hue plugin (server)

```js
var COLORBOX_HUE_HOLD_TARGET_MS = 5000;
var COLORBOX_HUE_ZONES = [
  { id: 0, label: 'Red',    hueMin:   0, hueMax:  89 },
  { id: 1, label: 'Yellow', hueMin:  90, hueMax: 179 },
  { id: 2, label: 'Green',  hueMin: 180, hueMax: 269 },
  { id: 3, label: 'Blue',   hueMin: 270, hueMax: 359 }
];

// Same username-hash fallback the LC render layer uses for hue-less
// members. Stable per username so a student's "category" is consistent
// across sessions.
function fallbackHueForUsername(username) {
  var h = 0;
  for (var i = 0; i < username.length; i++) {
    h = (h * 31 + username.charCodeAt(i)) & 0x7fffffff;
  }
  return h % 360;
}

function zoneForHue(hue) {
  var h = ((hue % 360) + 360) % 360;
  return Math.floor(h / 90);  // 0-3
}

activityPlugins['colorbox-hue'] = {
  minMembers: 2,

  initActivity: function (room, onlineStudents, opts) {
    // Each student's category is determined by their hue once at start.
    var assignments = {};
    onlineStudents.forEach(function (m) {
      var hue = (m.hue != null) ? m.hue : fallbackHueForUsername(m.username);
      assignments[m.username] = zoneForHue(hue);
    });
    return {
      assignments: assignments,
      currentZone: {},      // username -> zone id (or -1 if not in any zone)
      tally:       [0, 0, 0, 0],
      holdMs:      0,
      zones:       COLORBOX_HUE_ZONES.map(function (z) { return { id: z.id, label: z.label }; })
    };
  },

  // No student-side input message -- ColorBox piggybacks on the
  // existing classroom_pos broadcasts. The plugin reads avatar
  // positions via the room reference passed to onTick.
  onStudentInput: function (state, username, payload) { return null; },

  onTick: function (state, deltaMs, room) {
    // Compute current zone for each assigned student from member.pos.
    // Zones are 4 horizontal rectangles along the bottom of the canvas;
    // canvas width is sender-side; we use a logical [0..1] band for
    // zone hit-testing.
    //
    // The Desk's renderer paints zones aligned to the same canvas
    // coordinate space the server already knows from classroom_pos
    // broadcasts. The shared convention: zone i occupies the
    // horizontal band x in [i/4 * 320, (i+1)/4 * 320] (DEFAULT_BOARD_W
    // = 320). For a Desk canvas wider than 320 we still partition into
    // 4 equal columns; the client renderer matches.
    //
    // For simplicity v5 reads only x; y is ignored (any vertical
    // position counts as "in" the zone).
    var canvasW = 320;  // DEFAULT_BOARD_W -- matches the Desk's renderer
    var nextCurrent = {};
    var nextTally   = [0, 0, 0, 0];
    var allCorrect  = true;
    var anyAssigned = false;

    var keys = Object.keys(state.assignments);
    for (var k = 0; k < keys.length; k++) {
      anyAssigned = true;
      var uname = keys[k];
      var m = room.members.get(uname);
      if (!m || m.online === false) {
        nextCurrent[uname] = -1;
        if (state.assignments[uname] !== -1) { allCorrect = false; }
        continue;
      }
      var x = (m.pos && typeof m.pos.x === 'number') ? m.pos.x : 0;
      var zone = Math.max(0, Math.min(3, Math.floor(x / (canvasW / 4))));
      nextCurrent[uname] = zone;
      nextTally[zone]++;
      if (zone !== state.assignments[uname]) { allCorrect = false; }
    }

    if (!anyAssigned) { allCorrect = false; }

    var nextHoldMs = allCorrect ? (state.holdMs + deltaMs) : 0;
    return Object.assign({}, state, {
      currentZone: nextCurrent,
      tally:       nextTally,
      holdMs:      nextHoldMs
    });
  },

  isComplete: function (state) {
    return state.holdMs >= COLORBOX_HUE_HOLD_TARGET_MS;
  },

  onMemberLeave: function (state, username) {
    if (!(username in state.assignments)) return null;
    var next = Object.assign({}, state, {
      assignments: Object.assign({}, state.assignments),
      currentZone: Object.assign({}, state.currentZone)
    });
    delete next.assignments[username];
    delete next.currentZone[username];
    return next;
  },

  onMemberJoin: function (state, username) {
    // Re-look up the joining member's hue from the room. Engine passes
    // username only; the engine member-join hook is responsible for
    // wiring the room reference in V5 (signature extension).
    return null;  // handled by an engine join hook update -- see below
  },

  serializeForBoard: function (state) {
    return {
      assignments:  state.assignments,
      currentZone:  state.currentZone,
      tally:        state.tally,
      holdMs:       state.holdMs,
      holdTargetMs: COLORBOX_HUE_HOLD_TARGET_MS,
      zones:        state.zones
    };
  }
};
```

#### Engine join hook update

V4's `onMemberJoin` plugin hook takes `(state, username)`. V5 extends
it to `(state, username, room)` so a plugin can look up the joining
member's properties. Wire it in `activityOnMemberJoin(room, username)`:

```js
function activityOnMemberJoin(room, username) {
  if (!room.activity || room.activity.finished) return;
  var plugin = activityPlugins[room.activity.type];
  if (typeof plugin.onMemberJoin !== 'function') return;
  var next = plugin.onMemberJoin(room.activity.state, username, room);
  if (next) { room.activity.state = next; }
}
```

The colorbox-hue plugin's `onMemberJoin` becomes:

```js
onMemberJoin: function (state, username, room) {
  if (username in state.assignments) return null;
  var m = room.members.get(username);
  if (!m) return null;
  var hue = (m.hue != null) ? m.hue : fallbackHueForUsername(username);
  var next = Object.assign({}, state, {
    assignments: Object.assign({}, state.assignments)
  });
  next.assignments[username] = zoneForHue(hue);
  return next;
}
```

(The bridge-mean plugin's V4 `onMemberJoin(state, username)` is still
called as `(state, username, room)` -- it ignores the 3rd arg
silently. JavaScript permits this. No V4 code change required.)

## C3. activity-colorbox.js (Desk renderer, NEW file)

Single IIFE exposing `window.ActivityColorbox`:

```js
window.ActivityColorbox = {
  mount: function (mountEl, opts) -> handle,
  // handle: {
  //   destroy(),
  //   updateState(activityState),
  //   showOutcome('success' | 'timeout' | 'cancel')
  // }
};
```

Layout: a horizontal strip at the BOTTOM of the existing
classroom-board canvas, overlay-style (separate `<canvas>` rendered
on top of the existing board). The strip is `canvas_width × 40 px`:

```
┌────────────────────────────────┐
│                                │  <- existing classroom-board canvas
│   avatars walk freely here    │
│                                │
├──────┬──────┬──────┬──────────┤  <- 40px overlay below
│ RED  │ YELL │ GREN │  BLUE    │
│      │      │      │          │
└──────┴──────┴──────┴──────────┘
```

Renders:

- 4 colored zone rectangles (`fillStyle` per zone color, slight `globalAlpha=0.45`)
- Zone label centered in each zone (`monospace`, contrasting color)
- A tally count overlay at the top of each zone (the number of avatars
  currently in that zone)
- A small "✓" or "✗" indicator at the top of each zone showing whether
  the count matches the expected (= number of students whose hue
  assignment falls in that zone)
- A faint progress bar across the top showing `holdMs / holdTargetMs`
- On success: full-zone green flash for 1.5 seconds before destroy

The renderer does NOT draw avatars (the existing classroom-board
already does); it ONLY draws the zone overlay. The user's avatar walks
into a zone via the same arrow-key handler used everywhere else.

## C4. Cockpit (teacher-classroom.html)

The V4 activity-type dropdown gets one new option:

```html
<option value="colorbox-hue">U1.3 Sort by Color (categorical)</option>
```

`renderActivity(summary)` already routes by `summary.activity.type` --
add a `colorbox-hue` branch in the readout:

```js
if (summary.activity.type === 'colorbox-hue') {
  var s = summary.activity.state;
  var correct = 0;
  var keys = Object.keys(s.assignments);
  for (var i = 0; i < keys.length; i++) {
    if (s.currentZone[keys[i]] === s.assignments[keys[i]]) correct++;
  }
  readoutEl.textContent =
    'In correct zone: ' + correct + '/' + keys.length +
    ' | hold: ' + (s.holdMs/1000).toFixed(1) + 's / ' + (s.holdTargetMs/1000).toFixed(1) + 's' +
    ' | tally: R=' + s.tally[0] + ' Y=' + s.tally[1] + ' G=' + s.tally[2] + ' B=' + s.tally[3];
}
```

Optionally renders a `Ti84Plot.drawBarChart` of the live tally next
to the readout (using the new `drawBarChart` already in `ti84-plot.js`).

## C5. Desk mount wiring

In `_handleActivityState(summary)` (added in V4), branch on activity
type:

```js
function _activityRendererForType(type) {
  if (type === 'bridge-mean') return window.ActivityBridge;
  if (type === 'colorbox-hue') return window.ActivityColorbox;
  return null;
}

// In the activity-live branch:
var Renderer = _activityRendererForType(summary.activity.type);
if (Renderer && !activityHandle) {
  activityHandle = Renderer.mount(mountEl, {});
}
if (activityHandle) {
  activityHandle.updateState(summary.activity.state);
}
```

V5 generalizes V4's `activityBridgeHandle` to `activityHandle` (rename
during the V5 build).

## C6. Wire protocol

**Zero new message types.** ColorBox reuses:

- `classroom_activity_start` (V4)
- `classroom_activity_state` (V4)
- `classroom_activity_success / _timeout / _cancel / _error` (V4)
- `classroom_pos` (existing v3 P3) -- the student input channel

The `classroom_activity_state` payload's `state` block is plugin-typed;
ColorBox's serialized state shape is documented in C2.

## C7. Tests

#### Unit A tests (cr `railway-server/tests/classroom.activity.colorbox.test.js`)

- Plugin registry resolves `'colorbox-hue'`
- `initActivity` assigns zone-by-hue for each online student
- `initActivity` falls back to username hash when hue is null
- `zoneForHue` partitions correctly: 0°→0, 89°→0, 90°→1, 179°→1, 180°→2, 270°→3
- `zoneForHue` handles wraparound: 360°→0, -10°→3
- `onTick(state, dt, room)` reads `member.pos.x` and computes
  `currentZone` correctly
- `onTick` increments `holdMs` when ALL students in correct zone
- `onTick` resets `holdMs` on any out-of-zone student
- `isComplete` fires when `holdMs >= 5000`
- `onMemberJoin(state, username, room)` looks up hue and adds assignment
- `onMemberLeave` removes assignment + currentZone entry
- `serializeForBoard` returns the documented public shape
- Snapshot (`buildStatePayload`) serializes colorbox state
- Mutex still enforced: cannot start colorbox while bridge is live

Acceptance count: ≥ 18 cases.

#### Unit B tests (`tests/activity-colorbox.test.js`)

- `ActivityColorbox.mount` returns a handle with documented methods
- `updateState` renders 4 colored zones via `fillRect`
- `updateState` writes per-zone tally counts as text
- `updateState` writes ✓/✗ indicators per zone (matching expected
  count derived from `assignments`)
- Progress bar width matches `holdMs / holdTargetMs`
- `showOutcome('success')` renders green flash
- `destroy` removes the canvas element

Acceptance count: ≥ 7 cases.

#### Unit T -- engine signature compatibility

- V4's bridge-mean plugin still works with the new `onTick(state, dt, room)`
  signature (ignores `room`)
- V4's bridge-mean `onMemberJoin(state, username)` still works with
  the new `onMemberJoin(state, username, room)` signature (ignores `room`)
- Cockpit's `activity-type` dropdown lists both options after V5
  ships
- `_handleActivityState` dispatches the right renderer per activity
  type

Acceptance count: ≥ 4 cases.

## Acceptance (end-to-end smoke)

After Unit A + B + T land:

1. Open 3-5 student Desks (each picked a different hue at sign-in) +
   the cockpit.
2. Cockpit dropdown: select "U1.3 Sort by Color"; click Run Activity.
3. Four colored zones appear at the bottom of every student's LC
   canvas; cockpit readout shows `In correct zone: 0/N | hold: 0.0s`.
4. Students walk their avatars (left/right arrows) into the zone
   matching their own sprite color.
5. As students enter correct zones, cockpit's "In correct zone" count
   climbs; tally per zone updates live.
6. Once ALL students are in their correct zone, hold counter starts.
7. Hold ≥ 5s → success fires → green flash on every Desk → override-
   gate unlocks the U1.3 lesson on every student.
8. Retry: move someone out of zone mid-hold → counter resets → success
   doesn't fire until everyone is back.

## What this contract does NOT include (v5.1 / v6 candidates)

- **`colorbox-chi2` plugin** (U8): same zone layout + expected vs
  observed + `chi2GOFTest(observed, expected)` from the lifted
  stat-math + a final "reject / fail to reject" vote on a doorways
  sub-mode. ~150 additional LoC. Logical v5.1.
- **`colorbox-free` plugin** (U1.3 alt): no "correct" zone; mastery =
  every student standing in SOME zone for 5s. Useful when the
  pedagogical aim is "collect data," not "match to a known
  category."
- **Multi-column zones for two-way tables (U1.4)**: zones become a
  grid (rows × cols), each student in the cell defined by TWO
  categorical attributes (hue × dominant-hand). Cockpit renders a
  contingency table. ~250 LoC; would warrant its own V6 contract.
- **Per-lesson activity routing JSON** (`activities/<lesson-key>.json`):
  the cockpit dropdown is currently hardcoded; v5.1 could route on
  the currently-open lesson on the Desk.

## Build dispatch

After V4 lands and roster-server + cr are confirmed green: dispatch
Units A + B + T as 3 parallel Sonnet subagents against this frozen
contract; planner-verify (vitest both repos); Codex read-only review
(cross-repo: cr + follow-alongs); fold inline; commit + push both
repos.

## Why this is the right "second plugin" choice

- Adds the **second pedagogical pattern** (categorical sort vs
  numerical aggregate) -- proves the engine generalizes beyond
  bridge-mean
- Adds **zero new WS messages** -- proves the engine's input layer
  composes with existing channels
- Adds **one signature extension** (`onTick` gets `room`) -- the
  smallest possible engine change to support position-driven plugins
- Sets up V5.1 (chi-square) trivially -- same zones + a compute layer
  on top
- Sets up V6 (two-way tables) -- same zone idea, two-axis grid
- Reuses pre-existing data (sprite_hue) instead of introducing a new
  per-activity assignment, demonstrating that activities can layer on
  top of LC identity

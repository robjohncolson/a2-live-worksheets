# LIVE_CLASSROOM V4 -- Activity Engine + Bridge Plugin (FROZEN)

Session 114, 2026-05-24. Activity-mode foundation for the Live
Classroom. Generalizes the existing per-room "mode" slot (gate / poll
/ doorways) to support a `room.activity` slot driven by typed plugins.
Ships the first plugin -- **bridge-mean** -- which lifts a bridge to a
target mean as students nudge their assigned values; on success, the
existing override-gate auto-unlocks the lesson for every present
student.

The engine boundary is deliberately drawn so plugin #2 (ColorBox sort,
chi-square, LSRL push) is a small additive: register a plugin with five
methods, no engine change. v4 ships engine + plugin 1; v5 adds
plugin 2.

This contract is FROZEN -- implement verbatim.

## Pedagogy

U1 Day 1 (Topic 1.1, Introducing Statistics) lesson opener. Students
experience the mean as a property of the whole set; their individual
value contributes; the mean responds when anyone adjusts. Embodied
learning ritual, continuing the LC thesis of "in-world ritual instead
of verbal cold-call."

## Dependency analysis

Cross-repo. Five units; A-D are file-disjoint and run in parallel; T
collects tests across the four.

- **Unit A** (cr `railway-server/classroom.js` + `server.js`):
  server-side engine + bridge-mean plugin + 5 message handlers + tick
  loop + state snapshot extension + mutex extension.
- **Unit B** (`classroom-board.js`): board-side `_reduce` cases + the
  `summary.activity` field exposed via `onStateChange` + handle methods
  for plugin-side rendering hooks.
- **Unit C** (`teacher-classroom.html`): cockpit Run-Activity UI +
  cancel handler + activity panel section + result-on-timeout panel.
- **Unit D** (`ap_stats_roadmap_square_mode.html` + new
  `activity-bridge.js`): Desk bridge renderer + value-bubble overlay +
  arrow-key binding + success-fade-and-unlock flow.
- **Unit T**: tests both repos (Vitest for cr server, Vitest+jsdom for
  follow-alongs).

## Locked design dials (CC + teacher session 114)

| Dial | Value |
|---|---|
| Value range | `[1, 10]` integer, server-assigned at activity start |
| Target | Random int in `[3, 8]`, NEVER equal to `Math.round(mean(initialValues))` |
| Tolerance | Fixed `±0.3` |
| Target band visibility | Visible from activity start |
| Adjustment | `↑/↓` arrow keys, unlimited, no rate limit |
| Duration | 90 seconds, teacher-configurable on launch |
| Mastery | Class `mean(values)` inside band for **3 sustained seconds** |
| Mastery action | Existing override-gate auto-fires for every present student |
| Failure flow | Cockpit panel offers `Manual Advance / Show Hint / Retry`. No AI-tutor wiring (v5 candidate). |
| Min class size | 2 online students; under that the launch button is disabled with `"Need ≥2 students"` |
| Persistence | In-memory in `room.activity` (no DB migration) |
| Mutex | One of `{gate, poll, doorways, activity}` at a time |

## The contract -- verbatim

### C1. Activity Engine API (server)

The engine is a thin abstraction over a per-room activity slot. ONE
activity at a time per room; plugin determines the type-specific
behavior.

#### C1.1. Plugin interface

A plugin is a plain object registered to a server-side
`activityPlugins` map keyed by activity `type` string. v4 registers
exactly one plugin: `'bridge-mean'`.

```js
// activityPlugins[type] = {
//   minMembers,                              // int: minimum online students to launch
//   initActivity(room, online, opts) -> state, // server-side: builds initial activity state
//   onStudentInput(state, username, payload) -> nextState | null,  // null = no change / ignore
//   onTick(state, deltaMs) -> nextState,     // tick at ~5 Hz; computes derived (mean, holdMs, etc.)
//   isComplete(state) -> bool,               // true => engine fires success
//   serializeForBoard(state) -> publicState, // what classroom_activity_state carries
// }
```

`room.activity` has the engine-managed shell:

```js
room.activity = {
  type:        'bridge-mean',
  startedAt:   123,
  durationMs:  90000,
  state:       {...},     // plugin-managed
  finished:    false      // engine sets true on success/timeout/cancel
}
```

The engine is responsible for:

- Lifecycle messages (`classroom_activity_start`, `_state`, `_success`, `_timeout`, `_cancel`).
- Tick scheduling (`setInterval(200ms)` while `room.activity` is live and not finished).
- Mutual exclusion at start time.
- Member presence (online flips, leave, late join) — plugin reads `online` from
  the standard member record; engine does not synthesize members.
- Override-gate auto-fire on success (see C1.3).
- Cleanup on cancel / timeout / room-empty.

The plugin is responsible for:

- Computing the activity's domain state (values, mean, hold counter, etc.).
- Defining minimum members (gate at launch).
- Defining when the activity is complete.
- Defining the publishable shape (what reaches clients via
  `classroom_activity_state`).

#### C1.2. Server methods on `classroom.js`

Add new room field in `getOrCreateRoom`:

```js
activity: null,   // v4: { type, startedAt, durationMs, state, finished } | null
```

Add to `buildStatePayload(room)` so a late-joiner / cockpit refresh
hydrates current activity:

```js
activity: room.activity
  ? {
      type:        room.activity.type,
      durationMs:  room.activity.durationMs,
      startedAt:   room.activity.startedAt,
      finished:    room.activity.finished,
      state:       activityPlugins[room.activity.type].serializeForBoard(room.activity.state)
    }
  : null,
```

New engine methods (place after `closeDoorways`, before `position`):

```js
// startActivity(ws, type, opts, now) -> { broadcasts }
// Teacher-only. opts: { durationMs?, target?, tolerance? } -- plugin may use or ignore.
// Rejects when room.gate.armed || room.poll || room.doorways || room.activity (mutex).
// Rejects when online student count < plugin.minMembers.
function startActivity(ws, type, opts, now) {
  var entry = wsIndex.get(ws);
  if (!entry) return { broadcasts: [] };
  var room = classrooms.get(entry.section);
  if (!room) return { broadcasts: [] };
  var member = room.members.get(entry.username);
  if (!member || member.role !== 'teacher') return { broadcasts: [] };
  if (room.gate && room.gate.armed) return { broadcasts: [] };
  if (room.poll || room.doorways || room.activity) return { broadcasts: [] };
  var plugin = activityPlugins[type];
  if (!plugin) return { broadcasts: [] };
  // Count online students.
  var online = [];
  room.members.forEach(function (m) {
    if (m.role === 'student' && m.online !== false) { online.push(m); }
  });
  if (online.length < plugin.minMembers) {
    return { broadcasts: [{ sockets: [ws], payload: {
      type: 'classroom_activity_error', code: 'not-enough-members',
      minMembers: plugin.minMembers, online: online.length
    }}]};
  }
  var initialState = plugin.initActivity(room, online, opts || {});
  room.activity = {
    type:       type,
    startedAt:  now == null ? Date.now() : now,
    durationMs: (opts && typeof opts.durationMs === 'number') ? opts.durationMs : 90000,
    state:      initialState,
    finished:   false
  };
  // Reset every member's status -- fresh activity slot.
  room.members.forEach(function (m) { m.status = 'present'; });
  var payload = {
    type:       'classroom_activity_start',
    section:    entry.section,
    activity: {
      type:       type,
      startedAt:  room.activity.startedAt,
      durationMs: room.activity.durationMs,
      state:      plugin.serializeForBoard(initialState)
    }
  };
  var sockets = roomSockets(room, null);
  var broadcasts = [{ sockets: sockets, payload: payload }];
  _fanoutToMonitors(broadcasts);
  return { broadcasts: broadcasts };
}

// activityValue(ws, payload) -> { broadcasts }
// Student-only. Forwards to plugin.onStudentInput. Returns broadcasts
// from the next tick (no separate broadcast on input; the tick loop
// covers it). On nextState change, replaces room.activity.state.
function activityValue(ws, payload) {
  var entry = wsIndex.get(ws);
  if (!entry) return { broadcasts: [] };
  var room = classrooms.get(entry.section);
  if (!room || !room.activity || room.activity.finished) return { broadcasts: [] };
  var member = room.members.get(entry.username);
  if (!member || member.role !== 'student') return { broadcasts: [] };
  var plugin = activityPlugins[room.activity.type];
  if (!plugin) return { broadcasts: [] };
  var next = plugin.onStudentInput(room.activity.state, entry.username, payload);
  if (next) { room.activity.state = next; }
  return { broadcasts: [] };  // tick loop carries state out
}

// cancelActivity(ws) -> { broadcasts }
// Teacher-only. Sets finished=true, broadcasts cancel, schedules cleanup.
function cancelActivity(ws) {
  var entry = wsIndex.get(ws);
  if (!entry) return { broadcasts: [] };
  var room = classrooms.get(entry.section);
  if (!room || !room.activity) return { broadcasts: [] };
  var member = room.members.get(entry.username);
  if (!member || member.role !== 'teacher') return { broadcasts: [] };
  room.activity.finished = true;
  var payload = {
    type: 'classroom_activity_cancel', section: entry.section,
    activityType: room.activity.type
  };
  var sockets = roomSockets(room, null);
  var broadcasts = [{ sockets: sockets, payload: payload }];
  _fanoutToMonitors(broadcasts);
  // The tick loop drops finished activities on the next tick.
  return { broadcasts: broadcasts };
}
```

#### C1.3. Engine tick loop

Single `setInterval(200ms)` started per `getOrCreateRoom`, cleared on
room destruction:

```js
function activityTick(now) {
  classrooms.forEach(function (room, section) {
    if (!room.activity || room.activity.finished) return;
    var plugin = activityPlugins[room.activity.type];
    var elapsed = now - room.activity.startedAt;
    // Run plugin tick.
    var nextState = plugin.onTick(room.activity.state, 200);
    if (nextState) { room.activity.state = nextState; }
    // Success?
    if (plugin.isComplete(room.activity.state)) {
      room.activity.finished = true;
      var successPayload = {
        type: 'classroom_activity_success',
        section: section,
        activityType: room.activity.type,
        finalState: plugin.serializeForBoard(room.activity.state)
      };
      broadcastToRoom(room, successPayload);
      _fireOverrideGateForRoom(room, room.activity.type);
      return;
    }
    // Timeout?
    if (elapsed >= room.activity.durationMs) {
      room.activity.finished = true;
      var timeoutPayload = {
        type: 'classroom_activity_timeout',
        section: section,
        activityType: room.activity.type,
        finalState: plugin.serializeForBoard(room.activity.state)
      };
      broadcastToRoom(room, timeoutPayload);
      return;
    }
    // Normal tick -- broadcast state.
    var statePayload = {
      type: 'classroom_activity_state',
      section: section,
      activityType: room.activity.type,
      state: plugin.serializeForBoard(room.activity.state),
      elapsedMs: elapsed
    };
    broadcastToRoom(room, statePayload);
  });
}

function _fireOverrideGateForRoom(room, activityType) {
  // Calls into the existing lesson-unlock route on roster-server via a
  // fire-and-forget HTTP POST per online student. The lesson key comes
  // from the activity's plugin (the bridge-mean plugin maps to lesson
  // '1.1'; future plugins map elsewhere). Failures are logged but do
  // NOT block the success broadcast.
  var lessonKey = ACTIVITY_LESSON_MAP[activityType];
  if (!lessonKey) return;
  room.members.forEach(function (m) {
    if (m.role !== 'student' || m.online === false) return;
    _postOverrideGate(m.username, lessonKey, 'activity-' + activityType);
  });
}
```

(`ACTIVITY_LESSON_MAP['bridge-mean'] = '1.1'`.)

#### C1.4. server.js -- WS message dispatch

Add four new switch cases alongside the existing
`classroom_open_doorways` block:

```js
case 'classroom_activity_start': {
  // payload: { activityType, opts? }
  var result = classroom.startActivity(ws, data.activityType, data.opts, Date.now());
  result.broadcasts.forEach(broadcast);
  break;
}
case 'classroom_activity_value': {
  // payload: { ...plugin-specific }
  var result = classroom.activityValue(ws, data.payload || {});
  result.broadcasts.forEach(broadcast);
  break;
}
case 'classroom_activity_cancel': {
  var result = classroom.cancelActivity(ws);
  result.broadcasts.forEach(broadcast);
  break;
}
```

(No client→server `_state` / `_success` / `_timeout` -- those are
server→all broadcasts only.)

### C2. The bridge-mean plugin (server)

```js
var BRIDGE_MEAN_HOLD_TARGET_MS = 3000;
var BRIDGE_MEAN_TOLERANCE      = 0.3;

activityPlugins['bridge-mean'] = {
  minMembers: 2,

  initActivity: function (room, onlineStudents, opts) {
    // Assign random int [1,10] to each online student.
    var values = {};
    var initialMean = 0;
    onlineStudents.forEach(function (m) {
      var v = 1 + Math.floor(Math.random() * 10);
      values[m.username] = v;
      initialMean += v;
    });
    initialMean = initialMean / onlineStudents.length;
    // Pick target: random int [3, 8] but not equal to round(initialMean).
    var rounded = Math.round(initialMean);
    var candidates = [];
    for (var t = 3; t <= 8; t++) { if (t !== rounded) candidates.push(t); }
    var target = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      values:   values,
      target:   target,
      tolerance: BRIDGE_MEAN_TOLERANCE,
      currentMean: initialMean,
      holdMs:   0,
      lastTickAt: Date.now()
    };
  },

  onStudentInput: function (state, username, payload) {
    if (!payload || typeof payload.delta !== 'number') return null;
    // Only -1 or +1 deltas accepted; others ignored.
    var d = (payload.delta > 0) ? 1 : (payload.delta < 0) ? -1 : 0;
    if (d === 0) return null;
    if (!(username in state.values)) return null;
    var next = Object.assign({}, state);
    next.values = Object.assign({}, state.values);
    next.values[username] = Math.max(1, Math.min(10, state.values[username] + d));
    return next;
  },

  onTick: function (state, deltaMs) {
    // Drop usernames whose presence has gone offline (presence is the
    // member record; this plugin re-reads on each tick via the room
    // reference, but for simplicity we just trust the values map and
    // engine drops members on leave by deleting their value -- see
    // C1.5 leave hook).
    var keys = Object.keys(state.values);
    if (keys.length === 0) {
      return Object.assign({}, state, { currentMean: 0, holdMs: 0 });
    }
    var sum = 0;
    for (var i = 0; i < keys.length; i++) { sum += state.values[keys[i]]; }
    var mean = sum / keys.length;
    var inBand = Math.abs(mean - state.target) <= state.tolerance;
    var nextHoldMs = inBand ? (state.holdMs + deltaMs) : 0;
    return Object.assign({}, state, {
      currentMean: mean,
      holdMs:      nextHoldMs
    });
  },

  isComplete: function (state) {
    return state.holdMs >= BRIDGE_MEAN_HOLD_TARGET_MS;
  },

  serializeForBoard: function (state) {
    return {
      values:      state.values,
      target:      state.target,
      tolerance:   state.tolerance,
      currentMean: Math.round(state.currentMean * 100) / 100,
      holdMs:      state.holdMs,
      holdTargetMs: BRIDGE_MEAN_HOLD_TARGET_MS
    };
  }
};
```

#### C1.5. Engine member-leave hook

In the existing detach / sweep code, when a student member is removed
from `room.members`, ALSO remove their value from `room.activity.state.values`
if `room.activity?.type === 'bridge-mean'`. Generalize via a plugin
hook `onMemberLeave(state, username) -> nextState | null`:

```js
function activityOnMemberLeave(room, username) {
  if (!room.activity || room.activity.finished) return;
  var plugin = activityPlugins[room.activity.type];
  if (typeof plugin.onMemberLeave !== 'function') return;
  var next = plugin.onMemberLeave(room.activity.state, username);
  if (next) { room.activity.state = next; }
}

// bridge-mean plugin gets:
onMemberLeave: function (state, username) {
  if (!(username in state.values)) return null;
  var next = Object.assign({}, state, { values: Object.assign({}, state.values) });
  delete next.values[username];
  return next;
},

// And the symmetric onMemberJoin for late joiners:
onMemberJoin: function (state, username) {
  if (username in state.values) return null;  // re-join: keep value
  var v = 1 + Math.floor(Math.random() * 10);
  var next = Object.assign({}, state, { values: Object.assign({}, state.values) });
  next.values[username] = v;
  return next;
}
```

(`onMemberJoin` called from the existing join handler when
`room.activity && !room.activity.finished`.)

### C3. classroom-board.js (Unit B)

Add to `_reduce`:

```js
case 'classroom_activity_start':
  return Object.assign({}, state, {
    activity: {
      type:       message.activity.type,
      startedAt:  message.activity.startedAt,
      durationMs: message.activity.durationMs,
      state:      message.activity.state,
      finished:   false
    }
  });

case 'classroom_activity_state':
  if (!state.activity || state.activity.finished) return state;
  return Object.assign({}, state, {
    activity: Object.assign({}, state.activity, {
      state: message.state
    })
  });

case 'classroom_activity_success':
case 'classroom_activity_timeout':
case 'classroom_activity_cancel':
  if (!state.activity) return state;
  return Object.assign({}, state, {
    activity: Object.assign({}, state.activity, {
      finished:    true,
      finalState:  message.finalState || state.activity.state,
      outcome:     message.type === 'classroom_activity_success' ? 'success'
                 : message.type === 'classroom_activity_timeout' ? 'timeout' : 'cancel'
    })
  });
```

Add `activity` to `buildSummary` output (mirrors the existing `poll` field):

```js
return {
  // ...existing fields...
  activity: state.activity || null
};
```

Add to `classroom_state` snapshot case so a refresh hydrates correctly:

```js
activity: message.activity || null
```

Add to `state.activity` the same `Object.assign` preservation pattern
used for `state.poll` in every other case (don't drop activity on a
member update / heartbeat / etc.).

New handle method (after `setSelectMode`):

```js
sendActivityValue: function (payload) {
  if (!ws || ws.readyState !== 1) return false;
  try { ws.send(JSON.stringify({ type: 'classroom_activity_value', payload: payload })); }
  catch (_) { return false; }
  return true;
}
```

### C4. teacher-classroom.html (Unit C)

#### C4.1. Activity panel

Add a new section between `#doorways-section` and `#nudge-section`:

```html
<div id="activity-section" style="display:none">
  <h3>Run Activity</h3>
  <div class="row">
    <label>Activity:
      <select id="activity-type">
        <option value="bridge-mean">U1.1 Lift the Bridge (mean)</option>
      </select>
    </label>
    <label>Duration (s): <input id="activity-duration" type="number" min="30" max="300" value="90"></label>
  </div>
  <div class="row">
    <button type="button" id="btn-activity-start">Run Activity</button>
    <button type="button" id="btn-activity-cancel" style="display:none">Cancel Activity</button>
  </div>
  <div id="activity-status"></div>
  <div id="activity-live" style="display:none">
    <pre id="activity-readout"></pre>
    <ul id="activity-roster"></ul>
  </div>
  <div id="activity-result" style="display:none">
    <p id="activity-result-text"></p>
    <button type="button" id="btn-activity-advance">Manual Advance</button>
    <button type="button" id="btn-activity-hint">Show Hint</button>
    <button type="button" id="btn-activity-retry">Retry</button>
  </div>
</div>
```

Add to `setBoardSectionsVisible(on)`:

```js
var act = document.getElementById('activity-section');
if (act) act.style.display = disp;
```

Add to the `onStateChange` callback:

```js
renderActivity(summary);
```

`renderActivity(summary)` reads `summary.activity` and:

- Shows `#activity-live` while activity is live + not finished
- Renders `#activity-readout` with `mean / target / hold / remaining`
- Renders `#activity-roster` with `username: value (nudges)`
- Shows `#activity-result` when `summary.activity.finished` is true,
  populated with outcome-specific text
- Toggles `#btn-activity-start` vs `#btn-activity-cancel`
- Disables `#btn-activity-start` when `_lastSummary` shows
  `<2` online students OR any of `{gate, poll, doorways, activity}` is
  live (mutex parity)

`#btn-activity-start` click sends a raw WS msg via the board handle's
internal socket. Add a thin pass-through:

```js
function startActivity() {
  if (!boardHandle) return;
  var type = document.getElementById('activity-type').value;
  var duration = parseInt(document.getElementById('activity-duration').value, 10);
  // boardHandle exposes sendMessage from P3 -- reuse here.
  boardHandle.sendMessage({
    type: 'classroom_activity_start',
    activityType: type,
    opts: { durationMs: Math.max(30000, Math.min(300000, duration * 1000)) }
  });
}

function cancelActivity() {
  if (!boardHandle) return;
  boardHandle.sendMessage({ type: 'classroom_activity_cancel' });
}
```

(`boardHandle.sendMessage` was added in P3 for the nudge channel; reuse.)

### C5. ap_stats_roadmap_square_mode.html + activity-bridge.js (Unit D)

#### C5.1. New file `activity-bridge.js`

Single IIFE exposing `window.ActivityBridge` with:

```js
window.ActivityBridge = {
  mount: function (mountEl, opts) -> handle,   // creates a canvas in mountEl, returns handle
  // handle: {
  //   destroy(),
  //   updateState(activityState) -- redraws bridge + bubbles per state
  //   showOutcome('success' | 'timeout' | 'cancel')
  // }
};
```

The bridge canvas is ~320 wide, ~180 tall (or full container width
when present). Renders:

- Stone left platform with the avatars (placeholder dots labeled by
  username + current value bubble)
- A vertical gap
- Stone right platform with a goal door
- A rising bridge fragment in the gap; height ∝ `(currentMean - 1) / 9`
  of the gap height (so mean=1 = lowest, mean=10 = top)
- A green band overlay at the target ± tolerance (in the same coordinate
  scale)
- HUD: `mean / target / hold` text on top

Uses no PixiJS or new library; raw 2D canvas (mirroring `classroom-board.js`
style).

#### C5.2. Desk script hook in `ap_stats_roadmap_square_mode.html`

Load `activity-bridge.js` next to `classroom-board.js`:

```html
<script src="classroom-board.js"></script>
<script src="activity-bridge.js"></script>
```

In `_mountClassroomBoard` (after `onStateChange` wiring), set up an
activity bridge that mounts/unmounts on `summary.activity` transitions:

```js
var activityBridgeHandle = null;
var activityBridgeMount = null;

// Inside the existing onStateChange (or a sibling helper):
function _handleActivityState(summary) {
  if (summary.activity && !summary.activity.finished) {
    if (!activityBridgeHandle && typeof window.ActivityBridge !== 'undefined') {
      activityBridgeMount = document.createElement('div');
      activityBridgeMount.id = 'activity-bridge-mount';
      activityBridgeMount.style.cssText = 'margin-top:8px;width:100%';
      // Insert above the classroom-board-mount so the bridge is the focus.
      var board = document.getElementById('classroom-board-mount');
      if (board && board.parentNode) {
        board.parentNode.insertBefore(activityBridgeMount, board);
      }
      activityBridgeHandle = window.ActivityBridge.mount(activityBridgeMount, {});
    }
    if (activityBridgeHandle) {
      activityBridgeHandle.updateState(summary.activity.state);
    }
  } else if (summary.activity && summary.activity.finished) {
    if (activityBridgeHandle) {
      activityBridgeHandle.showOutcome(summary.activity.outcome);
      // Tear down after 2.5s so the success animation reads.
      setTimeout(function () {
        if (activityBridgeHandle) {
          activityBridgeHandle.destroy();
          activityBridgeHandle = null;
        }
        if (activityBridgeMount && activityBridgeMount.parentNode) {
          activityBridgeMount.parentNode.removeChild(activityBridgeMount);
          activityBridgeMount = null;
        }
      }, 2500);
    }
  } else {
    // No activity. Ensure clean teardown if anything stale.
    if (activityBridgeHandle) {
      activityBridgeHandle.destroy();
      activityBridgeHandle = null;
    }
    if (activityBridgeMount && activityBridgeMount.parentNode) {
      activityBridgeMount.parentNode.removeChild(activityBridgeMount);
      activityBridgeMount = null;
    }
  }
}
```

Arrow-key binding (only while activity is live + this Desk is in the
section + this user is a student in the activity's values map):

```js
window.addEventListener('keydown', function (e) {
  if (!_classroomBoardHandle) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  if (!_lastClassroomSummary || !_lastClassroomSummary.activity
      || _lastClassroomSummary.activity.finished) return;
  var me = (window.rosterClient && window.rosterClient.current() || {}).username;
  if (!me || !(me in _lastClassroomSummary.activity.state.values)) return;
  e.preventDefault();
  _classroomBoardHandle.sendActivityValue({ delta: (e.key === 'ArrowUp') ? 1 : -1 });
});
```

(`_lastClassroomSummary` is the existing closure-scope variable in
`_mountClassroomBoard`'s onStateChange.)

NOTE: the existing `PlayerSprite` keyboard handling in classroom-board.js
binds the SAME arrows. Add a gate: when an activity is live AND this
Desk's user is in the values map, the PlayerSprite handler must
short-circuit on ArrowUp / ArrowDown -- otherwise both fire. The
gate is read from `state.activity`.

### C6. Wire protocol summary

| Type | Direction | Payload |
|---|---|---|
| `classroom_activity_start` | Teacher → server | `{ activityType, opts?: { durationMs?, target?, tolerance? } }` |
| `classroom_activity_start` | Server → all | `{ section, activity: { type, startedAt, durationMs, state } }` |
| `classroom_activity_value` | Student → server | `{ payload: { ...plugin-specific } }` (bridge-mean: `{ delta: ±1 }`) |
| `classroom_activity_state` | Server → all (5 Hz while live) | `{ section, activityType, state, elapsedMs }` |
| `classroom_activity_success` | Server → all | `{ section, activityType, finalState }` |
| `classroom_activity_timeout` | Server → all | `{ section, activityType, finalState }` |
| `classroom_activity_cancel` | Teacher → server | `{}` |
| `classroom_activity_cancel` | Server → all | `{ section, activityType }` |
| `classroom_activity_error` | Server → 1 ws | `{ code, ...details }` (e.g., `not-enough-members`) |

### C7. Tests

#### Unit A tests (cr `railway-server/tests/classroom.activity.test.js`)

- Engine plugin registry resolves `'bridge-mean'`
- `startActivity` rejects non-teacher
- `startActivity` rejects when mutex (gate / poll / doorways / activity)
- `startActivity` rejects when online students < `minMembers`, returns
  `classroom_activity_error{code:'not-enough-members'}` to the caller
- `startActivity` assigns values [1,10] to each online student
- `startActivity` picks target in [3,8], NOT equal to `Math.round(initialMean)`
- `activityValue` clamps delta to ±1 and clamps values to [1,10]
- `activityValue` ignored when not a student / not in values map
- `activityTick` increments `holdMs` while in band, resets on exit
- `activityTick` fires `classroom_activity_success` when `holdMs ≥ 3000`
  AND broadcasts to room + monitors
- `activityTick` fires `classroom_activity_timeout` at `elapsed ≥ durationMs`
- `cancelActivity` sets finished + broadcasts cancel
- Member leave during activity drops their value from state
- Member join during live activity assigns a value
- Snapshot (`buildStatePayload`) includes serialized activity for late-joiners

Acceptance count: ≥ 28 cases.

#### Unit B tests (`tests/classroom-board-activity.test.js`)

- `_reduce` on `classroom_activity_start` sets state.activity
- `_reduce` on `classroom_activity_state` updates state.activity.state
- `_reduce` on `classroom_activity_success/timeout/cancel` sets `finished + outcome`
- `_reduce` preserves state.activity across unrelated cases (heartbeat / member-update / etc.)
- `buildSummary` exposes `activity` field
- `classroom_state` snapshot hydrates `activity`
- `handle.sendActivityValue` sends correct JSON when WS is open
- `handle.sendActivityValue` returns false when WS is not ready

Acceptance count: ≥ 12 cases.

#### Unit C tests (extend `tests/poll-archive-cockpit.test.js` OR new
`tests/cockpit-activity.test.js`)

- Activity section hidden by default; visible after `setBoardSectionsVisible(true)`
- Start button disabled when `_lastSummary.activity` is live (mutex)
- Start button disabled when online student count < 2
- Click on `#btn-activity-start` sends `classroom_activity_start` via WS
- `renderActivity` populates readout from `summary.activity.state`
- Cancel button visible while activity live
- Result panel visible after `finished`; outcome text matches

Acceptance count: ≥ 8 cases.

#### Unit D tests (`tests/activity-bridge.test.js` + `tests/desk-activity-kbd.test.js`)

- `ActivityBridge.mount` returns a handle with `destroy / updateState / showOutcome`
- `updateState` redraws (fillRect background + bridge height fillRect)
- Bridge height scales with currentMean (mean=1 → bottom, mean=10 → top)
- Green band rendered at target position
- `showOutcome('success')` renders success animation
- Desk arrow-key handler fires `sendActivityValue` when activity is live
  AND user is in values map
- Arrow-key handler NO-OP when activity is not live
- Arrow-key handler NO-OP when user is NOT in values map (e.g., teacher)
- PlayerSprite arrow-key handler short-circuits while activity active

Acceptance count: ≥ 12 cases.

## Acceptance (end-to-end smoke)

After all four units land and the engine boots:

1. Open 3+ student Desks signed in to the same section + the cockpit.
2. Cockpit: click "Run Activity". Bridge appears on each Desk; values
   visible above each avatar; target band visible.
3. Students press ↑/↓ to nudge values; bridge animates; mean adjusts.
4. Mean enters band, holds for 3s → success fires → bridge meets goal
   → all avatars warp → override-gate unlocks the U1.1 lesson on every
   student's Desk.
5. Retry with 4-students: same flow, scales naturally.
6. Cancel mid-activity: all clients return to idle LC state; no unlock.
7. Timeout (set 30s in cockpit): result panel shows; Manual Advance
   button fires override-gate manually.

## Build dispatch

Standard loop: dispatch Units A-D as 4 parallel Sonnet subagents
against this frozen contract; planner-verify (run vitest); Codex
read-only cross-repo review (NOT cross-agent: read both
roster-server, curriculum_render, and follow-alongs); fold inline;
re-run tests; commit + push both repos.

## What this contract does NOT include (v5 candidates)

- Plugin #2 (ColorBox sort or LSRL push)
- AI-tutor integration on failure (deferred)
- Activity DB persistence / log (deferred)
- Per-lesson activity selection UI (the dropdown lists one activity --
  bridge-mean -- and assumes U1.1; v5 generalizes to a lesson→activity
  mapping)
- Hint content (the "Show Hint" button is wired but renders a static
  placeholder; per-activity hint content is a v5 follow-up)
- Per-lesson `activities/<key>.json` authoring -- v4 hardcodes
  bridge-mean → U1.1; v5 introduces the directory + lesson router

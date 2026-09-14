# LIVE_CLASSROOM V6 -- ColorBox-Grid Plugin (FROZEN)

Session 114, 2026-05-24. Third activity-engine plugin after the V4
bridge-mean and V5 colorbox-hue. Generalizes V5's 1-D color sort to a
2-D contingency-table grid: row = student's hue (4 values, free from
V5), column = a second categorical attribute supplied at launch.
**Depends on V4 + V5 landing first.**

The `colorbox-grid` plugin is U1 Topic 1.4 (Two-Way Tables): students
experience how a SECOND categorical variable splits the existing
distribution into a joint frequency table. The hue axis is identical
to V5; the column axis is plugin-configurable per launch -- either a
pre-walk PROMPT each student answers ("Are you left-handed?") or a
server-side AUTO assignment ("you are Group A").

On success: the override-gate auto-fires for the U1.4 lesson on every
present student. Mid-activity, the cockpit live-renders the
contingency table itself (`drawBarChart` per row, plus row + column
totals).

This contract is FROZEN -- implement verbatim. **Land V4 + V5 first.**

## Pedagogy

U1 Topic 1.4 lesson opener (Joint Distributions, Marginal & Conditional
Distributions). Students experience:

- A two-way table is the count of how many fall in each (row, col) cell
- Row totals = marginal distribution of variable 1
- Column totals = marginal distribution of variable 2
- Cell counts = joint distribution
- "Conditional on row X, what fraction are in column Y?" becomes a
  natural follow-up question the cockpit can frame

The pedagogical leap from V5 → V6: V5 showed "every student belongs
to ONE category"; V6 shows "every student belongs to a PAIR of
categories" -- exactly the conceptual ladder from one-variable
displays to two-variable displays.

## Locked design dials (CC, session 114)

| Dial | Value |
|---|---|
| Row axis (axis 1) | Same as V5: 4 hue quadrants (Red, Yellow, Green, Blue) |
| Column axis (axis 2) | Plugin-configurable via `opts.secondAxis` (see C2) |
| Grid layout | `4 rows × C cols` where `C = opts.secondAxis.options.length`, 2 ≤ C ≤ 4 |
| Cell positions | Equal-area grid on the LC canvas; row by canvas_height/4, col by canvas_width/C |
| Per-student picks | Two modes: `'prompt'` (student picks via 1-key shortcut or click) or `'auto'` (server randomly assigns at launch) |
| Mastery | EVERY present student has picked (in prompt mode) AND is standing in their CORRECT (hue × pick) cell for **5 sustained seconds** |
| Tick rate | 5 Hz (engine default) |
| Duration | 75 seconds default (between V4's 90s coordination and V5's 60s walking) |
| Failure flow | Same as V4: Manual Advance / Show Hint / Retry. No AI-tutor wiring. |
| Min class size | 2 online students |
| Mutex | Engine-managed |

## Dependency analysis

Cross-repo, three units; A and B file-disjoint and parallel; T is tests.

- **Unit A** (cr `railway-server/classroom.js`): the `colorbox-grid`
  plugin registration. NO further engine changes -- V5's engine
  already passes `room` to `onTick` and `onMemberJoin`. ~140 LoC.
- **Unit B** (`activity-colorbox-grid.js` new file + Desk wiring +
  cockpit dropdown additions): grid overlay renderer + per-student
  prompt modal (when `mode='prompt'`) + cockpit dropdown options +
  contingency-table readout. ~250 LoC.
- **Unit T**: tests both repos.

## C1. Engine -- nothing to add

V6 piggybacks on V5's already-extended engine:

- `onTick(state, deltaMs, room)` -- the plugin reads avatar positions
  from `room.members.get(u).pos` (same as V5)
- `onStudentInput(state, username, payload)` -- the plugin handles
  `{ choice: <int> }` for the prompt-mode pick (channel = V4's
  `classroom_activity_value`)
- `onMemberJoin(state, username, room)` -- assigns a hue zone; on
  prompt mode the joiner's `choice` starts `null` and they're
  prompted via the cockpit broadcast that follows

V6 introduces **zero new WS messages**, **zero new room-state slots**,
and **zero new mutex categories**.

## C2. The colorbox-grid plugin (server)

```js
var COLORBOX_GRID_HOLD_TARGET_MS = 5000;
var COLORBOX_GRID_DEFAULT_DURATION_MS = 75000;
// COLORBOX_HUE_ZONES and zoneForHue + fallbackHueForUsername are
// shared with V5 -- factor into a module-scope helper that both
// plugins import (or copy-paste verbatim for v6 if module-extraction
// is out of scope).

// opts.secondAxis shape:
//   mode='prompt':
//     { mode:'prompt', question:'Are you left-handed?', options:['No','Yes'] }
//   mode='auto':
//     { mode:'auto', labels:['Group A','Group B'] }
// 2 <= options.length / labels.length <= 4.

function validateSecondAxis(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.mode === 'prompt') {
    if (typeof s.question !== 'string' || !Array.isArray(s.options)) return null;
    if (s.options.length < 2 || s.options.length > 4) return null;
    if (!s.options.every(function (o) { return typeof o === 'string'; })) return null;
    return {
      mode: 'prompt',
      question: s.question.trim().slice(0, 280),
      options: s.options.map(function (o) { return String(o).trim().slice(0, 40); })
    };
  }
  if (s.mode === 'auto') {
    if (!Array.isArray(s.labels)) return null;
    if (s.labels.length < 2 || s.labels.length > 4) return null;
    return {
      mode: 'auto',
      labels: s.labels.map(function (o) { return String(o).trim().slice(0, 40); })
    };
  }
  return null;
}

activityPlugins['colorbox-grid'] = {
  minMembers: 2,

  initActivity: function (room, onlineStudents, opts) {
    var secondAxis = validateSecondAxis(opts.secondAxis);
    if (!secondAxis) {
      // Default fallback: prompt for a Yes/No.
      secondAxis = { mode: 'prompt', question: 'Yes or No?', options: ['No', 'Yes'] };
    }
    var colCount = (secondAxis.mode === 'prompt') ? secondAxis.options.length
                                                  : secondAxis.labels.length;
    var assignments = {};   // username -> { row, col } (col is null until pick)
    var picks       = {};   // username -> 0..colCount-1 OR null (still picking)
    onlineStudents.forEach(function (m) {
      var hue = (m.hue != null) ? m.hue : fallbackHueForUsername(m.username);
      var row = zoneForHue(hue);
      var col = null;
      if (secondAxis.mode === 'auto') {
        col = Math.floor(Math.random() * colCount);
      }
      assignments[m.username] = { row: row };
      picks[m.username] = col;
    });
    return {
      secondAxis:   secondAxis,
      colCount:     colCount,
      assignments:  assignments,   // username -> { row }
      picks:        picks,         // username -> col | null
      currentCell:  {},            // username -> { row, col } or { row:-1, col:-1 }
      tally:        emptyTally(4, colCount),  // 4 x colCount matrix of zeros
      holdMs:       0
    };
  },

  onStudentInput: function (state, username, payload) {
    // Prompt mode: { choice: <int> } sets the student's pick. Ignored
    // in auto mode (server already assigned).
    if (!payload || typeof payload.choice !== 'number') return null;
    if (state.secondAxis.mode === 'auto') return null;
    if (!(username in state.picks)) return null;
    var c = Math.floor(payload.choice);
    if (c < 0 || c >= state.colCount) return null;
    if (state.picks[username] === c) return null;
    var next = Object.assign({}, state, { picks: Object.assign({}, state.picks) });
    next.picks[username] = c;
    return next;
  },

  onTick: function (state, deltaMs, room) {
    var canvasW = 320;  // DEFAULT_BOARD_W
    var canvasH = 220;  // BOARD_H (from classroom-board.js)
    var rowH = canvasH / 4;
    var colW = canvasW / state.colCount;
    var nextCurrent = {};
    var nextTally   = emptyTally(4, state.colCount);
    var allCorrect  = true;
    var allPicked   = true;
    var anyAssigned = false;

    var keys = Object.keys(state.assignments);
    for (var k = 0; k < keys.length; k++) {
      anyAssigned = true;
      var uname = keys[k];
      var pick  = state.picks[uname];
      if (pick == null) {
        allPicked = false;
        allCorrect = false;
        nextCurrent[uname] = { row: -1, col: -1 };
        continue;
      }
      var m = room.members.get(uname);
      if (!m || m.online === false) {
        nextCurrent[uname] = { row: -1, col: -1 };
        allCorrect = false;
        continue;
      }
      var x = (m.pos && typeof m.pos.x === 'number') ? m.pos.x : 0;
      var y = (m.pos && typeof m.pos.y === 'number') ? m.pos.y : 0;
      // Map x to col, y to row.
      var col = Math.max(0, Math.min(state.colCount - 1, Math.floor(x / colW)));
      var row = Math.max(0, Math.min(3, Math.floor(y / rowH)));
      nextCurrent[uname] = { row: row, col: col };
      if (row >= 0 && row < 4 && col >= 0 && col < state.colCount) {
        nextTally[row][col]++;
      }
      var expectedRow = state.assignments[uname].row;
      var expectedCol = state.picks[uname];
      if (row !== expectedRow || col !== expectedCol) {
        allCorrect = false;
      }
    }
    if (!anyAssigned) { allCorrect = false; }
    var holdEligible = allPicked && allCorrect;
    var nextHoldMs = holdEligible ? (state.holdMs + deltaMs) : 0;
    return Object.assign({}, state, {
      currentCell: nextCurrent,
      tally:       nextTally,
      holdMs:      nextHoldMs
    });
  },

  isComplete: function (state) {
    return state.holdMs >= COLORBOX_GRID_HOLD_TARGET_MS;
  },

  onMemberLeave: function (state, username) {
    if (!(username in state.assignments)) return null;
    var next = Object.assign({}, state, {
      assignments: Object.assign({}, state.assignments),
      picks:       Object.assign({}, state.picks),
      currentCell: Object.assign({}, state.currentCell)
    });
    delete next.assignments[username];
    delete next.picks[username];
    delete next.currentCell[username];
    return next;
  },

  onMemberJoin: function (state, username, room) {
    if (username in state.assignments) return null;
    var m = room.members.get(username);
    if (!m) return null;
    var hue = (m.hue != null) ? m.hue : fallbackHueForUsername(username);
    var col = null;
    if (state.secondAxis.mode === 'auto') {
      col = Math.floor(Math.random() * state.colCount);
    }
    var next = Object.assign({}, state, {
      assignments: Object.assign({}, state.assignments),
      picks:       Object.assign({}, state.picks)
    });
    next.assignments[username] = { row: zoneForHue(hue) };
    next.picks[username] = col;
    return next;
  },

  serializeForBoard: function (state) {
    return {
      secondAxis:   state.secondAxis,
      colCount:     state.colCount,
      assignments:  state.assignments,
      picks:        state.picks,
      currentCell:  state.currentCell,
      tally:        state.tally,
      holdMs:       state.holdMs,
      holdTargetMs: COLORBOX_GRID_HOLD_TARGET_MS
    };
  }
};

function emptyTally(rows, cols) {
  var out = [];
  for (var r = 0; r < rows; r++) {
    var row = [];
    for (var c = 0; c < cols; c++) { row.push(0); }
    out.push(row);
  }
  return out;
}
```

## C3. activity-colorbox-grid.js (Desk renderer, NEW file)

Single IIFE exposing `window.ActivityColorboxGrid` with the same
handle shape as V4 / V5:

```js
window.ActivityColorboxGrid = {
  mount: function (mountEl, opts) -> handle
};
// handle: { destroy(), updateState(activityState), showOutcome(outcome) }
```

Layout: full-canvas grid overlay drawn ON TOP of the existing
classroom-board canvas (a separate canvas absolutely-positioned at
the same location with `pointer-events: none`):

```
┌──────┬──────┬──────┐    rows = hue quadrants (4)
│ R×A  │ R×B  │ R×C  │   cols = secondAxis (2..4)
├──────┼──────┼──────┤    cell label per zone (e.g., "Red x Yes")
│ Y×A  │ Y×B  │ Y×C  │    live count per cell (small text)
├──────┼──────┼──────┤    correct vs current marker per student
│ G×A  │ G×B  │ G×C  │
├──────┼──────┼──────┤
│ B×A  │ B×B  │ B×C  │
└──────┴──────┴──────┘
```

`updateState(state)` draws:
- Per-row tint (Red / Yellow / Green / Blue at 0.18 alpha)
- Per-column label at top edge (`state.secondAxis.options[c]` or
  `.labels[c]`)
- Per-row label at left edge (Red / Yellow / Green / Blue)
- Per-cell tally count in the cell center (`state.tally[r][c]`)
- Marginal column totals along the bottom (`sum(col)`)
- Marginal row totals along the right (`sum(row)`)
- Grand total in bottom-right
- A faint progress bar across the top showing `holdMs / holdTargetMs`
- On success: full-grid green flash for 1.5 s before destroy

#### Prompt modal (mode='prompt' only)

When `state.secondAxis.mode === 'prompt'` AND the current user's
`state.picks[username]` is null, show a modal `<div>` overlay with:

- The question text
- N buttons (one per option), labeled by the option strings
- Keyboard shortcuts: `1`, `2`, `3`, `4` press the matching button

On button click, fire
`classroom_activity_value` with `{ choice: <index> }` via
`_classroomBoardHandle.sendActivityValue(...)`. The cockpit's `onTick`
will broadcast the new state on the next tick; the modal hides when
`state.picks[username]` is non-null in the next state.

In auto mode (`state.secondAxis.mode === 'auto'`), no modal -- the
student's column is already assigned; render a small badge above their
avatar showing `state.secondAxis.labels[state.picks[username]]`.

## C4. Cockpit (teacher-classroom.html)

The activity-type dropdown gets two new options for the two ColorBox
configurations:

```html
<option value="colorbox-grid:hand">U1.4 Hue x Handedness (prompt)</option>
<option value="colorbox-grid:group">U1.4 Hue x Group (random A/B)</option>
```

The dropdown values use a `:variant` suffix that the launch handler
parses:

```js
function startActivity() {
  if (!boardHandle) return;
  var raw = document.getElementById('activity-type').value;
  var duration = parseInt(document.getElementById('activity-duration').value, 10);
  var parts = raw.split(':');
  var type = parts[0];
  var variant = parts[1] || '';
  var opts = { durationMs: Math.max(30000, Math.min(300000, duration * 1000)) };
  if (type === 'colorbox-grid') {
    if (variant === 'hand') {
      opts.secondAxis = {
        mode: 'prompt',
        question: 'Are you left-handed?',
        options: ['No', 'Yes']
      };
    } else if (variant === 'group') {
      opts.secondAxis = {
        mode: 'auto',
        labels: ['Group A', 'Group B']
      };
    }
  }
  boardHandle.sendMessage({
    type: 'classroom_activity_start',
    activityType: type,
    opts: opts
  });
}
```

`renderActivity(summary)` adds a `colorbox-grid` branch:

```js
if (summary.activity.type === 'colorbox-grid') {
  var s = summary.activity.state;
  var keys = Object.keys(s.assignments);
  var picked = keys.filter(function (u) { return s.picks[u] != null; }).length;
  var correct = keys.filter(function (u) {
    var c = s.currentCell[u];
    return c && c.row === s.assignments[u].row && c.col === s.picks[u];
  }).length;
  readoutEl.textContent =
    'Picked: ' + picked + '/' + keys.length +
    ' | In correct cell: ' + correct + '/' + keys.length +
    ' | hold: ' + (s.holdMs/1000).toFixed(1) + 's / ' + (s.holdTargetMs/1000).toFixed(1) + 's';
  // Optionally render the contingency table as a small read-only HTML
  // table next to the readout. The `tally` is a 4 x colCount matrix.
}
```

## C5. Desk mount wiring

In `_handleActivityState(summary)` (added in V4 + V5 generalization),
add a third type branch:

```js
function _activityRendererForType(type) {
  if (type === 'bridge-mean')   return window.ActivityBridge;
  if (type === 'colorbox-hue')  return window.ActivityColorbox;
  if (type === 'colorbox-grid') return window.ActivityColorboxGrid;
  return null;
}
```

The arrow-key gating that prevents the PlayerSprite handler from
swallowing arrows during bridge-mean ALSO applies during
colorbox-grid: it doesn't, because colorbox-grid wants vertical
movement (rows) AND horizontal movement (cols) -- so we LEAVE the
PlayerSprite handler intact and don't intercept arrows. ColorBox-grid
uses the existing free-walk keyboard for navigation, and the prompt
modal hijacks 1-4 keys ONLY while the modal is open.

Important: when the modal is open, also `e.preventDefault()` on
ANY keypress to prevent the PlayerSprite handler from receiving it.
(The modal is small + transient; this is a narrow window.)

## C6. Wire protocol

**Zero new message types.** Reuses:

- `classroom_activity_start` (V4) with `opts.secondAxis` in the
  payload
- `classroom_activity_value` (V4) with `{ choice: 0..colCount-1 }`
  payload for the prompt-mode pick
- `classroom_activity_state` (V4)
- `classroom_activity_success / _timeout / _cancel / _error` (V4)
- `classroom_pos` (existing v3 P3)

## C7. Tests

#### Unit A tests (cr `tests/classroom.activity.colorbox-grid.test.js`)

- Plugin registry resolves `'colorbox-grid'`
- `validateSecondAxis` accepts valid prompt + auto shapes
- `validateSecondAxis` rejects invalid (missing fields, wrong types,
  out-of-range option count)
- `initActivity` in `mode='auto'` assigns each student a random
  column 0..colCount-1
- `initActivity` in `mode='prompt'` leaves `picks[username] = null`
- `initActivity` assigns row by hue + falls back to username hash
- `onStudentInput` in prompt mode: `{choice: c}` sets picks[username]
- `onStudentInput` clamps choice to [0, colCount-1]; out-of-range
  payloads ignored
- `onStudentInput` in auto mode: ignored (returns null)
- `onTick` computes (row, col) from (y, x) member position
- `onTick` requires `picks[u] != null` (in prompt mode) for student
  to be "eligible" for mastery
- `onTick` `holdMs` resets if any student isn't picked OR isn't in
  correct cell
- `isComplete` fires when `holdMs >= 5000`
- `onMemberJoin` in prompt mode adds row assignment with null pick
- `onMemberJoin` in auto mode adds row + random col
- `onMemberLeave` removes assignment + pick + currentCell entry
- `serializeForBoard` returns the documented public shape
- Snapshot (`buildStatePayload`) serializes grid state
- Mutex still enforced: cannot start grid while bridge or hue is live

Acceptance count: ≥ 22 cases.

#### Unit B tests (`tests/activity-colorbox-grid.test.js`)

- `ActivityColorboxGrid.mount` returns handle with documented methods
- `updateState` renders 4 x N grid cells via `fillRect`
- `updateState` writes per-cell tally numbers as text
- `updateState` writes row + column labels around the edges
- Marginal totals match (row sums + col sums)
- Progress bar width matches `holdMs / holdTargetMs`
- Prompt modal appears when current user's pick is null AND mode is prompt
- Prompt modal hides when pick becomes non-null
- Prompt modal does NOT appear in auto mode
- Auto-mode renders a label badge above the current user's avatar
- Modal button click fires `sendActivityValue({choice:i})` via handle
- Modal 1/2/3/4 key shortcuts also fire `sendActivityValue`
- `showOutcome('success')` renders green flash
- `destroy` removes both the grid overlay and the modal

Acceptance count: ≥ 14 cases.

## Acceptance (end-to-end smoke)

After Unit A + B + T land:

1. Open 3-5 student Desks (mixed hues at sign-in) + the cockpit.
2. Cockpit: select "U1.4 Hue × Handedness (prompt)"; click Run.
3. On each student's Desk: modal "Are you left-handed? [No] [Yes]"
   appears.
4. Each student picks via click or 1/2 key. Modal disappears.
5. Grid (4 rows × 2 cols) appears as overlay on the LC canvas.
6. Students walk into their (hue × pick) cell (left/right + up/down
   arrows).
7. Cockpit shows: `Picked: 5/5 | In correct cell: 3/5 | hold: 0.0s`.
8. Once all 5 are in correct cells, hold counter starts.
9. ≥ 5s → success → green flash → override-gate unlocks U1.4.
10. Retry with "U1.4 Hue × Group (random A/B)" -- no modal; each
    avatar has a small label badge showing their assigned group;
    students walk to (hue × group). Same mastery flow.

## What this contract does NOT include (v7 / v6.1 candidates)

- **`colorbox-grid-chi2` variant** (U8 chi-square test of independence):
  same grid + computed χ² on observed vs expected-under-independence
  + final reject/fail-to-reject vote via doorways. ~150 LoC v6.1.
- **`colorbox-grid-cond` variant** (U1.4 conditional distributions):
  after the joint table is built, cockpit asks a conditional probability
  question ("P(Yes | Red)?") and class votes via doorways for the
  answer. ~120 LoC v6.1.
- **Custom hue-axis variants** (e.g., 6-zone color wheel for finer-grained
  categorical): generalize the 4-quadrant hue partition to N. ~50 LoC
  if the constants are already extracted.
- **Per-lesson activity routing JSON** (`activities/<lesson-key>.json`):
  the cockpit dropdown is still hardcoded across V4/V5/V6; a v7+ would
  read a per-lesson manifest mapping `(lesson, activity-variant)` pairs.

## Build dispatch

After V4 + V5 both land and roster-server + cr are confirmed green:
dispatch Units A + B + T as 3 parallel Sonnet subagents; planner-verify
(vitest both repos); Codex read-only cross-repo review; fold inline;
commit + push both repos.

## What V6 buys you in shipping reach

After V4 + V5 + V6, the activity system covers (with one cockpit
dropdown):

- **U1.1** -- bridge-mean (find the target mean)
- **U1.3** -- colorbox-hue (sort by your color)
- **U1.4** -- colorbox-grid:hand (two-way table: hue × handedness)
- **U1.4** -- colorbox-grid:group (two-way table: hue × random group)

Three U1 lesson openers, two engine releases. Each subsequent unit
adds variants of the same three mechanics. The architecture is now
provably general.

# LIVE_CLASSROOM_V1B_BUILD.md

Frozen implementation contract for **cycle v1b (the Gate)** of the Live
Classroom feature. `LIVE_CLASSROOM_SPEC.md` is the full design (Section
5 protocol, Section 9 cockpit, Section 10 phasing); `LIVE_CLASSROOM_V1A_BUILD.md`
is the shipped Foundation this extends. This doc is the precise, frozen
v1b contract. Written 2026-05-21 (session 106).

## 0. Resolved decisions (carried + v1b)

- OPEN-1 -> v1 trusts the client-claimed `role` (no passphrase). v1b
  enforces teacher-only controls server-side by checking the joined
  member's `role`.
- OPEN-2 -> the single current section label is `PeriodX`.
- v1b check-in affordance = a CLICK on an HTML button the board injects
  into its own container (spec K1 allows keypress OR click; a button
  click needs no canvas focus management and is the robust choice).
- v1b green light = INFORMATIONAL only. `classroom_go` broadcasts
  `classroom_greenlight`; no `startVideo` payload, no Desk navigation
  (that is v1c). The cockpit lights an indicator; the board may show a
  brief green cue.
- Hole theme = a short ASCII token the cockpit derives deterministically
  from the current date; the board renders a doorway and may vary its
  look by theme. Freshness only (spec D7), not load-bearing.

## 1. v1b scope

IN (v1b -- "the Gate"):
- WS server: a per-room `gate`, member `status`, and handlers for
  `classroom_arm_gate`, `classroom_checkin`, `classroom_go`,
  `classroom_reset`.
- `classroom-board.js`: render the hole when a gate is armed; a
  check-in button for the local student; drain (a checked-in student
  is no longer drawn); a green-light cue; an `onStateChange` callback.
- `teacher-classroom.html`: a control strip (Arm Gate / Green Light /
  Reset) and a live checked-in panel (count + checked-in real names).

OUT (do NOT build now):
- Polls / votes / `ti84-plot.js` (v2).
- Synchronized video start -- the `classroom_go` `startVideo`/`videoRef`
  path and student-Desk navigation (v1c).
- Any Desk (`ap_stats_roadmap_square_mode.html`) edit. v1a already
  embeds the board; v1b enriches the board component in place, so the
  Desk needs NO change. Do not edit the Desk.
- Avatar-art picker; attendance persistence; the Pulse.

## 2. The v1b WebSocket protocol (FROZEN -- extends the v1a protocol)

Additive to the curriculum_render WS server. v1a's `classroom_join` /
`_leave` / `_heartbeat` / `_state` / `_member_update` / `_member_left`
are UNCHANGED except that `classroom_state` and `classroom_member_update`
now carry real `gate` / `status` (v1a hardcoded `gate:null` /
`status:"present"`).

### 2.1 Server state additions

- `ClassroomRoom` gains `gate: { armed:boolean, theme:string,
  openedAt:number } | null` (default `null`).
- `Member` gains `status: "present" | "checkedIn"` (default
  `"present"`). v1b never uses `"voted"` (that is v2).
- `WireMember = { username, role, status, online }` -- `status` is now
  the member's real status.

### 2.2 Client -> server (NEW in v1b)

- `classroom_arm_gate` -- `{ type:"classroom_arm_gate", theme }`.
  TEACHER only. Sets the sender's room `gate = { armed:true, theme,
  openedAt:now }` and sets EVERY member's `status` back to `"present"`
  (a fresh ritual). Broadcasts `classroom_gate`. Rejected with no
  effect if the sender's member `role !== "teacher"`.
- `classroom_checkin` -- `{ type:"classroom_checkin" }`. STUDENT. If the
  sender's room has an armed gate, set the sender's member
  `status = "checkedIn"` and broadcast a `classroom_member_update` for
  that member. Ignored (no broadcast) if there is no armed gate.
- `classroom_go` -- `{ type:"classroom_go" }`. TEACHER only. Broadcasts
  `classroom_greenlight`. Rejected if `role !== "teacher"`.
- `classroom_reset` -- `{ type:"classroom_reset" }`. TEACHER only. Sets
  the room `gate = null` and every member `status = "present"`.
  Broadcasts a full `classroom_state`. Rejected if `role !== "teacher"`.

### 2.3 Server -> client (NEW in v1b; section-scoped broadcast)

- `classroom_gate` -- `{ type:"classroom_gate", section,
  gate:{ armed, theme } }`. Sent when a gate is armed.
- `classroom_greenlight` -- `{ type:"classroom_greenlight", section }`.
  Sent when the teacher presses Go.
- `classroom_state` -- now carries the real `gate` (object or null) and
  members with their real `status`. Sent on join (v1a) AND on
  `classroom_reset` (v1b).
- `classroom_member_update` -- now carries the member's real `status`.

### 2.4 Durability and liveness (spec 5.5 -- unchanged rules)

- `checkedIn` is a DURABLE decision: it survives a socket drop / reload
  / reconnect and is cleared ONLY by `classroom_arm_gate` (fresh
  ritual) or `classroom_reset`. `classroom_join` re-attaching an
  existing member by username MUST keep that member's `status` -- never
  reset it to `"present"` on re-join.
- Liveness (`online`) is unchanged from v1a (30s heartbeat / 45s
  window / 45min idle GC). A checked-in member that goes `online:false`
  stays `checkedIn`.
- v1b has no poll, so spec 5.6 mode-exclusivity needs no code -- the
  room's only mode is the gate.
- v1b broadcasts are NOT role-aware (the spec 5.4 role-aware rule is a
  blind-poll concern -- v2 only).

## 3. Work item A -- curriculum_render WS server (Sonnet)

Repo: `C:\Users\rober\Downloads\Projects\school\curriculum_render` (a
SEPARATE repo, ES modules + vitest). Owned paths:
`railway-server/classroom.js` (EDIT), `railway-server/server.js`
(EDIT, additive only), `tests/classroom.test.js` (EDIT -- extend).

A1. `classroom.js` -- extend `createClassroomRegistry()`:
    - Add `gate` (default null) to the room object created in `join`;
      add `status` (default `"present"`) to the member object. `join`
      re-attaching an existing member MUST preserve its `status`.
    - Add `armGate(ws, theme, now)`: resolve the sender's room +
      member via the ws index; if `member.role !== "teacher"` return
      `{ broadcasts: [] }`; else set `room.gate`, set every member
      `status="present"`, return a `classroom_gate` broadcast to all
      room sockets.
    - Add `checkin(ws, now)`: resolve room + member; if `room.gate &&
      room.gate.armed`, set `member.status="checkedIn"` and return a
      `classroom_member_update` broadcast; else `{ broadcasts: [] }`.
    - Add `greenLight(ws, now)`: teacher-check; return a
      `classroom_greenlight` broadcast.
    - Add `reset(ws, now)`: teacher-check; set `room.gate=null`, every
      member `status="present"`; return a `classroom_state` broadcast.
    - Update `stateFor(section)` and the WireMember serializer to emit
      the real `gate` and `status`.
    - The registry still does NO socket I/O -- methods RETURN
      `{ broadcasts:[{sockets,payload}], ... }`; `server.js` sends.

A2. `server.js` -- additive only. In the `switch (data.type)` (the
    classroom block ~lines 1808-1837), add `case 'classroom_arm_gate':`,
    `'classroom_checkin':`, `'classroom_go':`, `'classroom_reset':`
    before `default:`. Each delegates to the new registry method and
    feeds the result to the existing `broadcastToClassroom`. Do NOT
    modify any existing case, the presence / `gameRooms` / `challenges`
    logic, `broadcastToClients`, `broadcastToClassroom`, or the sweep
    loop. DogePresence and Tetris must not regress.

A3. `tests/classroom.test.js` -- extend with stub-ws cases:
    `armGate` sets the room gate, resets statuses, and is rejected from
    a student-role socket; `checkin` sets `checkedIn` only with an
    armed gate and is ignored otherwise; `reset` clears the gate and
    resets statuses; `greenLight` is teacher-only; a checked-in member
    that detaches and re-joins is still `checkedIn` (durability);
    section isolation for the gate (arming section A does not affect
    section B); the v1a join/detach/sweep cases still pass.

## 4. Work item B -- classroom-board.js (Sonnet)

Repo: follow-alongs. Owned paths: `classroom-board.js` (EDIT),
`tests/classroom-board.test.js` (EDIT -- extend). It is a plain
(non-module) browser script attaching `window.ClassroomBoard`.

B1. Extend `_reduce(state, message)`:
    - `classroom_gate`: set `state.gate` from the message; also reset
      every member's local `status` to `"present"` (arming = fresh
      ritual).
    - `classroom_greenlight`: set `state.greenlight` to the boolean
      `true`. `classroom_gate` and `classroom_state` set it back to
      `false`. Keep `_reduce` PURE -- NO `Date.now()`; the brief
      on-canvas banner fade is render-layer, owned by `mount()`.
    - `classroom_state`: adopt the real `gate` and per-member `status`
      (no longer assume null/`"present"`).
    - `classroom_member_update`: adopt the member's `status`.
    Keep `_reduce` a pure function (no canvas, no I/O) -- the test
    drives it directly.

B2. Rendering:
    - When `state.gate && state.gate.armed`, draw a doorway/hole
      sprite on the board; its look may vary by `state.gate.theme`.
    - Draw avatars only for `role:"student"` members whose `status` is
      `"present"`. A `"checkedIn"` student has drained (spec D4) and is
      NOT drawn. An optional brief walk-to-hole animation is allowed
      but not required.
    - `online:false` members still render dimmed (v1a behavior).
    - Render a brief green-light cue after a `classroom_greenlight`;
      `mount()` owns its fade timing via a separate timestamp and a
      short repaint timer (so the banner clears itself).

B3. Check-in affordance: the board injects ONE HTML `<button>` into its
    own container, shown ONLY when `gate.armed` AND the local member
    (`opts.username`) is `role:"student"` AND its `status` is
    `"present"`. Clicking it sends `classroom_checkin` on the board's
    WebSocket. Hide the button once the local member is `checkedIn` or
    the gate is cleared. The button is ASCII-labelled (e.g. "Check in").

B4. API additions (FROZEN -- backward compatible with v1a Section 6):
    - `mount(container, opts)` -- `opts` gains an optional
      `onStateChange(summary)` callback, invoked after every `_reduce`
      with `summary = { gate, members:[{ username, role, status,
      online }], greenlight }`. v1a callers (the Desk embed) omit it --
      unchanged.
    - the returned `handle` gains three teacher methods:
      `armGate(theme)` sends `classroom_arm_gate`; `greenLight()` sends
      `classroom_go`; `reset()` sends `classroom_reset`. They are used
      only by the cockpit; the student Desk embed never calls them.
    - `destroy()` and `setNameMap(map)` are unchanged.

B5. `tests/classroom-board.test.js` -- extend: `_reduce` applies
    `classroom_gate` (sets gate, resets statuses), a
    `classroom_member_update` carrying `status:"checkedIn"`, a
    `classroom_state` with a gate object, and `classroom_greenlight`;
    a render/query helper confirms a `checkedIn` student is not drawn;
    the check-in button shows only in the armed+present case;
    `onStateChange` fires with the summary shape. v1a board cases keep
    passing.

## 5. Work item C -- teacher-classroom.html (Sonnet)

Repo: follow-alongs. Owned paths: `teacher-classroom.html` (EDIT),
`tests/classroom-structure.test.js` (EDIT -- extend).
The v1a shell already loads `roster_config.js`, `roster-client.js`,
`classroom-board.js`, gates on the teacher role, builds the
`username -> realName` nameMap, and mounts the board in teacher mode.

C1. Add a control strip (in the board region, visible only once the
    board is mounted): an "Arm Gate" button, a "Green Light" button, a
    "Reset" button. They call the board handle's `armGate(theme)` /
    `greenLight()` / `reset()`. Compute `theme` as a short ASCII token
    deterministic from the current date.

C2. Add a live "checked-in" panel: pass an `onStateChange` callback to
    `ClassroomBoard.mount`; from each `summary` render a count
    ("N / M in" -- M = student-role members, N = those with
    `status:"checkedIn"`) and the list of checked-in students by real
    name (mapped through the existing nameMap; fall back to username).

C3. Add a green-light indicator that lights when the teacher has
    pressed Go (track it from the same `onStateChange` / a board
    signal). Informational only.

C4. Keep the v1a security posture: teacher-role gate, the
    "open from the Desk" message for non-teachers,
    `x-teacher-secret`/real-name handling unchanged. Patterned on
    `teacher-dashboard.html` aesthetics. Update the v1a "read only"
    header wording as appropriate for v1b controls.

C5. Extend `tests/classroom-structure.test.js` with structure pins for
    the v1b cockpit: the control strip (Arm Gate / Green Light / Reset)
    and the checked-in panel. Do not weaken the existing v1a pins.

## 6. Rules and gotchas (all work items)

- ASCII-only in every file (no emoji, smart quotes, em-dashes) -- the
  Codex cross-agent runner has a known UTF-8 decode bug.
- EOL: all five files (classroom.js, server.js, classroom-board.js,
  teacher-classroom.html, the curriculum_render test) are LF -- new
  content stays LF.
- `server.js` is additive ONLY -- DogePresence / Tetris / presence /
  `gameRooms` / `broadcastToClients` untouched and unregressed.
- Sacred: never read or write `curriculum_render/data/curriculum.js`.
- Two repos: work item A is in curriculum_render; B and C are in
  follow-alongs. Stage own paths only -- curriculum_render carries
  unrelated pre-existing dirty files; never `git add -A`.
- The board keeps its OWN WebSocket (do not entangle with DogePresence
  or Tetris).
- A real name never crosses the WS wire -- only usernames. The cockpit
  maps to real names locally via the roster `section` endpoint.
- Subagents: do NOT `git commit`, `git push`, or `git add`. Create/edit
  ONLY your owned paths. The planner commits after Codex eval + final
  review.

## 7. Dispatch plan

A, B, C are built by parallel Sonnet subagents -- independent files,
each conforming to the frozen protocol (Section 2) and the frozen board
API (Section 4 B4). No planner-direct piece (v1b touches no Desk file).
Then: Codex read-only eval -> planner folds findings + re-verifies on
disk -> commit + push both repos (one curriculum_render commit for A,
one follow-alongs commit for B + C), or repeat.

## 8. Definition of done (v1b GREEN)

- follow-alongs `npm test`: no NEW failures beyond the known
  pre-existing `tests/study-guide.test.js` fail; the extended
  `classroom-board` and `classroom-structure` tests pass.
- curriculum_render `npm test`: no NEW failures beyond the known
  pre-existing `tests/redox-chat.test.js` (`max_tokens`) fail; the
  extended `classroom` test passes.
- `node scripts/audit-feeder-ids.mjs` (follow-alongs) -> CLEAN 69.
- DogePresence / Tetris handling unchanged; the WS server change is
  independently deployable.
- All five files stay LF; `curriculum_render/data/curriculum.js`
  untouched.

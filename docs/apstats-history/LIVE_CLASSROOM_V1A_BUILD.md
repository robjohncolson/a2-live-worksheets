# LIVE_CLASSROOM_V1A_BUILD.md

Frozen implementation contract for **cycle 1 (v1a, Foundation)** of the
Live Classroom feature. `LIVE_CLASSROOM_SPEC.md` is the full design;
this doc is the precise, frozen contract for v1a only. Every parallel
work item (A, B, C, D) MUST conform to the protocol and the APIs frozen
here.

## 0. Resolved decisions

- OPEN-1 -> RESOLVED: v1 trusts the client-claimed `role`. No
  classroom-control passphrase.
- OPEN-2 -> RESOLVED: the single current section label is `PeriodX`
  (no space, matching the existing `PeriodB` / `PeriodE` rows).

## 1. v1a scope

IN (v1a -- "prove the plumbing"):
- A section-aware classroom room model on the curriculum_render WS
  server: join a room keyed by `section`, live presence, online/offline
  liveness, idle member GC.
- A `classroom-board.js` component that renders the section's students
  as avatars on a 320x240 TI-84-style canvas, live.
- A `teacher-classroom.html` cockpit shell that embeds the board in
  teacher mode (real-name labels).
- Desk integration: the board embedded on the student Desk, a
  Teacher-menu launch item, the `_periodToSection` companion fix.

OUT (deferred to v1b / v2 -- do NOT build now):
- The gate: arm-gate, check-in, drain, green light. No
  `classroom_arm_gate` / `classroom_checkin` / `classroom_go` /
  `classroom_reset` handlers.
- Polls, votes, the `ti84-plot.js` module.
- Avatar movement / the hole. v1a avatars are placed and idle-animate
  only.
- The cockpit control strip.

The v1a protocol below is a strict SUBSET of spec Section 5. v1b extends
this contract; do not implement the rest now.

## 2. The v1a WebSocket protocol (FROZEN)

Additive to the curriculum_render WS server. New `type`s are prefixed
`classroom_`. Existing handling is untouched.

### Client -> server

- `classroom_join` -- `{ type:"classroom_join", section, username, role }`.
  Join or re-attach this socket to the section room. `role` is
  `"student"` or `"teacher"`. The server replies `classroom_state` to
  this socket and broadcasts a `classroom_member_update` for this
  member to the rest of the room.
- `classroom_leave` -- `{ type:"classroom_leave" }`. Detach this socket
  (also done on socket close). The member record is NOT removed here.
- `classroom_heartbeat` -- `{ type:"classroom_heartbeat" }`. Refresh
  this member's liveness.

### Server -> client (section-scoped broadcast)

- `classroom_state` -- `{ type:"classroom_state", section, gate:null,
  poll:null, members:[ WireMember ] }`. Full snapshot, sent to a socket
  on join. `gate`/`poll` are always `null` in v1a (kept in the shape
  for v1b forward-compatibility).
- `classroom_member_update` -- `{ type:"classroom_member_update",
  section, member: WireMember }`. A member joined or changed (e.g. an
  online-flip). Recipients upsert by `username`.
- `classroom_member_left` -- `{ type:"classroom_member_left", section,
  username }`. A member record was GC'd. Recipients delete it.

`WireMember = { username:string, role:"student"|"teacher",
status:"present", online:boolean }`. In v1a `status` is always
`"present"`. The wire NEVER carries a real name (spec D6).

### Liveness and removal (v1a)

- A member is `online:true` while it has at least one open socket and a
  heartbeat within 45s; otherwise `online:false`.
- An online-flip broadcasts a `classroom_member_update`. The member is
  NOT removed and keeps its identity.
- A member `online:false` for more than 45 minutes is removed; the
  server broadcasts `classroom_member_left`.
- A room with zero members is deleted.
- All state is in memory; a server restart clears it (accepted).

## 3. Work item A -- curriculum_render WS server

Repo: `C:\Users\rober\Downloads\Projects\school\curriculum_render`
(a SEPARATE repo). Owned paths: `railway-server/classroom.js` (NEW),
`railway-server/server.js` (EDIT, additive only), `tests/classroom.test.js`
(NEW). curriculum_render uses ES modules and vitest.

A1. NEW `railway-server/classroom.js` -- an ES module exporting
    `createClassroomRegistry()`. The registry owns the `classrooms` Map
    (section -> room) and a ws->member index, with methods for: join
    (add or re-attach a socket; create the room if needed), detach (a
    socket leaves or closes), heartbeat, `sweep(now)` (time-driven --
    returns the online-flips and the GC removals), and `stateFor(section)`
    (the v1a snapshot). The registry holds socket references but does
    NO socket I/O -- its methods RETURN what to send plus the recipient
    socket list; `server.js` performs the `.send()`. This keeps the
    module unit-testable with stub ws objects.
A2. `railway-server/server.js` -- additive ONLY:
    - Construct one `createClassroomRegistry()` near the module-level
      state (~lines 28-44).
    - Add `case 'classroom_join':`, `'classroom_leave':`,
      `'classroom_heartbeat':` to the `switch (data.type)` before
      `default:` (~line 1804). Each delegates to the registry and uses
      a new `broadcastToClassroom(section, data)` helper (model it on
      `broadcastToClients` ~line 1870, but iterate only the section's
      member sockets).
    - In `ws.on('close')` (~lines 1812-1860): after the existing
      cleanup, detach the socket from the registry; if the member lost
      its last socket, broadcast a `classroom_member_update` online-flip
      -- do NOT remove the member here.
    - Add ONE `setInterval` (model it on the presence cleanup
      ~line 1929) that calls `registry.sweep(Date.now())` and broadcasts
      the online-flips (`classroom_member_update`) and GC removals
      (`classroom_member_left`).
    - Do NOT modify any existing case, the presence / `gameRooms` /
      `challenges` logic, or `broadcastToClients`.
A3. NEW `tests/classroom.test.js` (vitest) -- unit-test `classroom.js`
    with stub ws objects (`{ readyState:1, send(){} }`): join creates a
    room + member; a second join by the same username is a re-attach
    (no duplicate); detach + a `sweep` past 45s flips `online:false`
    WITHOUT removing; a `sweep` past 45 min removes the member;
    `stateFor` returns the v1a shape; section isolation (section A
    members are absent from section B's state).

## 4. Work item B -- the board component

Repo: follow-alongs. Owned paths: `classroom-board.js` (NEW),
`tests/classroom-board.test.js` (NEW).

B1. NEW `classroom-board.js` -- a self-contained, no-build, PLAIN
    (non-module) browser script. The Desk loads it via `<script src>`,
    so it must NOT use ES `export`/`import`. It attaches
    `window.ClassroomBoard` with the FROZEN API in Section 6. It opens
    its OWN WebSocket (separate from DogePresence), sends
    `classroom_join`, heartbeats every 30s, handles `classroom_state` /
    `classroom_member_update` / `classroom_member_left`, and reconnects
    on drop with exponential backoff (re-sending `classroom_join`).
B2. Rendering: a 320x240 backing-store canvas (logical resolution),
    CSS-scaled to the container width with `image-rendering: pixelated`.
    Draw `role:"student"` members as avatars on a 40x30 grid of 8x8px
    cells (spec K2); deterministic placement by a hash of `username`;
    a small label above each avatar; teacher members are NOT drawn; an
    `online:false` member renders dimmed. Idle animation is allowed
    (client-side only). Use the TI-84 Plus CE screen look -- reference
    `ti84-trainer-v2/native/screen-renderer.js` for the palette and
    pixel font; do NOT import it.
B3. Testability: structure the file so the WS-message state reduction
    is a pure function exposed as `window.ClassroomBoard._reduce(state,
    message) -> state`, and canvas drawing is isolated so `_reduce`
    runs without a 2d context. The test loads the plain script into a
    jsdom window and exercises `window.ClassroomBoard`. Study
    `tests/desk-roster-signin.test.js` for this repo's existing
    jsdom-load test pattern and follow it.
B4. NEW `tests/classroom-board.test.js` (vitest + jsdom): `_reduce`
    applies a `classroom_state` snapshot, upserts on
    `classroom_member_update`, deletes on `classroom_member_left`; a
    query for rendered avatars returns student-role members only;
    offline members are flagged; `mount()` creates a canvas element in
    the container (use a mock WebSocket).

## 5. Work item C -- the cockpit shell

Repo: follow-alongs. Owned path: `teacher-classroom.html` (NEW).

C1. NEW `teacher-classroom.html` -- patterned on `teacher-dashboard.html`
    (read it: the SG aesthetic, the sticky header, the security-posture
    note, the layout). Load `roster_config.js`, `roster-client.js`, AND
    `classroom-board.js`. (Loading `roster-client.js` is a deliberate
    deviation from `teacher-dashboard.html` -- the cockpit needs the
    teacher's roster identity.)
C2. On load: read `window.rosterClient.current()` and
    `localStorage.apstats_user_role`. If the role is `"teacher"` and a
    session exists, proceed; otherwise show a friendly message:
    "Open this from the Desk after signing in as a teacher."
C3. A section selector defaulting to `PeriodX` (a `<select>`; `PeriodX`
    may be its only option in v1a).
C4. Fetch `GET <ROSTER_SERVICE_URL>/roster/section/<section>` (the
    existing public endpoint) and build a `{ username: realName }` map.
C5. Mount the board: `ClassroomBoard.mount(container, { wsUrl, section,
    username: rosterClient.current().username, role:"teacher", nameMap })`.
    Derive `wsUrl` exactly as DogePresence does:
    `(window.RAILWAY_SERVER_URL || 'https://curriculumrender-production.up.railway.app').replace(/^http/,'ws')`.
C6. NO control strip in v1a (Arm Gate / Green Light are v1b). The page
    is the shell that proves the teacher sees the live board.

## 6. The `classroom-board.js` public API (FROZEN)

```
window.ClassroomBoard.mount(container, opts) -> handle

opts = {
  wsUrl:    string,   // "wss://..." -- connect to it directly
  section:  string,   // room key, e.g. "PeriodX"
  username: string,   // this client's identity
  role:     "student" | "teacher",
  nameMap?: { [username]: realName }   // teacher passes it; student omits
}

handle = {
  destroy(): void,          // close the WS, remove the canvas, stop timers
  setNameMap(map): void     // replace the username->realName map
}
```

A student Desk calls `mount` with NO `nameMap` -> labels are usernames.
A teacher cockpit passes `nameMap` -> labels are real names. The board
NEVER sends a real name on the wire; `nameMap` is display-only and
client-local.

## 7. Work item D -- Desk integration (PLANNER-DIRECT)

Owned paths: `ap_stats_roadmap_square_mode.html` (EDIT) +
`tests/classroom-structure.test.js` (NEW). Done by the planner, not a
subagent -- the Desk is the contended single file.

D1. Add `<script src="classroom-board.js"></script>` to the sibling
    script block (after `roster-client.js`, ~line 1522).
D2. Add a board mount point -- `<div id="classroom-board-mount">` -- in
    the right column after `.prog-area` (~line 1248).
D3. Add a 4th Teacher-menu item in `#menu-teacher` (~line 1125):
    `onclick="closeMenus();window.open('teacher-classroom.html','_blank')"`,
    label "Live Classroom".
D4. Init the board for the signed-in student: on boot if
    `rosterClient.current()` exists, and in the post-sign-in success
    path (~line 4172), mount `ClassroomBoard` with the student's
    `username`/`section`, `role:"student"`, no `nameMap`. Guard so it
    mounts at most once; tolerate a missing component
    (`typeof window.ClassroomBoard`).
D5. `_periodToSection` companion fix (~line 3785): it must never return
    `null` (null -> empty picker). Pass a recognized section through,
    map bare letters, and default to `PeriodX`.
D6. NEW `tests/classroom-structure.test.js`: structure pins for the
    Desk integration (the script tag, the mount div, the Teacher-menu
    item, `_periodToSection` never returns null) and the cockpit
    (`teacher-classroom.html` exists, loads the three scripts, mounts
    the board in teacher mode).

## 8. Knobs (v1a values)

- Canvas backing store 320x240; CSS-scaled to the container.
- Logical grid 40x30, 8x8 px cells.
- Heartbeat 30s; liveness window 45s; idle GC 45 min.
- Avatar art: deterministic from a `username` hash (a color + a simple
  shape).

## 9. Rules and gotchas (all work items)

- ASCII-only in every file (no emoji, smart quotes, em-dashes). Codex
  reviews this code via a cross-agent runner with a known UTF-8 bug.
- EOL: new files LF. The Desk edit preserves the file's existing LF.
- `server.js`: additive only -- do not touch existing presence /
  `gameRooms` / `challenges` / `broadcastToClients` logic. Must not
  regress DogePresence or Tetris.
- Sacred: never write `curriculum_render/data/curriculum.js`.
- Two repos: A is in curriculum_render; B/C/D in follow-alongs.
- The board opens its OWN WebSocket; do not entangle with DogePresence
  or the Tetris code.
- A real name never crosses the WS wire.
- Subagents: do NOT `git commit` or `git push` and do NOT `git add`.
  Create/edit only your owned paths. The planner commits after Codex
  eval + final review.

## 10. Build and dispatch plan

A, B, C are built by parallel Sonnet subagents (independent files, no
clobber). D is planner-direct. Then: Codex eval -> fix gaps -> planner
final review -> commit + push both repos, or repeat.

## 11. Definition of done (v1a GREEN)

- follow-alongs `npm test` (vitest): no NEW failures beyond the known
  pre-existing `tests/study-guide.test.js` fail; the new
  `classroom-board` and `classroom-structure` tests pass.
- curriculum_render `npm test` (vitest): no NEW failures beyond the
  known pre-existing `tests/redox-chat.test.js` (`max_tokens`) fail;
  the new `classroom` test passes.
- `node scripts/audit-feeder-ids.mjs` (follow-alongs) -> CLEAN.
- The Desk file stays LF; DogePresence / Tetris handling unchanged.

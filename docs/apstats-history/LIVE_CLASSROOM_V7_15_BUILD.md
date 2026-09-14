# Live Classroom V7.15 -- shared camera + teacher spectator + dev-start

Session 118 (2026-05-26). Author: CC. Status: FROZEN -- dispatching.

V7.15 addresses three connected gaps surfaced in V7.14 PeriodX smoke:

1. **Per-client camera defeats cooperative pedagogy.** Each student
   has their own follow-camera; the leader can scroll right and
   leave slower classmates behind visually. Pico Park forces a
   SHARED camera that follows the leftmost player -- nobody can
   disappear off-screen-right because the camera literally won't
   advance until the slowest catches up. V7.15 ports that
   architectural primitive.
2. **Teacher avatars collecting coins is confusing.** Teachers are
   spectators; they walk around the level for class management
   but shouldn't trigger collect / choice / gate-walkthrough
   mechanics. V7.15 role-gates the 4 applyInput handlers.
3. **CC can't autonomously playtest without teacher cockpit access.**
   Activity-start currently requires a teacher to click "Run
   Activity" in the cockpit. V7.15 adds a dev query-string hook
   (`?devActivity=U1.1`) that auto-launches U1.1 from the Desk for
   solo testing. Gated by `?dev=1` so production usage is unaffected.

## Engine -- `cr/railway-server/level-engine.js`

### 1. Player role denormalization

In `createLevelState`, populate each player's `role` from
`onlineStudents[i].role` (caller threads it from room.members):

```js
players[u] = {
  x: sp.x * chipSize,
  y: sp.y * chipSize,
  marks: { sampledA: false, sampledB: false, choice: null },
  role: (students[i].role === 'teacher') ? 'teacher' : 'student'
};
```

Same in `onMemberJoin` (read from `room.members.get(username).role`).

This requires the caller (`classroom.js`) to pass role in the
onlineStudents array. If absent, default to 'student'.

### 2. Teacher input gates (4 handlers)

Add at the top of `_handleCoinCollect`, `_handleRecordChoice`,
`_handleWalkThroughGate`, `_handleAttemptGate`:

```js
var player = state.players && state.players[username];
if (player && player.role === 'teacher') return null;
```

(Move the `var player = ...` line up if it's currently below other
checks; the role guard fires before any state mutation.)

### 3. Shared camera state

In `createLevelState`:

```js
state.camera = {
  x:             0,
  viewportFloor: 640    // matches V7.12 #classroom-board-mount max-width CSS cap
};
```

In `tick()`, AFTER `_refreshPlayerPositions` + BEFORE phase logic,
update camera.x:

```js
if (state.camera) {
  // V7.15 shared-camera: follow the leftmost STUDENT (teachers
  // excluded so spectator movement doesn't drag camera back).
  // Camera advances forward-only ratchet (Pico Park: once the
  // class has progressed, the leader can't fall back further).
  var leftmostX = null;
  var usernamesCam = Object.keys(state.players || {});
  for (var ucm = 0; ucm < usernamesCam.length; ucm++) {
    var p = state.players[usernamesCam[ucm]];
    if (!p || p.role === 'teacher') continue;
    if (typeof p.x !== 'number') continue;
    if (leftmostX === null || p.x < leftmostX) leftmostX = p.x;
  }
  if (leftmostX !== null) {
    var vw       = state.camera.viewportFloor || 640;
    var levelPx  = (state.mapWidth || 32) * (state.chipSize || 10);
    var maxCam   = Math.max(0, levelPx - vw);
    // Leader sits ~100 px from the left edge of the viewport.
    var targetX  = Math.max(0, Math.min(maxCam, leftmostX - 100));
    // Forward-only ratchet: camera never retreats. Comment out the
    // Math.max if Pico-style "follow leftmost even backwards" is
    // wanted instead.
    state.camera.x = Math.max(state.camera.x || 0, targetX);
  }
}
```

### 4. serialize camera

Add to the returned object:

```js
camera: state.camera ? {
  x:             state.camera.x || 0,
  viewportFloor: state.camera.viewportFloor || 640
} : null,
```

### 5. Tests -- `cr/railway-server/tests/level-engine-shared-camera.test.js`

Pin:
- state.camera populated by createLevelState (x=0, viewportFloor=640).
- Per-tick: camera.x follows leftmost student.
- Teacher player at far-right does NOT pull camera right.
- Forward-only ratchet: camera doesn't retreat when leader steps back.
- Camera clamped to [0, levelW - viewportFloor].
- Teacher input gates: _handleCoinCollect returns null for teacher.
- Teacher input gates: _handleRecordChoice returns null for teacher.
- Teacher input gates: _handleWalkThroughGate returns null for teacher.
- Teacher input gates: _handleAttemptGate returns null for teacher.
- Non-teacher (student / unknown role) input works as before.
- serialize emits state.camera.

Target: 14-18 cases.

## Classroom.js wrapper -- `cr/railway-server/classroom.js`

### 6. Thread role into createLevelState + onMemberJoin

Find the `startActivity` path (or wherever it builds onlineStudents
from room.members). Each student object passed to createLevelState
should include `role`:

```js
var online = [...room.members.values()].filter(m => m.online).map(function (m) {
  return { username: m.username, role: m.role || 'student' };
});
```

Same for onMemberJoin call.

If member.role isn't currently populated by classroom.join, also
thread it from the join() signature (the existing code already
takes role per `registry.join(ws, section, username, role, ...)`).

## Client -- `fa/classroom-board.js`

### 7. Shared-camera mode

In `_updateCamera`, replace the local-follow logic with a
server-emitted read when state.camera is non-null:

```js
function _updateCamera(dt) {
  if (!_camera.enabled) return;
  // V7.15 shared-camera: server-emitted state.camera.x is the
  // single source of truth. Local follow logic disabled.
  var act = state && state.activity && state.activity.state;
  if (act && act.camera && typeof act.camera.x === 'number') {
    _camera.x = act.camera.x;
    return;
  }
  // Legacy fallback: levels without server-emitted camera use the
  // V7.9.0 local follow. (Backward compat for any level def that
  // somehow lacks state.camera -- shouldn't happen post-V7.15
  // engine, but defensive.)
  // ... existing _updateCamera body ...
}
```

### 8. Dev-start hook

In `ap_stats_roadmap_square_mode.html` (or wherever the Desk inits
classroom-board), after the WS connects + roster is signed in, check
the query string:

```js
function _tryDevAutoStartActivity() {
  if (!new URLSearchParams(location.search).has('dev')) return;
  var devActivity = new URLSearchParams(location.search).get('devActivity');
  if (!devActivity) return;
  // Send a teacher-style startActivity even though we're a student.
  // This needs to bypass the existing teacher-role check on the
  // server side -- but the BUILD spec scope is dev-only, so we
  // just send the message; server-side will need a dev flag to
  // accept. (Out of scope for V7.15; user can manually start activity
  // OR we add `?devKey=<secret>` server-side check in V7.15.1.)
  console.log('[dev] auto-starting activity:', devActivity);
  safeSend({ type: 'classroom_activity_start', activityType: 'level', opts: { levelKey: devActivity } });
}
```

(This is best-effort. If the server-side role check blocks it,
the auto-launch fails silently; CC reports the gap and we add a
server-side dev override in V7.15.1.)

### 9. Tests -- `fa/tests/classroom-board-shared-camera.test.js`

Pin:
- _updateCamera reads from state.activity.state.camera.x when present.
- _updateCamera falls back to local follow when state.camera absent.
- _camera.x synced to server-emitted value on each tick.
- Cockpit fit-to-width path unchanged (teacher view still zooms).
- Dev-start hook: only fires when both `?dev=1` AND `?devActivity=`
  are present in query string.

Target: 10-14 cases.

## Dispatch -- 3 file-disjoint units

| Unit | Owner | Files | Tests |
|---|---|---|---|
| A | CC | `cr/railway-server/level-engine.js` + `classroom.js` (role threading) | `cr/railway-server/tests/level-engine-shared-camera.test.js` (new) |
| B | Sonnet | `fa/classroom-board.js` (shared-camera mode) + `fa/ap_stats_roadmap_square_mode.html` (dev hook) | `fa/tests/classroom-board-shared-camera.test.js` (new) |
| C | (none -- no JSON changes) | -- | -- |

## Risk areas for CC self-review

1. **Forward-only ratchet vs. follow-leftmost-everywhere.** Currently
   speced as forward-only (camera can't retreat). If a student
   disconnects and the leftmost becomes someone way ahead, camera
   stays put -- doesn't ratchet forward to the new leader. Verify
   this is desirable; otherwise drop the max-with-prev guard.
2. **Empty room edge case.** 0 students online (teacher only) -> no
   leftmost found -> camera stays at last position OR at 0 if just
   created. Don't crash.
3. **Cockpit camera.** Cockpit role is teacher; teacher avatar
   doesn't pull camera. Cockpit's fit-to-width branch (`!_camera.
   enabled`) shouldn't read state.camera.x at all -- need to verify
   the fit-to-width path is unaffected.
4. **Teacher input gates need state.players[u].role lookup.** If
   role isn't denormalized into state.players (Unit A engine + Unit
   A classroom.js wrapper), the role gate fires for everyone (returns
   null always) OR for nobody (no role data) -- both broken. Verify
   role threading lands end-to-end before assuming the gate works.

## Acceptance criteria

- cr tests: 337 -> ~352 (+14-18 new), 0 regression.
- fa LC subset: 561 -> ~573 (+10-14 new), 0 regression.
- Smoke (manual or CDP-driven):
  * Two students + one teacher in PeriodX. Student A walks right
    past student B; camera stays at student B's position; student
    A's avatar visually disappears off-right of the viewport on
    BOTH clients (and on the cockpit).
  * Teacher avatar walks past a SipStation -- no collect happens.
    Tally count doesn't bump.
  * Teacher walks past a ContextSlot -- doesn't light it.
  * URL `?dev=1&devActivity=U1.1` auto-starts U1.1 for a solo
    student session (provided the server-side role gate accepts
    the message; if not, document the gap for V7.15.1).

## What ships AFTER V7.15

- **V7.15 self-playtest**: CC uses the dev-start hook + CDP to walk
  U1.1 end-to-end without user intervention. Reports observations
  + suggested fixes. First true autonomous polish loop.
- **V7.16+**: sprite atlas mapping per user-provided coordinates
  (scanner gate / locked doors / etc. swap to real Pico Park atlas
  regions).
- **79-level fan-out**: per-unit author dispatch for the remaining
  level redesigns.

# LIVE_CLASSROOM_V1C_BUILD.md

> Frozen implementation contract for F3 -- Live Classroom v1c
> (synchronized video start). Design authority: LIVE_CLASSROOM_SPEC.md
> Sections 5 and 10 (the v1c paragraph). Written 2026-05-21 (session
> 108). Built via the loop: 3 parallel Sonnet units against the Section
> 1 wire contract + planner-direct on the Desk.

## 0. Scope, units, ownership

v1c lets the teacher's Green Light optionally tell every student Desk to
surface today's lesson video. The WS fields (`classroom_go` /
`classroom_greenlight` carrying `startVideo` + `videoRef`) are already
described in LIVE_CLASSROOM_SPEC.md Section 5; today the server sends a
bare greenlight (v1b never threaded them). v1c threads them and adds the
consumption path.

Four units -- the three Sonnet units touch disjoint files; the Desk is
planner-direct.

| Unit | Repo | Files | Owner |
|------|------|-------|-------|
| U1 -- WS server | curriculum_render | `railway-server/classroom.js`, `railway-server/server.js`, `tests/classroom.test.js` | Sonnet |
| U2 -- board | follow-alongs | `classroom-board.js`, `tests/classroom-board.test.js` | Sonnet |
| U3 -- cockpit | follow-alongs | `teacher-classroom.html`, `tests/classroom-structure.test.js` | Sonnet |
| U4 -- Desk | follow-alongs | `ap_stats_roadmap_square_mode.html` | planner |

EOL: every file LF -- preserve. Stage own paths only. Two commits
(curriculum_render for U1; follow-alongs for U2+U3+U4). The U1 push
touches `railway-server/**` -> deploys the curriculumrender WS service;
it must not regress DogePresence/Tetris and must be independently
deployable. Sacred: never touch `curriculum_render/data/curriculum.js`.

## 1. The wire contract (FROZEN -- every unit builds to this)

Additive only, fully back-compatible: absent `startVideo` == false,
absent `videoRef` == null. A pre-v1c client and a v1c server (or vice
versa) keep working.

Client -> server, `classroom_go`:
```
{ type: 'classroom_go', startVideo: boolean, videoRef: string|null }
```

Server -> clients, `classroom_greenlight` broadcast (section-scoped):
```
{ type: 'classroom_greenlight', section: string,
  startVideo: boolean, videoRef: string|null }
```

`startVideo` / `videoRef` ride ONLY on the live `classroom_greenlight`
broadcast. They are NOT stored in room state and NOT added to
`buildStatePayload` / `classroom_state` -- a student who joins AFTER a
green-light must not be retro-yanked to a video.

Board public API `greenLight`:
```
handle.greenLight(opts?)   opts = { startVideo?: boolean, videoRef?: string|null }
```
`greenLight()` with no args == `{ startVideo:false, videoRef:null }` so
every v1b call site keeps working.

Board `mount()` gains one optional opt:
```
onStartVideo: function(videoRef) {}
```
Called once per inbound `classroom_greenlight` whose `startVideo === true`.
`videoRef` is whatever the broadcast carried (null in v1c). The cockpit
does NOT pass `onStartVideo`; only the Desk embed does.

## 2. U1 -- curriculum_render WS server

`railway-server/classroom.js` -- `greenLight`:
- change the signature to `greenLight(ws, now, startVideo, videoRef)`.
- coerce inside the method: `startVideo` -> `startVideo === true`;
  `videoRef` -> `typeof videoRef === 'string' ? videoRef : null`.
- the `classroom_greenlight` broadcast payload becomes
  `{ type:'classroom_greenlight', section: entry.section,
     startVideo: <coerced>, videoRef: <coerced> }`.
- nothing else changes: still teacher-only, still broadcasts to all room
  sockets, still returns `{ broadcasts }`.

`railway-server/server.js` -- the `classroom_go` case:
- read `data.startVideo` and `data.videoRef`.
- call `classroomRegistry.greenLight(ws, Date.now(), data.startVideo, data.videoRef)`.
- coercion lives in `greenLight`, so the case may pass the raw values
  straight through.
- do NOT touch any other case; the game / DogePresence cases are
  off-limits.

## 3. U2 -- classroom-board.js

`greenLight` (public API in the returned `handle`):
```
greenLight: function (opts) {
  var o = opts || {};
  safeSend({
    type: 'classroom_go',
    startVideo: o.startVideo === true,
    videoRef: (typeof o.videoRef === 'string') ? o.videoRef : null
  });
}
```

`mount()` opts -- read a new optional `onStartVideo`:
```
var onStartVideo = (typeof opts.onStartVideo === 'function') ? opts.onStartVideo : null;
```

`applyMessage` -- it already special-cases `classroom_greenlight` to
call `showGreenlight()`. Add, right after that, ONE guarded call:
```
if (msg.type === 'classroom_greenlight' && msg.startVideo === true && onStartVideo) {
  try { onStartVideo(msg.videoRef || null); } catch (_) {}
}
```
`_reduce` stays PURE and UNCHANGED -- `startVideo`/`videoRef` are read
off the live message, never reduced into state. The greenlight overlay,
the `onStateChange` summary, and the gate/check-in machine are all
unchanged.

## 4. U3 -- teacher-classroom.html (cockpit)

Add a "Sync video start" checkbox to the v1b `.control-strip` (next to
the Green Light button), with `id="sync-video-start"`. Add a one-line
`.hint` sentence explaining it ("When checked, Green Light also opens
today's lesson video on every student Desk.").

The Green Light click handler currently calls `boardHandle.greenLight()`.
Change it to pass the checkbox:
```
boardHandle.greenLight({
  startVideo: !!document.getElementById('sync-video-start').checked
});
```
No `videoRef` from the cockpit in v1c (the field stays null on the
wire). The greenlight-indicator behaviour is unchanged. The cockpit does
NOT pass `onStartVideo` into its `ClassroomBoard.mount(...)` call.

## 5. U4 -- the Desk (planner-direct)

`ap_stats_roadmap_square_mode.html`, `_mountClassroomBoard`: pass an
`onStartVideo` callback into `ClassroomBoard.mount(...)`. The callback
surfaces today's lesson video for the student:
- it focuses / opens the resource view for the section's CURRENT lesson
  (today's calendar lesson) so the video link is front-and-centre;
- it MUST NOT attempt true autoplay -- browser autoplay policy blocks a
  programmatic play with no user gesture (LIVE_CLASSROOM_SPEC.md Section
  10). v1c is "bring the video to the student and let them press Play,"
  not literal autoplay;
- it fails soft -- any error swallowed; a green-light must never break
  the Desk.
The exact Desk wiring (which existing surface presents the lesson:
`showResourcePanel`, the Do-Now card, or a scroll-to-`.cal-current`) is
a planner implementation detail decided against the live Desk code.

## 6. Tests

- curriculum_render `tests/classroom.test.js` -- extend: `greenLight`
  with `startVideo:true` + a `videoRef` puts both (coerced) on the
  `classroom_greenlight` broadcast; junk types coerce to `false`/`null`;
  a bare `greenLight(ws, now)` still broadcasts `startVideo:false`.
  DogePresence/Tetris paths untouched.
- follow-alongs `tests/classroom-board.test.js` -- extend:
  `greenLight({startVideo:true,videoRef:'x'})` sends a `classroom_go`
  carrying both; `greenLight()` sends `startVideo:false`; an inbound
  `classroom_greenlight` with `startVideo:true` fires `onStartVideo`
  with the videoRef; with `startVideo` absent/false it does NOT fire;
  `_reduce` unchanged (greenlight still a boolean).
- follow-alongs `tests/classroom-structure.test.js` -- extend: the
  cockpit has the `sync-video-start` checkbox and the Green Light
  handler passes `startVideo`; the Desk `_mountClassroomBoard` passes an
  `onStartVideo` opt.

Green before commit: curriculum_render `npm test`; follow-alongs root
`npm test`. Report counts. The only acceptable pre-existing fails are
the documented unrelated ones (curriculum_render `redox-chat`;
follow-alongs `study-guide`).

## 7. Gotchas

- The wire contract (Section 1) is FROZEN -- the three Sonnet units must
  build exactly to it so they compose without seeing each other.
- Cross-repo review caveat: a per-repo Codex reviewer sees only one half
  of the `classroom_go` / `classroom_greenlight` contract -- verify any
  cross-repo finding against both halves before folding.
- The U1 push deploys the WS service; U1 must be independently
  deployable and must not regress DogePresence/Tetris.
- ASCII-clean new/edited code where practical.

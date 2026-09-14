# LIVE_CLASSROOM_R3_BUILD.md

> FROZEN CONTRACT -- the Live Classroom Presentation Revamp (r3).
> Design authority: LIVE_CLASSROOM_SPEC.md Section 15. Frozen 2026-05-21
> (session 107). The wire contract in Section 2 is FROZEN: every unit
> implements its half against it; it does not change mid-build. ASCII
> only. Preserve each file's existing EOL.

## 1. Scope and repos

The revamp replaces the Live Classroom presentation: the board becomes
an animated side-view sprite scene reusing curriculum_render's avatars,
and a per-student avatar hue persists cross-app via the roster account.

Two repos, five workstreams:

| ID | Workstream | Repo / area | Owner |
|----|-----------|-------------|-------|
| P  | Planner prep -- file lifts + shared/contended edits | follow-alongs + cr | Planner (direct) |
| U1 | roster-server -- the hue column + endpoint | follow-alongs `roster-server/` | Sonnet subagent |
| U2 | curriculum_render WS server -- the `hue` field | curriculum_render `railway-server/` | Sonnet subagent |
| U3 | curriculum_render picker -- write hue to roster | curriculum_render `index.html` | Sonnet subagent |
| U4 | follow-alongs board -- the sprite-scene rewrite | follow-alongs | Sonnet subagent |

Deploy triggers (a later step, not part of the build):
- A push touching `roster-server/**` auto-deploys roster-server.
- A push touching `curriculum_render/railway-server/**` deploys the
  `curriculumrender-production` WS service.
- SACRED: `curriculum_render/data/curriculum.js` is NEVER touched.

## 2. The frozen wire contract

All changes are ADDITIVE. No message, field, column, or endpoint is
removed or renamed.

### 2.1 roster.sprite_hue (DB)
`roster` gains a nullable column `sprite_hue integer`, value 0-359 or
NULL. Added by migration `0006` (Section 5). NULL = not yet picked.

### 2.2 roster-server db helpers (`db.js`)
- `getSpriteHueByStudentId(studentId)` -> `Promise<integer|null>`.
  Degrades to `null` on ANY error (missing column pre-migration, DB
  error, no row) -- mirrors `getRoleByStudentId`. NEVER throws.
- `updateSpriteHue({ studentId, spriteHue })` -> `{ data, error }`.
  Writes only `sprite_hue` (+ `updated_at` via the existing trigger).
  Mirrors `updateStudent`.

### 2.3 GET-side: POST /roster/verify
The success response gains one field: `spriteHue: integer | null`.
Sourced by `await getSpriteHueByStudentId(studentId)`. It is NOT added
to the `findByUsername` SELECT projection (a missing column there would
break the login query pre-migration).

### 2.4 NEW: PATCH /roster/:studentId/sprite-hue
- Auth: the student's OWN roster token (Bearer header or `?token=`),
  verified by `verifyToken`. The token's studentId MUST equal the
  `:studentId` path param. Pattern = `GET /ledger/student/:studentId`.
- Body: `{ spriteHue: integer 0-359 | null }`.
- Responses: `200 { ok:true, spriteHue }`; `401` missing/invalid token;
  `403 { ok:false, error:'cross-student' }` token != path id; `400`
  spriteHue not (integer 0-359 or null).
- Fail-soft: if the column is missing (pre-migration), respond with a
  non-500 error (`503 { ok:false, error:'sprite_hue not provisioned' }`).

### 2.5 roster-client.js -- current()
`window.rosterClient.current()` (and the `signIn` session write) gain
`spriteHue` (integer|null), carried from the `/roster/verify` response.
Only the FOLLOW-ALONGS copy is changed -- the Desk + cockpit mount sites
consume `current().spriteHue`; cr's picker (U3) does not. NOTE: the cr
copy of `roster-client.js` has already drifted independently of r3 (it
predates the `role` + `changePassword` additions); re-syncing that
shared file is a separate cleanup, out of r3 scope. (Planner owns -- P4.)

### 2.6 WS: classroom_join carries hue
The board's `classroom_join` message gains an optional `hue`:
`{ type:'classroom_join', section, username, role, hue }`. `hue` is an
integer 0-359 or omitted/`null`. The server coerces a non-integer or
out-of-range value to `null`.

### 2.7 WS: Member + WireMember + broadcasts
- The server `Member` gains `hue: integer|null`, set from the
  `classroom_join` payload at `join()` time.
- `toWireMember()` includes `hue`.
- So `classroom_state.members[]` and `classroom_member_update.member`
  carry `hue`. `classroom_gate`, `classroom_greenlight`,
  `classroom_member_left` are unchanged.
- DURABILITY: `hue` is NOT reset by `armGate` or `reset` (unlike
  `status`). A re-join updates `hue` (last value wins).

### 2.8 ClassroomBoard.mount -- the hue opt
`ClassroomBoard.mount(container, opts)` -- `opts` gains
`hue: integer|null`. The board sends that `hue` in its `classroom_join`.
`_reduce` carries `hue` on each WireMember. The renderer tints each
student sprite by `member.hue`; a `null`/absent `hue` falls back to
`hashStringToHue(username)` (the exact function lifted from cr's
`sprite_manager.js`).

## 3. Dependency graph and dispatch

```
P (planner prep)  -- DONE FIRST, before any subagent
   |
   +--> U1  roster-server      -.
   +--> U2  cr WS server        |  all four in PARALLEL
   +--> U3  cr picker           |  (disjoint file sets)
   +--> U4  follow-alongs board-'
            |
            v
   Codex read-only review (per repo)
            |
            v
   Planner folds findings + re-verifies on disk
            |
            v
   Commit + push (per repo)
```

With the Section 2 contract frozen, each unit implements its half
independently. U3 depends only on U1's CONTRACT (2.4), not U1's code.
U4 depends on the planner lifts (P1-P3) being present first -- they are.

File-set disjointness (no two writers share a file):
- P: `canvas_engine.js`, `sprite_sheet.js`, `sprite.png`,
  `roster-client.js` (follow-alongs copy), `ap_stats_roadmap_square_mode.html`.
- U1: `roster-server/**` only.
- U2: `curriculum_render/railway-server/**`,
  `curriculum_render/tests/classroom.test.js`.
- U3: `curriculum_render/index.html` (+ an optional new test file).
- U4: `classroom-board.js`, `teacher-classroom.html`,
  `tests/classroom-board.test.js`, `tests/classroom-structure.test.js`.

## 4. Planner-direct prep (P)

Done by the planner BEFORE the subagents are dispatched.

- P1. Copy `curriculum_render/js/canvas_engine.js` ->
  `follow-alongs/canvas_engine.js`, byte-verbatim.
- P2. Copy `curriculum_render/js/sprite_sheet.js` ->
  `follow-alongs/sprite_sheet.js`, byte-verbatim.
- P3. Copy `curriculum_render/sprite.png` -> `follow-alongs/sprite.png`,
  byte-verbatim (binary). Commit the asset before code references it.
- P4. `roster-client.js` (follow-alongs copy only) -- `current()` and
  the `signIn` session write carry `spriteHue` from the `/roster/verify`
  response. The cr copy is NOT touched (see 2.5 -- pre-existing drift;
  r3 does not depend on it).
- P5. `ap_stats_roadmap_square_mode.html` -- `_mountClassroomBoard`
  passes `hue: <rosterClient.current().spriteHue, or null>` into the
  `ClassroomBoard.mount` opts.

## 5. Unit U1 -- roster-server

OWNED FILES (write only these): `roster-server/migrations/0006_roster_sprite_hue.sql`
(new), `roster-server/db.js`, `roster-server/server.js`,
`roster-server/tests/sprite-hue.test.js` (new).

Tasks:
1. NEW migration `0006_roster_sprite_hue.sql` -- additive, mirrors the
   `0005` style: `ALTER TABLE roster ADD COLUMN IF NOT EXISTS sprite_hue
   integer;` plus a guarded CHECK `sprite_hue IS NULL OR sprite_hue
   BETWEEN 0 AND 359`. No RLS change (it is a column add).
2. `db.js` -- add `getSpriteHueByStudentId` + `updateSpriteHue` per 2.2.
   `getRoleByStudentId` is the degrade-safe template; `updateStudent`
   is the update template. Do NOT touch the `findByUsername` projection.
3. `server.js` -- `/roster/verify`: set `spriteHue` on the success
   object from `await getSpriteHueByStudentId(studentId)` (never lets it
   throw).
4. `server.js` -- NEW `PATCH /roster/:studentId/sprite-hue` per 2.4.
   Token extraction + the cross-student 403 follow
   `GET /ledger/student/:studentId` in `ledger.js`.
5. `tests/sprite-hue.test.js` -- the two db helpers (incl.
   degrade-to-null), `/roster/verify` returns `spriteHue`, the PATCH
   happy path + 401 + 403-cross-student + 400-bad-range, pre-migration
   safe-degrade.

Acceptance: `npm --prefix roster-server test` green (381 prior + new, no
regression). Additive only -- no existing endpoint behavior changes
except `/roster/verify` gaining one response field.

## 6. Unit U2 -- curriculum_render WS server

OWNED FILES: `curriculum_render/railway-server/classroom.js`,
`curriculum_render/railway-server/server.js`,
`curriculum_render/tests/classroom.test.js`.

Tasks:
1. `classroom.js` -- `join()` gains a `hue` parameter; the `Member`
   object gains `hue` (default `null`); `toWireMember()` includes `hue`.
2. `classroom.js` -- `hue` is NOT cleared by `armGate` or `reset`
   (durability, 2.7). A re-join overwrites it (last wins).
3. `server.js` -- the `classroom_join` switch case extracts `data.hue`,
   coerces to an integer in 0-359 or `null`, passes it to `join()`.
4. Tests -- `hue` rides `classroom_join` -> `classroom_state` /
   `classroom_member_update`; `hue` survives `armGate` + `reset`;
   DogePresence + Tetris handling unregressed.

Acceptance: the curriculum_render suite green (795 prior + new; the
known unrelated `redox-chat.test.js` fail is pre-existing). Additive --
must not regress DogePresence/Tetris. SACRED `data/curriculum.js`
untouched.

## 7. Unit U3 -- curriculum_render picker

OWNED FILES: `curriculum_render/index.html`, plus a new test file under
`curriculum_render/tests/` if the suite has a structural-test pattern.

Task: in `saveSpriteConfig()` (around line 12611), AFTER the existing
`playerSprite.setHue(hue)`, also persist the hue to roster-server:
- Only when a roster session exists -- cr's `window.rosterClient`
  (copied in via DN2d): check `rosterClient.token()` and
  `rosterClient.studentId()` are present.
- Fire `PATCH ${ROSTER_SERVICE_URL}/roster/${studentId}/sprite-hue`
  (`ROSTER_SERVICE_URL` from cr's `roster_config.js`) with
  `Authorization: Bearer <token>` and body `{ spriteHue: hue }`.
- BEST-EFFORT: wrap in try/catch + a rejected-promise `.catch`. Any
  failure (offline, 503 pre-migration, no session) is a silent no-op.
  It MUST NOT block or alter the existing local save (localStorage +
  IDB stay exactly as-is).

Acceptance: the existing local save path is byte-unchanged; the roster
write is purely additive and fail-soft. cr suite green. Do NOT touch the
sprite engine, the quiz, or anything outside `saveSpriteConfig`. SACRED
`data/curriculum.js` untouched.

## 8. Unit U4 -- follow-alongs board revamp

OWNED FILES: `classroom-board.js`, `teacher-classroom.html`,
`tests/classroom-board.test.js`, `tests/classroom-structure.test.js`.
The lifted `canvas_engine.js` + `sprite_sheet.js` + `sprite.png` are
already present (planner P1-P3) -- USE them; do NOT modify them.

Task A -- rewrite the RENDER LAYER of `classroom-board.js`:
- PRESERVE unchanged: the public API (`mount`, `destroy`, `setNameMap`,
  `armGate`, `greenLight`, `reset`), the WS lifecycle (connect,
  heartbeat, reconnect/backoff, `classroom_join`), and the pure
  `_reduce` reducer. `_reduce` gains ONLY an additive `hue` field on the
  WireMember it builds (from `classroom_state` /
  `classroom_member_update`).
- REPLACE the render layer: drop the 320x240 pixelated TI-84 canvas and
  the hand-drawn `drawAvatar`/`drawHole`/`drawLabel`. Instead:
  - In `mount()`, create a normally-sized, responsive canvas; give it a
    unique element id and pass that id to `new CanvasEngine(id)` (the
    lifted engine resolves the canvas via `getElementById` -- this is
    the intended adaptation; do NOT edit `canvas_engine.js`).
  - Load the avatar sheet:
    `new SpriteSheet('sprite.png', 80, 96, {columns:11, rows:2, paddingX:4, paddingY:4})`.
  - A NEW slim board sprite entity (defined IN `classroom-board.js`, not
    a cr import): idle-blink (frames [0,10]) + a walk cycle (frames
    [2,3,4,5]); `render(ctx)` via `spriteSheet.drawFrame(ctx, frame, x,
    y, scale, hue)`; an optional `getLabelSpec()` for the name label.
  - Side-view layout: student avatars in a row on a ground line.
  - The gate: a door drawn in the scene; on a member's
    `present`->`checkedIn` transition, that avatar plays the walk cycle
    toward the door, then is removed ("drains"). `_reduce` only flips
    the status flag -- the render layer animates the transition.
  - `online:false` -> dimmed. `greenlight` -> a brief scene overlay cue.
  - Tint each student sprite by `member.hue`; a `null` `hue` -> the
    lifted `hashStringToHue(username)` fallback (copy that exact
    function from cr's `sprite_manager.js` into `classroom-board.js`).
- `mount(container, opts)` -- `opts.hue` (2.8) is sent in
  `classroom_join`.

Task B -- `teacher-classroom.html`: `mountBoard()` passes
`hue: <the roster session's spriteHue, or null>` into the
`ClassroomBoard.mount` opts (API consistency; a teacher avatar is not
drawn). The cockpit control strip + checked-in panel are pure DOM and
need NO change -- they keep working via the unchanged `onStateChange`
summary.

Task C -- tests:
- `tests/classroom-board.test.js` -- keep the `_reduce` tests (pure;
  add a `hue`-field assertion); exercise the render layer via
  `CanvasEngine` against a jsdom / 2d-canvas stub; the
  `present`->`checkedIn` transition triggers the walk-then-drain path.
- `tests/classroom-structure.test.js` -- pin: the three lifted files
  exist; `mount` accepts a `hue` opt.

Acceptance: `npm test` (follow-alongs root) green -- 4505 prior + new;
the known `study-guide.test.js` fail is pre-existing. The board's public
API + the WS protocol are unchanged on the wire except the additive
`hue`. `classroom-board.js` is LF -- keep LF.

Gotcha: largest unit. Do NOT touch `ap_stats_roadmap_square_mode.html`
(the planner owns the Desk mount edit, P5). Do NOT modify the lifted
files.

## 9. Global rules (all units)

- ASCII only in every new/edited file and in any cross-agent prompt.
- Preserve each file's existing EOL. New follow-alongs files: LF. The
  lifted cr files keep cr's bytes verbatim.
- Stage own paths only -- never `git add -A`. The repos carry unrelated
  untracked scratch (`.ai-tutor-*`, `.codex-*`, `state/cross-agent*`).
- SACRED: never write `curriculum_render/data/curriculum.js`.
- Additive only: no message/field/column/endpoint removed or renamed.
- The WS change must not regress DogePresence or Tetris.
- Run the relevant test suite; report pass counts; never leave a suite
  red.

## 10. Test baselines (must not regress)

- follow-alongs root `npm test`: 4505/4506 (the 1 fail =
  `tests/study-guide.test.js`, pre-existing, unrelated).
- roster-server `npm --prefix roster-server test`: 381/381.
- curriculum_render suite: 795/796 (the 1 fail = `redox-chat.test.js`,
  pre-existing, unrelated).

New tests ADD to these counts; no prior test may flip red.

## 11. Commit plan

Per-repo, after Codex review + planner fold:
- follow-alongs: the spec r3 revision + this BUILD doc + P1-P5 + U1 +
  U4. One or two tight commits (roster-server may be its own commit --
  it auto-deploys).
- curriculum_render: U2 + U3. One commit; it deploys the WS service.

Stage explicit paths only. roster-server and railway-server pushes
trigger deploys -- expected.

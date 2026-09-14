# LIVE_CLASSROOM_V2_1_BUILD.md

> FROZEN implementation contract for Live Classroom v2.1. Design
> authority: LIVE_CLASSROOM_V2_1_SPEC.md. Written 2026-05-22 (session
> 109). Built via the loop: 4 parallel Sonnet units against the Section 1
> contract -> Codex read-only review -> planner fold + re-verify on disk
> -> commit. Implement Section 1 EXACTLY -- the four units build to it
> without seeing each other.

## 0. Scope, units, ownership

v2.1 = a student-facing pull-down poll-result screen + a durable,
calendar-anchored, student-browsable poll archive. ALL follow-alongs;
NO curriculum_render / WS-server change (v2's `classroom_poll_closed`
broadcast already carries the result; the archive write is cockpit ->
roster-server REST).

Four units, fully disjoint files -> 4 parallel Sonnet subagents.

| Unit | Files | 
|------|-------|
| U1 -- roster-server archive | `roster-server/migrations/0007_poll_archive.sql` NEW, `roster-server/poll-archive-db.js` NEW, `roster-server/poll-archive.js` NEW, `roster-server/server.js` EDIT (mount), `roster-server/tests/poll-archive.test.js` NEW |
| U2 -- board pull-down screen | `classroom-board.js` EDIT, `tests/classroom-board.test.js` EDIT |
| U3 -- cockpit archive write | `teacher-classroom.html` EDIT, `tests/poll-archive-cockpit.test.js` NEW |
| U4 -- Desk history index | `ap_stats_roadmap_square_mode.html` EDIT, `tests/poll-archive-desk.test.js` NEW |

Rules (ALL units):
- EOL: LF, preserve existing endings. ASCII-only in new/edited code.
- Stage own paths only; do NOT `git add` / commit / push -- the planner
  commits after the Codex review. The repos carry untracked scratch.
- Sacred: never touch `curriculum_render/**`.
- Build EXACTLY to Section 1; do not improvise contract shapes.
- Each unit reads the files it edits before editing; matches the
  surrounding code style and patterns.

## 1. Frozen contracts

### 1.1 The `poll_archive` table

`roster-server/migrations/0007_poll_archive.sql` -- a single
`create table if not exists poll_archive`. READ
`roster-server/migrations/0004_remediation_assignment.sql` first and
MATCH its conventions: the primary-key style, `create ... if not
exists`, the `alter table ... enable row level security` with NO
policies, SQL formatting. Columns:

| Column | Type | Notes |
|--------|------|-------|
| `id` | (match 0004's PK) | primary key |
| `poll_id` | `text` | `UNIQUE` -- the v2 WS poll id; dedup key |
| `section` | `text` | `NOT NULL` |
| `poll_date` | `date` | `NOT NULL` -- the calendar day the poll ran |
| `question` | `text` | `NOT NULL` |
| `options` | `jsonb` | `NOT NULL` -- JSON array of option-label strings |
| `tally` | `jsonb` | `NOT NULL` -- JSON array of integer counts, same length as `options` |
| `blind` | `boolean` | `NOT NULL DEFAULT false` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

Plus `create index if not exists poll_archive_section_date_idx on
poll_archive (section, poll_date);`. RLS enabled, no policies (all
access via the server's service key).

### 1.2 roster-server endpoints (mounted in `server.js`)

**`POST /poll-archive`** -- auth `requireTeacher` (from
`roster-server/teacher-auth.js`). JSON body:
`{ pollId:string, section:string, pollDate:"YYYY-MM-DD",
question:string, options:string[], tally:number[], blind:boolean }`.
- Validate: all fields present; `options` length 2-8; `tally` length
  === `options` length; `pollDate` matches `^\d{4}-\d{2}-\d{2}$`.
  Bad input -> `400 { ok:false, error }`.
- Insert with `ON CONFLICT (poll_id) DO NOTHING` (idempotent re-POST).
- Success -> `200 { ok:true }`.

**`GET /poll-archive`** -- auth: a valid roster token (verify it the
SAME way `roster-server/donow.js` `GET /donow` verifies its roster
token; resolve the caller's roster row via `db.findByStudentId` and read
its `section`). Optional `?date=YYYY-MM-DD`.
- Returns the caller's-section rows (NEVER trust a `section` query
  param), ordered by `poll_date` then `created_at`:
  `200 { ok:true, polls:[{ id, pollId, pollDate, question, options,
  tally, blind, createdAt }] }` -- `options`/`tally` parsed back to
  arrays.
- No/invalid token -> `401`.

**`DELETE /poll-archive/:id`** -- auth `requireTeacher`. Deletes the row.
`200 { ok:true }` (idempotent -- ok even if the id was absent).

ALL THREE: catch the Postgres undefined-table error (`code === '42P01'`)
and return `503 { ok:false, error:'poll_archive not provisioned -- run
migration 0007' }`. Mirror the remediation endpoints' `42P01` degrade
pattern exactly (read `roster-server/remediation.js`). A deploy before
the migration must not 500 and must not affect other routes.

### 1.3 The board API -- `classroom-board.js`

The board component gains a pull-down "classroom screen" + two public
methods on the returned handle:

- **`showResultScreen(polls)`** -- `polls` is a non-empty array of
  `{ question:string, options:string[], tally:number[], blind?:boolean }`.
  Rolls the screen DOWN; renders `polls[polls.length-1]` (the latest);
  if `polls.length > 1`, renders an internal `< N/M >` stepper that
  pages within the array (pure board-internal -- no external callback).
- **`hideResultScreen()`** -- rolls the screen up.

The pull-down screen DOM (created in `mount()`, inside the board's
container): a `<div>` with `position:absolute; left:0; top:0; width:100%`,
`transform:translateY(-100%)` (hidden) <-> `translateY(0)` (shown) with
a CSS `transition:transform`. It holds a `<canvas>` (drawn via
`window.Ti84Plot.drawBarChart(ctx,{labels:options,counts:tally,
title:question})` -- guard `if (window.Ti84Plot)`; it may be absent),
the question text, and a small pull-tab / close control that calls
`hideResultScreen()`.

`_reduce` (STAYS PURE -- no `Date.now`, no DOM):
- `classroom_poll_closed`: keep clearing `state.poll`; ADDITIONALLY set
  `state.closedPoll = { question, options, blind, tally }` -- the
  `question`/`options`/`blind` read from the PRE-clear `state.poll`, the
  `tally` from the message.
- `classroom_poll` (new poll), `classroom_gate`, `classroom_reset`: set
  `state.closedPoll = null`.

Render layer (reacts to reduced state, like the v2 vote-cluster): when
`state.closedPoll` becomes non-null -> `showResultScreen([closedPoll])`;
when it becomes null -> `hideResultScreen()`. `showResultScreen` /
`hideResultScreen` are ALSO public for the Desk's history click.

The v1/v2 protocol, the gate/poll state machine, the avatar scene, and
the v2 cockpit are otherwise UNTOUCHED. Additive only.

### 1.4 The archive POST (cockpit -> roster-server)

On `classroom_poll_closed`, the cockpit POSTs `POST /poll-archive` with
the 1.2 body: `pollId` = the close message `id`; `section` = the
cockpit's current section; `pollDate` = today as `YYYY-MM-DD`;
`question` / `options` / `blind` = the poll the cockpit authored;
`tally` = the close message tally. Auth header
`Authorization: Bearer <rosterClient.token()>`. Fire-and-forget, fully
guarded -- a failed archive must never block or throw in the cockpit.

### 1.5 The Desk history index

The Desk fetches `GET /poll-archive` once on load (signed-in only),
groups the returned polls by `pollDate`, marks calendar cells, and on a
poll-indicator click calls
`_classroomBoardHandle.showResultScreen(thatDaysPolls)`.

## 2. U1 -- roster-server archive

Files: `migrations/0007_poll_archive.sql` (1.1), `poll-archive-db.js`,
`poll-archive.js`, `server.js` (mount), `tests/poll-archive.test.js`.

- `poll-archive-db.js` -- a live + injectable db module mirroring
  `remediation-db.js`: helpers `insertPollArchive(row)` (ON CONFLICT DO
  NOTHING), `listPollArchive(section, date?)`, `deletePollArchive(id)`.
  Reuse the Supabase client bootstrap pattern from `remediation-db.js`.
- `poll-archive.js` -- an Express router with the three 1.2 endpoints.
  Wrap every handler in the `safeAsync` pattern used by
  `remediation.js` (Express-4 promise-rejection guard). Pin the
  `42P01 -> 503` translation on all three.
- `server.js` -- mount the router additively, exactly like the
  remediation router is mounted (fault-tolerant `create...Db` try/catch
  bootstrap).
- Tests: every endpoint happy / 400 / 401 / 403 / `42P01->503`;
  idempotent re-POST; `GET` section-scoping reads the token's section,
  not the param; the `date` filter. Use the existing roster-server test
  fakes/harness. Do NOT regress Phase-0/donow/grade/remediation suites.

## 3. U2 -- board pull-down screen

File: `classroom-board.js` + `tests/classroom-board.test.js`.

Implement 1.3: the pull-down screen DOM + CSS, the `_reduce`
`closedPoll` additions (PURE), the render-layer auto show/hide, the
public `showResultScreen(polls)` / `hideResultScreen()`, the internal
`< N/M >` stepper for a multi-poll array. Use `window.Ti84Plot`
defensively. Do NOT change the WS protocol, the gate machine, the avatar
scene, or the v2 vote-cluster. Tests: `_reduce` `closedPoll` set on
`classroom_poll_closed` / cleared on `classroom_poll`+`reset`+`gate`
(and `_reduce` still pure); `showResultScreen`/`hideResultScreen` toggle
the screen element; the stepper pages a 2+ array.

## 4. U3 -- cockpit archive write

File: `teacher-classroom.html` + `tests/poll-archive-cockpit.test.js`.

Read the cockpit's existing v2 poll-close handling. Add the 1.4 POST in
that close path -- after the existing result render. Use
`window.rosterClient.token()` + `window.ROSTER_SERVICE_URL` (the cockpit
already loads `roster_config.js` / `roster-client.js` for teacher auth;
if it does not, add those `<script>` tags). The POST is guarded
(try/catch + `.catch`), fire-and-forget. Tests (structure + a vm/jsdom
check as the file allows): the close path issues a `POST` to
`/poll-archive` with the 1.4 body shape, guarded.

## 5. U4 -- Desk history index

File: `ap_stats_roadmap_square_mode.html` + `tests/poll-archive-desk.test.js`.

- Add `<script src="ti84-plot.js">` to the Desk (the board's pull-down
  screen needs `window.Ti84Plot`; the Desk does not currently load it).
- On Desk load, for a signed-in roster member, fetch
  `GET ROSTER_SERVICE_URL + '/poll-archive'` with the Bearer roster
  token. Store grouped by `pollDate` (e.g. `_pollArchive`). Guarded,
  never throws, fails quiet.
- In `rCal`: a lesson-day cell whose date (formatted `YYYY-MM-DD`) has
  archived poll(s) gets a small clickable poll indicator -- in the
  spirit of the existing `.status-dot`. The indicator's click
  `stopPropagation()`s (must NOT trigger the cell's resource panel) and
  calls `_classroomBoardHandle.showResultScreen(thatDaysPolls)` --
  guarded (`_classroomBoardHandle` may be null; `showResultScreen` may
  be absent on an old board). Then focus/scroll the board panel into
  view.
- Tests: the Desk loads `ti84-plot.js`; the fetch + grouping helper;
  `rCal` adds the indicator on a poll-day cell; the click is guarded +
  `stopPropagation`s + calls `showResultScreen`.

## 6. Tests -- green before the planner commits

- roster-server: `npm --prefix roster-server test` -- U1 suite green, no
  regression (only known unrelated fails acceptable).
- follow-alongs root: `npm test` -- U2/U3/U4 suites green; the only
  acceptable fail is the long-standing unrelated `study-guide.test.js`.

## 7. Gotchas

- Section 1 is FROZEN -- the four units build exactly to it so they
  compose without seeing each other.
- `_reduce` MUST stay pure (U2) -- the `closedPoll` derivation reads the
  message + prior state only.
- The Desk (`ap_stats_roadmap_square_mode.html`) is a contended
  ~10k-line single file (U4) -- additive edits, EOL LF, read before edit.
- roster-server lives inside follow-alongs; the U1 push touches
  `roster-server/**` and auto-deploys the roster service.
- The `42P01 -> 503` degrade (U1) makes the deploy-before-migration
  window safe; migration `0007` is a user-run Supabase step.
- ASCII-only in new/edited code; no curriculum_render changes.

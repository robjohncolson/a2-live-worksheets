# LIVE_CLASSROOM_V2_1_SPEC.md

> Status: DRAFT -- written 2026-05-22 (session 109). Design freeze for
> Live Classroom v2.1. Builds on v2 (Poll mode, shipped session 108 --
> LIVE_CLASSROOM_V2_BUILD.md). Authoritative for v2.1; defers to
> LIVE_CLASSROOM_SPEC.md for all v1/v2/r3 design. Resolves decision K11.
> Next: planner review -> freeze LIVE_CLASSROOM_V2_1_BUILD.md ->
> dependency-aware dispatch.

## 1. Overview

v2 shipped the POLL mechanic: the teacher opens a 2-8 option question,
students vote, avatars cluster under the option columns, and the teacher
COCKPIT renders the tally as a TI-84 bar chart (`ti84-plot.js`). Three
pieces were deferred (LIVE_CLASSROOM_V2_BUILD.md Section 0):

1. a student-facing TI-84 poll-result surface (v2 shows the result only
   in the cockpit);
2. a durable archive of poll graphs;
3. poll history.

v2.1 delivers all three. Brainstormed session 109; the teacher's three
decisions (Section 3) collapse pieces 2+3 into one thing -- a durable,
calendar-anchored, student-browsable poll archive -- and fix the result
surface form.

## 2. The shape of v2.1

Two workstreams:

- **A -- the pull-down classroom screen.** A TI-84 plot panel that
  slides down over the Live Classroom board (the avatar scene) like a
  classroom projector screen. It shows a poll's result -- the question
  plus the `ti84-plot.js` bar chart. It is the SINGLE viewer for both a
  just-closed live poll and a historical poll opened from the calendar.

- **B -- the poll archive.** Every closed poll is saved to a durable
  roster-server table, anchored to the calendar date it ran on. The Desk
  calendar marks days that have polls; any student can click a marked
  day to replay that poll on the pull-down screen.

v2 already broadcasts the closed result to every client
(`classroom_poll_closed { id, tally }`), and the archive write is a
cockpit -> roster-server REST call. So **v2.1 changes NO
curriculum_render / WS-server code** -- it is entirely follow-alongs
(including its in-repo `roster-server/`).

## 3. Locked decisions (teacher, session 109)

- **V2.1-D1 -- Persistence is roster-server.** A new `poll_archive`
  table (migration `0007`), written by the teacher cockpit on poll
  close, read by students. Durable, cross-device, survives a WS-server
  restart. localStorage was considered and rejected: per-device, lost
  on a cache clear.
- **V2.1-D2 -- The student result surface is a pull-down "classroom
  screen."** A TI-84 plot panel that slides DOWN over the board, like a
  pull-down projector screen at the front of a classroom. Resolves K11
  (overlay modal vs pull-down -- pull-down chosen; the board IS a
  classroom, the metaphor fits).
- **V2.1-D3 -- History is student-browsable, anchored to the calendar
  day.** Each archived poll is pinned to the date it ran. The Desk
  calendar marks poll days; a student clicks a marked day to view that
  poll. The calendar is the index; the pull-down screen is the viewer.
- **V2.1-D4 (derived) -- v2.1 is single-repo, follow-alongs only.** No
  curriculum_render / WS-server change (Section 2). roster-server lives
  inside follow-alongs.
- **V2.1-D5 -- One viewer, two triggers.** The pull-down classroom
  screen renders BOTH a live close and a calendar history click -- same
  component, same `ti84-plot.js` render.
- **V2.1-D6 -- Auto-tag by date; the cockpit owns the write.** On poll
  close the cockpit POSTs the result to roster-server with
  `poll_date = today`. No manual tagging UI in v2.1 -- the calendar date
  IS the tag. Teacher curation is a DELETE.

## 4. Architecture

### 4.1 Files (all follow-alongs)

| Piece | File | Change |
|-------|------|--------|
| Archive table | `roster-server/migrations/0007_poll_archive.sql` | NEW (user-run) |
| Archive db | `roster-server/poll-archive-db.js` | NEW (live + injectable, like `remediation-db.js`) |
| Archive API | `roster-server/poll-archive.js` + `server.js` mount | NEW endpoints |
| Pull-down screen | `classroom-board.js` | EDIT -- the result screen + API |
| Archive write | `teacher-classroom.html` | EDIT -- POST on poll close |
| Calendar index | `ap_stats_roadmap_square_mode.html` | EDIT -- poll indicators + history fetch + board wiring |
| Plot module | `ti84-plot.js` | REUSED as-is (no change expected) |

No curriculum_render file is touched.

### 4.2 The `poll_archive` table (migration 0007)

User-run in the curriculum_render Supabase SQL editor, like `0004`-`0006`.

Columns:
- `id` -- primary key (match the existing migrations' PK style).
- `poll_id text` -- the v2 WS poll id; UNIQUE (dedup -- a re-POST of the
  same close is idempotent).
- `section text NOT NULL` -- the class section (e.g. `PeriodE`).
- `poll_date date NOT NULL` -- the calendar day the poll ran; the anchor
  for the calendar tie (V2.1-D3).
- `question text NOT NULL`.
- `options jsonb NOT NULL` -- the option labels (a JSON string array).
- `tally jsonb NOT NULL` -- vote counts per option index (a JSON number
  array, same length as `options`).
- `blind boolean NOT NULL DEFAULT false`.
- `created_at timestamptz NOT NULL DEFAULT now()`.

Index on `(section, poll_date)` -- the read path. RLS enabled with NO
policies -- consistent with `item_ledger` / `remediation_assignment`:
roster-server uses the service key, so RLS-on-no-policies blocks any
direct anon/student access; all access is through the server.

### 4.3 roster-server endpoints

| Method / path | Auth | Effect |
|---------------|------|--------|
| `POST /poll-archive` | teacher (`requireTeacher`) | Insert one archived poll. Body `{ pollId, section, pollDate, question, options[], tally[], blind }`. Idempotent on `poll_id` (`ON CONFLICT DO NOTHING`). |
| `GET /poll-archive` | any valid roster token | List archived polls for the TOKEN'S section (section read from the token, never a trusted query param). Optional `?date=YYYY-MM-DD`. Returns `[{ id, pollDate, question, options, tally, blind, createdAt }]`. |
| `DELETE /poll-archive/:id` | teacher (`requireTeacher`) | Delete one archived poll (curation -- removes a junk/test poll). |

Pre-migration safety: every endpoint catches the Postgres
"relation does not exist" error (`42P01`) and returns `503` naming
`0007` -- the same degrade pattern as the remediation endpoints. A
deploy that lands before the teacher runs `0007` does not 500; the rest
of roster-server is unaffected.

### 4.4 The pull-down classroom screen (`classroom-board.js`)

A new render-layer element OWNED by the board component:
- A `<div>` over the top of the board's container, holding a `<canvas>`.
  CSS `transform: translateY(-100%)` (rolled up, hidden) ->
  `translateY(0)` (rolled down) with a transition -- the pull-down
  motion. A small pull-tab / close affordance rolls it up.
- It renders a poll via `Ti84Plot.drawBarChart(ctx, { labels: options,
  counts: tally, title })` plus the question text.
- New board public API: `showResultScreen(poll)` and `hideResultScreen()`,
  where `poll = { question, options, tally, blind, pollDate?, lesson? }`.
- Auto-show: the `_reduce` `classroom_poll_closed` case already clears
  `state.poll`; the render layer additionally calls `showResultScreen`
  with the closed `{ question, options, tally }` (the question/options
  are remembered from the open `classroom_poll`; the `tally` arrives on
  close). `_reduce` stays PURE -- the auto-show is render-layer, like the
  v2 vote-cluster.
- Roll-up: `classroom_reset`, a new `classroom_poll`, or
  `classroom_gate` rolls the screen back up; a student can also roll it
  up manually.
- The screen is presentation-only (no controls). It appears wherever the
  board is mounted (the Desk AND the cockpit). The cockpit's v2 inline
  live-tally canvas is unchanged -- that is the teacher's authoring view
  while a poll is OPEN; the pull-down is the shared closed-result
  presentation.

### 4.5 The calendar history index (`ap_stats_roadmap_square_mode.html`)

- On Desk load, for a signed-in roster member, fetch `GET /poll-archive`
  once -> the section's archived polls. Guarded, never throws, fails
  quiet (no polls -> no indicators).
- `rCal`: a lesson-day cell whose date has one or more archived polls
  gets a small poll indicator (a badge/icon, in the spirit of the
  existing `.status-dot`), keyed by `poll_date` matching the cell date.
- Clicking the indicator -> `boardHandle.showResultScreen(poll)` for
  that day's poll. If a day has more than one poll, the screen carries a
  small `< 1/N >` stepper.
- The board panel is focused / scrolled into view on a history click.

### 4.6 The archive write (`teacher-classroom.html`)

- The cockpit already receives `classroom_poll_closed` and holds the
  poll's `question` / `options` (from when it opened the poll) plus the
  `tally` and `blind`.
- On poll close, the cockpit POSTs `/poll-archive` with
  `{ pollId, section, pollDate: <today, YYYY-MM-DD>, question, options,
  tally, blind }`. Fire-and-forget, guarded -- a failed archive never
  blocks the cockpit. Idempotent server-side on `pollId`.

## 5. Data flow

Live close:
`teacher Close Poll -> classroom_close_poll -> WS broadcasts
classroom_poll_closed { id, tally } -> (a) every board rolls the
pull-down screen DOWN with the result; (b) the cockpit POSTs the result
to /poll-archive`.

History browse:
`Desk load -> GET /poll-archive (section) -> rCal marks poll days ->
student clicks a marked day -> boardHandle.showResultScreen(thatPoll) ->
the pull-down screen rolls down with the archived bar chart`.

## 6. Phasing and dependency-aware dispatch

One phase. The contract (the `poll_archive` columns, the three endpoint
shapes, the `showResultScreen(poll)` API) is frozen FIRST in
`LIVE_CLASSROOM_V2_1_BUILD.md`; then four units:

- **U1 -- roster-server.** Migration `0007`, the db helpers, the three
  endpoints. Self-contained -> Sonnet.
- **U2 -- `classroom-board.js`.** The pull-down result screen (DOM +
  slide CSS + `ti84-plot` render + `showResultScreen`/`hideResultScreen`
  + auto-show on `classroom_poll_closed`). Self-contained -> Sonnet.
- **U3 -- `teacher-classroom.html`.** The archive POST on poll close.
  Depends on U1's endpoint CONTRACT, not its deploy -> Sonnet.
- **U4 -- the Desk (`ap_stats_roadmap_square_mode.html`).** The history
  fetch, the calendar poll indicators, the click -> `showResultScreen`.
  Depends on U1's GET contract + U2's board API contract. The contended
  Desk file -> PLANNER-DIRECT (never parallel-Sonnet on it).

Then the loop: Codex read-only review -> planner folds + re-verifies on
disk -> tight commits. roster-server auto-deploys on the U1 push (it
touches `roster-server/**`); the rest is GitHub Pages.

User-owned handoff: migration `0007` is run by the teacher in the
Supabase SQL editor (like `0004`-`0006`). The `42P01 -> 503` degrade
(4.3) makes the deploy-before-migration window safe.

## 7. Testing

- roster-server (`roster-server/tests/`): `0007` migration shape
  (columns, the unique `poll_id`, the index, RLS-no-policies); the
  `poll-archive` db helpers; `POST` (teacher 401/403; happy; idempotent
  re-POST); `GET` (section-scoped from the token, never the param; the
  optional `date` filter); `DELETE` (teacher-gated); the `42P01 -> 503`
  pre-migration degrade on all three endpoints.
- `tests/classroom-board.test.js` -- extended: `showResultScreen` /
  `hideResultScreen` toggle the screen; `classroom_poll_closed`
  auto-shows it; `classroom_reset` / a new `classroom_poll` rolls it up;
  `_reduce` stays pure.
- `tests/classroom-structure.test.js` -- extended: the cockpit POSTs on
  close; the Desk fetches `/poll-archive`, marks poll-day cells, wires
  the click to `showResultScreen`.
- `tests/ti84-plot.test.js` -- unchanged unless the plot module needs a
  tweak.
- Green before commit: roster-server `npm test`; follow-alongs root
  `npm test` (only the known unrelated `study-guide` fail acceptable).

## 8. Open knobs / proposed defaults

- **K12.** Multiple polls on one calendar day -> the pull-down screen
  carries a `< 1/N >` stepper. PROPOSED default: yes, a stepper.
- **K13.** The pull-down screen's scope -- over the board PANEL (chosen,
  D2: the projector-screen metaphor) vs a full-viewport overlay.
  Tunable; D2 is the board-panel form.
- **K14.** Live-close auto-show for students not currently looking at
  the board: the screen rolls down over the board panel; NO forced
  scroll (non-intrusive -- students are already at the board when they
  just voted). A history click DOES focus the board.
- **K15.** Archive retention -- v2.1 keeps every closed poll; curation
  is the teacher DELETE. A dated auto-prune is a later knob.
- **K16.** A teacher edit (re-tag / fix a question typo) -- a
  `PATCH /poll-archive/:id` -- is DEFERRED past v2.1; auto-tag-by-date
  plus DELETE is the v2.1 surface.

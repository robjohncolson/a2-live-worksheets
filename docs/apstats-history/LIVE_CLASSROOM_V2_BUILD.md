# LIVE_CLASSROOM_V2_BUILD.md

> Frozen implementation contract for F4 -- Live Classroom v2 (Poll mode +
> ti84-plot.js). Design authority: LIVE_CLASSROOM_SPEC.md Sections 5, 7,
> 9, 15.3. Written 2026-05-21 (session 108). Built via the loop: 4
> parallel Sonnet units against the Section 1 wire contract.

## 0. Scope, units, ownership

v2 adds the POLL mechanic on the existing Live Classroom substrate: the
teacher opens a question with 2-8 options; each student votes; the live
avatar cluster is the distribution; a snapshot renders as a TI-84-style
plot. The gate (v1) and the poll are mutually exclusive (one active mode).

**K11 resolved:** the TI-84 result plot renders as an inline `<canvas>`
in the teacher cockpit. Students see the live distribution as their
avatar cluster on the board itself. A dedicated student-facing TI-84
overlay / pull-down surface is DEFERRED (v2.1).

**Deferred (NOT in F4):** per-lesson tagging of saved poll graphs;
the student-facing TI-84 surface; poll history.

Four units. All four touch disjoint files -> 4 parallel Sonnet units;
no planner-direct Desk part (the board component carries the student
poll UI; the Desk embed needs no change).

| Unit | Repo | Files | Owner |
|------|------|-------|-------|
| U1 -- WS poll | curriculum_render | `railway-server/classroom.js`, `railway-server/server.js`, `tests/classroom.test.js` | Sonnet |
| U2 -- board poll | follow-alongs | `classroom-board.js`, `tests/classroom-board.test.js` | Sonnet |
| U3 -- plot module | follow-alongs | `ti84-plot.js` (NEW), `tests/ti84-plot.test.js` (NEW) | Sonnet |
| U4 -- cockpit poll | follow-alongs | `teacher-classroom.html`, `tests/classroom-structure.test.js` | Sonnet |

EOL: every file LF -- preserve. Stage own paths only. Two commits
(curriculum_render for U1; follow-alongs for U2+U3+U4). U1 deploys the
WS service; it must not regress DogePresence/Tetris/the v1 gate and must
be independently deployable. Sacred: never touch
`curriculum_render/data/curriculum.js`.

## 1. The WS protocol (FROZEN -- every unit builds to this)

All additive, prefixed `classroom_`. The v1 gate messages are untouched.

### 1.1 Server state (additive)

`ClassroomRoom` gains:
```
poll: { id: string, question: string, options: string[],
        blind: boolean, openedAt: number } | null
```
`Member` gains `vote: number | null` (option index). `status` gains a
third value `"voted"` (alongside `present` / `checkedIn`).

`gate` and `poll` are NEVER both non-null (Section 1.4, mode exclusivity).

### 1.2 Client -> server

| Type | Sender | Payload | Effect |
|------|--------|---------|--------|
| `classroom_open_poll` | teacher | `{ question, options, blind }` | Opens a poll. `options` length must be 2-8. Rejected if a gate is armed. Resets every member `vote=null`, `status="present"`. Broadcasts `classroom_poll`. |
| `classroom_vote` | student | `{ choice }` | Sets the sender `vote=choice`, `status="voted"`. Ignored if no poll open or `choice` out of `[0, options.length)`. Broadcasts a role-aware `classroom_member_update`. |
| `classroom_close_poll` | teacher | `{}` | Computes the final tally, clears `room.poll`, broadcasts `classroom_poll_closed`. |
| `classroom_reveal` | teacher | `{}` | Blind poll only: broadcasts `classroom_poll_reveal` (full per-member votes) to ALL sockets. |

### 1.3 Server -> client (section-scoped)

| Type | Payload | When |
|------|---------|------|
| `classroom_poll` | `{ id, question, options, blind }` | Poll opened. |
| `classroom_poll_closed` | `{ id, tally }` | Poll closed. `tally` = `number[]`, count per option index. |
| `classroom_poll_reveal` | `{ id, tally, members }` | Blind poll revealed; `members` = `[{ username, vote }]`. |
| `classroom_member_update` | `{ member }` (existing) | Now also fires on a vote; `member.vote` is role-gated (1.4). |
| `classroom_state` | (existing) | Now carries `poll`; `members[].vote` is role-gated (1.4). |

### 1.4 Role-aware broadcast (the blind-poll rule)

The wire never carries real names (v1 rule, unchanged). For a poll with
`blind === true`, while the poll is open:
- to a STUDENT socket: a `classroom_member_update` / `classroom_state`
  reveals `vote` ONLY for that student own member; every other student
  member carries `status:"voted"` with `vote` omitted (or null).
- to a TEACHER socket: every member `vote` is always included.
For a non-blind poll, `vote` is included for all sockets.
`classroom_reveal` sends `classroom_poll_reveal` with the full tally +
per-member votes to ALL sockets.

Implementation: the registry splits the room sockets by member role and
emits TWO broadcast objects (`{ sockets: studentSockets, payload:
studentPayload }` and `{ sockets: teacherSockets, payload:
teacherPayload }`) -- `broadcastToClassroom` already iterates broadcasts
and sends each payload to its own socket list, so no server.js broadcast
helper change is needed. `join`'s reply (`sends`) is built for the
joining socket role.

### 1.5 Mode exclusivity

The board has exactly one active mode: idle, gate, or poll.
- `classroom_open_poll` while `room.gate` is armed -> rejected, no effect.
- `classroom_arm_gate` while `room.poll` is non-null -> rejected, no
  effect (this requires a one-line guard ADDED to the existing `armGate`).
- `classroom_close_poll` / `classroom_reset` clear the poll.
`classroom_reset` (v1) also clears `poll` and every member `vote`.

### 1.6 Error handling

- `classroom_open_poll` with `options` length outside 2-8 -> rejected.
- `classroom_vote` with no poll open, or `choice` not an integer in
  range -> ignored, no broadcast.
- A teacher-control message from a non-teacher socket -> rejected (the
  existing v1 guard pattern: `if (member.role !== 'teacher') return
  { broadcasts: [] };`).
- Unknown message type -> ignored (existing behavior).

## 2. U1 -- curriculum_render WS poll server

`railway-server/classroom.js`:
- `ClassroomRoom` factory: add `poll: null`. `Member` factory: add
  `vote: null`.
- `buildStatePayload(room, forRole)` -- replace the hardcoded
  `poll: null` with `poll: room.poll || null`; make the members list
  role-aware per 1.4 (a `forRole` argument; student callers get votes
  masked for a blind poll).
- NEW methods, each returning `{ broadcasts }` (or `{ sends, broadcasts }`),
  no socket I/O, following the existing registry method pattern:
  `openPoll(ws, question, options, blind, now)`,
  `castVote(ws, choice, now)`,
  `closePoll(ws, now)`,
  `revealPoll(ws, now)`.
- `armGate`: add the 1.5 guard -- reject when `room.poll` is non-null.
- `reset`: also clear `room.poll` and every member `vote`.
- Export the four new methods.

`railway-server/server.js`: add four `case` blocks in the single
`switch(data.type)`, between the existing classroom cases and `default`
(do NOT disturb the game/DogePresence cases). Each reads its payload
fields, calls the registry method, dispatches via
`broadcastToClassroom(null, result.broadcasts)` (and `result.sends` for
join-style replies). Follow the existing `classroom_*` case pattern.

`tests/classroom.test.js`: extend per Section 6.

## 3. U2 -- classroom-board.js poll rendering

- `_reduce`: add pure cases for `classroom_poll` (set `state.poll`),
  `classroom_poll_closed` (clear `state.poll`), `classroom_poll_reveal`
  (no state change required beyond what the render layer needs);
  `classroom_member_update` / `classroom_state` already carry `vote` --
  thread it onto the reduced member (additive, like `hue`). `_reduce`
  stays PURE.
- Render layer: when `state.poll` is non-null, draw the option labels as
  evenly spaced columns across the scene; a student whose `status` is
  `"voted"` has their sprite positioned under their chosen option column;
  un-voted students stand in the idle row. (Reuse the existing
  `computeSlots` / BoardSprite walk animation -- a vote walks the sprite
  to its column, mirroring the gate drain.)
- Student vote affordance: when a poll is open and this client is a
  student who has not voted, show option buttons (one per option, reuse
  the check-in-button pattern). A click sends `classroom_vote`.
- Public API: add `openPoll(question, options, blind)`, `closePoll()`,
  `reveal()` to the returned handle -- each `safeSend`s the matching
  teacher message. (Mirror the v1b `armGate`/`greenLight`/`reset` methods.)
- `onStateChange` summary: include `poll` and the per-option `tally` so
  the cockpit can render the live result.

## 4. U3 -- ti84-plot.js (NEW)

A plain browser script (no import/export), attaching `window.Ti84Plot`.
Data-driven TI-84-style plotting, adapted from the trainer renderer
`ti84-trainer-v2/native/screen-renderer.js` (read it for the calculator
framing / pixel font; do NOT modify the trainer).

Public API:
```
Ti84Plot.drawBarChart(ctx, { labels: string[], counts: number[], title? })
Ti84Plot.drawDotplot(ctx, { values: number[], labels?: string[], title? })
```
- `drawBarChart` renders one bar per option, height scaled to the max
  count, the count printed above each bar, the label below -- the
  natural poll-result plot.
- `drawDotplot` stacks one dot per value -- the cheapest, most poll-like
  plot (LIVE_CLASSROOM_SPEC.md Section 7).
- Both reuse a shared TI-84 axis/frame draw (calculator screen look).
- Pure rendering, data-driven, no hardcoded mock data, no DOM beyond the
  passed 2d context. ASCII-clean.

## 5. U4 -- teacher-classroom.html cockpit poll UI

Add a "Poll" section to the cockpit (a new `.section`, sibling of the
v1b Gate Controls):
- A poll-authoring form: a question text input, 2-8 option text inputs
  (start with 2-3, an "add option" affordance up to 8), a "Blind" checkbox.
- An "Open Poll" button -> `boardHandle.openPoll(question, options, blind)`.
  Disabled / guarded while a gate is armed (mode exclusivity, 1.5).
- "Close Poll" and "Reveal" buttons (Reveal enabled only for a blind poll).
- A live tally readout + an inline `<canvas>` rendering the result via
  `Ti84Plot.drawBarChart(ctx, { labels, counts })`, fed from the
  `onStateChange` summary `poll`/`tally`.
- Load `ti84-plot.js` as a sibling `<script>` (after `classroom-board.js`).
The v1b Gate Controls section is unchanged; the cockpit now shows both,
and the board enforces one-active-mode.

## 6. Tests

- curriculum_render `tests/classroom.test.js` -- new: `openPoll`
  (option-count 2-8 bounds; rejected while a gate is armed); `castVote`
  (in-range vs out-of-range; no-poll ignored); `closePoll` tally math;
  `revealPoll`; the blind-poll role-aware rule (a student broadcast
  masks other students votes, a teacher broadcast does not; reveal
  unmasks for all); mode exclusivity (arm-gate rejected while a poll is
  open); `reset` clears the poll; DogePresence/Tetris/v1-gate unregressed.
- follow-alongs `tests/classroom-board.test.js` -- new: `_reduce` poll
  cases (pure); the `openPoll`/`closePoll`/`reveal` handle methods send
  the right messages; a `classroom_vote` is sent on an option click;
  `_reduce` stays pure.
- follow-alongs `tests/ti84-plot.test.js` (NEW) -- `drawBarChart` /
  `drawDotplot` against a 2d-context stub: correct bar count, height
  scaling, no throw on empty/degenerate data, axis drawn.
- follow-alongs `tests/classroom-structure.test.js` -- new: the cockpit
  Poll section exists (question input, option inputs, Blind checkbox,
  Open/Close/Reveal buttons, the result canvas); `ti84-plot.js` is
  loaded; `ti84-plot.js` exists and exposes `window.Ti84Plot`.

Green before commit: curriculum_render `npm test`; follow-alongs root
`npm test`. The only acceptable pre-existing fails are the documented
unrelated ones (curriculum_render `redox-chat`; follow-alongs
`study-guide`).

## 7. Gotchas

- The WS protocol (Section 1) is FROZEN -- the four Sonnet units build
  exactly to it so they compose without seeing each other.
- The role-aware blind-poll broadcast (1.4) is the subtle part: the
  registry emits per-role broadcast objects; verify a student socket can
  never receive another student vote while a blind poll is open.
- Mode exclusivity (1.5) requires touching the EXISTING `armGate` -- one
  guard line; do not otherwise change v1 gate behavior.
- Cross-repo review caveat: a per-repo reviewer sees only one half of
  the poll contract -- verify cross-repo findings against both halves.
- U1 deploys the WS service; must be independently deployable and must
  not regress DogePresence / Tetris / the v1 gate.
- ASCII-clean new/edited code where practical. `ti84-plot.js` is a new
  follow-alongs file (no build step) -- plain browser script.

# Live Classroom v3 -- Live Mode + WebRTC + Data Modes Spec

> Status: DRAFT, session 111, 2026-05-23. The next major architectural
> step after the v2.1 polls + r3 sprite scene + v1c synced video + the
> session-111 SCALING knob 1. Brings the cockpit a global presence view
> by default and a class-time "Live" mode that drops a section onto
> WebRTC for pedagogically-killer real-time data modes. First concrete
> data mode = vote-with-your-feet multi-doorway.
>
> Builds on `LIVE_CLASSROOM_SPEC.md` (the v1/v2 master) and
> `LIVE_CLASSROOM_SCALING_SPEC.md` (cadence knob, shipped session 111).
> Sibling docs persist; this is additive, not a rewrite.

## 1. Problem

The Live Classroom today is **section-scoped + WS-broadcast at a scaled
cadence** (100-500 ms by member count). That's the right shape for
ambient presence + asynchronous polls + once-a-day rituals (the gate
check-in), and the session-111 scaling work bounded its server traffic.

But two real teacher-side limits surface:

- **The cockpit only watches one section at a time.** Outside class
  time (evenings, weekends, lunch), a teacher who wants to know "is
  anyone online right now?" has no surface for it -- the cockpit shows
  whichever section is active, nothing else.
- **The 200-300 ms broadcast lag forecloses live data modes.** The most
  pedagogically valuable AP-Stats classroom interactions -- watching a
  sampling distribution form live, density-sliders that update as the
  class moves them, vote-with-your-feet polls -- *depend* on sub-20 ms
  smoothness for their emotional payoff. At 300 ms the histogram
  staggers; the lesson loses its punch.

CSP (client-side prediction) was considered and declined this session
(`feedback_live_classroom_self_directed.md` partners with the existing
CSP-decline note in CONTINUATION s110). The cleaner answer is to drop
the lag where it matters: in class, on a LAN, via WebRTC P2P.

## 2. Goal / non-goals

**Goal**: a clean two-mode model that gives the teacher (a) **global
presence visibility outside class time** via the existing WS transport,
and (b) **sub-20 ms WebRTC for live-data lesson tools inside class
time**, scoped to one section. One toggle ("Live") swaps between them.
The first concrete data mode that justifies the WebRTC investment is
vote-with-your-feet (multi-doorway).

**Non-goals**:

- **No voice / screen-share / peer-pair channels.** See
  `feedback_live_classroom_self_directed.md` -- the classroom style is
  self-directed and whole-class, not problem-by-problem realtime
  intimacy. Voice / share / peer modes are explicitly rejected.
- **No client-side prediction.** Declined session 110.
  WebRTC's actual latency drop is preferred to CSP's smoothness-with-
  rubber-band tradeoff.
- **No mesh topology.** Star only; the teacher's cockpit is the host.
  Mesh at 30 students is 435 P2P connections per browser -- DOA.
- **No cross-section data aggregation in a Live event.** When the
  teacher goes Live with Period B, only Period B contributes. (The
  cockpit's *Idle*-mode global view IS section-mixed; just not in a
  Live data event.)
- **No new persistence model.** Live-data events follow the v2.1 poll
  archive pattern (write a snapshot to the existing roster-server
  archive table at close-of-event). No new DB tables for v3 phase 1.
- **No `curriculum_render/data/curriculum.js` change.** Sacred (per
  `feedback_curriculum_render_sacred.md`).

## 3. The two modes

| Property         | Idle (default)                        | Live (button on)                         |
|------------------|---------------------------------------|------------------------------------------|
| Cockpit scope    | All sections; everyone online         | One section, picked at Live-on           |
| Student scope    | Section-scoped (unchanged)            | Section-scoped (unchanged)               |
| Transport        | Railway WS (status quo)               | WebRTC star (cockpit host); WS fallback  |
| Cadence          | Scaled per `POS_RATE_TABLE` (s111)    | Native WebRTC datachannel (no rate cap)  |
| Avatar features  | All existing (r3 sprites, gate)       | All existing + active Data Mode UI       |
| Data modes       | None (asynchronous polls are v2)      | Available (vote-with-feet first)         |
| Teacher avatar   | Invisible observer                    | Visible (a new behaviour -- see Section 7) |
| Student indicator| (none)                                | "Live with Mr. Colson" pill              |

Notable: **the student view is section-scoped in both modes**. The
section-agnostic property of Idle mode is teacher-side ONLY. A student
never sees students from a different period.

## 4. The Live button (cockpit UI)

The cockpit grows one new control. Three observable states:

- **Idle** -- default; gray pill labelled `Go Live`.
- **Live** -- green pill labelled `Live (Period B) -- 12 connected`;
  click to exit, ESC also exits.
- **Live (Fallback)** -- amber pill labelled `Live (Period B, WS fallback)`;
  same exit behavior; visual indicator that smooth modes are degraded.

Press flow:

1. Click `Go Live`.
2. Section picker drops (today: just `PeriodX`; post-Sept-1: `A B C D E PeriodX`).
3. On pick: cockpit fires a `classroom_live_start { section }` over WS,
   then begins WebRTC negotiation in parallel with each connected
   student in that section.
4. As DataChannels open, each student's row goes from "connecting" to
   "live". A 3-second timeout per student falls back to WS for that
   student only (per-student fallback, not whole-room).
5. The data-mode toolbar appears below the section roster.

Exit: pill click OR ESC -> `classroom_live_stop` over WS -> all
DataChannels close -> student-side Live UI hides -> cockpit returns to
the Idle global view.

## 5. Student-side "we're live" indicator

When a student's WS receives `classroom_live_start` for their section,
their Desk shows a fixed `Live with Mr. Colson` pill (top-right,
matching the existing s108 preview-as-student badge style). The active
data mode's controls slot in below the avatar board:

- **Vote-with-your-feet active**: the multi-doorway is rendered on the
  avatar board, ready to walk through.
- **(Future) Slider active**: a 0-100 slider appears below the board.
- **(Future) 2D-axes drop active**: the board axes are labelled and
  the student drags their sprite.

Outside Live, those controls are hidden -- the avatar board reverts to
its session-110 r3 sprite-scene state with the gate (if armed).

## 6. The transport

### 6.1 Signaling

Reuse the Tetris precedent verbatim: WS server relays three signaling
message types between the cockpit and each student in the active Live
section.

| Message                  | Direction        | Carries                |
|--------------------------|------------------|------------------------|
| `rtc_offer`              | Either           | SDP offer              |
| `rtc_answer`             | Either           | SDP answer             |
| `rtc_ice`                | Either           | ICE candidate          |
| `classroom_live_start`   | Cockpit -> all   | section, modeMeta      |
| `classroom_live_stop`    | Cockpit -> all   | (no payload)           |

The first three already exist in `curriculum_render/railway-server/server.js`
for the Tetris solo/MP rooms; this work piggybacks on the same handler
with an additional gate that the sender's role is `teacher` (cockpit
host) or the recipient is the active host (student peer).

### 6.2 Star topology

- The cockpit opens one `RTCPeerConnection` per student in the active
  section, each with a single `RTCDataChannel` named `livedata`.
- All real-time payloads (position deltas, vote-with-feet door entries,
  slider drags, etc.) flow over the DataChannel.
- The cockpit aggregates state per data mode and rebroadcasts the
  aggregate to every student over the SAME datachannel (back-channel
  on each connection).

### 6.3 Fallback ladder

| Layer       | When                                | What happens                          |
|-------------|-------------------------------------|---------------------------------------|
| WebRTC      | Negotiation succeeds in <3 s        | DataChannel is the transport          |
| WS fallback | Negotiation fails / times out       | That student's data rides over WS     |
| Mode lock   | All students fall back to WS        | Cockpit pill -> "Live (Fallback)"     |

The fallback is **per student**, not per session. A class with 25
WebRTC-good students + 5 WS-fallback students runs cleanly; the smooth
modes still benefit the 25 even if the 5 jitter.

### 6.4 Network probe

On the cockpit's `Go Live` press, BEFORE picking a section, a quick
self-STUN test runs (try to obtain a server-reflexive candidate within
800 ms). If it fails -- typically school networks blocking UDP -- the
cockpit shows a one-time toast: "WebRTC unreachable on this network --
Live mode will run in WS fallback. Smooth-update data modes will be
degraded but functional." The teacher can proceed; the system goes
directly to per-student WS without the WebRTC negotiation step.

## 7. Teacher avatar visible in Live mode

Today the board mount bails unless the signed-in user has a `section`
-- so teachers are invisible. In Live mode the cockpit-driven view
gains a teacher sprite drawn at a fixed spot (front-of-room, between
the gate-door and the doorways): an additive `member` with
`role: 'teacher'` flag and a distinct visual treatment (TBD: hat icon
or text label overhead). The teacher sprite does NOT walk via arrow
keys in v3 phase 1 -- it's a fixed presence cue. (Walking-teacher is a
later cosmetic; the spec is small enough to defer.)

A clicked teacher sprite is a no-op for now (the Teacher -> Student
Console click target is the STUDENT sprites; the teacher sprite is
just a presence cue).

## 8. Data modes -- Vote With Your Feet (first to ship)

The minimal-viable first data mode. Generalizes the single GateDoor to
N labelled doorways; walking through + pressing Up = vote.

### 8.1 Server-side (curriculum_render)

Three new WS messages, additive to v2's `classroom_poll` family:

| Message                          | Direction          | Carries                                                    |
|----------------------------------|--------------------|------------------------------------------------------------|
| `classroom_open_doorways`        | Cockpit -> all     | `{ id, question, options: [{label, doorId}, ...] }`        |
| `classroom_doorway_vote`         | Student -> cockpit | `{ id, doorId }` (over the DataChannel in Live; WS in fallback) |
| `classroom_close_doorways`       | Cockpit -> all     | `{ id, tally: [{doorId, count}, ...] }`                    |

Server-side state in `railway-server/classroom.js`: per-room
`activeDoorways` slot, mutually exclusive with the existing v2 `poll`
slot. Teacher-authed open + close.

### 8.2 Client-side -- the board

Today: one `GateDoor` entity at a fixed x; `showGateDoor()` /
`hideGateDoor()` toggle visibility; `onUpPressed` fires `classroom_checkin`
if inside the gate hitbox.

Generalization:

- `showDoorways(options)` adds N `Doorway` entities (rename or
  generalize `GateDoor`), one per option, spread evenly across the
  canvas with a text label above each.
- `onUpPressed` does a multi-hitbox check; the matched doorway's
  `doorId` is the vote payload.
- The student sprite drains through the matched doorway (the v1b
  "drain" animation already exists; per-doorway target x is the
  generalization).

### 8.3 Client-side -- the cockpit

A live bar chart drawn via the existing `ti84-plot.js` (added in s108
F4 for v2 polls). Each doorway = one bar. Updates per
`classroom_doorway_vote` arrival -- which lands in microseconds over
WebRTC. Reset / Close buttons. The Close payload archives the result
to the v2.1 `poll_archive` table (re-use the existing schema; type
discriminator field added if necessary).

### 8.4 Visual sketch

```
+--------------------------------------------------+
|  Question: Which approach reduces bias more?     |
+--------------------------------------------------+
|                                                  |
|   [DOOR A]      [DOOR B]      [DOOR C]           |
|   Stratified   Random      Convenience           |
|                                                  |
|   ./sprites move toward chosen doors ./.         |
|                                                  |
+--------------------------------------------------+
```

(Cockpit view shows the same scene + a live histogram pane to the
side. Each tally arrival is animated; the histogram bar climbs as the
student's sprite walks through the door, finishing as the sprite
drains out.)

## 9. Phased rollout

Each phase is one session's work + the proven cross-agent review loop
(BUILD contract -> parallel Sonnet -> Codex review -> fold -> commit).

| Phase | Workstream                                                                 | Touches                                                                 |
|-------|----------------------------------------------------------------------------|-------------------------------------------------------------------------|
| **P1** | Cockpit section-agnostic by default (subscribe-to-all)                     | curriculum_render railway-server/classroom.js, teacher-classroom.html   |
| **P2** | Live button + section picker (still WS transport; flips scope only)        | teacher-classroom.html (cockpit UI), Desk Live indicator                |
| **P3** | WebRTC star transport (signaling reuse from Tetris; replaces position in Live mode only) | curriculum_render server.js + classroom-board.js                        |
| **P4** | Vote-with-your-feet data mode (first concrete payoff of P3)                | classroom-board.js (doorway generalization), teacher-classroom.html (bar chart), railway-server/classroom.js (`open_doorways` etc.) |

P1 can ship pre-WebRTC (purely a teacher-cockpit-side change); P2 makes
the toggle real but still over WS; P3 is the WebRTC swap; P4 is the
first lesson-grade feature.

## 10. Sept 1 phasing

- **Pre-Sept-1** (today through 2026-09-01): periods don't yet exist;
  every student is in PeriodX. P1-P4 are buildable and shippable, but
  the section picker has one option (PeriodX) and the global Idle view
  shows just PeriodX. The Live button infrastructure is exercised end-
  to-end with that one section. The pre-Sept-1 work also catches
  school-network blockers BEFORE the feature has to carry a real
  lesson.
- **Post-Sept-1**: rosters get sectioned A-E (B/E this year, full
  range later). The Live button gains its full meaning ("Go live with
  Period B" actually narrows to Period B). The data modes become
  daily-use lesson tools.

## 11. Open decisions

1. **Teacher avatar visual treatment** -- hat icon? Text label overhead?
   Distinct hue range? The spec assumes "some distinct treatment" without
   nailing it; freeze in the BUILD contract.
2. **What is the data-mode controls toolbar's exact shape?** The cockpit
   gains a strip for "Open doorways", "Open slider", "Open 2D drop", etc.
   The toolbar's icon set + grouping is UI work; freeze in BUILD.
3. **Post-Live archive shape**: vote-with-feet results piggyback on the
   v2.1 `poll_archive`. Does a `mode_type` discriminator column need to
   be added to the schema, or can we tag the question text? (No-schema-
   change preferred.)
4. **Multi-mode-simultaneously**: can the cockpit run doorways + a
   slider at the same time, or is one Live data mode at a time? (Spec
   suggests mutually exclusive; revisit if a real lesson needs the mix.)
5. **Walking teacher**: deferred from v3 phase 1. Add a session task to
   evaluate after vote-with-feet ships.

## 12. Out-of-scope (future v3.x)

- Slider density data mode (continuous-value voting).
- 2D-axes drop data mode (two-variable thinking).
- Sampling-distribution-live data mode (each student types one sample
  mean; cockpit's histogram fills).
- CI coverage simulation data mode.
- Bulk export of a Live event's data to CSV / Blooket-compatible format
  for take-home / next-day analysis.
- Multi-section simultaneous Live (only relevant if the teacher runs
  two real classes back-to-back and wants overlapping data; not a near-
  term need).
- The Teacher -> Student Console (the avatar-click contextual panel +
  View as / Send nudge / Apply remediation): a SIBLING spec, still to
  be drafted separately. Shares the avatar-click hit-testing
  infrastructure with this v3 work but is otherwise orthogonal.

## Recall on freeze

When ready to implement, the proven loop:

1. Pick the phase (P1 / P2 / P3 / P4).
2. Freeze a `LIVE_CLASSROOM_V3_P{n}_BUILD.md` contract that quotes the
   verbatim source text for every observable symbol.
3. Dispatch parallel Sonnet units on disjoint files; planner-direct on
   contended files (cockpit HTML, the Desk if touched).
4. Codex read-only review with a 600 s timeout; fold every finding.
5. Planner-verify on disk + run vitest + smoke a known-good scenario.
6. Stage own paths only; commit via `git commit -F-` heredoc; push.

Sibling work that does NOT block this:

- `LIVE_CLASSROOM_SCALING_SPEC.md` knobs 2 + 3 (idle suppression
  docs / interest filtering) stay parked.
- The Teacher -> Student Console spec is still TBD; v3 phases 1-4 can
  ship without it.

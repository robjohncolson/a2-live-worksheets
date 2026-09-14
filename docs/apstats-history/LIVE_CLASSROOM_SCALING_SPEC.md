# Live Classroom -- Scaling Knobs Spec

Three orthogonal knobs to reduce Live Classroom WS traffic without
compromising the user-visible interaction quality. The current 10 Hz
per-emitter, full-room fanout copes fine at class scale (~30 students);
this spec is what to reach for if a real classroom ever stresses the
existing budget.

Frozen 2026-05-23 (session 110). Not implemented; document only.

**Explicitly out of scope:** client-side prediction. Considered + declined
this session. User preference: the natural broadcast-roundtrip lag is
better than CSP's rubber-band-on-direction-change failure mode. Students
in practice don't watch their friend's screen, so the perceived lag is
~zero from each individual student's view -- only the teacher-observer
notices it side-by-side.

---

## 1. Rate adaptation -- scale emit Hz to observed room size

### Today

`PlayerSprite.update` emits `classroom_pos` at a fixed `POS_RATE_MS = 100`
(10 Hz) while moving; one final "rest" snapshot when motion stops; then
0 Hz until the next input. The cadence is constant regardless of room
size.

At ~30 students all moving: 30 emitters * 10 Hz = 300 msgs/s server-in,
forwarded to N-1 peers each = ~870 msgs/s server-out. Trivial.

### Proposed

Scale the emit interval to `members.length` -- the client already has this
in `state.members` from its `_reduce` output, no protocol change needed.

| members.length | emit Hz   | POS_RATE_MS |
|----------------|-----------|-------------|
| <= 8           | 10 Hz     | 100         |
| 9 - 20         |  5 Hz     | 200         |
| 21 - 40        |  3.33 Hz  | 300         |
| > 40           |  2 Hz     | 500         |

A new helper `_currentEmitRateMs()` returns the threshold-mapped interval;
the existing emit gate reads `now - this._lastPosMs >= _currentEmitRateMs()`
instead of the constant. The threshold table is a top-of-file constant
(`POS_RATE_TABLE` or similar) so tuning is one-line.

### Effects

- **Traffic at 30 students:** 30 * 5 = 150 msgs/s in, ~4350 msgs/s out.
  ~6 KB/s per peer received. Still trivial; halves what's needed.
- **Visual:** at 200 ms broadcast cadence and WALK_SPEED=120 px/s, each
  broadcast is ~24 px of x delta. The existing `walkTo` chase covers
  it in ~12 frames at 60 FPS (~200 ms) -- exactly matching the
  broadcast interval, no extra jitter.
- **Carry lag:** doubles from ~200 ms to ~400 ms at 30 students. User
  accepted similar lag (Phase 2.4 acceptance: "students don't notice");
  the same logic applies here.
- **Rest-snapshot rule unchanged:** still exactly one snapshot when
  motion ends, then silent. Idle suppression (item 2) is independent
  of cadence.

### Files touched (implementation reference)

- `classroom-board.js`:
  - Replace `POS_RATE_MS` constant with `POS_RATE_TABLE` lookup.
  - Add `_currentEmitRateMs(memberCount)` (top-level helper).
  - PlayerSprite needs read access to member count -- pass `getMemberCount`
    via opts (mount() supplies `function() { return Object.keys(state.members).length; }`).
  - Emit gate: `now - this._lastPosMs >= _currentEmitRateMs(this._getMemberCount())`.
- Tests: unit-test the threshold mapping at boundary sizes; structure pin
  that the lookup is read by the emit gate.

### Implementation cost

~50 lines including tests. No protocol change. Safe to ship at any time.

---

## 2. Idle suppression -- already in place

### Today

The Phase 2 emit gate fires the rest snapshot exactly once when motion
stops, then 0 Hz until the next input. Idle players contribute 0 traffic.

The `_restEmitted` flag latches after the rest snapshot; cleared whenever
`moving` becomes true again (input pressed, carry resumes, jump triggered).

### Why this is here

Documented for completeness. No new implementation; this item is the
"already covered" line.

### Edge that could still be tightened

- A player who is being CARRIED (Phase 2.1) emits at the full 10 Hz while
  the carrier moves -- but the player has no input, just the carry
  payload. With rate adaptation (item 1) the carry emit cadence follows
  the same scaled table. Acceptable.
- The 30 s `classroom_heartbeat` is a separate path; it scales with WS
  connections, not motion. Not affected by this work.

### Files touched

None.

---

## 3. Interest filtering -- OUT OF SCOPE while one section == one room

### Pattern

Instead of broadcasting `classroom_pos` to all peers in a room, broadcast
only to peers whose viewport contains the source's position. Cuts O(N^2)
to O(k * N) where k is the average overlap.

### Why it's out of scope today

- Current room model: ONE room per section. All students see each other.
- The board canvas is a small embedded panel; everyone IS in everyone's
  viewport. There's nowhere to "be far away".
- Class sizes (~30) don't hit the O(N^2) wall.

### Implementation sketch (IF multi-zone or auditorium ever)

- Add a `region: <enum>` field to `classroom_join` and `classroom_pos`.
- Server-side `classroomRegistry.position()` filters target sockets by
  region overlap (members whose region matches the sender's, or whose
  region is adjacent).
- Client-side: as the local player walks across zone boundaries, emits
  a `classroom_region_change` and unsubscribes from the prior region's
  fanout.
- Reconcile region membership in `classroom_state` snapshots.

### Trigger conditions

Implement if any of:
- Multi-zone classroom layout (table groups, breakout rooms).
- Auditorium / lecture hall scale (>100 concurrent presences).
- An observed bandwidth or rendering bottleneck at the current room model.

### Files touched (if implemented)

- `curriculum_render/railway-server/classroom.js` + `server.js`.
- `classroom-board.js` (region opt + region-change emit).
- Cross-repo workstream; two commits.

---

## Tuning notes

- Rate-adaptation thresholds (`8 / 20 / 40` above) are best-guess. Pilot
  in a real classroom and adjust if the carry lag at 30+ students feels
  worse than expected.
- The 10 Hz baseline (small rooms) was chosen empirically in Phase 2 --
  not strict. If pilot data ever suggests 8 Hz would feel the same with
  20% less traffic, fine to lower.
- Item 2 has no tuning surface -- it's already at the natural floor.
- Item 3 doesn't kick in until the model changes.

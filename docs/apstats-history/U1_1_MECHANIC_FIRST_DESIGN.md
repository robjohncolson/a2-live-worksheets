# U1.1 Mechanic-First Design -- "Cola Mystery Conveyor"

Session 118 (2026-05-26). Author: CC + Codex critique. Status:
CANONICAL -- supersedes the U1.1.json shape on disk + the V7.7-era
quiz-with-HUD framing in `LIVE_CLASSROOM_V7_PICO_PARITY_SPEC.md`.

## Why we re-designed

The previous U1.1 (currently shipped as `cr/railway-server/activities/
U1.1.json`, V7.6 dynamic reflection on V7.5 multi-stage) treats the
game as a flashcard delivery system: students walk around collecting
sips, then click through 4 stages of voting questions. The voting is
the lesson; the walking is theater.

Codex's critique (2026-05-26) named the structural problem and added
a second one:

1. **The mechanic doesn't teach.** Players can complete every gate
   without ever forming the statistical intuition. The pedagogy is
   bolted on as a quiz layer.
2. **Worse, an earlier sketch (CC's "tilt platform that dumps players
   on imbalance") taught the WRONG thing for 1.1.** Topic 1.1 is not
   about balanced sampling. If 9 of 10 students prefer A, that is
   valid, informative data -- not a failure. The failure is
   interpreting that imbalance as "A is Coke" or "A is better." We
   should NEVER teach kids that imbalance is wrong; we should teach
   that data can only support specific kinds of claims.

This doc re-grounds U1.1 in the AP Stats 1.1 framework: data are
observations, observations need to be complete + recorded with their
variable, and only some questions can be answered from a given
dataset.

## Reference: AP Stats Topic 1.1

The big 1.1 ideas (from `apstat_1_framework.md` + the worksheet set):

- Identify the real-world question / problem.
- Identify the variable being measured.
- Notice variation in one-variable data.
- Put numbers in context.
- Interpret ONLY what the data can actually support.
- Do not answer brand / value / causal questions from data that only
  measured preference / choice.

For "Cola Mystery," the responsibly-answerable question is:

> Can students tell / prefer A vs B from blind sip data?

The questions that the data CANNOT answer:

- "Is A Coke?" -- blind sips don't identify brand.
- "Is Coke better?" -- "better" is a value judgment, not a measurement.
- "What's inside each cup?" -- ditto.

The pedagogy of the level must make this distinction tangible.

## Reference: browser_port findings

`C:/Users/rober/Downloads/Projects/hermes/old-app/recovered/browser_port/`
is a TypeScript port of Pico Park (an autonomous-agent reverse-
engineering effort -- see `SLEEP_AGENT_LOOP_PROMPT.md` /
`CONTINUOUS_WORKER_PROMPT.md` in that dir). It contains working
actor classes with tests. We use it as a SEMANTIC REFERENCE only --
the TS code is read-only; we re-implement in our LC engine style
(ES modules in `cr/railway-server/`, sprite engine entities in
`fa/classroom-board.js`).

Actors verified usable (mechanic is stable, ~40-150 LoC each):

| TS file | Semantic shape | Mapped to LC actor |
|---|---|---|
| `Player.ts` | Side-scrolling rect with MOVE/JUMP/GRAVITY + tile collision | Existing LC avatar (already multiplayer) |
| `Switch.ts` | Pressure plate; `pressed` flag; label matches a Gate's label | Will be `SwitchPad` or extend `SipStation` |
| `KeyGate.ts` -- `Key` | Pickup with `collected` flag; raw spawn carries target name | Existing LC `Key` actor (V7.5 ships this) |
| `KeyGate.ts` -- `Gate` | Closed rect physically blocks; opens via `Key.collected` OR `Switch.pressed` match | New: `Gate` actor (extends existing `Goal` logic with label predicate) |
| `KeyGate.ts` -- `resolveClosedGateCollision` | Real physics push-out + grounded/blocked flags | Port the math when we add Gate; out of scope for V7.8 |
| `PushBox.ts` | Pushable rect (player walks into it; box moves with momentum) | Will be `PushBox` actor |

Actors that exist but need work (per Codex):

| TS file | Status | Notes |
|---|---|---|
| `StopWatch.ts` | Mostly visual + activation state | Not a full timer; we'll greenfield ours |
| `WeightedLift.ts` | Mostly render / params | Not a moving carrier yet; defer to a later sprint |
| `Thunder.ts` | Has extensive RE investigation docs (`.json` byte evidence) | Not needed for U1.1 |

Multiplayer is the bigger gap. The TS port runs single-Player; the LC
engine already has multi-player state via `room.members`. We KEEP the
LC multiplayer model and only borrow the TS actors' single-player
semantics, then apply them per-player on our side.

## The 5-zone level

A continuous left-to-right scroll (or stage-swap fallback -- see
"Open structural questions" below). Each zone is one cooperation
primitive embodying one sub-concept of 1.1.

### Zone 1 -- The Blind Sip Line (Capture)

**Feel:** Cafeteria / lab hallway. Two giant mystery cup stations
(A and B) sit on platforms above the hallway. Players run, jump, and
touch each station. After tasting BOTH, they walk to one of two
"choice pads" (A or B) and stand on the pad they prefer -- recording
their choice.

**Mechanic:** Per-player state extension. Each player carries
`marks = { sampledA: false, sampledB: false, choice: null }`. Touching
an A SipStation sets `sampledA = true`; touching a B SipStation sets
`sampledB = true`. Standing on the A ChoicePad with both samples
done sets `choice = 'A'`; standing on B ChoicePad sets `choice = 'B'`.
A player whose marks are all set has `rowComplete = true` (derived).

**Concept embodied:** A row of data is not abstract. It comes from
one individual (you), who measured one variable (preference after
blind comparison), in one context (this trial, these cups). The
ChoicePad makes the variable explicit -- preference, not brand.

**Pass condition:** EVERY online player has `rowComplete = true`.
Until then, Zone 2's row-scanner blocks all forward movement.

**Fail condition:** None per-player. Soft block at Zone 2 until
complete. A player who's been kicked out of the room is removed from
the row count.

**Actors:**
- `PlayerSpawn` x N (left edge of the hallway)
- `SipStation` x 2 (one drink:'A', one drink:'B', placed apart so
  collecting both requires actual traversal -- not all-at-spawn)
- `ChoicePad` x 2 -- new actor type, `value: 'A'` and `value: 'B'`.
  Visually distinct from SipStation. Records choice on overlap.
- `Text` -- big sign: "TASTE BOTH. THEN CHOOSE WHICH YOU PREFERRED."

**What this REPLACES:** the current U1.1's 4 hidden SipStations and
TallyDisplay. The `Tally` actor we shipped in V7.7 is REPURPOSED in
Zone 2 (see below).

### Zone 2 -- The Row Scanner (Completeness Gate)

**Feel:** Narrow scanner corridor at the edge of the cafeteria.
Three sensor arches in a row, each painted with a checklist:
"A SIP?", "B SIP?", "CHOICE RECORDED?". A glowing red Gate beyond
them. Players who try to walk through with an incomplete row are
visibly pushed back (or held still) until they have all three marks.

**Mechanic:** The Gate has predicate `every_player.rowComplete ===
true`. The Gate is real physics -- closed Gate blocks horizontal
movement at its x. Each player must satisfy their own marks AND wait
for the slowest classmate. (Pico-style cooperation: the gate doesn't
open for "most of the class"; it opens for ALL.)

**Concept embodied:** Statistics depends on clearly recorded
observations. You can't interpret missing data as if it were
measured. The "everyone matters" beat is honest, not a "be inclusive"
platitude -- it's a math truth.

**Pass condition:** All online players have `rowComplete = true`.
Gate opens.

**Fail condition:** None destructive. Players with incomplete rows
walk back to Zone 1, finish, then return. Patient.

**Actors:**
- `Gate` -- new actor; predicate `every_player.rowComplete`. Physical
  block until predicate satisfied.
- `Text` -- the three checklist signs.
- (Optional V7.8.1+) per-player visual badge above the avatar showing
  which marks they have / lack. Helps the class self-coordinate.

**What this REPLACES:** the V7.7 `Tally` threshold gate is repurposed.
Instead of "class hits N-A AND N-B sips," the gate is "EACH player
hits the per-player rowComplete state." V7.7's engine code mostly
survives -- the threshold-check moves from a global tally to a
per-player mark check.

### Zone 3 -- The Tally Machine (Pattern Visible, NOT Gate)

**Feel:** The centerpiece. A big mechanical tally device with two
glass columns labeled "A" and "B." Each completed row from Zone 2
spawns a small colored "data block" that rolls into the column matching
the player's choice. The class watches the columns fill.

**Mechanic:** Display only. When a player passes Zone 2, a `RowBlock`
sprite spawns in front of them; they push it (PushBox style) or it
auto-conveys into the matching A or B chute. The tally column visibly
grows.

**Pass condition:** Some minimum total `rowsCollected >= N` (default
N = `min(onlineCount, 6)` -- so a small class doesn't grind, a large
class can stop early). OR: teacher cockpit "advance now" override.

**CRITICAL:** Pass is on TOTAL rows, NOT balance. If all 10 players
chose A, the tally shows A:10 / B:0 and the level still advances.
That is valid, informative data.

**Fail condition:** None.

**Actors:**
- `RowBlock` -- new actor; spawned by engine on Zone-2-pass per
  player. Pushable (PushBox semantics) or auto-conveyed. Carries
  `choice` payload.
- `TallyChute` x 2 -- one for A, one for B. Counts rows entering.
  Visual: column fills with stacked RowBlocks.
- `Text` -- "OBSERVED VARIABLE: BLIND SIP CHOICE. NOT BRAND."

**What this REPLACES:** the existing V7.4 `TallyDisplay` HUD. The
TallyDisplay was a tiny chip ("Sips - A: 2 B: 1"); the TallyChute is
a physical mechanism. We keep `TallyDisplay` as a cheap-mode fallback
for levels that don't have space for the full chute mechanism.

### Zone 4 -- The Question Door Hall (Knowability Gate)

**Feel:** A hallway with three doors. The doors are large, the
labels are visible from far. Players approach the doors after passing
the Tally Machine.

- **Door 1:** "OPEN IF CUP A = COKE"
- **Door 2:** "OPEN IF COKE IS BETTER THAN PEPSI"
- **Door 3:** "OPEN IF THESE DATA SHOW WHICH CUP THIS CLASS CHOSE/PREFERRED MORE"

Door 1 and Door 2 are PERMANENT visual question marks. Pressing Up at
them produces a low "thunk" sound and a brief shake. They never open.

Door 3 opens when `state.tally.rowsCollected >= requiredRows`. Pressing
Up there opens the door to Zone 5.

**Mechanic:** Each door is a `Gate` actor with a per-door predicate
function. The predicates:

- Door 1: `() => false` -- structurally unanswerable
- Door 2: `() => false` -- structurally unanswerable
- Door 3: `(state) => state.tally.rowsCollected >= state.tally.requiredRows`

Optional UI accent: when a player walks up to a perma-locked door, a
small text bubble appears over the door: "BLIND SIPS DON'T MEASURE
BRAND." / "WHICH IS BETTER IS A VALUE JUDGMENT, NOT A MEASUREMENT."
After 1.5 seconds the bubble fades.

**Concept embodied:** The CORE of 1.1. The dataset answers SOME
questions, not others. The game makes students FEEL: "ohhh, the
brand door won't open because we never measured brand."

**Pass condition:** A player walks through Door 3.

**Fail condition:** None. Doors 1 and 2 can never be opened; that's
their entire teaching purpose.

**Actors:**
- `Gate` x 3 -- one per door. Each carries its own `predicate` field
  (referenced by label or by an inline JS-safe predicate id from a
  whitelist: `always_false`, `tally_threshold`, `key_collected`, etc.
  -- never raw eval).
- `Text` x 3 (door labels) + `Text` x 2 (optional reflection bubbles
  for the perma-locked doors).

**What this REPLACES:** the entire V7.5 multi-stage `stages[]` voting
flow for U1.1. The 4 stages of "vote on the right interpretation"
collapse into "walk through the door that physically can open." Voting
is dead for this level. The substituted-reflection text mechanism
({N}/{TOTAL}/{PCT}) survives -- repurposed as the post-door bubble
content for Door 3 ("THIS CLASS: {N_A} OF {TOTAL} CHOSE A, {N_B} CHOSE
B"). The {N}/{TOTAL}/{PCT} engine code from V7.6 ships as-is; just the
trigger and audience change.

### Zone 5 -- The Context Bridge + Final Claim Pad

**Feel:** A short final platforming corridor. A bridge to the goal
has three missing tiles. Three carryable pieces sit at the bridge's
left edge, each labeled:

- "QUESTION: Which cup did students choose/prefer?"
- "VARIABLE: Blind sip choice (A or B)"
- "CONTEXT: This class, this trial, mystery cups"

Players pick up and carry the pieces (PushBox semantics) and drop
them into three labeled slots in the bridge. When all three slots are
filled, the bridge extends to a final wide pad. The whole class then
walks onto the pad to fire LEVEL_CLEARED.

**Mechanic:** Three `BridgePiece` actors (pushable). Three
`BridgeSlot` actors (each matches one piece by label). When all three
slots are filled, a `BridgeTile` spawns connecting the gap to the
final pad. Final pad is a `GoalPad` (presence-of-all-players timer,
~1.5 s sustained).

**Concept embodied:** Numbers become meaningful only in context. A
data pattern alone isn't a finished statistical statement; it needs
the question + variable + context anchored. Kids must physically
ASSEMBLE the claim, not just observe it.

**Pass condition:** All three pieces slotted + all online players
standing on GoalPad for the sustained duration.

**Fail condition:** GoalPad presence resets if any player steps off.

**Actors:**
- `BridgePiece` x 3 -- pushable, label-carrying
- `BridgeSlot` x 3 -- matched by label
- `BridgeTile` -- spawns on completion (engine-controlled)
- `GoalPad` -- replaces the V7.2 `GoalSprite`; presence-of-all-players
  predicate with a sustained timer

**Final display (replaces the old reflection panel):** After
LEVEL_CLEARED fires, a single screen shows:

> "In this blind sip trial, {N_A} of {TOTAL} students chose A and
> {N_B} chose B.
>
> These data can describe the class pattern.
>
> They cannot prove the brand or decide which cola is better."

The {N}/{TOTAL} placeholders are filled from the actual Zone-3 tally.

## The level state machine, mapped

The existing V7.5 phase enum (SIPPING -> VOTING -> REFLECTION ->
KEY_HUNT -> GOAL_AVAILABLE -> LEVEL_CLEARED) survives, with new
zone-level sub-phases per the mechanic-first redesign:

| V7.5 phase | U1.1 Mechanic-First mapping |
|---|---|
| `SIPPING` | Zone 1 (Blind Sip Line). Per-player mark collection. |
| `VOTING` | Zone 2 (Row Scanner) + Zone 3 (Tally Machine) + Zone 4 (Question Door Hall). All collapsed into "the gates open when their predicate is true." |
| `REFLECTION` | NOT USED. Voting wrong-doors don't exist anymore. |
| `KEY_HUNT` | Zone 5 (Context Bridge piece pickup). |
| `GOAL_AVAILABLE` | Zone 5 final GoalPad. |
| `LEVEL_CLEARED` | Final claim display. |

The phase machine doesn't need new states; the existing transitions
map cleanly. What changes is what GATES the transitions:

- SIPPING -> VOTING: was "all coins collected" (V7.5), then "tally
  threshold met" (V7.7). Now: "every online player has rowComplete".
- VOTING -> REFLECTION: WAS triggered by a wrong vote. Now NEVER
  fires (Doors 1+2 are physically impossible, Door 3 is correct).
- VOTING -> KEY_HUNT: was triggered by correct vote on last stage.
  Now: triggered by any player walking through Door 3.
- KEY_HUNT -> GOAL_AVAILABLE: was "key collected." Now: "all three
  BridgePieces slotted" (each piece is a sub-Key).
- GOAL_AVAILABLE -> LEVEL_CLEARED: was "any player reached Goal."
  Now: "all online players on GoalPad for sustained duration."

## What this level DOES NOT do (the do-NOT list)

1. **Do NOT require balanced A/B sips to advance.** Imbalanced data
   is valid data. Test the math, not the fairness.
2. **Do NOT use the phrase "data reveals what kind"** anywhere in
   any text actor. Blind sips don't reveal what kind of soda is in
   the cup -- they reveal preference. The current U1.1.json welcome
   text has this phrasing; we delete it.
3. **Do NOT script the Wrong-Door reflection panel** the way V7.5
   did. The doors are perma-locked; the optional accent bubble is
   one sentence.
4. **Do NOT keep voting as the primary mechanic.** If you find
   yourself adding a `stages[]` array, you've reverted to V7.5.
5. **Do NOT make Door 3 vote-gated** (e.g., "open when 50% of
   class clicks it"). The dataset's presence opens it. The class
   discovers Door 3 works by trying it, not by voting on it.
6. **Do NOT teach "sampling balance" in 1.1.** Sampling-method
   pedagogy belongs in U3 (Random Samples / Bias). Keep 1.1
   focused on what data CAN ANSWER.

## Open structural questions (defer until V7.8 ships)

1. **Real horizontal scroll vs stage-swap.** True scroll requires
   widening the LC canvas (currently 320x80 native) and adding camera
   logic. Stage-swap fades from Zone N to Zone N+1 -- 90% of the
   pedagogical feel at maybe 10% of the engine cost. Recommend stage-
   swap for V7.8; revisit true scroll later if classroom feedback
   demands it.
2. **Per-player visual mark badge** (Zone 1/2): an avatar overlay
   showing which marks each player has. Adds a lot of self-coord but
   needs renderer work. Defer to V7.8.1 polish.
3. **Failure tax in Zone 2** (a kid refuses to cooperate, class
   stalls): Pico Park accepts this as the cost of cooperation
   pedagogy, but classrooms differ. Provide a teacher-cockpit "force
   advance" override from V7.8 ship.
4. **Number of `requiredRows` for Zone 3->4 advance.** Currently
   speced as `min(onlineCount, 6)`. Tune in PeriodX smoke. A class of
   25 needing all 25 rows is too slow; a class of 5 needing 6 is
   impossible.
5. **TallyChute physics.** Are RowBlocks pushed by players (active),
   or auto-conveyed (passive)? Active = more engagement, harder to
   engineer. Passive = simpler. Recommend passive for V7.8, active
   for V7.8.1.
6. **GoalPad sustained-presence timer duration.** 1.5 s is a guess.
   Worth testing -- shorter feels twitchy, longer feels like waiting.

## Why this should ship in stages, not all at once

The 5 zones share state (player marks, row count, tally), but the
mechanics are largely independent. V7.8 ships Zone 1 alone (per-
player marks + SipStation + ChoicePad) and a STUB Zone 2 (the row-
complete state gates VOTING entry). That alone changes the U1.1
play experience -- kids no longer collect-sips-then-vote; they
collect-mark-then-wait-for-class. Smoke that in PeriodX.

Then V7.9 ships Zone 3 + Zone 4 (the tally chutes + the three-door
hall). That kills voting for U1.1 entirely.

Then V7.10 ships Zone 5 (Context Bridge + GoalPad).

Per-sprint scope keeps the diff under Codex's ~35 KB reliability
ceiling.

## What this means for the other 79 levels

This design is the TEMPLATE. Every other level needs its own 3-5
zone mechanic-first redesign. Some zones are reusable across levels
(the ChoicePad + RowScanner pattern repeats for any "preference"
topic; the three-door hall repeats for any "what can data answer"
topic). The Pico-Parity master spec needs a corresponding revision
to capture which mechanics live in which units. See
`LIVE_CLASSROOM_V7_PICO_PARITY_SPEC.md` (revised).

## Reference: where this design lives

- This file (`U1_1_MECHANIC_FIRST_DESIGN.md`): canonical Zone-by-Zone
  shape, do-NOT list, framework anchoring.
- `LIVE_CLASSROOM_V7_PICO_PARITY_SPEC.md` (revised this session):
  master arc, browser_port reference table, sprint plan, per-unit
  mechanic palette.
- `LIVE_CLASSROOM_V7_8_BUILD.md` (new this session): V7.8 frozen
  contract scoped to Zone 1 + stub-Zone-2 (the row-complete VOTING
  gate).
- `cr/railway-server/activities/U1.1.json`: current V7.5 + V7.6 ship.
  Will be replaced incrementally as V7.8, V7.9, V7.10 land. Until
  then, keeps the existing voting flow as a fallback.
- `hermes/old-app/recovered/browser_port/src/engine/actors/*.ts`:
  reference-only TypeScript. We read for semantics; we re-implement
  in our ES module style for cr + fa.

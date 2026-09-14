# Live Classroom V7 Pico Parity -- master spec (REVISED)

Session 118 (2026-05-26). Status: REVISED -- mechanic-first framing.

This file supersedes the V7.7-era version of itself (which framed the
arc around "voting with HUD aids"). After playing the shipped V7.7
U1.2 the user identified the structural problem -- the game was a
flashcard delivery system, not a teaching mechanic -- and the design
was redirected by Codex's critique
(see `U1_1_MECHANIC_FIRST_DESIGN.md` for the canonical example).

The shipped V7.7 Tally actor is NOT obsoleted -- it survives as a
cascade fallback in the V7.8 `_isSippingComplete` precedence list
(ChoicePad > Tally-threshold > all-coins). U1.2 ships unchanged in
V7.8; future levels can opt into Tally if their pedagogy fits.

## 1. Pedagogical principle (the headline change)

**The mechanic IS the lesson.**

Voting is a flashcard. The previous V7 arc treated the game as a
walkable quiz delivery system -- kids collected sips, then clicked
through 4 stages of multiple-choice questions to "demonstrate" the
concept. The walking was theater; the lesson was the multiple choice.

The new arc treats cooperation primitives as the lesson. A platform
that requires N players to push it. A gate that only opens when every
player has a complete row of data. A door that physically can't open
because the data doesn't measure that question. The concept lives in
the mechanic; the mechanic gives the kid no choice but to live the
concept.

Voting is demoted to an OPTIONAL reflection beat at the end of some
levels -- never the primary mechanic, never the gate. Wrong-vote
reflection (V7.5/V7.6) is preserved as a tool but used sparingly --
most levels won't have a vote at all.

## 2. Why we re-grounded

Three sources triangulated the re-design:

1. **The user playing V7.7 U1.2 in live PeriodX** -- "even though we
   have voting + Key + Goal, the questions still feel like flashcards
   with extra steps." The mechanic wasn't teaching; the voting was.
2. **The Pico Park stages I mined** in `hermes/old-app/recovered/
   lua_sources/` (104 stages) -- every stage embeds the cooperation
   primitive IN the mechanic. There's no "vote to advance." There's
   only "the platform won't tilt without you."
3. **Codex's pedagogy critique** (session 118) -- pointed out that an
   earlier sketch (CC's "balanced or fall" tilt platform) was
   teaching the WRONG concept for U1.1. The 1.1 lesson is "which
   questions can these data answer?" not "is your sample balanced?"
   The complete-row gate is the right primitive: data needs to be
   complete observations, not balanced ones.

## 3. Reference: browser_port TypeScript port

`C:/Users/rober/Downloads/Projects/hermes/old-app/recovered/browser_port/`
is a working TypeScript port of Pico Park. It's the product of an
autonomous-agent reverse-engineering loop (see
`SLEEP_AGENT_LOOP_PROMPT.md` / `CONTINUOUS_WORKER_PROMPT.md` /
`LEVEL_STATE_MACHINE_PRIORITY.md` in that dir -- not our work, but
deeply useful).

We use the port as a **semantic reference only**. The TS code is
read-only; we re-implement each actor in our own engine style (ES
modules for `cr/railway-server/`, sprite engine entities for
`fa/classroom-board.js`). Reasons:
- TS + PIXI.js doesn't fit the existing LC engine (vanilla JS sprite
  engine + plain canvas).
- The port is single-player; LC is multiplayer via `room.members`.
- License clarity -- the port is a decompiled reconstruction; safest
  to extract semantics, not source.

Per-actor reference table:

| Browser_port TS | Status | LC actor (our impl) | Sprint |
|---|---|---|---|
| `Player.ts` | Stable, single-player platformer | Existing LC avatar (already multiplayer) | (prereq -- no new sprint) |
| `Switch.ts` | Stable | `ChoicePad` (V7.8 -- semantically a labeled switch); future generic `SwitchPad` for non-binary choices | V7.8 |
| `KeyGate.ts -- Key` | Stable | Existing LC `Key` actor (V7.5) | (already shipped) |
| `KeyGate.ts -- Gate` + `resolveClosedGateCollision` | Stable | New `Gate` actor (per-door predicate; physical block) | V7.9 |
| `PushBox.ts` | Stable | `RowBlock` (V7.10 -- semantically a pushable carrying choice payload); generic `PushBox` (V7.11) | V7.10/V7.11 |
| `StopWatch.ts` | Mostly visual + activation state | Defer; greenfield ours when needed | V7.13+ |
| `Watch.ts` | Mostly visual | Same -- defer | V7.13+ |
| `WeightedLift.ts` | Mostly render / params (no movement yet) | Greenfield ours when needed; visual reference only | V7.14+ |
| `Thunder.ts` | Has extensive RE investigation docs (`.json` byte evidence) | Not needed for AP Stats levels | -- |
| `Warp.ts` / `WarpAll.ts` | Stable | Could power `ReturnWarp` (already exists in LC schema as a placeholder) | V7.12 |
| `ColorBox.ts` | Stable | Could power per-category visual sorting | V7.13+ |
| `FallBox.ts` | Stable | Hazard / fail-state platform | V7.13+ |
| `JumpStand.ts` | Stable | Bounce pad (mobility helper) | V7.13+ |
| `PlaneObstacle.ts` | Stable | Generic blocker | V7.13+ |
| `StepEnemy.ts` | Stable | Could power "bias" / "confounding" antagonists | V7.13+ |

The browser_port also has `levelStateMachine.ts` (5720 LoC). Worth
reading the API shape if we end up re-thinking our phase machine,
but our V7.5 phase machine (SIPPING/VOTING/REFLECTION/KEY_HUNT/
GOAL_AVAILABLE/LEVEL_CLEARED) maps cleanly to the zone-based design.

## 4. Sprint plan (revised)

Each sprint adds one or more actors mapped to a U1.1-template zone.
The sprint order is driven by U1.1's zones (because U1.1 is the
prototype and ships first); other levels reuse the primitives from
existing sprints + add their own as needed.

| Sprint | Adds | Powers U1.1 zone | Powers other-level usage | Sessions |
|---|---|---|---|---|
| **V7.7** (shipped) | `Tally` actor + `TallyDisplay` threshold render | -- (repurposed in V7.8 cascade) | U1.2 (W/N category gate) | 1 |
| **V7.8** | `ChoicePad` actor + per-player marks + `rowComplete` cascade | Zone 1 (Blind Sip Line) + stub Zone 2 (row-complete VOTING gate) | Any "preference / observation" level | 1 |
| **V7.9** | `Gate` actor (per-door predicate, physical block) + Zone-2 visible scanner + Zone-4 three-door hall | Zones 2, 4 (Row Scanner + Question Door Hall) | Any "what can data answer" level | 1-2 |
| **V7.10** | `RowBlock` + `TallyChute` actors (pushable data row + visible column) | Zone 3 (Tally Machine) | Any "see the pattern" level | 1 |
| **V7.11** | `GoalPad` (presence-of-all-players timer) + `BridgePiece` / `BridgeSlot` actors | Zone 5 (Context Bridge + class goal) | Any "assemble the claim" level | 1 |
| **V7.12** | True horizontal scroll (camera follows players) IF feedback demands it | Visual upgrade for all zones | All side-scrolling levels | 1-2 |
| **V7.13** | Generic `PushBox`, `JumpStand`, `FallBox` for varied platforming | (none in U1.1) | U2/U3 levels with cooperation puzzles | 1 |
| **V7.14** | `WeightedLift` (moving carrier) | (none in U1.1) | U3 random samples, U5 CLT (sample-size = lift height) | 2 |
| **V7.15** | `StopWatch` / `Watch` (real countdown) | (none in U1.1) | U6 sigtest timing, U7 means timing | 1 |
| **V7.16+** | Other Pico primitives as level designs demand | -- | -- | varies |

Total engine sessions: ~12-15.

After engine: 78 levels x mechanic-first redesign each. Each level
gets its own design doc (template: `U1_1_MECHANIC_FIRST_DESIGN.md`)
before its JSON is authored. Authoring per-unit can fan out in
parallel; design per-level needs more pedagogical thought.

## 5. Per-level design template

Every level follows the U1.1 template: a 3-5 zone left-to-right
sequence (true scroll or stage-swap), each zone is one cooperation
primitive embodying one sub-concept. Each level needs its own design
doc on disk BEFORE its JSON is authored.

Template (steal from `U1_1_MECHANIC_FIRST_DESIGN.md`):

1. **Lesson framework anchoring** -- which AP Stats sub-concepts is
   this level teaching? Quote the framework.
2. **The do-NOT list** -- what wrong concepts could the level
   accidentally teach? Name them and reject them. (For U1.1: "balanced
   sampling," "data reveals brand.")
3. **Zone-by-zone breakdown** -- mechanic + concept + pass condition
   + fail condition + actor list per zone.
4. **State machine mapping** -- which V7.5 phase each zone lives in.
5. **Open structural questions** -- defer items for later sprints.

## 6. Per-level mechanic assignment (high-level palette)

Each entry is the DOMINANT mechanic for that level's pedagogy. The
full 3-5 zone design happens in the level's own design doc. Many
levels will reuse the U1.1 zone shape (Sip + Choice + Gate + Tally
+ Doors + Bridge) with topic-specific variations.

### Unit 1 -- Exploring 1-variable data

| Level | Topic | Dominant mechanic + concept embodiment |
|---|---|---|
| 1.1 | Variables & Individuals | **CANONICAL** -- 5-zone Cola Mystery Conveyor. See U1_1_MECHANIC_FIRST_DESIGN.md |
| 1.2 | Categorical variables | V7.7 Tally cascade (already shipped). Future: convert to ChoicePad multi-value |
| 1.3 | Categorical displays | Tally + Gate -- choose the right display type before advancing |
| 1.4 | Representing data | Switch + Gate sequence -- order chart parts correctly to open the gate |
| 1.5 | Describing distributions | RowBlock physics -- spread/cluster blocks to match a target shape |
| 1.6 | Numerical summary | Seesaw center-finding (when V7.14+ Seesaw ships) |
| 1.7 | Mean & Median | Seesaw -- player positions form the mean; pivot point is median |
| 1.8 | Variability | Spread mechanic -- multiple players' positions, low/high spread platform |
| 1.9 | Boxplots | RowBlock + slots -- 5 blocks (min/Q1/med/Q3/max) into correct order |
| 1.10 | Outliers | Tally + outlier-aware gate -- an outlier block visually + numerically distinct |

### Unit 2 -- Exploring 2-variable data

| Level | Topic | Mechanic |
|---|---|---|
| 2.1 | Two-variable data | Paired ChoicePad -- record (x, y) pair per player |
| 2.2 | Scatter plots | WeightedLift positioned by (x, y) per player |
| 2.3 | Correlation | Bound (leashed players) -- leash length = 1 - |r|; weak corr = wide leash |
| 2.4 | Linear regression | WeightedLift line -- player positions fit a moving line |
| 2.5 | Residuals | Per-point distance to line -- visible residual rendering |
| 2.6 | Squared residuals | PushBox to minimize sum-of-squares (the line moves; players push to align) |
| 2.7 | Influential points | One "leverage" player drastically shifts the WeightedLift line |
| 2.8 | Categorical bivariate | 2-D ChoicePad grid (Tally + 2nd axis) |
| 2.9 | Stratified analysis | Switch + Gate sequence -- order strata by metric |

### Unit 3 -- Sampling & experimentation

| Level | Topic | Mechanic |
|---|---|---|
| 3.1 | Intro / planning | Plain V7.5 (voting may survive here -- it's a conceptual intro) |
| 3.2 | Random samples | WeightedLift -- N players on sampling platform = lift height |
| 3.3 | Sampling strategies | Switch + Gate sequence -- pick the right strategy order |
| 3.4 | Bias | Tally + TrafficLight -- bias = TrafficLight phase distorts collect timing |
| 3.5 | Experimental design | Switch + Gate -- order random-assign / blind / replicate |
| 3.6 | Confounding | Bound -- lurking variable leashed to treatment |
| 3.7 | Generalization | Plain V7.5 (conceptual) |

### Unit 4 -- Probability

| Level | Topic | Mechanic |
|---|---|---|
| 4.1 | Random patterns | Tally + Watch -- speeded random-trial tally |
| 4.2 | Simulation | Tally -- many trials, frequency stabilizes |
| 4.3 | Intro probability | Tally |
| 4.4 | Conditional probability | TrafficLight -- RED = condition fails; collect only on GREEN |
| 4.5 | Independence | Bound + Tally -- leash forces dependence; release to see independence |
| 4.6 | Addition rule | Tally combined-category |
| 4.7 | Random variables | Tally + Seesaw -- expected value = seesaw balance |
| 4.8 | Probability distributions | Seesaw -- E[X] visualization |
| 4.9 | Discrete RV | Seesaw + Tally |
| 4.10 | Geometric | Watch + Tally -- trials until first success |
| 4.11 | Binomial | Tally + Switch -- order outcome blocks by count |
| 4.12 | Expected value calc | Seesaw (canonical) |

### Unit 5 -- Sampling distributions

| Level | Topic | Mechanic |
|---|---|---|
| 5.1 | Sampling variability | WeightedLift + Tally |
| 5.2 | Normal distribution revisit | Seesaw -- center / spread |
| 5.3 | CLT | WeightedLift -- **MOST canonical lift mechanic** -- more samples lifts higher AND tighter |
| 5.4 | Bias / variability | WeightedLift + Seesaw |
| 5.5 | Diff of p-hats | WeightedLift x 2 (side-by-side) |
| 5.6 | Sampling distr for p | WeightedLift |
| 5.7 | Sampling distr for sum | Seesaw |
| 5.8 | Diff of x-bars | WeightedLift x 2 |

### Unit 6 -- Inference for proportions

| Level | Topic | Mechanic |
|---|---|---|
| 6.1 | Why be normal? | Plain V7.5 (conceptual setup) |
| 6.2 | Constructing CI for p | WeightedLift + Watch -- build interval before timer |
| 6.3 | Justifying claim w/ CI | Switch + Gate -- match interval to claim |
| 6.4 | Setting up a test | Watch -- speeded test-setup |
| 6.5 | Carrying out test | WeightedLift -- lift = sample evidence |
| 6.6 | Concluding test | Switch + Gate -- order conclusion steps |
| 6.7 | Type I / II error | TrafficLight -- RED = wrong decision |
| 6.8 | Test for diff of 2 p | WeightedLift x 2 |
| 6.9 | CI for diff of 2 p | WeightedLift x 2 |
| 6.10 | Justifying test result | Switch + Gate |
| 6.11 | Putting it together | Watch + Switch + Gate composite |

### Unit 7 -- Inference for means

| Level | Topic | Mechanic |
|---|---|---|
| 7.1 | Intro for means | Plain V7.5 |
| 7.2 | CI for one mean | WeightedLift |
| 7.3 | Justifying CI for mean | Switch + Gate |
| 7.4 | Setting up test for mean | Watch |
| 7.5 | Carrying out test for mean | WeightedLift |
| 7.6 | Concluding test for mean | Switch + Gate |
| 7.7 | Test for diff of 2 means | WeightedLift x 2 |
| 7.8 | CI for diff of 2 means | WeightedLift x 2 |
| 7.9 | Test for diff of paired means | WeightedLift + Bound (pairs bound) |
| 7.10 | Putting it together | Watch + Switch + Gate composite |

### Unit 8 -- Chi-square

| Level | Topic | Mechanic |
|---|---|---|
| 8.1 | Intro: are results unexpected? | Tally + Watch |
| 8.2 | Chi-sq distrib + GOF setup | Switch + Gate |
| 8.3 | Carrying out GOF | Tally + WeightedLift |
| 8.4 | Test for homogeneity | Tally (2-D) + Switch |
| 8.5 | Test for independence | Bound + Tally |
| 8.6 | Putting it together | Switch + Gate |
| 8.7 | Composite drill | Watch + Switch + Gate |

### Unit 9 -- Slopes (LSRL)

| Level | Topic | Mechanic |
|---|---|---|
| 9.1 | CI for slope | WeightedLift |
| 9.2 | Setting up test for slope | Watch |
| 9.3 | Carrying out test for slope | WeightedLift |
| 9.4 | Concluding test for slope | Switch + Gate |
| 9.5 | Putting it together | Watch + Switch + Gate |
| 9.6 | Composite drill | Composite |

## 7. Hard constraints (carry-forward -- unchanged)

- LC features are **ADDITIVE OVERLAYS** -- never replace the avatar /
  doorway / arrow-key scene. (`feedback_lc_additive_overlay.md`.)
- Levels live in `cr/railway-server/activities/<key>.json`. Railway
  deploys `railway-server/` as project root.
- `chipSize: 10`, `map.width <= 32`, `map.height <= 8` for single-
  screen levels. True scroll (V7.12) may relax this -- TBD.
- Activity overlay canvas is ABOVE the avatar canvas in DOM order --
  full-overlay paints occlude sprite engine entities. Use sprite
  engine entities (zIndex) for HUDs (V7.6.1 lesson).
- Per-member `canvasW` rides `classroom_pos`. Any new actor reading
  player positions MUST use the rescaled coord (V5 fix).
- `curriculum_render/data/curriculum.js` is **SACRED** -- never edit.
  (`feedback_curriculum_render_sacred.md`.)
- ASCII-only in cross-agent prompts, level JSON, and test files
  (s112/s113 lesson).
- LF line endings on new files. Older U1-U3 / U8-U9 worksheets stay
  CRLF -- EOL-preserve.
- PowerShell 5.1: never `git commit -m` from PS; use `git commit -F-`
  with a Bash-tool heredoc.
- Stage own paths explicitly with `git add <path>`, never `-A`.
- Codex review is unreliable on diffs > ~35 KB. Keep sprint diffs
  bounded; fall back to CC self-review when needed.
- Edge CDP rig MUST pass `--remote-allow-origins=*`.
- Never kill Edge from bash via `taskkill /F ...`; use PowerShell.

## 8. Pedagogy rules (new)

These apply to every level design:

1. **The mechanic IS the lesson.** If a level's pedagogy depends on
   the kid clicking the right vote option, you've made a flashcard,
   not a lesson. Re-design until the mechanic forces the lived
   experience.
2. **Voting is a reflection, not a gate.** If voting survives in a
   level, it's at the end as a single optional reflection beat -- not
   the path through.
3. **Failure must teach, not punish.** A fail-state should be
   pedagogically meaningful (the platform tilts because data needs
   complete observations, not because you weren't fast enough).
4. **Imbalance is not failure.** Topic 1.1 lesson: data is what was
   observed; imbalanced data is valid data. Failure is INTERPRETING
   imbalance as proof of value or causation.
5. **Don't teach the wrong concept by accident.** Every level needs
   a do-NOT list -- what wrong concepts COULD this mechanic
   accidentally teach? Reject them explicitly.

## 9. V7.7 status (historical note)

V7.7 shipped the `Tally` actor with threshold-gated SIPPING ->
VOTING transition (sprint 1 of the previous, voting-with-HUDs arc).
It's not obsoleted -- the V7.8 `_isSippingComplete` cascade puts
ChoicePad first, falls back to Tally-threshold, then to all-coins.
U1.2 (which V7.7 piloted) ships unchanged.

For new levels: prefer ChoicePad (V7.8+) over Tally when the lesson
is about individual observations / preferences. Use Tally when the
lesson is about category counts at the class level (e.g., U1.2's
categorical-vs-numerical distinction, where the lesson is "the data
shows two TYPES of variables" not "you personally chose A vs B").

## 10. Rollback / backout

Each sprint is a single commit on cr + one on fa. Each new actor
type is no-op if absent from a level's JSON. The 78 legacy levels
that have neither ChoicePad nor Tally nor any new actor continue to
fire the V7.5 all-coins-collected SIPPING gate unchanged.

If any sprint regresses live behavior, revert the cr commit only --
the engine falls back to the previous mechanic palette and the new
JSON actor type is treated as a no-op. The fa client gracefully
handles unknown actor types in `_classifyActor` (returns null +
console.warn).

## 11. Open questions (defer until V7.8 ships)

1. **True horizontal scroll vs stage-swap.** V7.8 stays single-screen.
   Decide in V7.12 based on classroom feel.
2. **Per-level mark schema.** V7.8 hard-codes `sampledA/sampledB/
   choice`. V7.8.1+ may add per-level configurable mark categories
   (e.g. U2.x needs `sampledX, sampledY`).
3. **Per-player visual mark badge.** Deferred to V7.8.1 polish.
4. **Teacher-cockpit "force advance" override** for stuck cooperation.
   Plan to ship as part of V7.8 if a single uncooperative kid soft-
   locks the room.
5. **The 78 other levels' design docs.** Each needs a
   `U<N>_<L>_MECHANIC_FIRST_DESIGN.md` written BEFORE the JSON is
   authored. That's a separate parallel track -- can start once V7.8
   ships and the pattern is validated in PeriodX.

## 12. Where this lives in the doc tree

| Doc | What |
|---|---|
| `LIVE_CLASSROOM_V7_PICO_PARITY_SPEC.md` (this file) | Master arc, framing, browser_port reference, sprint plan, per-unit mechanic palette |
| `U1_1_MECHANIC_FIRST_DESIGN.md` | Canonical 5-zone Cola Mystery Conveyor design -- the TEMPLATE for every other level |
| `LIVE_CLASSROOM_V7_8_BUILD.md` | V7.8 frozen contract (ChoicePad + per-player marks + cascade) |
| `LIVE_CLASSROOM_V7_7_BUILD.md` | V7.7 frozen contract (Tally actor) -- shipped; survives as cascade fallback |
| `LEVEL_DESIGN_RECIPE.md` | Per-actor reference for level authors. Tally row added V7.7; ChoicePad row added V7.8 |
| `cr/railway-server/activities/U1.1.json` | Will be replaced incrementally as V7.8 / V7.9 / V7.10 ship. Voting flow stays until V7.9 |
| `cr/railway-server/activities/U1.2.json` | V7.7 Tally-threshold pilot. Unchanged in V7.8 |
| `cr/railway-server/activities/U*.json` (other 78) | Single-stage no-key. Each will get its own mechanic-first redesign post-V7.10 |
| `hermes/old-app/recovered/browser_port/src/engine/actors/*.ts` | Reference-only TS. Read for semantics, re-implement in our style |

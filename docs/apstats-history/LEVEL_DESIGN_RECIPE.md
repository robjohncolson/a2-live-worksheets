# Level Design Recipe -- AP Stats lesson-levels for the V7.1 engine

Session 115, 2026-05-25 (updated for V7.1 additive-overlay redesign).
Recipe for unit-author agents to produce the ~80 lesson-levels in
batch. Each unit gets one agent; each agent produces ~10 JSON files
(one per topic) into
`curriculum_render/railway-server/activities/UN.X.json`.

Reference specs: `LIVE_CLASSROOM_V7_1_BUILD.md` (frozen redesign).
V7.1 supersedes V7 visually but the JSON schema field names are
unchanged. The key V7.1 deltas for authors:
- `chipSize: 10` (was 24). The level pixel space is now 320 x 80 px
  native, matching the existing LC canvas. Levels overlay on top of
  the existing avatar/doorway scene; they do NOT replace it.
- `map.height: <= 8` chips (= 80 px). Width up to 32 chips (= 320 px).
- `QuestionDoor` actors are still authored in JSON the same way
  (`x, y, text, correct, reflection`) BUT the server-side engine
  reuses the existing v3 P4 doorways mechanic for the visual + vote
  (open + walk-through + press-Up). Authors DO NOT think about door
  visuals -- just the labels + correctness.
Canonical example: `curriculum_render/railway-server/activities/U1.1.json` (Cola Mystery). NOTE: levels MUST live inside `railway-server/` because Railway deploys that folder as the project root -- a sibling `cr/activities/` at the repo root is invisible to the running server.

## How a level teaches

A level is a small interactive scene the class collectively navigates
to demonstrate a single statistical concept. The mechanics carry the
pedagogy:

- **Walking** = data collection. Students walk to a Sip/Coin actor to
  sample/observe.
- **Voting via doors** = interpretation. After data is collected, the
  class votes on the right interpretation by walking to one of N
  Question Doors.
- **Soft-block reflection** = wrong-vote teaching moment. Walking
  through a wrong-door door triggers a reflection panel with text
  explaining WHY it's wrong; class re-votes after 8 seconds.
- **Goal** = mastery unlock. Walking past a correct door + onto a Goal
  fires the override-gate for the lesson key.

## Actor vocabulary (V7 + V7.1 candidates)

### V7 actors (implemented in level-engine.js -- USE THESE):

| Actor | What it does | Required fields |
|---|---|---|
| `Text` | Static sign; pop-up tooltip when local Player within ~32 px | `x, y, text` |
| `SipStation` | Collectible carrying a `drink` (A/B/C/...). Walking on it bumps `tally.sips[drink]` once. | `x, y, drink`, optional `id` |
| `PlayerSpawn` | Marker for where Players spawn (use 1; engine picks first if >1) | `x, y` |
| `TallyDisplay` | Renders a live value from state via `binds` (e.g., `tally.sips`) | `x, y, binds` |
| `QuestionDoor` | Switch+Gate composite. Walking on its switch zone votes for that door's id. When `voteCount >= ceil(onlineN/3)`, gate opens. Walking past the open gate triggers correct/wrong handling. | `x, y, text, correct`, optional `id, reflection` |
| `Goal` | Mastery target. Player walks here after at least one correct gate opens to fire success. | `x, y` |
| `ReturnWarp` | Lives in `reflection_room.actors`. V7 doesn't use it for walk-back (replaced with time-based auto-clear) but the field is reserved. | `x, y` |
| `Tally` | Threshold gate for SIPPING -> VOTING. Reads `tally.sips`; advances when every key in `threshold` meets its min count. Pair with `TallyDisplay` actor for live progress UI. | `x, y`, `threshold` (object mapping drink letter -> min count). Optional `binds` (default `"tally.sips"`). |
| `ChoicePad` | Per-player preference recorder. Player must have both sampledA and sampledB marks; walking onto a ChoicePad sets `player.marks.choice = value`. Pair with SipStation actors (one per category letter). Engine cascade: ChoicePad presence overrides V7.7 Tally threshold + V7.5 all-coins gate. | `x, y, value` (string -- 'A' or 'B' for binary preference). Optional `id`. |
| `Gate` | Physical blocker with a per-instance predicate. Closed gate clamps player X; opens (one-way) when predicate evaluates true. Three predicate types in V7.10: `always_false` (perma-locked tempting question), `every_player_row_complete` (Zone 2 row scanner), `tally_nonzero` (Zone 4 data-answerable door). Walking through the advance gate (tally_nonzero) transitions phase to KEY_HUNT. | `x, y, label, predicate` (one of the whitelist). Optional `id`. |
| `TallyChute` | Pure-visual data column. Reads `state.tally.sips[label]` and renders a vertical stack of blocks (count = stack height). NOT a gate; doesn't affect phase. Pair with SipStation actors of matching drink letter. | `x, y, label` (drink letter to bind to). Optional `id`. |
| `ContextSlot` | Lights green when ANY player walks within overlap distance (one-way). Use 3+ in a row labeled with statistical-claim components (Question, Variable, Context) for the Zone 5 assembly beat. Per-tick eval in KEY_HUNT or GOAL_AVAILABLE phase. | `x, y, label`. Optional `id`. |
| `GoalPad` | Whole-class presence pad. Replaces legacy Goal for V7.14+ levels. LEVEL_CLEARED fires when ALL online players are within overlap of x for sustained `triggerMs` (default 1500). Resets if anyone steps off. Pair with 1+ ContextSlot actors (GoalPad waits for all slots lit before activating). | `x, y`. Optional `id, triggerMs`. |

V7.7 (sprint 1 of Pico Parity arc). Authors should pair a `Tally`
actor with a `TallyDisplay` actor at the same chip position when the
level uses per-category coins (W/N, R/B, etc.) and wants students to
feel the sampling threshold. Levels without a `Tally` actor keep the
legacy 'all coins collected' trigger.

V7.8 (sprint 1 of mechanic-first arc). Use ChoicePad when the level
teaches "what does the data measure?" -- the act of CHOOSING is the
variable. Pair with 1 A-SipStation + 1 B-SipStation (per-player
required) and one ChoicePad per choice value. The level advances from
SIPPING to VOTING only when EVERY online player has a complete row
(sampledA + sampledB + choice). Do NOT also use a Tally actor on a
ChoicePad level -- the ChoicePad cascade overrides the Tally one.

V7.9 (side-scroll engine). Levels MAY declare `map.width > 32` to
get a horizontal scroll. The canvas viewport stays 320 px wide; the
camera follows the local player with a deadzone. To author multi-
zone levels, place actors in chip x bands and let the natural
player movement scroll them through. World actors (Coin, Key, Goal,
ChoicePad, Doorway) scroll with the camera. HUD actors (TallyDisplay,
ResultPanel, StageIndicator) stay screen-anchored. Cockpit gets a
fit-to-width view automatically -- teacher sees everyone at once.

V7.10 (Zones 2 + 4 of the mechanic-first arc). Gate actors are
the canonical "this question is / isn't answerable" mechanic.
Use `always_false` for tempting wrong-question doors (brand,
value, causation in 1.1). Use `tally_nonzero` for the data-
answerable door. Use `every_player_row_complete` for completeness
gates. Levels with Gate actors SHORT-CIRCUIT the V7.5 voting
path -- delete `stages[]` from such levels. The 78 legacy
levels + U1.2 keep V7.5 voting.

V7.11 (Zone 3 visual pattern). Use TallyChute pairs when the level
needs students to SEE the data shape emerge before interpreting it
(e.g., comparing A:B counts pre-Zone-4-doors). Place 2-4 chutes
vertically aligned in a corridor between the row scanner Gate and
the question doors. Each chute reads its own sip count -- no engine
state required; pure client-side visualization. Heights scale 1:1
with sip count (cap visible at 12; overflow shows 'N+').

V7.14 (Zone 5 -- whole-class endgame). Use ContextSlot + GoalPad
together to replace the legacy Key + Goal "single-player touch
ends the level" mechanic. Place 2-4 ContextSlots in a row with
labels that name COMPONENTS of the statistical claim being
assembled (Question, Variable, Context for Topic 1.1; Sample,
Distribution, Inference for sigtest topics; etc.). Walking past
each lights it. After all are lit, the GoalPad activates; the
CLASS together stands on it to fire LEVEL_CLEARED. Backward
compat: levels with a Goal actor (no GoalPad) keep V7.5 single-
player touch.

### V7.1 actors (NOT YET implemented -- log if you need them, but
DON'T use in v7-level-1 schema levels):

`Coin` (collect-with-value, distinct from SipStation), `Switch` +
`Gate` (independent of QuestionDoor), `PushBox`, `JumpStand`,
`Warp/WarpAll`, `Thunder` (hazard), `StopWatch` (timer-triggered),
`FallBox`, `WeightedLift`, `ColorBox`.

If a level needs a mechanic that needs one of these, note it in your
report and use a CLOSE V7-shipped actor (e.g., SipStation in place of
Coin; multiple QuestionDoors in place of Switch+Gate puzzles).

## JSON schema (v7-level-1)

```jsonc
{
  "schema":     "v7-level-1",
  "levelKey":   "U1.7",                          // canonical key
  "lessonKey":  "1.7",                            // for override-gate routing (NO leading U)
  "title":      "<short, evocative -- 2-4 words>",
  "skill":      "<the framework's Skill code, e.g. 1.A>",
  "lo":         "<the LO code, e.g. UNC-1.J>",
  "ek":         ["<EK codes>"],
  "duration":   180,                              // seconds, default 180
  "map": {
    "width":    32,                                // chips wide
    "height":   8,                                  // chips tall -- KEEP <= 8 (= 80 CSS px native)
                                                   //  (V7 doesn't scale Y -- BOARD_H = 220 px ceiling)
    "chipSize": 10                                  // px per chip (V7.1 = 10; was 24)
  },
  "actors": [
    /* ...placed actors per the recipes below... */
  ],
  "reflection_room": {
    "map":     { "width": 16, "height": 8, "chipSize": 10 },
    "actors":  [
      { "type": "Text",       "x": 8, "y": 2, "text": "[reflection text shown by renderer]" },
      { "type": "ReturnWarp", "x": 8, "y": 6 }
    ]
  },
  "completion": {
    "kind": "lock-and-switch-state + goal-overlap",
    "rule": "any correct QuestionDoor switch pressed by >= 1/3 of online players, then any Player walks onto Goal"
  },
  "min_students": 2
}
```

## V7.1 coordinate budget (HARD CONSTRAINT)

With chipSize=10 and the LC canvas at 320 x ~80 CSS px:
- `map.width <= 32` chips (= 320 px native -- matches LC canvas width)
- `map.height <= 8` chips (= 80 px -- comfortably inside BOARD_H=220)
- ALL actor `x` values in `[0, 32)`, `y` values in `[0, 8)`.

Build wide-and-short levels (32 chips wide x ~8 chips tall). Coords
map 1:1 to LC canvas pixels -- no rescaling needed at render time.

## Per-unit thematic anchors

Read `follow-alongs/apstat_N_framework.md` for the unit before
designing. Each unit has a flavor that should drive mechanic choice:

| Unit | Theme | Mechanic anchor |
|---|---|---|
| U1 | Descriptive statistics | Sip/collect for data; Question Doors for interpretation. Variation on U1.1's pattern. |
| U2 | Bivariate / regression | Pairs of SipStations representing (x, y) points; voting on slope direction / r value. |
| U3 | Sampling + experimental design | Multiple Sip "sources" (representing strata / clusters / SRS); voting on whether the design is unbiased. |
| U4 | Probability + random variables | Multiple SipStations representing trials; voting on P(X >= k) or E[X]. |
| U5 | Sampling distributions | Sample-then-average mini-cycles; voting on "is this normal?" / shape questions. |
| U6 | Inference for proportions | SipStations as binary trials; voting on "reject" vs "fail to reject" or CI questions. |
| U7 | Inference for means | Like U6 but quantitative data; voting on T-test conclusions. |
| U8 | Chi-square | Multi-category SipStations; voting on "uniform vs not" / observed-vs-expected. |
| U9 | Regression inference | Like U2 but with formal slope tests; voting on "slope significantly != 0". |

## Mechanic recipes (the level patterns)

### Pattern A: "Identify the right question" (U1.1, U1.2, U3.1, U6.1)

Best fit: lessons about SKILL 1.A (what question can data answer?) or
introduction-to-a-concept lessons.

- N SipStations (data collection) → live tally → 3 Question Doors
  (different framings of "what does this data answer?") → 1 correct,
  2 wrong.

### Pattern B: "Compute a statistic" (U1.5, U1.7, U1.8, U4.6, U5.1)

Best fit: lessons about a specific summary statistic (mean, median,
proportion, etc.).

- N SipStations with NUMERICAL values (Text label shows the number) →
  Question Doors labeled with candidate values (one correct mean /
  median / etc., 2 wrong distractors).

For computational lessons, use `drink` as a placeholder for the value
when it's binary (A/B); use `Text` actors NEAR each SipStation to
carry the numerical value if richer.

### Pattern C: "Interpret a result" (U6.3, U6.5, U7.3, U8.1)

Best fit: lessons about reading test output, CI interpretation, p-value
meaning.

- 1 SipStation (just for class to "sample" data) → Text actors that
  show the resulting stat (CI bounds, p-value, etc.) → Question Doors
  with interpretation choices ("we reject Ho", "we fail to reject", "p
  is too small", etc.) -- 1 correct.

### Pattern D: "Pick the right test" (U6.4, U7.1, U8.6)

Best fit: lessons about which inferential procedure applies to a
scenario.

- Text actor describes a scenario → Question Doors labeled with test
  names ("1-PropZTest", "2-SampTTest", "chi-square GOF", etc.) -- 1
  correct.

### Pattern E: "Identify a violated condition" (U3.2-3.6, U6.2, U7.2)

Best fit: conditions/assumptions lessons.

- Scenario in a Text actor → Question Doors labeled with possible
  problems ("random sampling violated", "n*p < 10", "outlier present",
  etc.) -- 1 correct.

### Pattern F: "Distribution shape" (U1.4, U1.5, U5.2, U5.3)

Best fit: lessons about graph types, distribution shape, CLT.

- Tally builds via SipStations across categories → Question Doors
  labeled with shape names ("skewed left", "approximately normal",
  "bimodal", etc.) -- 1 correct.

## Authoring conventions

- **lessonKey format**: just the topic number (`1.7`, `5.3`, `8.1`).
  NO leading `U`. The override-gate looks up the lessonKey verbatim.
- **levelKey format**: `U` prefix + topic number (`U1.7`, `U5.3`). The
  filename matches: `activities/U1.7.json`.
- **id fields on QuestionDoor**: `d1`, `d2`, `d3` (sequential). Match
  the position you placed them (leftmost = d1).
- **correct**: exactly ONE QuestionDoor has `correct: true` per level.
- **reflection text**: every WRONG door needs a `reflection` string
  explaining WHY it's wrong, in 1-2 sentences. Match the framework's
  Skill verb (e.g., for "Identify the question" lessons, the
  reflection points out which question the data actually answers).
- **Goal placement**: x at level center, y at the bottom row.
- **Sip Station layout**: spread horizontally across the upper third
  of the map.
- **Text actor placement**: top of map for context; near actors for
  vocab tooltips.
- **ASCII only**: NO smart quotes, NO emoji, NO box-drawing
  characters, NO non-ASCII apostrophes. Plain ASCII apostrophes are OK.
- **LF line endings**.

## When the mechanic doesn't fit cleanly

If a lesson's pedagogy doesn't fit Patterns A-F:
- Default to Pattern A ("identify the right question") with the
  lesson's core concept as the doors.
- Add a `note` field at the top of the JSON: `"_note":
  "Mechanic-fit imperfect; consider V7.2 actor for X"`. The verify
  pass will surface these.

## Sample walkthrough -- U1.7 (Summary Statistics)

Framework anchor: Topic 1.7 = "Summary Statistics for a Quantitative
Variable". Skill 2.B (describe the distribution). LO UNC-1.J (calc
center / spread).

Pattern: B ("Compute a statistic"). 5 SipStations with values [2, 5,
5, 7, 8] (mean = 5.4, median = 5). Question Doors: "Mean is 5.4" (T),
"Mean is 5" (F -- that's median), "Mean is 7" (F).

```jsonc
{
  "schema": "v7-level-1", "levelKey": "U1.7", "lessonKey": "1.7",
  "title": "Mean Hunt", "skill": "2.B", "lo": "UNC-1.J", "ek": ["UNC-1.J.1"],
  "duration": 180,
  "map": { "width": 32, "height": 8, "chipSize": 10 },
  "actors": [
    { "type": "Text", "x": 6, "y": 1, "text": "Sip each cup. Count its number. What is the MEAN?" },
    { "type": "SipStation", "id": "s1", "x":  4, "y": 3, "drink": "2" },
    { "type": "SipStation", "id": "s2", "x":  9, "y": 3, "drink": "5" },
    { "type": "SipStation", "id": "s3", "x": 14, "y": 3, "drink": "5" },
    { "type": "SipStation", "id": "s4", "x": 19, "y": 3, "drink": "7" },
    { "type": "SipStation", "id": "s5", "x": 24, "y": 3, "drink": "8" },
    { "type": "PlayerSpawn", "x": 4, "y": 4 },
    { "type": "QuestionDoor", "id": "d1", "x":  6, "y": 7, "text": "Mean = 5.4", "correct": true },
    { "type": "QuestionDoor", "id": "d2", "x": 16, "y": 7, "text": "Mean = 5", "correct": false, "reflection": "5 is the MEDIAN (middle value), not the mean. Mean = sum / count = 27 / 5 = 5.4." },
    { "type": "QuestionDoor", "id": "d3", "x": 26, "y": 7, "text": "Mean = 7", "correct": false, "reflection": "7 is one of the data points but not the mean. Mean = (2+5+5+7+8)/5 = 5.4." },
    { "type": "Goal", "x": 16, "y": 7 }
  ],
  "reflection_room": {
    "map": { "width": 16, "height": 8, "chipSize": 10 },
    "actors": [
      { "type": "Text", "x": 8, "y": 2, "text": "[reflection text shown by renderer]" },
      { "type": "ReturnWarp", "x": 8, "y": 6 }
    ]
  },
  "completion": { "kind": "lock-and-switch-state + goal-overlap", "rule": "any correct QuestionDoor switch pressed by >= 1/3 of online players, then any Player walks onto Goal" },
  "min_students": 2
}
```

## Sample walkthrough -- U6.3 (CI interpretation)

Framework anchor: Topic 6.3 = "Justifying a Claim Based on a CI for p".
Skill 4.B (interpret CI). LO UNC-4.E.

Pattern: C ("Interpret a result"). 1 SipStation as data trigger; Text
actor shows pre-computed CI; doors are interpretation choices.

```jsonc
{
  "schema": "v7-level-1", "levelKey": "U6.3", "lessonKey": "6.3",
  "title": "CI Reading", "skill": "4.B", "lo": "UNC-4.E",
  "duration": 180,
  "map": { "width": 32, "height": 8, "chipSize": 10 },
  "actors": [
    { "type": "Text", "x": 4, "y": 1, "text": "A 95% CI for p is (0.42, 0.58). Read the doors -- which interpretation is correct?" },
    { "type": "SipStation", "id": "s1", "x": 16, "y": 3, "drink": "A" },
    { "type": "PlayerSpawn", "x": 4, "y": 4 },
    { "type": "QuestionDoor", "id": "d1", "x":  6, "y": 7, "text": "We are 95% sure that p is in (0.42, 0.58)", "correct": false, "reflection": "Common but wrong. The 95% is about the METHOD, not the specific interval. p is fixed; the interval is the random thing." },
    { "type": "QuestionDoor", "id": "d2", "x": 16, "y": 7, "text": "If we repeated, 95% of intervals would capture p", "correct": true },
    { "type": "QuestionDoor", "id": "d3", "x": 26, "y": 7, "text": "95% of the data falls in (0.42, 0.58)", "correct": false, "reflection": "The CI is about the PARAMETER p, not the data values. Data range is unrelated." },
    { "type": "Goal", "x": 16, "y": 7 }
  ],
  "reflection_room": { "map": { "width": 16, "height": 8, "chipSize": 10 }, "actors": [ { "type": "Text", "x": 8, "y": 2, "text": "[reflection text]" }, { "type": "ReturnWarp", "x": 8, "y": 6 } ] },
  "completion": { "kind": "lock-and-switch-state + goal-overlap", "rule": "any correct QuestionDoor switch pressed by >= 1/3 of online players, then any Player walks onto Goal" },
  "min_students": 2
}
```

## Sample walkthrough -- U2.5 (LSRL)

Framework anchor: Topic 2.5 = "Least Squares Regression". Skill 2.D.
LO DAT-1.G.

Pattern: B + slope direction. 5 SipStations representing (x, y) data
points (encoded in `drink` as a numeric pair). Doors ask about slope.

```jsonc
{
  "schema": "v7-level-1", "levelKey": "U2.5", "lessonKey": "2.5",
  "title": "LSRL Slope", "skill": "2.D", "lo": "DAT-1.G",
  "duration": 180,
  "map": { "width": 32, "height": 8, "chipSize": 10 },
  "actors": [
    { "type": "Text", "x": 4, "y": 1, "text": "Each cup shows (x, y). As x grows, y grows too. What is the slope?" },
    { "type": "SipStation", "id": "s1", "x":  3, "y": 3, "drink": "(1,3)" },
    { "type": "SipStation", "id": "s2", "x":  8, "y": 3, "drink": "(2,5)" },
    { "type": "SipStation", "id": "s3", "x": 13, "y": 3, "drink": "(3,7)" },
    { "type": "SipStation", "id": "s4", "x": 18, "y": 3, "drink": "(4,9)" },
    { "type": "SipStation", "id": "s5", "x": 23, "y": 3, "drink": "(5,11)" },
    { "type": "PlayerSpawn", "x": 4, "y": 4 },
    { "type": "QuestionDoor", "id": "d1", "x":  6, "y": 7, "text": "Slope = +2",  "correct": true },
    { "type": "QuestionDoor", "id": "d2", "x": 16, "y": 7, "text": "Slope = -2",  "correct": false, "reflection": "As x rises (1->5), y rises (3->11). The slope is POSITIVE, not negative." },
    { "type": "QuestionDoor", "id": "d3", "x": 26, "y": 7, "text": "Slope = 0",   "correct": false, "reflection": "Zero slope would mean y stays constant. Here y changes from 3 to 11 -- the slope is not zero." },
    { "type": "Goal", "x": 16, "y": 7 }
  ],
  "reflection_room": { "map": { "width": 16, "height": 8, "chipSize": 10 }, "actors": [ { "type": "Text", "x": 8, "y": 2, "text": "[reflection text]" }, { "type": "ReturnWarp", "x": 8, "y": 6 } ] },
  "completion": { "kind": "lock-and-switch-state + goal-overlap", "rule": "any correct QuestionDoor switch pressed by >= 1/3 of online players, then any Player walks onto Goal" },
  "min_students": 2
}
```

## How a unit-author agent should work

1. Read `follow-alongs/apstat_N_framework.md` in full.
2. For each `## TOPIC N.X` heading, identify Skill / LO / EK / available
   resource / required content. ~10 topics per unit typically.
3. Match the topic to a Pattern (A-F) above.
4. Author a JSON file `curriculum_render/railway-server/activities/UN.X.json`.
5. ASCII only. LF line endings. Max map.height = 9.
6. Output ALL files for the unit + a 200-word report summarizing
   any topics where Pattern-fit was imperfect or new actors are needed.

That's the recipe. Use U1.1.json as the canonical example for shape.

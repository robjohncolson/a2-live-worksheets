# Level Editor v1 -- BUILD spec

Session 119+. Successor track to the s118 mechanic-first arc:
ahead of us is a 79-level fan-out (U1.2 -> U9.6) that converts the
s115 batch-authored legacy levels into mechanic-first designs using
the V7.10-V7.14 actor palette. JSON-by-hand authoring is too slow
and error-prone for that scale; this tool replaces it.

This document is the contract. Implementation is phased; each phase
ships independently.

## Goal

A visual, sprite-faithful, schema-aware editor for `v7-level-1`
JSON levels (the only schema the cr engine accepts). The teacher
can open any of the 80 existing levels, redesign it in a tile
painter, run a single-player walk-through to verify the mechanics
work, and save the JSON back to disk.

## Non-goals

- Multi-player playtest from inside the editor (use the existing
  CDP rig / cockpit dev-hook for that)
- Atlas-image authoring or sprite editing (atlas is fixed, mapped
  in `pico_sprite1.json`)
- Auto-deploy of edited levels to a running roster-server (manual
  `git add` + push + Railway auto-deploy stays the loop)
- Schema migration / version conversion (only `v7-level-1`)
- Concurrent / collaborative editing (single-user, single-tab)

## Phasing & ship gate per phase

| Phase | Scope | Vitest count | Ship gate |
|---|---|---|---|
| P1 -- Painter + IO | 3-pane layout, palette, grid, click-place / drag-move / del, props form, metadata form, reflection_room sub-tab, camera viewport slider, save (download) / load (file picker), undo/redo | ~30 | Open U1.1, move 3 actors, save, diff -> only the moved coords changed |
| P2 -- Linter + playtest launcher | Pedagogical lint rules + warnings panel + "Launch in cockpit" button (clipboard + open `?dev=1&devActivity=<key>` in new tab) | ~15 | Open a corrupt level (missing PlayerSpawn) -> 1 red warning |
| P3 -- Sim mode | Single-player walk simulator that mirrors cr-engine actor mechanics (Gate predicate eval, ContextSlot light, GoalPad timer, SipStation auto-choice, phase HUD) + "fake tally" toggle to force open `tally_nonzero` gates | ~20 | Open U1.1, walk player to all 5 zones, transitions match cr engine behavior |

Each phase commits its own BUILD doc + tests + implementation.

## File layout

```
follow-alongs/
  tools/
    level-editor.html        # single-file (HTML + CSS + JS), no build
    level-editor.css         # split out if the inline CSS exceeds ~400 lines (review at P1 close)
    level-editor.js          # split out if the inline JS exceeds ~800 lines (likely)
    pico_park_atlas.png      # the source atlas image (copy from the existing cr sprite path)
  pico_sprite1.json          # already present, sprite region map (READ-ONLY for the editor)
  tests/
    level-editor.test.js     # P1 unit tests (jsdom)
    level-editor-lint.test.js     # P2
    level-editor-sim.test.js      # P3
```

The editor is committed, no secrets, no build. Open via `file://` OR
deploy to GH Pages so it's reachable from any browser. The atlas
image is copied (not symlinked) into `tools/` so `file://` works
without server-side relative-path tricks.

## Actor schema reference (load-bearing for P1)

Surveyed from all 80 existing JSONs (`jq -r '.actors[] | [.type,
(keys|join(","))] | @tsv' *.json | sort -u` against
`cr/railway-server/activities/`).

| Type | Required | Optional | Family | Sprite source |
|---|---|---|---|---|
| `PlayerSpawn` | x, y | -- | Universal | `player_red_idle_0` (atlas) |
| `Text` | x, y, text | -- | Universal | procedural (white box + text wrap) |
| `SipStation` | x, y, id, drink | -- | V7.4+ mechanic-first | `collectible_coin_0` (atlas) |
| `TallyDisplay` | x, y, binds | -- | V7.4+ | procedural (HUD panel with sample tally) |
| `TallyChute` | x, y, id, label | -- | V7.11 | procedural (vertical column, color from label) |
| `Tally` | x, y, threshold | -- | V7.7 (deprecated viz; kept for backward compat) | procedural (yellow box + threshold N) |
| `Gate` | x, y, id, label, predicate | -- | V7.10 | procedural (full-height wall, color from predicate) |
| `ContextSlot` | x, y, id, label | -- | V7.14 | procedural (slot rectangle + label) |
| `GoalPad` | x, y, triggerMs | -- | V7.14 | procedural (green pad with pulsing ring icon) |
| `QuestionDoor` | x, y, id, text, correct | reflection | V7.1 legacy voting | `door_closed` (atlas) |
| `Key` | x, y, id | -- | V7.5 | `hud_key_icon` (atlas) |
| `Goal` | x, y | -- | V7.1 legacy | `door_closed` + green tint (procedural overlay) |
| `ReturnWarp` | x, y | -- | reflection_room only | procedural (orange portal circle) |

Predicates (Gate.predicate enum, dropdown in props form):
- `always_false` -- never opens (a "wrong answer" door)
- `every_player_row_complete` -- opens when all players have
  sampledA + sampledB + choice (the Zone 2 scanner)
- `tally_nonzero` -- opens when any player has recorded a sip
  preference (the Zone 4 advance gate)

Completion kinds (dropdown in metadata form):
- `contextslots-lit-and-goalpad-presence` (mechanic-first style)
- `lock-and-switch-state + goal-overlap` (legacy voting style)

## Palette grouping (left pane)

Three collapsible groups in the palette:

```
+----------------------------+
| MECHANIC-FIRST (V7.10-14)  |
|   [SipStation]             |
|   [Gate]                   |
|   [ContextSlot]            |
|   [GoalPad]                |
|   [TallyChute]             |
|   [TallyDisplay]           |
+----------------------------+
| LEGACY VOTING (V7.1-V7.5)  |
|   [QuestionDoor]           |
|   [Key]                    |
|   [Goal]                   |
|   [Tally]                  |
+----------------------------+
| UNIVERSAL                  |
|   [PlayerSpawn]            |
|   [Text]                   |
+----------------------------+
```

Each palette entry shows the actor's sprite (atlas where mapped,
procedural icon otherwise) + label. Click an entry to set the
"active tool" -- the next grid click places that actor type.

`Esc` or click-blank clears the active tool (selection-only mode).

## UI layout

```
+----------------------------+--------------------------------------+----------------+
| PALETTE                    | TOP TOOLBAR: metadata form          | PROPS          |
| (mechanic-first)           | levelKey [U1.1] title [Cola Mystery]| (selected      |
| (legacy)                   | width [96] height [8] chipSize [10] |  actor's       |
| (universal)                | min_students [2] duration [180]     |  fields)       |
|                            +--------------------------------------|                |
|                            | CAMERA VIEWPORT SLIDER (64 chips wide)|                |
|                            | [--+-----------------------------]   |                |
|                            +--------------------------------------+                |
|                            | GRID CANVAS (sprite-faithful render) |                |
|                            | row 0: . . . T . . . . . . . . .    |                |
|                            | row 1: . . . . . . . . . . . . .    |                |
|                            | row 2: . . . . S . . . . . . . .    |                |
|                            | ...                                  |                |
|                            +--------------------------------------+                |
|                            | TABS: [Main level] [Reflection room] |                |
|                            +--------------------------------------+                |
|                            | BOTTOM TOOLBAR:                      |                |
|                            | [Save] [Load] [Undo] [Redo] [Copy JSON]|              |
+----------------------------+--------------------------------------+----------------+
```

Default canvas size scales to fit screen; sprite-faithful render
uses the actual cr chip size (10 CSS px per chip) zoomed up to ~3x
for editor visibility (so each chip is ~30 CSS px in the editor).

## Interaction model

**Mouse:**
- Palette click -> set active tool
- Grid click (with active tool) -> place actor at clicked chip
- Grid click (no active tool) -> select actor under cursor (if any)
- Grid drag (on selected actor) -> move actor; chip-snap on release
- Grid right-click -> context menu (Delete / Duplicate / Edit ID)

**Keyboard:**
- `Esc` -> clear active tool / clear selection
- `Del` / `Backspace` -> delete selected actor
- Arrow keys -> nudge selected actor 1 chip
- `Ctrl+Z` / `Ctrl+Y` -> undo / redo
- `Ctrl+S` -> save (download JSON)
- `Ctrl+O` -> load (file picker)
- `1`-`9` -> palette quickselect (top 9 entries; reorder by usage)

**Selection visual:** 2px solid blue outline around the selected
actor's chip footprint; drag-handle dots at the 4 corners.

## Props form (right pane, schema-aware)

When an actor is selected, the right pane shows fields for ONLY
that actor's props. Field types:

| Field type | Used for | Widget |
|---|---|---|
| number | x, y, threshold, triggerMs | number input + step=1 (or step=100 for triggerMs) |
| text-short | id, label, drink, binds | text input |
| text-long | text, reflection | textarea, autoexpand |
| enum | predicate (Gate), kind (completion) | dropdown |
| boolean | correct (QuestionDoor) | checkbox |

Required fields are validated on blur (red border if empty). On
save, fail with a toast if any required field is missing.

## Metadata form (top toolbar)

Fields:
- `schema` (readonly, always `v7-level-1`)
- `levelKey` (text, required, validates `^U\d+\.\d+$`)
- `lessonKey` (text, required, validates `^\d+\.\d+$`)
- `title` (text, required)
- `skill` (text)
- `lo` (text)
- `ek` (text, comma-separated -> array on save)
- `duration` (number, default 180)
- `map.width` (number, default 32, min 8, max 96)
- `map.height` (number, default 8, min 4, max 16)
- `map.chipSize` (number, default 10, readonly)
- `min_students` (number, default 2)
- `completion.kind` (enum: contextslots-lit-and-goalpad-presence /
  lock-and-switch-state + goal-overlap)
- `completion.rule` (text-long)

Changing `map.width` / `map.height` resizes the grid canvas. Actors
that fall outside the new bounds get a warning + are moved to the
nearest in-bounds chip on save.

## Reflection room sub-tab

Second tab on the grid panel. Same painter UI but:
- Default map: `{width: 16, height: 8, chipSize: 10}`
- Palette is filtered to `{Text, ReturnWarp}` only
- Metadata form is hidden (the reflection_room metadata is fixed)
- Camera viewport slider is hidden (reflection rooms are
  single-frame; don't side-scroll)

## Camera viewport slider

Above the grid canvas. A 64-chip-wide window indicator that the
user can drag along the level's full width to preview "what
students see at this scroll position." Useful for spacing zones
(U1.1's 5 zones each get their own camera frame at chip x=8/24/40/
50/64/76/88/95). The grid canvas always shows the FULL level;
the slider just dims the chips outside the current camera window.

Hidden on the reflection_room tab.

## Save / Load contract

**Save:** click [Save] -> browser download `<levelKey>.json` (e.g.
`U2.3.json`). JSON format matches the existing corpus EXACTLY:
- 2-space indent
- All actor lines on one line (the current corpus uses compact
  single-line actors; preserve that for diff-clean fan-out commits)
- Top-level keys in order: schema, levelKey, lessonKey, title,
  skill, lo, ek, duration, map, actors, reflection_room,
  completion, min_students

User manually `git mv ~/Downloads/U2.3.json
cr/railway-server/activities/` + commits.

**Load:** click [Load] -> file picker -> JSON file -> validates
schema (`schema === "v7-level-1"` required; else toast) -> parses
into editor state. ANY top-level fields not in the schema are
preserved verbatim on save (forward-compat).

**Copy JSON:** writes formatted JSON to clipboard for users who
prefer paste-to-VS-Code workflow.

**Round-trip guarantee:** load a level, immediately save, parse
again -- the resulting parsed STRUCTURE is deep-equal to the
input structure (semantic round-trip; whitespace + key ordering
within sub-objects may normalize). Pinned by 1 Vitest case PER
existing level (80 round-trip cases). Byte-identical round-trip
was the original aspiration but is impossible against the s115
batch-authored corpus, which has heterogeneous intra-file
whitespace (some actors on one line, others multi-line; padded
vs unpadded type columns within the same file). Editor's
canonical format matches the dominant U6.x/U7.x/U9.x style.

## Undo / redo model

Editor maintains a flat array of state snapshots (deep clones).
Each user action that mutates state pushes a snapshot to the
undo stack. Undo pops -> applies. Redo applies the popped snapshot.
Max stack depth = 50. New action after undo truncates the redo
stack.

Actions that snapshot:
- Place actor
- Delete actor
- Move actor (one snapshot per drag END, not per pixel)
- Edit prop (one snapshot per field blur, not per keystroke)
- Edit metadata field
- Resize map
- Switch tabs (no -- viewing isn't a mutation)

## P2 -- Lint rules

Warnings panel below the grid (collapsible). Each rule has a
severity (`error` / `warn` / `info`) and a click-to-jump-to-actor
behavior.

| Rule | Severity |
|---|---|
| No `PlayerSpawn` in actors[] | error |
| Multiple `PlayerSpawn`s | warn |
| PlayerSpawn x or y outside map bounds | error |
| Actor x or y outside map bounds | error |
| Duplicate `id` across actors | error |
| Gate with `always_false` and no Gate with `tally_nonzero` (no advance path) | error |
| QuestionDoor with `correct: false` and no `reflection` text | warn |
| TallyChute with `label` that no SipStation `drink` matches | warn |
| `completion.kind === 'contextslots-lit-and-goalpad-presence'` but no GoalPad in actors[] | error |
| `completion.kind === 'lock-and-switch-state + goal-overlap'` but no Goal in actors[] | error |
| Two actors at the same (x, y) chip | warn |
| Actor placed but referenced predicate / binds value unknown | warn |

## P2 -- Playtest launcher

Button: [Launch in cockpit]. Behavior:
1. Save current state to clipboard (formatted JSON)
2. Show toast: "JSON in clipboard. Drop into
   `cr/railway-server/activities/<levelKey>.json`, commit, push,
   wait for Railway, then visit the URL below."
3. Open new tab to
   `https://robjohncolson.github.io/apstats-live-worksheet/ap_stats_roadmap_square_mode.html?year=SY26-27&dev=1&devActivity=<levelKey>`

No round-trip to roster-server. The user owns the deploy step.

## P3 -- Sim mode

A play-button on the toolbar. Click -> editor enters "sim mode":
- Actor placement disabled
- A red player avatar appears at PlayerSpawn coords
- Arrow keys move the avatar 1 chip/tick (or hold for continuous
  walk at 6 chips/sec)
- Gate / ContextSlot / GoalPad / SipStation / Key / Goal /
  QuestionDoor interactions fire the cr engine logic locally:
  - Gate: `predicate` evaluated against sim state; closed gate
    blocks x movement (push-out)
  - ContextSlot: walk-over lights it (green); state survives
    sub-phase changes
  - GoalPad: walk-on starts `triggerMs` timer; walk-off cancels;
    timer complete -> LEVEL_CLEARED toast
  - SipStation: walk-on records (sampledA / sampledB); 2nd
    distinct sip = `choice`
  - Key: walk-on collects; Goal becomes unlocked
  - Goal: walk-on (after Key OR if no Key actor exists) ->
    LEVEL_CLEARED toast
  - QuestionDoor: walk-through -> vote; `correct: true` advances
    phase to KEY_HUNT or GOAL_AVAILABLE; `correct: false` shows
    reflection panel (text from `reflection` field) for 4 sec
- Phase HUD at top: "SIPPING | VOTING | REFLECTION | KEY_HUNT |
  GOAL_AVAILABLE | LEVEL_CLEARED"
- "Fake tally" toggle -> sim state pretends tally has 1 row, so
  `tally_nonzero` gates open without the user walking SipStations
- [Stop sim] returns to editor mode, sim state discarded

This is NOT a full engine port; it's a faithful mirror sufficient
to verify the level's mechanics order. Multi-player teamwork
(Zone 2 row-scanner needing ALL players ready) is simulated as
"always ready" (since there's only 1 player).

## Test plan

### P1 -- `tests/level-editor.test.js`

Loads `tools/level-editor.html` into jsdom, then exercises the
editor's exported API (the editor exposes a `window.LE` test
handle when `?test=1` is in the URL).

~30 cases:
- Actor model: place actor at (x, y); state.actors[] has the entry
- Actor model: delete selected actor; state.actors[] shrinks by 1
- Actor model: move actor via setActorPos(); coords update
- Actor model: place outside bounds; throws / no-op
- Schema: load JSON, state matches; save JSON, output matches
  input (byte-for-byte, per the round-trip guarantee)
- Schema: 80 round-trip cases (parametrized over all existing
  level files) -- this is the big confidence pin
- Palette: click palette entry -> active tool set
- Palette: click grid with active tool -> actor placed at chip
- Props form: select actor -> form shows that actor's fields
- Props form: edit field -> state updates
- Metadata: edit width -> grid resizes; out-of-bounds actors
  flagged
- Undo: place 3 actors, undo 2; state.actors.length === 1
- Redo: undo, redo; state matches pre-undo
- Reflection room: switch tab; palette filtered to {Text,
  ReturnWarp}
- Camera slider: move slider; dims appropriate chips
- Save: triggers download with correct filename
- Load: file picker returns blob; state populated
- Validation: load non-v7-level-1 JSON; rejected with toast

### P2 -- `tests/level-editor-lint.test.js`

~15 cases, one per lint rule + edge cases. Each rule exercised
against a fixture level that triggers it + a fixture that doesn't.

### P3 -- `tests/level-editor-sim.test.js`

~20 cases. Sim engine actor mechanics:
- Walk player 5 chips right; pos.x === spawn.x + 5
- Walk into Gate(always_false); blocked
- Walk into Gate(tally_nonzero) with fakeTally=true; passes
- Walk over ContextSlot; lit
- Walk on GoalPad; timer starts; walk off; cancels
- Walk SipStation A then SipStation B; choice='B' recorded
- Walk Key; key.collected=true; Goal unlocks
- Walk QuestionDoor(correct=true); phase advances
- Walk QuestionDoor(correct=false); reflection panel shows
- Phase transitions: SIPPING -> VOTING when sips complete; VOTING
  -> KEY_HUNT when correct vote; etc.

## Open questions / risks

1. **Atlas image path.** Where is `pico_park_atlas.png` (or
   equivalent) in the workspace right now? It needs to be findable
   to copy into `tools/`. Check `cr/railway-server/sprites/` and
   any `follow-alongs/sprites/` -- if it's not already in either,
   we need the user to drop a copy.

2. **Sprite atlas frames for actors NOT in `pico_sprite1.json`.**
   The map covers ~36 regions. Most mechanic-first actors (Gate /
   ContextSlot / GoalPad / TallyChute / Scanner) are procedural in
   the cr renderer. The editor mirrors that. If the user wants
   sprite-faithful art for those later, atlas extension is its
   own track.

3. **Procedural draw fidelity.** The editor's procedural draws
   should "approximate" the cr renderer but don't need to be
   pixel-identical. Document this as a soft contract: visual
   parity within ~10% (color, shape, position) is fine; exact
   parity is achieved by the sim-mode launcher (which opens the
   real cockpit).

4. **GH Pages deploy.** Does the user want the editor at
   `https://robjohncolson.github.io/apstats-live-worksheet/tools/
   level-editor.html` (auto-deployed by GH Pages from `master`)?
   If yes, no extra setup needed -- the file just goes in `tools/`
   and it'll be live on next push.

5. **Test fixture corpus.** The 80 round-trip cases load real
   files from `cr/railway-server/activities/`. P1 tests need a
   way to reach that path -- either symlink, copy into a fixture
   dir, or relative-path through `../../../curriculum_render/`.
   Verify the test command runs from the right cwd.

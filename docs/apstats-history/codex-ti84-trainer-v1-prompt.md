# Codex Task: Build TI-84 Plus CE Procedural Trainer — V1

## Objective

Build a **single-file HTML webapp** (`ti84_trainer.html`) that trains AP Statistics students on TI-84 Plus CE keystroke sequences. Students learn procedures via guided walkthrough, then prove retention via recall drills. An SM-2 SRS scheduler ensures durable memory.

**This is V1 — ship a working trainer, not a perfect one.**

## Context Files (read these first)

| File | What it contains |
|------|------------------|
| `ti84-trainer-spec.md` | Full spec: architecture, content model, interaction design, SRS, UI layout, phases |
| `ti84-procedures-data.json` | Verified procedure data: 27 procedures, 16 micro-skills, 65+ screens, 67 DAG edges, 144 common errors |
| `ti84-state-machine.js` | Deterministic JS state machine: `createState()`, `createRouteState()`, `transition(state, key)`, `validKeys(state)` |
| `ti84-rom-wizard-fields.md` | ROM extraction report with exact field labels and TI token mapping |
| `CONTINUATION_PROMPT.md` | Project status and verification history |

## What to Build

A single `ti84_trainer.html` file with embedded JS/CSS. Zero dependencies. Opens in any browser.

### Core Features (all required for V1)

1. **Mid-fidelity TI-84 CE screen renderer**
   - Monospace font, dark background, light text
   - Render screen types: menu (with tabs), wizard (labeled fields), result (statistics output), editor (list/matrix)
   - Menu tabs rendered as labeled headers (e.g., `EDIT  CALC  TESTS` with active tab highlighted)
   - Cursor/highlight shown with inverse background
   - Wizard fields rendered as labeled rows with values
   - Does NOT need to render graphs — simplified placeholder is fine

2. **Virtual keypad**
   - Clickable button grid matching TI-84 CE layout (see spec section 5.3)
   - Styled to approximate TI-84 CE colors: blue function keys, gray number pad, green ALPHA, yellow 2ND
   - 2ND key toggles secondary labels
   - Touch-friendly sizing for phone/tablet
   - In guided mode: correct key pulses/highlights, irrelevant keys dimmed

3. **Guided mode**
   - Shows current screen state
   - Narration text explains what to do next
   - Correct key highlighted on keypad
   - Wrong key → red flash + feedback text from `commonErrors` if available, generic "try again" otherwise
   - After completing all steps → procedure marked as "seen"

4. **Recall mode**
   - Shows a prompt describing the task (e.g., "Run a 1-PropZTest with p₀=0.5, x=64, n=100, prop > p₀")
   - Screen starts at home
   - Student must press correct keys from memory — no highlights, no narration
   - Wrong key → red flash, option to retry or show hint (hint counts as error)
   - Completion → score based on errors (0 = perfect, 1-2 = partial, 3+ = needs review)

5. **SM-2 SRS scheduling**
   - Per-node SRS state: interval, easeFactor, repetitions, lastReview, nextReview, mode (guided/recall)
   - New node → guided mode. After 1 successful guided → promoted to recall
   - If recall has 3+ errors → demoted back to guided
   - Session queue: collect overdue nodes, sort by most overdue, interleave across units, mix in 1-2 new items

6. **Session dashboard**
   - Shows: due reviews count, new items available, overall mastery percentage
   - Unit filter (dropdown or tabs for U1-U9)
   - Mode indicator (Guided / Recall)
   - Progress bar for current procedure (step X of Y)

7. **Persistence**
   - All state in `localStorage` under `ti84trainer_` prefix
   - Export/import as JSON for backup

### Architecture

```
┌─────────────────────────────────────────────┐
│              ti84_trainer.html               │
├─────────────────────────────────────────────┤
│ EMBEDDED DATA                               │
│ ├─ procedures[] from ti84-procedures-data   │
│ ├─ screens{} from ti84-procedures-data      │
│ └─ microSkills[] from ti84-procedures-data  │
├─────────────────────────────────────────────┤
│ ENGINE (port from ti84-state-machine.js)    │
│ ├─ transition(state, key) → newState        │
│ ├─ ProcedureRunner (steps through a proc)   │
│ ├─ SessionQueue (SRS scheduling)            │
│ └─ StateManager (localStorage)             │
├─────────────────────────────────────────────┤
│ UI                                          │
│ ├─ ScreenRenderer (draws TI-84 display)     │
│ ├─ KeypadController (button grid + input)   │
│ ├─ NarrationBar (guided mode text)          │
│ └─ Dashboard (progress, queue, mastery)     │
└─────────────────────────────────────────────┘
```

**Important**: The state machine logic from `ti84-state-machine.js` should be embedded inline in the HTML file. It's currently an ESM module — adapt it to work as inline `<script>` code. The procedure data from `ti84-procedures-data.json` should also be embedded as a `const PROCEDURES_DATA = { ... }` block.

### Layout

```
┌─────────────────────────────────────────────┐
│  TI-84 Procedural Trainer                   │
│  [Unit: All ▼] [Mode: Guided] [Stats: 72%] │
├──────────────────────┬──────────────────────┤
│                      │                      │
│   TI-84 CE Screen    │   Virtual Keypad     │
│   (mid-fidelity)     │   (clickable grid)   │
│                      │                      │
├──────────────────────┴──────────────────────┤
│  "Press [STAT] to open the Statistics menu" │
│  [Step 1/7]              [Hint] [Restart]   │
├─────────────────────────────────────────────┤
│  Session: 5 due | 2 new | Mastery: 72%     │
└─────────────────────────────────────────────┘
```

Mobile: stack screen above keypad vertically. Use CSS media queries.

### Screen Rendering Details

**Menu screens** (e.g., stat-menu, stat-tests-menu):
```
┌──────────────────────────┐
│ EDIT  CALC  TESTS        │  ← tabs, active tab inverse
│ ▶1:Z-Test...             │  ← cursor on item 0
│  2:T-Test...             │
│  3:2-SampZTest...        │
│  4:2-SampTTest...        │
│  5:1-PropZTest...        │
│  6:2-PropZTest...        │
│  7:ZInterval...          │
│                          │
└──────────────────────────┘
```

**Wizard screens** (e.g., one-propztest-wizard):
```
┌──────────────────────────┐
│ 1-PropZTest              │
│  p₀: .5                 │
│  x: 64                  │
│  n: 100                 │
│  prop: >p₀              │  ← highlighted option
│  ▶Calculate  Draw       │
│                          │
│                          │
└──────────────────────────┘
```

**Result screens** (e.g., one-propztest-result):
```
┌──────────────────────────┐
│ 1-PropZTest              │
│  prop>.5                 │
│  z=2.8                   │
│  p=.0051                 │
│  p̂=.64                  │
│  n=100                   │
│                          │
│                          │
└──────────────────────────┘
```

Use a monospace font (Courier New or similar). Dark background (#1a1a2e), light text (#e0e0e0). Highlighted items: inverse colors (light bg, dark text).

### Keypad Layout

Follow the TI-84 CE physical layout from `ti84-procedures-data.json` keypad section. Key colors:
- **Blue**: Y=, WINDOW, ZOOM, TRACE, GRAPH
- **Yellow**: 2ND
- **Green**: ALPHA
- **Dark gray**: MODE, DEL, CLEAR, arrow keys
- **Light gray**: number pad, operators
- **Black**: function keys (MATH, APPS, PRGM, VARS)
- **White labels** for primary function, **yellow labels** for 2ND, **green labels** for ALPHA

### What NOT to Build (defer to V2)

- Physical-first mode (compact key palette)
- Bayesian knowledge tracing
- DAG prerequisite enforcement
- Scaffolding removal (progressive hint hiding)
- Parameterized procedures (different input values each time)
- Railway sync / teacher visibility
- Graph rendering (histogram, scatterplot, normal curve)

## Implementation Notes

### Embedding the data

The JSON is large (~60K tokens). Embed it minified:
```html
<script>
const DATA = {"meta":...,"keypad":...,"screens":[...],"microSkills":[...],"procedures":[...],"dag":{...}};
</script>
```

### Embedding the state machine

Port `ti84-state-machine.js` inline. Key functions to preserve:
- `createState(screenId)` — create a calculator state
- `createRouteState(routeId)` — start a guided procedure
- `transition(state, key)` — the core deterministic transition
- `validKeys(state)` — keys valid at current state

### Key mapping for the keypad

The keypad `keys` array in the JSON has `id`, `label`, `row`, `col`, `color`, `secondary`, `alpha` for each key. Use `id` as the key identifier passed to `transition()`. The `secondary` field shows what 2ND + this key does (e.g., VARS has secondary "DISTR").

### Error handling in guided mode

When a student presses the wrong key:
1. Check if the wrong key has a `commonErrors` entry for this step
2. If yes → show the specific feedback text
3. If no → show generic "That's not the right key. Try [correct_key]."
4. Flash the pressed key red briefly
5. Do NOT advance the state

### SRS implementation

Use SM-2 algorithm (simple, well-documented):
```javascript
function sm2(quality, item) {
  // quality: 0-5 rating
  if (quality >= 3) {
    if (item.repetitions === 0) item.interval = 1;
    else if (item.repetitions === 1) item.interval = 6;
    else item.interval = Math.round(item.interval * item.easeFactor);
    item.repetitions++;
  } else {
    item.repetitions = 0;
    item.interval = 1;
  }
  item.easeFactor = Math.max(1.3,
    item.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  item.nextReview = addDays(new Date(), item.interval);
}
```

Quality mapping from the spec:
- 0 errors, no hints → quality 5
- 1 error, no hints → quality 4
- 2 errors OR 1 hint → quality 3
- 3+ errors → quality 1
- 2+ hints → quality 0 (demote to guided)

## Testing

After building, verify:
1. Opening the HTML file shows the trainer with keypad and screen
2. Clicking a procedure from the dashboard starts guided mode
3. Pressing the correct key advances the screen
4. Pressing the wrong key shows feedback
5. Completing a guided procedure marks it as seen
6. SRS state persists across page reloads
7. Mobile layout stacks vertically
8. The state machine correctly drives all 27 procedures

## Constraints

- **Single file**: everything in one `.html` file
- **No dependencies**: no CDN links, no npm packages, no build step
- **No network**: works fully offline (no Railway server needed)
- **Browser-only**: opens via `file://` protocol
- **Performance**: page load under 2 seconds even with embedded data

## Visual Style

- Dark theme matching TI-84 CE aesthetic
- Calculator screen area with visible bezel/border (rounded corners, slight shadow)
- Clean, minimal UI outside the calculator — the focus is on the screen and keypad
- Use the same monospace font family for the calculator screen as the real TI-84 CE uses
- Narration bar should be warm/encouraging in tone — this is a learning tool, not a test

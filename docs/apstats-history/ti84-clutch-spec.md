# TI-84 Trainer — Clutch System + Data Seeding + List Memory

## The Problem

12 of 27 procedures require data pre-loaded in lists (L1-L6) or matrices ([A]-[J]). CEmu starts with empty lists. When students hit Calculate, they get "ERR:INVALID DIM" or wrong results because there's no data.

Currently the trainer has one mode: walkthrough (state machine validates every keystroke). There's no way to freely use the calculator for data entry before a procedure starts.

## Architecture: The Clutch

Like a car clutch, the trainer can **engage** or **disengage** the state machine:

```
DISENGAGED (clutch out):
  - Student presses any key → goes straight to CEmu
  - No validation, no blocking, no "wrong key" feedback
  - Trainer shows guidance overlay but doesn't enforce
  - Used for: data entry, free exploration, fixing errors

ENGAGED (clutch in):
  - Student presses key → state machine validates first
  - Correct key → pass to CEmu + advance walkthrough
  - Wrong key → blocked, feedback shown
  - Used for: the actual procedure walkthrough
```

### Walkthrough Phases

Each procedure walkthrough now has up to 3 phases:

```
Phase 1: DATA SETUP (clutch disengaged)
  - Only if procedure requires list/matrix data
  - Shows what data needs to be in which lists
  - Guides student through STAT>EDIT data entry
  - Student types freely — trainer tracks but doesn't block
  - "Done" button or auto-detect when data matches expected values
  - Skip if lists already have the right data (memory system)

Phase 2: PROCEDURE (clutch engaged)  
  - The existing guided/recall walkthrough
  - State machine validates keystrokes
  - This is what we have today

Phase 3: RESULT REVIEW (clutch disengaged)
  - After procedure completes
  - Student can scroll result, explore output
  - Free navigation before moving to next item
```

### Data Requirements by Procedure

```javascript
const DATA_REQUIREMENTS = {
  'one-var-stats':        { L1: 'numeric' },
  'histogram':            { L1: 'numeric' },
  'modified-boxplot':     { L1: 'numeric' },
  'scatterplot':          { L1: 'numeric', L2: 'numeric' },
  'residual-plot':        { L1: 'numeric', L2: 'numeric' },
  'linreg-a-plus-bx':    { L1: 'numeric', L2: 'numeric' },
  't-test-data':          { L1: 'numeric' },
  't-interval-data':      { L1: 'numeric' },
  'chi-square-gof-test':  { L1: 'numeric', L2: 'numeric' },  // observed, expected
  'chi-square-test':      { '[A]': 'matrix', '[B]': 'matrix' },
  'linreg-ttest':         { L1: 'numeric', L2: 'numeric' },
  'linreg-tint':          { L1: 'numeric', L2: 'numeric' },
};
// Remaining 15 procedures (stats-input or distribution) need no data setup
```

## List Memory System

The trainer tracks what's currently in CEmu's lists.

```javascript
const listMemory = {
  L1: { data: [315, 108, 101, 32], source: 'chi-square-gof-test', timestamp: ... },
  L2: { data: [312.75, 139, 139, 46.25], source: 'chi-square-gof-test', timestamp: ... },
  L3: null,  // empty
  // ...
  '[A]': { data: [[20,30],[25,25]], source: 'chi-square-test', timestamp: ... },
};
```

### Memory Lifecycle

1. **On data entry**: When student types values into STAT>EDIT during Phase 1, the trainer captures each value and updates listMemory
2. **On auto-fill**: If trainer auto-types data, update listMemory immediately
3. **On procedure start**: Check if required lists already have compatible data
   - Same data → skip Phase 1, show "Using existing data in L1"
   - Different data → enter Phase 1, show "This procedure needs different data in L1"
   - Empty → enter Phase 1, guide through data entry
4. **On page reload**: listMemory persists in localStorage. CEmu persists ROM state in IndexedDB. Both should stay in sync.
5. **On calculator reset**: Clear listMemory (CLEAR CLEAR CLEAR might wipe lists)

### Tracking Data During Free Input (clutch disengaged)

When the clutch is disengaged and the student is in STAT>EDIT:
- The trainer watches key presses to track cursor position (which list, which row)
- When student types digits + ENTER, record the value at that position
- When student arrows to a different column, track the active list
- This builds up listMemory in real-time

This is imperfect (student might edit existing values, delete rows, etc.) but covers the common case of entering fresh data.

Alternative: after data entry is "done", read the list contents from the native module (which also processed the key presses) and trust that as the source of truth.

## Data Seeding Guidance UI

During Phase 1, the trainer shows:

```
┌─────────────────────────────────────────────────┐
│  DATA SETUP                                      │
│                                                  │
│  This procedure needs data in L1 and L2.         │
│                                                  │
│  L1 (Observed): 315, 108, 101, 32               │
│  L2 (Expected): 312.75, 139, 139, 46.25         │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ Step 1: Press [STAT] then [ENTER]        │    │
│  │         to open the list editor.         │    │
│  │                                          │    │
│  │ Step 2: Type each L1 value, press ENTER  │    │
│  │         after each one.                  │    │
│  │                                          │    │
│  │ Step 3: Arrow right to L2, type values.  │    │
│  │                                          │    │
│  │ Step 4: Press [2ND][QUIT] when done.     │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  [ Auto-fill (types it for you) ]  [ I'm done ] │
│                                                  │
│  Progress: L1 ✓ (4/4 values)  L2 ☐ (0/4 values)│
└─────────────────────────────────────────────────┘
```

### Auto-fill Option

For students who want to skip manual data entry:
- Trainer sends key presses to CEmu rapidly (STAT > ENTER > type values > ENTER each)
- Shows progress: "Entering L1... 3/4 values"
- Takes 2-5 seconds depending on data length
- Updates listMemory when complete

### Manual Entry Tracking

For students who enter data themselves:
- Trainer shows the target values as a reference
- Tracks progress: "L1: 4/4 values entered ✓"
- Highlights which value to enter next
- Non-blocking — student can enter in any order
- "I'm done" button moves to Phase 2

## Implementation

### New State: `app.clutch`

```javascript
app.clutch = {
  engaged: true,          // false during data setup / result review
  phase: 'procedure',     // 'data-setup' | 'procedure' | 'result-review'
  dataTarget: null,       // { L1: [...], L2: [...] } — what needs to be entered
  dataProgress: {},       // { L1: { entered: 4, total: 4 }, L2: { entered: 0, total: 4 } }
  autoFilling: false,     // true while auto-fill is running
};
```

### Key Press Routing with Clutch

```javascript
async function pressButton(buttonId) {
  if (app.clutch.autoFilling) return;  // ignore input during auto-fill
  
  if (!app.clutch.engaged) {
    // Clutch disengaged — pass directly to CEmu, track for memory
    await app.bridge.sendButton(buttonId);
    trackDataEntry(buttonId);  // update listMemory based on key
    updateDataProgress();      // check if target data is entered
    render();
    return;
  }
  
  // Clutch engaged — existing walkthrough validation logic
  // ... (current pressButton code)
}
```

### Auto-fill Implementation

```javascript
async function autoFillLists(dataTarget) {
  app.clutch.autoFilling = true;
  render();  // show progress UI
  
  // Navigate to STAT>EDIT
  await bridge.sendButton('STAT');
  await bridge.sendButton('ENTER');
  await wait(200);
  
  for (const [listName, values] of Object.entries(dataTarget)) {
    // Navigate to correct list column (L1 is default, RIGHT for L2, etc.)
    const listIndex = parseInt(listName.slice(1)) - 1;
    for (let i = 0; i < listIndex; i++) {
      await bridge.sendButton('RIGHT');
      await wait(50);
    }
    // Move to first row
    await bridge.sendButton('DOWN');
    
    for (const value of values) {
      await bridge.typeValue(String(value));
      await bridge.sendButton('ENTER');
      await wait(50);
      
      // Update progress
      app.clutch.dataProgress[listName].entered++;
      render();
    }
    
    // Move back to top for next list
    // ... navigate
  }
  
  // Return to home
  await bridge.sendButton('2ND');
  await bridge.sendButton('MODE');  // QUIT
  await wait(200);
  
  // Update memory
  for (const [listName, values] of Object.entries(dataTarget)) {
    listMemory[listName] = { data: values, source: 'auto-fill', timestamp: Date.now() };
  }
  
  app.clutch.autoFilling = false;
  // Transition to Phase 2
  startProcedurePhase();
}
```

### Matrix Entry (χ²-Test)

For matrices, auto-fill navigates to the matrix editor:
1. 2ND > X_INVERSE (MATRIX) > EDIT > ENTER ([A])
2. Type dimensions (rows ENTER cols ENTER)
3. Type each cell value + ENTER
4. 2ND > QUIT

## Persistence

```javascript
// Save to localStorage
const MEMORY_KEY = 'ti84-trainer-list-memory';

function saveListMemory() {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(listMemory));
}

function loadListMemory() {
  return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}');
}
```

On page load, check if CEmu's IndexedDB ROM state matches the listMemory. If the ROM was cleared or reset, clear listMemory too.

## Files to Modify

1. `app.js` — clutch state, phase management, auto-fill, data tracking, memory
2. `style.css` — data setup UI styling
3. `ti84-procedures-data.json` — add `dataRequirements` field to each procedure
4. `standalone.html` — rebuilt after changes
5. `native/ti84-native.js` — expose list contents for memory sync

## Files NOT to Modify

- Native module files (except ti84-native.js for list access)
- bridge.js
- Existing test files

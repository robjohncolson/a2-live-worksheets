# Codex Task: Clutch System + Data Seeding + List Memory

## Context

The TI-84 trainer has 27 AP Stats procedures. 12 of them require data pre-loaded in lists (L1-L6) or matrices. CEmu starts with empty lists, so students get "ERR:INVALID DIM" when they reach Calculate. We need a system to handle data setup before procedure walkthroughs.

Read `ti84-clutch-spec.md` for the full architecture. Read `ti84-procedures-data.json` for procedure data. Read `ti84-trainer-v2/app.js` for the current walkthrough engine.

## What to Build

### 1. Clutch State

Add `app.clutch` to the app state:

```javascript
app.clutch = {
  engaged: true,
  phase: 'idle',        // 'idle' | 'data-setup' | 'procedure' | 'result-review'
  dataTarget: null,     // { L1: [values], L2: [values], '[A]': [[matrix]] }
  dataProgress: {},     // tracks how many values entered per list
  autoFilling: false,
};
```

### 2. Data Requirements per Procedure

Add a `dataRequirements` field to each procedure in `ti84-procedures-data.json`. Read the existing `assumeDataIn` field and each procedure's problem data shape to determine requirements:

```javascript
// Procedures needing L1 only:
'one-var-stats', 'histogram', 'modified-boxplot', 't-test-data', 't-interval-data'

// Procedures needing L1 + L2:
'scatterplot', 'residual-plot', 'linreg-a-plus-bx', 'linreg-ttest', 'linreg-tint'

// χ²GOF needs L1 (observed) + L2 (expected):
'chi-square-gof-test'

// χ²-Test needs matrices:
'chi-square-test'

// Remaining 15 procedures use Stats input or distributions — no data needed
```

Add to each procedure object:
```json
{
  "dataRequirements": {
    "L1": "numeric",
    "L2": "numeric"
  }
}
```

Or `null` / omit for procedures that don't need data.

### 3. List Memory

Track what's in CEmu's lists across procedures:

```javascript
const MEMORY_KEY = 'ti84-trainer-list-memory';
let listMemory = loadListMemory();

function loadListMemory() {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}'); }
  catch { return {}; }
}

function saveListMemory() {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(listMemory));
}

function setListMemoryEntry(name, data, source) {
  listMemory[name] = { data, source, timestamp: Date.now() };
  saveListMemory();
}

function listDataMatches(name, targetData) {
  const entry = listMemory[name];
  if (!entry || !entry.data) return false;
  if (entry.data.length !== targetData.length) return false;
  return entry.data.every((v, i) => v === targetData[i]);
}
```

### 4. Phase Transitions in startWalkthrough

When starting a walkthrough, check if data setup is needed:

```javascript
async function startWalkthrough(procedureId, problem) {
  const procedure = PROCEDURE_BY_ID[procedureId];
  const dataReqs = procedure.dataRequirements;
  
  // Reset CEmu to home
  await app.bridge.prepareHome();
  native.reset();
  
  if (dataReqs && problem?.data) {
    // Build data target from problem values
    const dataTarget = {};
    for (const [listName, type] of Object.entries(dataReqs)) {
      const values = resolveListData(listName, problem);
      if (values && values.length > 0) {
        dataTarget[listName] = values;
      }
    }
    
    // Check if lists already have the right data
    const allMatch = Object.entries(dataTarget).every(([name, data]) => 
      listDataMatches(name, data)
    );
    
    if (allMatch) {
      // Data already in CEmu from previous procedure — skip setup
      app.banner = 'Using existing data. Starting procedure.';
      startProcedurePhase();
    } else {
      // Need data setup
      enterDataSetupPhase(dataTarget);
    }
  } else {
    // No data needed — go straight to procedure
    startProcedurePhase();
  }
}
```

`resolveListData(listName, problem)` should extract the right array from `problem.data` or `problem.values`. The problem object has fields like `observed`, `expected_proportions`, `data`, `x_values`, `y_values` — map these to L1/L2 appropriately based on the procedure.

### 5. Data Setup Phase UI

When `app.clutch.phase === 'data-setup'`:

Show a panel above/overlaying the walkthrough area:
- Title: "Data Setup"
- Shows target data: "L1 (Observed): 315, 108, 101, 32"
- Brief instructions: "Enter this data into the list editor, or click Auto-fill."
- Two buttons: **[Auto-fill]** and **[I'm done]**
- Progress indicator: "L1: 0/4 values  L2: 0/4 values"

The clutch is DISENGAGED during this phase — key presses go directly to CEmu without state machine validation.

### 6. Auto-fill Implementation

When student clicks Auto-fill:

```javascript
async function autoFillData(dataTarget) {
  app.clutch.autoFilling = true;
  app.banner = 'Auto-filling data...';
  render();
  
  // Clear existing lists first
  // Navigate to STAT>EDIT
  await sendAndWait('STAT');
  await sendAndWait('ENTER');
  await wait(300);
  
  const listNames = Object.keys(dataTarget).filter(k => k.startsWith('L'));
  
  for (let li = 0; li < listNames.length; li++) {
    const listName = listNames[li];
    const values = dataTarget[listName];
    const listIndex = parseInt(listName.slice(1)) - 1;
    
    // Navigate to correct list column
    // First go to top of L1
    await sendAndWait('UP'); await sendAndWait('UP'); await sendAndWait('UP');
    // Navigate right to correct column
    for (let c = 0; c < listIndex; c++) {
      await sendAndWait('RIGHT');
    }
    await sendAndWait('DOWN'); // move into data area
    
    // Clear the list first: move to header, press CLEAR ENTER
    await sendAndWait('UP');
    await sendAndWait('CLEAR');
    await sendAndWait('ENTER');
    await wait(100);
    
    // Type each value
    for (let v = 0; v < values.length; v++) {
      await app.bridge.typeValue(String(values[v]));
      await sendAndWait('ENTER');
      await wait(50);
      
      app.clutch.dataProgress[listName] = { entered: v + 1, total: values.length };
      render();
    }
  }
  
  // Handle matrices if needed
  if (dataTarget['[A]']) {
    await autoFillMatrix('[A]', dataTarget['[A]']);
  }
  if (dataTarget['[B]']) {
    await autoFillMatrix('[B]', dataTarget['[B]']);
  }
  
  // Return to home
  await sendAndWait('2ND');
  await sendAndWait('MODE'); // QUIT
  await wait(200);
  
  // Update memory
  for (const [name, values] of Object.entries(dataTarget)) {
    setListMemoryEntry(name, values, 'auto-fill');
  }
  
  // Also sync native module
  for (const [name, values] of Object.entries(dataTarget)) {
    if (name.startsWith('L') && app.bridge.setList) {
      app.bridge.setList(name, values);
    }
  }
  
  app.clutch.autoFilling = false;
  startProcedurePhase();
}

async function sendAndWait(key) {
  await app.bridge.sendButton(key);
  await wait(80);
}

async function autoFillMatrix(name, matrix) {
  // 2ND > X_INVERSE opens MATRIX menu
  await sendAndWait('2ND');
  await sendAndWait('X_INVERSE');
  await wait(200);
  // RIGHT RIGHT to EDIT tab
  await sendAndWait('RIGHT');
  await sendAndWait('RIGHT');
  // ENTER selects [A] (or navigate to [B])
  if (name === '[B]') {
    await sendAndWait('DOWN');
  }
  await sendAndWait('ENTER');
  await wait(200);
  // Enter dimensions
  const rows = matrix.length;
  const cols = matrix[0].length;
  await app.bridge.typeValue(String(rows));
  await sendAndWait('ENTER');
  await app.bridge.typeValue(String(cols));
  await sendAndWait('ENTER');
  await wait(100);
  // Enter values row by row
  for (const row of matrix) {
    for (const val of row) {
      await app.bridge.typeValue(String(val));
      await sendAndWait('ENTER');
      await wait(30);
    }
  }
  // Back to home
  await sendAndWait('2ND');
  await sendAndWait('MODE');
}
```

### 7. Manual Entry Tracking (optional but nice)

When clutch is disengaged and student is typing in STAT>EDIT, watch key presses to estimate what they've entered. This is best-effort — the definitive check happens when they click "I'm done":

At minimum, when "I'm done" is clicked:
- Trust that the student entered the data correctly
- Update listMemory with the target data
- Sync native module
- Transition to procedure phase

### 8. Key Press Routing

Update the main `pressButton` function:

```javascript
async function pressButton(buttonId) {
  if (app.clutch.autoFilling) return;
  
  if (!app.clutch.engaged) {
    // Clutch disengaged — pass to CEmu freely
    await app.bridge.sendButton(buttonId);
    render();
    return;
  }
  
  // Existing walkthrough validation logic...
}
```

### 9. Render Updates

When `app.clutch.phase === 'data-setup'`, render the data setup UI instead of (or above) the normal walkthrough step display:
- Show the data target values
- Show Auto-fill and I'm done buttons
- Show progress
- The calculator (CEmu) is still visible and interactive

When `app.clutch.phase === 'procedure'`, render normally (existing walkthrough UI).

## Files to Modify

1. **`ti84-procedures-data.json`** — Add `dataRequirements` to each procedure
2. **`ti84-trainer-v2/app.js`** — Clutch state, phase management, auto-fill, list memory, UI rendering for data-setup phase
3. **`ti84-trainer-v2/style.css`** — Styling for data-setup overlay/panel
4. Run `node ti84-trainer-v2/build.mjs` to rebuild standalone.html

## Files NOT to Modify

- `ti84-trainer-v2/native/*.js` (except ti84-native.js if list access needs exposing)
- `ti84-trainer-v2/bridge.js`
- Existing test files

## Testing

1. Start χ²GOF-Test → data setup phase appears with observed/expected values
2. Click Auto-fill → watch CEmu type data into L1/L2 → procedure starts
3. Complete the procedure → no "ERR:INVALID DIM"
4. Start another procedure that uses L1/L2 with same data → "Using existing data" message, skip setup
5. Start a stats-input procedure (like t-test-stats) → no data setup phase, goes straight to procedure
6. Reload page → list memory persists, data setup may be skipped
7. `cd ti84-trainer-v2/native && npx vitest run --config vitest.config.js` → 354 tests passing

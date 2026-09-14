# Teacher -> Student Console -- Phase 1 BUILD Contract

> FROZEN, session 112, 2026-05-23. Implements `TEACHER_STUDENT_CONSOLE_SPEC.md`
> Section 13 row P1. Wave 1 dispatch consumes THIS doc verbatim; deviations
> are folded into Codex review's BLOCKER class.
>
> Scope: side-drawer infrastructure in `teacher-dashboard.html` + 3 new
> read-only roster-server endpoints under `/teacher/student/:studentId/*`
> + real-name rendering already present in the dashboard table (no change
> needed -- only a data-attribute add to wire the click handler).
>
> NO migration. NO Desk file (`ap_stats_roadmap_square_mode.html`) change.
> NO `curriculum_render/data/curriculum.js` change (sacred). NO cockpit
> (`teacher-classroom.html`) change.

## 1. File ownership (disjoint -> both units run as parallel Sonnet)

| Unit | Files                                                                                | Touched by  |
|------|--------------------------------------------------------------------------------------|-------------|
| 1A   | `roster-server/teacher.js` (NEW), `roster-server/server.js` (1 import + 1 mount call), `roster-server/tests/teacher-endpoints.test.js` (NEW) | Sonnet      |
| 1B   | `teacher-dashboard.html` (drawer + row click + data-attrs), `tests/teacher-student-console-drawer.test.js` (NEW) | Sonnet      |

No file appears in both units. Wave 1A and 1B are launched in a single
parallel Agent dispatch.

## 2. Wave 1A -- roster-server endpoints

### 2.1 New file: `roster-server/teacher.js`

ES-module, header comment matches the in-repo style (see `class.js`
lines 1-10 for the model). Exports a single `mountTeacherStudent`
function. Auth via `requireTeacher(req, db)` per `teacher-auth.js`
(verbatim, no fork). All three handlers return JSON.

```js
// teacher.js -- mounts teacher-gated per-student READ endpoints (Phase 1 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Sibling to class.js, which fans the same
// compute over the whole roster; this file is the single-student dual.
//
//   GET /teacher/student/:studentId/profile -> identity + role
//   GET /teacher/student/:studentId/grade   -> computeGrade for one student
//   GET /teacher/student/:studentId/recent  -> last N ledger rows for one student
//
// Pure READ-ONLY. Auth via requireTeacher (x-teacher-secret OR a token whose
// role resolves to 'teacher'). 401 forbidden | 404 not found | 500 db error.
```

### 2.2 Endpoint contracts

All three endpoints share:

- **Path** is exactly as specified (case-sensitive, no trailing slash).
- **Auth first**: `if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });`
- **404** when `:studentId` is not found in roster: `res.status(404).json({ ok: false, error: 'student not found' })`.
- **500** on db error: `res.status(500).json({ ok: false, error: 'Database error' })`.
- **Success envelope**: `{ ok: true, ... }` -- matches class.js.

#### 2.2.1 `GET /teacher/student/:studentId/profile`

Looks up the student via `db.findByStudentId(studentId)` + `db.getRoleByStudentId(studentId)`. Returns the identity tuple needed by the drawer header.

Response 200 shape:
```json
{
  "ok": true,
  "studentId": "stu_abc123",
  "username": "papaya-otter",
  "realName": "Jane Doe",
  "section": "PeriodX",
  "role": "student"
}
```

`role` is the literal returned by `getRoleByStudentId`. If that helper degrades to `'student'` on error (existing pattern in `teacher-auth.js`), respect it.

#### 2.2.2 `GET /teacher/student/:studentId/grade`

Single-student variant of `class.js`'s `/class/grades` (lines 57-105). Reuse the same imports + the same `computeGrade` call -- DO NOT duplicate the computation. Inject the dashboard-shaped output verbatim so the drawer can render with no extra mapping.

Response 200 shape (the per-student object emitted by `/class/grades`, plus an envelope):
```json
{
  "ok": true,
  "asOf": "2026-05-23T17:00:00.000Z",
  "studentId": "stu_abc123",
  "username": "papaya-otter",
  "realName": "Jane Doe",
  "section": "PeriodX",
  "quarters": { "Q1": { "quarterGrade": 87.3, "ceiling": 92.1, "unitsGraded": 2, "unitsTotal": 3 } },
  "units":    { "U1": { "unitGrade": 88.0 } },
  "completion": { "U1": { "worksheet": 4, "curriculum_quiz": 1, "pc": 0 } },
  "config": {
    "C": 100,
    "feederWeights": { "...": "..." },
    "frqBand": { "...": "..." },
    "quarters": { "...": "..." }
  }
}
```

Implementation outline:

1. requireTeacher gate (as above).
2. Load + validate answer key via `loadAnswerKey` injected from `createApp` (same dep wiring class.js uses).
3. Fetch the roster row via `db.findByStudentId(req.params.studentId)`. If `data` is null -> 404. If `error` -> 500.
4. Fetch ledger rows via `ledgerDb.getLedgerByStudent(studentId)`. Empty array on per-student error (same defensive shape as class.js's `fanLedger`, but for one student).
5. Call `computeGrade(ledgerRows, answerKey, config, { lessonSchedule, section: roster.section, worksheetBlankCounts })` -- identical call to class.js line 85.
6. Compose the response with `studentMeta(roster)` + `computed` + the `config` block.

#### 2.2.3 `GET /teacher/student/:studentId/recent?limit=N`

Returns the N most recent ledger rows for the student. Default `limit=20`; min 1; max 100 (clamp silently).

Response 200 shape:
```json
{
  "ok": true,
  "studentId": "stu_abc123",
  "username": "papaya-otter",
  "realName": "Jane Doe",
  "section": "PeriodX",
  "submissions": [
    {
      "recordedAt": "2026-05-22T14:01:00Z",
      "itemId": "U6-L3-Q05",
      "source": "worksheet",
      "response": "0.45",
      "score": 1,
      "unit": "6",
      "attempt": 1
    }
  ]
}
```

Implementation:

1. requireTeacher gate.
2. Parse `limit` from `req.query.limit`; coerce via `Number`; if NaN or <1 -> 20; if >100 -> 100.
3. Lookup roster via `db.findByStudentId(studentId)`. 404 if not found.
4. `const { data: rows, error } = await ledgerDb.getLedgerByStudent(studentId);` On error -> 500.
5. Sort by `recorded_at` desc (string comparison is fine -- ISO 8601 sorts lexicographically). Slice to `limit`.
6. Map each row to the response shape (snake_case -> camelCase: `recorded_at` -> `recordedAt`, `item_id` -> `itemId`).

### 2.3 server.js wiring

Two edits, both additive:

**Import (after line 20):**
```js
import { mountTeacherStudent } from './teacher.js';
```

**Mount (immediately after the `mountClass` block, around line 522):**
```js
// ── Teacher Student Console (Phase 1 of TEACHER_STUDENT_CONSOLE_SPEC.md) ───
// Per-student READ endpoints for the Console drawer. Reuses the same
// loadAnswerKey + computeGrade pipeline as /class/grades.
if (loadAnswerKey) {
  mountTeacherStudent(app, {
    db, ledgerDb, loadAnswerKey,
    lessonSchedule: lessonSchedule || null,
    config: configOverrides ? { ...PHASE3_CONFIG, ...configOverrides } : PHASE3_CONFIG,
    worksheetBlankCounts: worksheetBlankCounts || null,
  });
}
```

NO change to any other server.js block.

### 2.4 Tests: `roster-server/tests/teacher-endpoints.test.js`

Mirror `class.test.js`'s harness verbatim (lines 1-80): vitest + http + TestServer + fake `createFakeRosterDb` + fake `createFakeLedgerDb` + `FIXTURE_ANSWER_KEY`. Reuse the helpers (copy or extract -- copy is preferred for test isolation; the class.test.js helpers are 60-LOC and stable).

The fake roster db MUST also expose `findByStudentId(sid)` returning `{ data: row|null, error: null }`. The fake ledger db is unchanged from class.test.js.

Required test cases (one `describe` per endpoint):

**describe('GET /teacher/student/:studentId/profile')**
- 401 without teacher secret AND without a teacher token
- 200 with valid teacher secret -> envelope shape (Section 2.2.1)
- 404 when studentId is unknown
- 200 with role='student' by default, 'teacher' when getRoleByStudentId returns 'teacher'
- 500 when db throws

**describe('GET /teacher/student/:studentId/grade')**
- 401 without teacher auth
- 200 -> envelope shape (Section 2.2.2) with quarters/units/completion populated for the fixture ledger
- 404 when studentId is unknown
- 200 with empty ledger -> quarters/units present but zero-valued (the existing computeGrade shape)
- The lessonSchedule + section threading: a fake schedule injected at createApp time IS the section the student belongs to (verify computeGrade was called WITH that section)

**describe('GET /teacher/student/:studentId/recent')**
- 401 without teacher auth
- 200 with default limit=20 -> at most 20 submissions
- 200 with limit=5 -> at most 5 submissions; ordered by recordedAt desc
- 200 with limit=invalid (e.g., 'banana') -> falls back to 20
- 200 with limit=999 -> clamped to 100
- 404 when studentId is unknown
- Each submission object has the camelCase keys per 2.2.3

Test count target: ~15-20. NO network calls -- pure fake-db + http loopback.

## 3. Wave 1B -- dashboard drawer

### 3.1 Aesthetic note

`teacher-dashboard.html` uses **Segoe UI + cream/brown** (`--sg-bg: #f7f2e8`, `--sg-accent: #7a4a1f`), NOT the Desk's System 7 / Chicago / platinum-gray. Drawer styling MUST match the dashboard, not the Desk. Reuse the existing CSS variables.

### 3.2 DOM contract

Insert directly before `</body>` in `teacher-dashboard.html`:

```html
<div id="tsc-drawer" class="tsc-drawer" aria-hidden="true">
  <div class="tsc-drawer-overlay" data-tsc-close="overlay"></div>
  <aside class="tsc-drawer-panel" role="dialog" aria-labelledby="tsc-drawer-title">
    <header class="tsc-drawer-header">
      <div class="tsc-drawer-title-wrap">
        <h2 id="tsc-drawer-title">Loading...</h2>
        <p id="tsc-drawer-subtitle" class="tsc-drawer-subtitle"></p>
      </div>
      <button class="tsc-drawer-close" data-tsc-close="button" aria-label="Close drawer">&times;</button>
    </header>
    <div class="tsc-drawer-body">
      <section class="tsc-section" id="tsc-section-grade">
        <h3 class="tsc-section-title">Grade Summary</h3>
        <div id="tsc-grade-card" class="tsc-grade-card">Loading...</div>
      </section>
      <section class="tsc-section" id="tsc-section-recent">
        <h3 class="tsc-section-title">Recent Submissions</h3>
        <ul id="tsc-recent-list" class="tsc-recent-list"></ul>
      </section>
      <nav class="tsc-actions" aria-label="Console actions">
        <button type="button" class="tsc-action-btn" id="tsc-action-view-as" disabled title="Phase 2">View as student</button>
        <button type="button" class="tsc-action-btn" id="tsc-action-nudge" disabled title="Phase 3 (Live only)">Send nudge</button>
        <button type="button" class="tsc-action-btn" id="tsc-action-remediation" disabled title="Phase 4 wiring">Apply remediation</button>
        <button type="button" class="tsc-action-btn" id="tsc-action-gate" disabled title="Phase 5">Override gate</button>
      </nav>
    </div>
  </aside>
</div>
```

The four action buttons are PRESENT but DISABLED in P1; later phases enable them. This freezes the layout so subsequent phases don't shift the visual.

### 3.3 CSS contract

Add to the existing `<style>` block (do not introduce a new sheet):

```css
/* Teacher -> Student Console drawer (P1 of TEACHER_STUDENT_CONSOLE_SPEC.md) */
.tsc-drawer { position: fixed; inset: 0; z-index: 200; display: none; }
.tsc-drawer.tsc-open { display: block; }
.tsc-drawer-overlay {
  position: absolute; inset: 0;
  background: rgba(42, 37, 32, 0.32);
  opacity: 0;
  transition: opacity 180ms ease-out;
}
.tsc-drawer.tsc-open .tsc-drawer-overlay { opacity: 1; }
.tsc-drawer-panel {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: 420px; max-width: 92vw;
  background: var(--sg-bg-card);
  border-left: 1px solid var(--sg-border);
  box-shadow: -4px 0 16px rgba(42, 37, 32, 0.18);
  transform: translateX(100%);
  transition: transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.tsc-drawer.tsc-open .tsc-drawer-panel { transform: translateX(0); }
.tsc-drawer-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--sg-border);
  background: var(--sg-bg-card);
}
.tsc-drawer-title-wrap h2 { margin: 0; font-size: 1.05rem; color: var(--sg-accent); }
.tsc-drawer-subtitle { margin: 4px 0 0; font-size: 0.82rem; color: var(--sg-text-dim); }
.tsc-drawer-close {
  background: transparent; border: 0; font-size: 1.5rem;
  color: var(--sg-text-dim); cursor: pointer; line-height: 1;
  padding: 0 4px;
}
.tsc-drawer-body { padding: 16px 18px; overflow-y: auto; display: grid; gap: 18px; }
.tsc-section-title {
  margin: 0 0 8px;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--sg-text-dim);
}
.tsc-grade-card { font-size: 0.9rem; color: var(--sg-text); display: grid; gap: 6px; }
.tsc-recent-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 0.85rem; }
.tsc-recent-list li {
  border: 1px solid var(--sg-border); border-radius: 6px;
  padding: 8px 10px; background: var(--sg-bg);
  display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center;
}
.tsc-actions { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--sg-border); }
.tsc-action-btn {
  padding: 8px 12px;
  border: 1px solid var(--sg-border); border-radius: 6px;
  background: var(--sg-bg);
  font: inherit; cursor: pointer;
  text-align: left;
}
.tsc-action-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
.tsc-action-btn:not([disabled]):hover { background: var(--sg-bg-card); border-color: var(--sg-accent); }
.grades-row-clickable { cursor: pointer; }
.grades-row-clickable:hover { background: rgba(122, 74, 31, 0.06); }
```

### 3.4 Row click wiring -- `renderGradesTable` change

In the `renderGradesTable` function (around line 549), each `<tr>` in `rowsHtml` MUST gain:

- `class="grades-row-clickable"`
- `data-student-id="<escHtml(s.studentId)>"`
- `data-username="<escHtml(s.username)>"`
- `data-real-name="<escHtml(s.realName || '')>"`
- `data-section="<escHtml(s.section || '')>"`

The data attrs let the drawer header populate optimistically (so the user sees the header instantly before fetches complete) AND let the fetch URLs be built.

After the loop, ADD a delegated click handler:

```js
$('grades-tbody').addEventListener('click', function(e) {
  var tr = e.target.closest('tr.grades-row-clickable');
  if (!tr) return;
  var sid = tr.getAttribute('data-student-id');
  if (!sid) return;
  openTscDrawer({
    studentId: sid,
    username: tr.getAttribute('data-username') || '',
    realName: tr.getAttribute('data-real-name') || '',
    section: tr.getAttribute('data-section') || ''
  });
});
```

(Use `once`-style guarding: store a `__tscWired = true` flag on the tbody node to avoid double-binding on re-render.)

### 3.5 Drawer behavior -- the `openTscDrawer` function

New function added to the `<script>` block. Captures the existing `getTeacherSecret()` / `getBaseUrl()` / `$` helpers already in the file:

```js
function openTscDrawer(stub) {
  var drawer = $('tsc-drawer');
  if (!drawer) return;

  // Populate header from the stub immediately so the user sees something.
  $('tsc-drawer-title').textContent = stub.realName || stub.username || 'Student';
  $('tsc-drawer-subtitle').textContent =
    (stub.username ? '@' + stub.username : '') +
    (stub.section ? ' -- ' + stub.section : '');

  // Body: loading state.
  $('tsc-grade-card').textContent = 'Loading...';
  $('tsc-recent-list').innerHTML = '';

  drawer.setAttribute('aria-hidden', 'false');
  drawer.classList.add('tsc-open');

  // Fetch profile + grade + recent in parallel.
  var base = getBaseUrl();
  var headers = teacherAuthHeaders(); // see 3.6 below
  var sid = encodeURIComponent(stub.studentId);

  Promise.all([
    fetch(base + '/teacher/student/' + sid + '/grade', { headers: headers }).then(jsonOrErr),
    fetch(base + '/teacher/student/' + sid + '/recent?limit=20', { headers: headers }).then(jsonOrErr)
  ]).then(function(results) {
    var grade = results[0], recent = results[1];
    renderTscGrade(grade);
    renderTscRecent(recent);
  }).catch(function(err) {
    $('tsc-grade-card').textContent = 'Error: ' + (err && err.message ? err.message : 'failed');
  });
}

function closeTscDrawer() {
  var drawer = $('tsc-drawer');
  if (!drawer) return;
  drawer.classList.remove('tsc-open');
  drawer.setAttribute('aria-hidden', 'true');
}

// ESC + overlay-click + close-button close.
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeTscDrawer();
});
document.getElementById('tsc-drawer').addEventListener('click', function(e) {
  if (e.target && e.target.getAttribute('data-tsc-close')) closeTscDrawer();
});
```

`profile` is NOT fetched in P1 -- the row already carries realName/username/section, and the fetch list stays short. Profile becomes load-bearing later (P3 nudge attribution; P5 role-check before showing override).

### 3.6 Auth header helper

```js
function teacherAuthHeaders() {
  var sec = getTeacherSecret();
  return sec ? { 'x-teacher-secret': sec } : {};
}
```

The dashboard already prompts for the teacher secret on every fetch (per line 6 of the file's existing comment). Reuse that pattern -- DO NOT persist the secret.

### 3.7 Render helpers

```js
function renderTscGrade(payload) {
  var el = $('tsc-grade-card');
  if (!payload || !payload.ok) { el.textContent = 'No grade data.'; return; }
  var q = (payload.quarters && payload.quarters.Q4) || payload.quarters && Object.values(payload.quarters).find(Boolean);
  var html = [];
  if (q) {
    html.push('<div><strong>Current quarter:</strong> ' + escHtml(fmt1(q.quarterGrade)) +
              (q.ceiling != null ? ' &uarr; ' + escHtml(fmt1(q.ceiling)) : '') + '</div>');
  }
  // Per-unit grades
  var units = payload.units || {};
  var unitLine = Object.keys(units).sort().map(function(k) {
    return k + ': ' + fmt1(units[k] && units[k].unitGrade);
  }).join(' &nbsp; ');
  if (unitLine) html.push('<div class="dim" style="font-size:0.82rem">' + unitLine + '</div>');
  el.innerHTML = html.join('');
}

function renderTscRecent(payload) {
  var el = $('tsc-recent-list');
  el.innerHTML = '';
  if (!payload || !payload.ok) {
    el.innerHTML = '<li class="dim">No recent submissions.</li>';
    return;
  }
  var items = payload.submissions || [];
  if (items.length === 0) {
    el.innerHTML = '<li class="dim">No recent submissions.</li>';
    return;
  }
  items.forEach(function(row) {
    var li = document.createElement('li');
    var when = document.createElement('span');
    when.className = 'dim mono';
    when.style.fontSize = '0.78rem';
    when.textContent = (row.recordedAt || '').slice(0, 10);
    var what = document.createElement('span');
    what.textContent = (row.itemId || '') + ' · ' + (row.source || '');
    var score = document.createElement('span');
    score.className = 'dim mono';
    score.textContent = row.score == null ? '-' : String(row.score);
    li.appendChild(when); li.appendChild(what); li.appendChild(score);
    el.appendChild(li);
  });
}

function jsonOrErr(res) {
  if (!res.ok) return res.json().then(function(j) { throw new Error(j && j.error ? j.error : res.statusText); });
  return res.json();
}
```

XSS safety: `renderTscRecent` uses `createElement` + `textContent` (no innerHTML on user-influenced data). `renderTscGrade` uses innerHTML with escHtml-wrapped values only (`escHtml` is already defined in the file). `openTscDrawer` header uses `textContent`.

### 3.8 Tests: `tests/teacher-student-console-drawer.test.js`

Vitest + jsdom (matching `tests/aggregate-drawer.test.js`'s harness, lines 1-46). Read the existing dashboard HTML, extract its `<script>` block, eval it inside the jsdom window with a stubbed `fetch`, then exercise the drawer.

Required test cases:

**describe('TSC drawer DOM presence')**
- The drawer root (`#tsc-drawer`) is hidden by default (`aria-hidden="true"`, no `.tsc-open`).
- All four action buttons present and disabled.
- The header has title + subtitle placeholders.

**describe('Row click opens drawer')**
- After `renderGradesTable(payload)`, each `<tr>` has the four data-* attrs + `grades-row-clickable` class.
- Click on a row sets the drawer to `.tsc-open` AND populates the header with stub data optimistically.

**describe('Fetch wiring')**
- On open, two `fetch` calls fire: `/teacher/student/:id/grade` + `/teacher/student/:id/recent?limit=20`.
- Both include the `x-teacher-secret` header when a teacher secret is set.
- Server returns `{ ok:true, quarters:{Q4:{quarterGrade:87.3,ceiling:92.1,...}}, units:{U1:{unitGrade:88}}, ...}` -> the grade card renders the quarter line.
- Recent endpoint returns 3 submissions -> the list shows 3 `<li>` items in order.

**describe('Close behavior')**
- ESC closes the drawer.
- Click on `.tsc-drawer-overlay` closes the drawer.
- Click on `.tsc-drawer-close` closes the drawer.
- Click INSIDE the panel does NOT close.

**describe('Error handling')**
- Fetch returning `{ ok:false, error:'forbidden' }` -> grade card shows "Error: forbidden".

Test count target: ~15-18. Pure jsdom, no network.

## 4. What is explicitly OUT of P1

- View as (`viewAsUserId` flow + Desk-side readOnly mount) -- P2.
- Nudges (popup textarea, toast, WS message) -- P3.
- Select-Students mode (cockpit) -- P4.
- Override gate -- P5.
- Cockpit avatar-click popup -- belongs to either P3 OR a Live-mode-specific BUILD; not P1.
- Adding the drawer to any file other than `teacher-dashboard.html`.
- Any change to the Desk (`ap_stats_roadmap_square_mode.html`).
- Any migration. `roster.real_name` is already present.
- Apply Remediation modal wiring (the button exists, disabled, in P1; wiring is a future micro-task).

## 5. Smoke checks (planner-run after Codex fold)

1. `cd roster-server && npm test` -- expect the new test file to add cases; total fail count should NOT increase. The existing one-fail-baseline (long-standing `study-guide.test.js` in the root) stays as-is.
2. `npm test` from repo root -- same baseline rule.
3. Manual: open `teacher-dashboard.html` over a local server, type the teacher secret, see the grades table, click a row -> drawer slides in from right, populates with grade + recent.
4. The drawer doesn't crash if `getRoleByStudentId` rejects (degrades to 'student').

## 6. Dispatch instructions

Both units dispatch in parallel via the Agent tool (`general-purpose`
agents at sonnet). Each prompt MUST embed Sections 2 + 3 verbatim
(no paraphrase) and instruct the agent to read this BUILD doc.

After both return: cross-agent.py to Codex (`task-type=review`,
read-only, 600 s timeout, prompt embeds the spec + BUILD + diff
summary). Fold all findings. Re-run tests. Decide commit.

## 7. Recall

`TEACHER_STUDENT_CONSOLE_SPEC.md` is the parent. `class.js` lines
1-105 are the verbatim pattern source for endpoint shape +
`requireTeacher` placement. `class.test.js` lines 1-80 are the
verbatim pattern source for the test harness. `teacher-dashboard.html`
lines 549-627 are the existing `renderGradesTable` -- only the row
template gets the data-attrs + the class; do not refactor the rest.

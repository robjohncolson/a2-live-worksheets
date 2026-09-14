# Teacher -> Student Console -- Phase 2 BUILD Contract

> FROZEN, session 112, 2026-05-23. Implements `TEACHER_STUDENT_CONSOLE_SPEC.md`
> Section 13 row P2 (and Section 7 in full). Wave 2 dispatch consumes THIS
> doc verbatim; deviations are folded into Codex review's BLOCKER class.
>
> Scope: full Desk impersonation. A teacher with the dashboard drawer
> open clicks "View as student" -> opens the Desk in a new tab with
> `?viewAsUserId=<sid>` -> Desk renders as that student, READ-ONLY.
>
> Absorbs the deferred Preview-as-student v2 (worksheet-level
> impersonation): the s108 sessionStorage flag becomes a richer
> `viewAsContext` object. The s108 `_togglePreviewAsStudent` flow stays
> intact alongside (still a generic "preview the gates" toggle); the
> new view-as supersets it.
>
> NO new migration. NO `curriculum_render/data/curriculum.js` change
> (sacred). NO cockpit (`teacher-classroom.html`) change. NO Live
> Classroom or WS change.

## 1. File ownership

| Unit | Files                                                                          | Touched by          |
|------|--------------------------------------------------------------------------------|---------------------|
| 2A   | `roster-server/teacher.js` (add 2 endpoints), `roster-server/tests/teacher-endpoints.test.js` (add tests) | Sonnet              |
| 2B   | `ap_stats_roadmap_square_mode.html` (contended file), `teacher-dashboard.html` (drawer button enable + onclick), `tests/desk-view-as.test.js` (NEW) | Planner-direct      |

2A is disjoint roster-server work and dispatches as a Sonnet agent.
2B is contended -- the Desk has ongoing parallel-edit risk -- so the
planner handles it directly. The two waves can run in parallel time
since they touch disjoint files; planner does 2B while 2A is in flight.

## 2. Wave 2A -- two new server endpoints

### 2.1 `GET /teacher/student/:studentId/donow`

Mirror of the existing `/donow` (in `roster-server/donow.js`), but
teacher-authed + student-id from path param instead of token. Same
response shape verbatim. Add it to `roster-server/teacher.js`'s
`mountTeacherStudent` function (NOT a new file).

Implementation outline:
1. requireTeacher gate (existing pattern).
2. `const { studentId } = req.params;`
3. `db.findByStudentId(studentId)` -- 404 if not found.
4. Reuse the EXISTING `/donow` compute path. `donow.js` exports
   `mountDonow(app, deps)` and likely a `computeDonow(ledgerRows, manifest, ...)`
   helper -- if so, import it. If not, factor the compute out of
   `mountDonow`'s handler into an exported helper, then call it.
   (READ donow.js first; if the compute is inline-only, accept that
   small refactor.)
5. Compose response: `{ ok: true, ...computed }` matching the
   existing `/donow` response shape (Section E of the P2 recon report
   lists the shape verbatim: `{ ok, nextTask, lessons, units, earlierGapFlag }`).

### 2.2 `GET /teacher/student/:studentId/poll-archive`

Mirror of `/poll-archive` (in `roster-server/poll-archive.js`). Same
shape; teacher-authed + path-param.

Implementation outline:
1. requireTeacher gate.
2. `db.findByStudentId(studentId)` -- 404 if not found. Extract
   `roster.section`.
3. Query `pollArchiveDb.listBySection(section)` (or whatever the
   existing endpoint uses to enumerate polls for the section).
4. Compose response identical to the student-token variant.

Both endpoints follow the same shape rules as P1 (Section 2.2):
- 401 forbidden when requireTeacher fails
- 404 student not found
- 500 db error
- 503 when poll-archive table missing (`42P01` -> 503, mirroring the
  existing degrade behavior)

### 2.3 server.js wiring

NONE NEEDED. Both endpoints are added to the existing
`mountTeacherStudent` function in `roster-server/teacher.js`. The
existing mount call in `server.js` already wires the deps.

ONE additive dep change: `mountTeacherStudent` now needs
`pollArchiveDb` (optional, gracefully degrades to 503 when missing).
Pass it through from `createApp` like `mountPollArchive` does. Look
at `server.js` lines around the existing `mountPollArchive` call
(around line 547) for the dep-availability gate; mirror it.

### 2.4 Tests

Add to the existing `roster-server/tests/teacher-endpoints.test.js`:

**describe('GET /teacher/student/:studentId/donow')**
- 401 without teacher auth
- 200 with teacher secret -> response has `ok`, `nextTask`, `lessons`, `units`, `earlierGapFlag`
- 200 with token-auth (Bearer) -> same envelope
- 401 with student-role token
- 404 when studentId unknown
- 200 with empty ledger -> lessons may be empty / nextTask is the first lesson

**describe('GET /teacher/student/:studentId/poll-archive')**
- 401 without teacher auth
- 200 with teacher secret -> response has `ok` + polls array (shape mirrors existing /poll-archive)
- 200 with token-auth -> same envelope
- 401 with student-role token
- 404 when studentId unknown
- 503 when pollArchiveDb is null (mirrors existing degrade)

Test count: ~10 new.

The fake `pollArchiveDb` (if needed) follows the existing pattern in
`tests/poll-archive.test.js`. Mock the table-missing degrade by
making `listBySection` throw a `42P01` style error.

## 3. Wave 2B -- Desk view-as mode

### 3.1 sessionStorage shape

ONE key, ONE per-tab object. Lives alongside the existing
`apstats_preview_as_student` (NOT replacing it):

```js
sessionStorage.setItem('apstats_view_as_context', JSON.stringify({
  studentId: 'stu_abc123',
  username: 'papaya-otter',
  realName: 'Jane Doe',
  section: 'PeriodB',
  readOnly: true,
  enteredAt: Date.now()
}));
```

The `enteredAt` is informational (for the banner "since X" later, if
ever needed) -- don't gate behavior on it.

### 3.2 Reader function

Add near `_previewAsStudentActive` (line ~3645):

```js
// view-as-context reader. Returns the parsed object OR null. Failure
// returns null -- a bad sessionStorage entry must never block the page.
function _viewAsContext() {
  try {
    var raw = sessionStorage.getItem('apstats_view_as_context');
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.studentId !== 'string') return null;
    return parsed;
  } catch (_) { return null; }
}
```

### 3.3 `_deskIsTeacher` extension

Existing function at line 3629. Extend the sessionStorage check to
ALSO return false when `viewAsContext` is set. Replace lines 3634-3636:

```js
  try {
    if (sessionStorage.getItem('apstats_preview_as_student') === '1') return false;
    if (sessionStorage.getItem('apstats_view_as_context')) return false;
  } catch (_) {}
```

This makes every existing teacher-gate (lesson unlock, Do-Now focus,
gradebook menu items, etc.) treat the viewer as a student while
view-as is active. ZERO additional gate-site changes needed -- the
extension propagates implicitly.

### 3.4 Bootstrap flow

On page load, AFTER `rosterClient` is ready (which happens via the
external `<script src="../roster_client.js">` tag, before the inline
script runs), check for `?viewAsUserId=<sid>`:

Add at the very top of the inline script, before any UI render:

```js
// View-as bootstrap. Detect ?viewAsUserId; verify teacher auth;
// hydrate viewAsContext into sessionStorage (per-tab). Idempotent --
// a second reload with the same query param refreshes the cached
// profile but never re-prompts.
(async function _viewAsBootstrap() {
  var params;
  try { params = new URLSearchParams(window.location.search); }
  catch (_) { return; }
  var sid = params.get('viewAsUserId');
  if (!sid) return;

  // Teacher must be signed in. If not, the existing sign-in wall
  // catches them on the next render; we just abort view-as.
  var me;
  try { me = window.rosterClient && window.rosterClient.current ? window.rosterClient.current() : null; }
  catch (_) { me = null; }
  if (!me || me.role !== 'teacher') return;

  // Already hydrated for this sid? Skip the network round-trip.
  var existing = null;
  try { existing = JSON.parse(sessionStorage.getItem('apstats_view_as_context') || 'null'); }
  catch (_) { existing = null; }
  if (existing && existing.studentId === sid) return;

  // Fetch the target profile via the P1 endpoint. teacherSecret() is
  // dashboard-only; the Desk uses the Bearer token.
  var base = window.ROSTER_SERVICE_URL;
  if (!base) return;
  var token = window.rosterClient.token && window.rosterClient.token();
  if (!token) return;

  try {
    var res = await fetch(base + '/teacher/student/' + encodeURIComponent(sid) + '/profile', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    var data = await res.json();
    if (!data || !data.ok) return;
    sessionStorage.setItem('apstats_view_as_context', JSON.stringify({
      studentId: data.studentId,
      username: data.username,
      realName: data.realName,
      section: data.section,
      readOnly: true,
      enteredAt: Date.now()
    }));
  } catch (_) { /* failure -> no view-as; user sees their own Desk */ }
})();
```

If the bootstrap fails (no teacher, no token, bad fetch), the
sessionStorage stays empty and the Desk renders normally for the
signed-in teacher. Fails open -- never hard-locks the Desk.

### 3.5 The view-as banner

Insert as the FIRST child of `<body>` (above everything else):

```html
<div id="view-as-banner" style="display:none">
  <span class="vab-label">VIEWING AS</span>
  <strong class="vab-name" id="view-as-banner-name"></strong>
  <span class="vab-meta" id="view-as-banner-meta"></span>
  <span class="vab-readonly">READ-ONLY</span>
  <button type="button" class="vab-exit" id="view-as-exit" aria-label="Exit view-as">Exit</button>
</div>
```

CSS (add to existing `<style>` block, near other System 7 rules):

```css
#view-as-banner {
  position: fixed; top: 0; left: 0; right: 0; z-index: 10000;
  background: #d97706; color: #fff;
  font: 13px "Geneva", "Lucida Grande", system-ui, sans-serif;
  letter-spacing: 0.04em;
  padding: 8px 14px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 2px solid #92400e;
  box-shadow: 0 2px 0 rgba(0,0,0,0.18);
}
#view-as-banner .vab-label { font-weight: 800; letter-spacing: 0.12em; opacity: 0.95; font-size: 11px; }
#view-as-banner .vab-name { font-weight: 800; }
#view-as-banner .vab-meta { opacity: 0.85; font-size: 12px; }
#view-as-banner .vab-readonly {
  margin-left: auto;
  background: #92400e; color: #fff;
  padding: 2px 8px; border-radius: 3px;
  font-weight: 700; font-size: 11px; letter-spacing: 0.1em;
}
#view-as-banner .vab-exit {
  background: #fff; color: #92400e; border: 1px solid #fff;
  padding: 3px 12px; border-radius: 3px;
  font: inherit; font-weight: 700; cursor: pointer;
}
#view-as-banner .vab-exit:hover { background: #fed7aa; }
/* Page content shifts down to make room for the fixed banner. */
body.view-as-active { padding-top: 40px; }
```

JS to render + wire the Exit button. Call at script-eval bottom
(after the bootstrap, after rosterClient is ready, before the rest of
the page UI initializes):

```js
function _renderViewAsBanner() {
  var ctx = _viewAsContext();
  var banner = document.getElementById('view-as-banner');
  if (!banner) return;
  if (!ctx) {
    banner.style.display = 'none';
    document.body.classList.remove('view-as-active');
    return;
  }
  document.getElementById('view-as-banner-name').textContent = ctx.realName || ctx.username || 'Student';
  document.getElementById('view-as-banner-meta').textContent =
    (ctx.username ? '@' + ctx.username : '') +
    (ctx.section ? ' -- ' + ctx.section : '');
  banner.style.display = 'flex';
  document.body.classList.add('view-as-active');
}

function _exitViewAs() {
  try { sessionStorage.removeItem('apstats_view_as_context'); } catch (_) {}
  // Strip ?viewAsUserId from the URL and reload as the teacher.
  try {
    var url = new URL(window.location.href);
    url.searchParams.delete('viewAsUserId');
    window.location.href = url.toString();
  } catch (_) {
    window.location.reload();
  }
}

document.addEventListener('DOMContentLoaded', function() {
  _renderViewAsBanner();
  var exitBtn = document.getElementById('view-as-exit');
  if (exitBtn) exitBtn.addEventListener('click', _exitViewAs);
});
```

### 3.6 Fetch URL rewriting

Add a single helper that maps student endpoint paths to teacher-
authed variants when view-as is active:

```js
// View-as URL/header rewriter. Pass (endpoint, headers). Returns the
// pair to actually use. When view-as is active:
//   /donow            -> /teacher/student/:id/donow      + Bearer (teacher's)
//   /grade?token=X    -> /teacher/student/:id/grade      + Bearer (teacher's)
//   /poll-archive     -> /teacher/student/:id/poll-archive + Bearer
// Otherwise: identity transform.
function _maybeViewAsFetch(endpoint, headers) {
  var ctx = _viewAsContext();
  if (!ctx) return { endpoint: endpoint, headers: headers };
  var sid = encodeURIComponent(ctx.studentId);
  var teacherToken = (window.rosterClient && window.rosterClient.token) ? window.rosterClient.token() : null;
  var newHeaders = Object.assign({}, headers || {});
  if (teacherToken) newHeaders['Authorization'] = 'Bearer ' + teacherToken;
  // Strip ?token= since teacher token rides in the header.
  if (endpoint.indexOf('/grade') === 0) {
    return { endpoint: '/teacher/student/' + sid + '/grade', headers: newHeaders };
  }
  if (endpoint.indexOf('/donow') === 0) {
    return { endpoint: '/teacher/student/' + sid + '/donow', headers: newHeaders };
  }
  if (endpoint.indexOf('/poll-archive') === 0) {
    return { endpoint: '/teacher/student/' + sid + '/poll-archive', headers: newHeaders };
  }
  return { endpoint: endpoint, headers: newHeaders };
}
```

Then modify the three fetch sites (recon Section A):

**Site 1**: `renderDoNow` (line 4565). Current:
```js
var res = await fetch(baseUrl + '/donow', {
  headers: { 'Authorization': 'Bearer ' + token }
});
```
Change to:
```js
var __va = _maybeViewAsFetch('/donow', { 'Authorization': 'Bearer ' + token });
var res = await fetch(baseUrl + __va.endpoint, { headers: __va.headers });
```

**Site 2**: `renderDoNowGrades` (line 4460). Current:
```js
var res = await fetch(baseUrl + '/grade?token=' + token);
```
Change to:
```js
var __va = _maybeViewAsFetch('/grade?token=' + token, {});
var res = await fetch(baseUrl + __va.endpoint, { headers: __va.headers });
```
(In view-as the `?token=` portion is stripped via the URL rewrite.)

**Site 3**: `_fetchPollArchive` (line 10384). Current:
```js
var res = await fetch(baseUrl + '/poll-archive', {
  headers: { 'Authorization': 'Bearer ' + token }
});
```
Change to:
```js
var __va = _maybeViewAsFetch('/poll-archive', { 'Authorization': 'Bearer ' + token });
var res = await fetch(baseUrl + __va.endpoint, { headers: __va.headers });
```

**Site 4** (`_fetchSectionRoster` at line 3956) is NOT rewritten. It
hits a public no-auth endpoint and is for the sign-in dropdown. In
view-as the user is already signed in (as teacher), so the sign-in
modal shouldn't render; if it does, querying the section roster is
harmless.

### 3.7 DOM-level write blocking

In view-as mode, disable every native input. Add to
`_renderViewAsBanner` (or right after it in the DOMContentLoaded
handler):

```js
function _applyViewAsReadOnly() {
  if (!_viewAsContext()) return;
  // Disable all native inputs + textareas. Buttons that drive
  // navigation (drawer open, calendar nav, menu toggle) stay enabled;
  // only WRITE-intending buttons need disabling and those are gated
  // via the write-helper short-circuits in Section 3.8.
  var els = document.querySelectorAll('input, textarea');
  for (var i = 0; i < els.length; i++) {
    els[i].setAttribute('disabled', 'true');
    els[i].style.opacity = '0.55';
    els[i].style.cursor = 'not-allowed';
  }
  // Sign-out menu item: hide (the teacher should Exit view-as, not
  // sign out the student account).
  var signOut = document.getElementById('menu-sign-out');
  if (signOut) signOut.style.display = 'none';
  // The change-password menu item: hide (same reason).
  var changePw = document.getElementById('menu-change-password');
  if (changePw) changePw.style.display = 'none';
}
```

Call from the DOMContentLoaded handler immediately after
`_renderViewAsBanner()`.

ALSO -- the Desk has dynamic content (calendar cells, lesson tiles,
the resource panel). When new content renders, the new inputs/buttons
need disabling too. The simplest approach: after EVERY render that
might inject new inputs/textareas, call `_applyViewAsReadOnly`. Or
use a MutationObserver. For P2, accept the simpler "call after each
render" approach -- the renders we touch are:
- `renderDoNow` success path -> call `_applyViewAsReadOnly()` at end
- the resource panel render (already wired to localStorage events;
  the next render handles it)

Other dynamic content the BUILD does NOT touch (worksheet iframes,
quiz modal, etc.): those are out-of-scope for P2 -- worksheet tile
clicks are blocked by the write-helper short-circuits (Section 3.8)
so the dynamic content there never appears in view-as.

### 3.8 Write-helper short-circuits

Three localStorage writers gate at top with a view-as check.

Find these write helpers in the Desk inline script (use grep on the
file for `localStorage.setItem` calls). Required short-circuits:

```js
// Write helper short-circuit pattern:
function someWriteFn(...) {
  if (_viewAsContext()) return; // view-as is read-only; no localStorage writes
  // ...existing body...
}
```

Specifically:
- The completion-registry write helper (the one called when
  `apstats_ws_completion` storage events fire). Find it via grep
  `apstats_ws_completion` + the helper that WRITES it (might be in
  a curriculum_render iframe -- if so, it's already out of the Desk
  scope; just gate the LISTENER in the Desk to no-op when view-as is
  set).
- The marks debug-helpers: `apstats_desk_marks_*` (lines 3797, 3826
  per recon). Gate each setItem with `if (_viewAsContext()) return;`.

If any write site is unclear, leave it AND add a TODO comment so the
P2 fold pass surfaces it.

### 3.9 Worksheet/quiz/PC tile click blocking

Find the click handler that opens the resource panel for a lesson
tile (probably `_openResourcePanel` or similar). At the TOP of the
handler, gate:

```js
function _openResourcePanel(...) {
  if (_viewAsContext()) {
    // In view-as mode, lesson tile clicks show a transient toast
    // rather than opening the (would-be writable) panel.
    _showViewAsToast('Worksheets cannot be opened in view-as mode. Exit view-as to interact with content as yourself.');
    return;
  }
  // ...existing body...
}
```

Add the toast helper:
```js
function _showViewAsToast(msg) {
  // Re-uses the existing dashboard toast pattern if present; otherwise
  // creates a minimal toast div. Keep it simple -- a div that appears
  // for 3 s near the bottom of the viewport.
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#fef3c7;color:#78350f;padding:10px 16px;border:1px solid #fbbf24;border-radius:6px;z-index:9999;font:13px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.18);';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 3000);
}
```

### 3.10 Drawer "View as" button wiring (teacher-dashboard.html)

Remove `disabled` + add an onclick. In `teacher-dashboard.html`,
find the line in the drawer DOM (added in P1):
```html
<button type="button" class="tsc-action-btn" id="tsc-action-view-as" disabled title="Phase 2">View as student</button>
```

Change to:
```html
<button type="button" class="tsc-action-btn" id="tsc-action-view-as" title="Open this student's Desk in a new tab (read-only)">View as student</button>
```

In the existing TSC drawer JS section (the inline `<script>` in
`teacher-dashboard.html`), add a click handler near the other drawer
helpers (after `closeTscDrawer`):

```js
function _openViewAsTab(studentId) {
  if (!studentId) return;
  // Resolve the Desk URL relative to the dashboard's hosting.
  // GH Pages serves both from the same origin.
  var url = './ap_stats_roadmap_square_mode.html?viewAsUserId=' + encodeURIComponent(studentId);
  window.open(url, '_blank', 'noopener');
}

// Stash current drawer's studentId so the click handler has it.
// Set in openTscDrawer (already captures stub.studentId).
var _tscCurrentStudentId = null;
```

Modify `openTscDrawer` (in teacher-dashboard.html, around line 1283 of
the current diff -- read first) to set `_tscCurrentStudentId = stub.studentId;`
right after the existing `var reqId = ++_tscReqSeq;` line.

Add the click wire in the document-load handler (or right after the
existing ESC handler, line ~1380):
```js
var __viewAsBtn = document.getElementById('tsc-action-view-as');
if (__viewAsBtn) __viewAsBtn.addEventListener('click', function() {
  _openViewAsTab(_tscCurrentStudentId);
});
```

### 3.11 Tests: `tests/desk-view-as.test.js`

Follow `tests/preview-as-student.test.js`'s pattern -- per-function
eval via `fnBody()` extractor + mocked sessionStorage.

Required test cases:

**describe('_viewAsContext reader')**
- Returns null when sessionStorage empty
- Returns parsed object when set
- Returns null on malformed JSON
- Returns null when parsed object lacks studentId

**describe('_deskIsTeacher extension')**
- Returns true for teacher with no flag set
- Returns false when viewAsContext is set (overriding teacher role)
- Returns false when preview-as-student is set (existing behavior, unchanged)

**describe('view-as bootstrap')**
- Skips when no ?viewAsUserId param
- Skips when not signed in
- Skips when signed-in user is a STUDENT, not a teacher
- Hydrates sessionStorage when teacher + valid profile fetch
- Does NOT re-fetch when sessionStorage already has matching studentId

**describe('banner render')**
- Hidden when no viewAsContext
- Visible with realName + username + section when viewAsContext set
- Exit button removes sessionStorage and reloads with stripped query

**describe('fetch URL rewriting')**
- Pass-through when no viewAsContext
- /donow -> /teacher/student/:id/donow + Bearer (teacher) when active
- /grade?token=X -> /teacher/student/:id/grade (no ?token) when active
- /poll-archive -> /teacher/student/:id/poll-archive when active
- Auth header swapped from student token to teacher token

**describe('write-helper short-circuits')**
- localStorage writes for apstats_desk_marks_* no-op when viewAsContext set
- Native inputs are disabled after `_applyViewAsReadOnly`
- Sign-out menu item is hidden in view-as mode

**describe('drawer click wiring (teacher-dashboard.html)')**
- (Pulled in via the existing drawer test file -- add 1-2 tests
  there asserting the button is no longer disabled + the onclick
  opens window with the correct URL)

Target test count: ~20-25 in the new file + ~2 in the existing
drawer test.

## 4. What is explicitly OUT of P2

- Worksheet iframe deep impersonation (clicking into a worksheet to
  see the student's filled-in answers, but read-only). Click is
  blocked at the tile level via Section 3.9 -- no worksheet content
  is shown.
- Override gate (P5). The view-as banner has NO "Override gate" carve-
  out button in P2; that ships in P5 when the underlying
  `lesson_unlock` table is added.
- Nudge channel (P3). The view-as banner has no nudge button.
- The "Recent submissions" pane already shows in the drawer (P1); no
  per-submission detail-view is added in P2.
- MutationObserver for dynamic input disabling. The `_applyViewAsReadOnly`
  callsite list in 3.7 covers the static + main render paths; if any
  late-arriving input slips through, accept it as a P2 known gap.
- Multi-tab view-as (one tab can impersonate student A, a second tab
  student B). The sessionStorage is per-tab so this WORKS naturally,
  but no test pins it.

## 5. Smoke checks (planner-run after Codex fold)

1. `cd roster-server && npm test` -- expect ~10 new tests; total fail
   count must NOT increase from baseline.
2. `npm test` from repo root -- the new desk-view-as.test.js adds
   ~20-25 cases; same baseline rule.
3. Manual smoke:
   - Sign in as teacher in `teacher-dashboard.html`.
   - Open the drawer for a student.
   - Click "View as student" -> new tab opens at
     `?viewAsUserId=<sid>`.
   - Orange banner shows "VIEWING AS <Real Name> -- @username -- PeriodB -- READ-ONLY -- Exit".
   - Do Now card loads with the STUDENT's data (not the teacher's).
   - Calendar shows the STUDENT's completion overlay.
   - Click Exit -> reloads without `?viewAsUserId`, banner gone, see
     own Desk again.
4. The view-as bootstrap fails open: with no `?viewAsUserId`, the
   Desk renders normally (no banner, no read-only).

## 6. Dispatch instructions

Wave 2A goes to Sonnet (general-purpose agent, model=sonnet). The
prompt MUST embed Section 2 verbatim and instruct the agent to read
this BUILD doc + the existing teacher.js + the existing donow.js +
poll-archive.js as pattern source.

Wave 2B is planner-direct -- the planner makes the edits to the
contended Desk file (+ small teacher-dashboard.html drawer wiring).

Both can be in flight in parallel time: Wave 2A as a background
Agent, planner doing 2B during. After both complete: cross-agent.py
to Codex (review, read-only, 600 s).

## 7. Recall

- `TEACHER_STUDENT_CONSOLE_SPEC.md` (parent spec, Section 7 in full)
- `TEACHER_STUDENT_CONSOLE_P1_BUILD.md` (P1 contract; the
  `teacherAuthHeaders()` pattern + `requireTeacher` import are reused
  verbatim)
- `PREVIEW_AS_STUDENT_SPEC.md` (s108 spec; this generalizes it)
- `roster-server/teacher.js` (P1's mountTeacherStudent -- extend it)
- `roster-server/donow.js` + `roster-server/poll-archive.js`
  (existing student-token endpoints to mirror)
- `tests/preview-as-student.test.js` (`fnBody()` per-function eval
  pattern + mockStorage for the new desk-view-as.test.js)

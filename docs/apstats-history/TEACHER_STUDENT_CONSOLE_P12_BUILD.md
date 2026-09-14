# Teacher -> Student Console -- Phase 12 (nudge history pagination) BUILD Contract

> FROZEN, session 113, 2026-05-24. Implements item #7 of the s113
> NEXT queue. The P7 nudge-history drawer section fetches limit=20
> newest-first; older history is invisible. P12 adds an "Older"
> button that fetches the next 20 + appends.
>
> Parent: P7 BUILD (the existing nudge-history section). The server
> endpoint /teacher/nudge-history already supports limit + offset
> -- no server change needed.
>
> NO migration. NO server change. NO cockpit / Desk change.

## 0. Scope

Add a "Load older" button at the bottom of the
`#tsc-nudges-list` drawer section. State:

- `_tscNudgeHistoryOffset` (module-scope) -- offset of the next page.
- Drawer open resets offset to 0.
- Initial fetch (in openTscDrawer's allSettled) loads offset=0 limit=20.
- "Older" button click fetches `?studentUsername=X&limit=20&offset=<current>`
  and APPENDS the rows to the existing list. Increments offset by 20.
- If a fetch returns FEWER than 20 rows, hide the "Older" button -- no
  more history to load.
- Disable the button while a fetch is in-flight (prevents double-click).

NO change to the initial-render flow. NO new endpoint. The button is
purely incremental client-side fetching.

## 1. File ownership (one wave)

| Wave | Files                                                                                                                                | Touched by |
|------|--------------------------------------------------------------------------------------------------------------------------------------|------------|
| Single | `teacher-dashboard.html` (button DOM + CSS + JS), `tests/teacher-student-console-nudges-pagination.test.js` (NEW)                  | Sonnet     |

## 2. DOM

Modify the existing `#tsc-section-nudges` section in
`teacher-dashboard.html` to add a button BELOW the list:

```html
<section class="tsc-section" id="tsc-section-nudges">
  <h3 class="tsc-section-title">Nudge History</h3>
  <ul id="tsc-nudges-list" class="tsc-nudges-list"></ul>
  <button type="button" id="tsc-nudges-older" class="tsc-nudges-older"
          style="display:none">Load older</button>
</section>
```

## 3. CSS

Append to the `.tsc-nudges-*` CSS block:

```css
.tsc-nudges-older {
  margin-top: 6px;
  padding: 6px 10px;
  font: inherit; font-size: 0.82rem;
  background: var(--sg-bg, #fff);
  color: var(--sg-accent, #7a4a1f);
  border: 1px solid var(--sg-border, #d8ccb0);
  border-radius: 4px;
  cursor: pointer;
  width: 100%;
}
.tsc-nudges-older:hover { background: var(--sg-bg-card, #ffffff); border-color: var(--sg-accent, #7a4a1f); }
.tsc-nudges-older[disabled] { opacity: 0.55; cursor: not-allowed; }
```

## 4. JS

### 4.1 State + helpers

Near the existing P7 `renderTscNudges` function in
`teacher-dashboard.html`, add module-scope state:

```js
// P12: pagination state for the Nudge History drawer section.
//   _tscNudgeHistoryOffset = number of rows already loaded for the
//     currently-open student. Reset to 0 on each openTscDrawer.
//   _tscNudgeHistoryStudentUsername = the username this offset
//     belongs to. Set on each openTscDrawer so a stale "Older" click
//     from a prior drawer can't query the new student.
//   _tscNudgeHistoryLoading = true while a fetch is in flight.
var _tscNudgeHistoryOffset = 0;
var _tscNudgeHistoryStudentUsername = null;
var _tscNudgeHistoryLoading = false;
var TSC_NUDGE_PAGE_SIZE = 20;
```

### 4.2 Reset on drawer open

Extend `openTscDrawer` to reset the pagination state + capture the
target username:

```js
// In openTscDrawer, near the existing _tscCurrentStudentStub assignment:
_tscNudgeHistoryOffset = 0;
_tscNudgeHistoryStudentUsername = stub.username || null;
_tscNudgeHistoryLoading = false;

// Also reset the "Older" button visibility synchronously:
var olderBtn = $('tsc-nudges-older');
if (olderBtn) { olderBtn.style.display = 'none'; olderBtn.disabled = false; }
```

### 4.3 Extend `renderTscNudges` to track offset + button visibility

`renderTscNudges` is called from `openTscDrawer` with the FIRST page
(limit=20). After it renders, the offset should advance to 20 IF the
page came back with exactly 20 rows -- meaning there might be more.

Modify `renderTscNudges` to:
- Read `payload.rows.length`.
- If 20 rows -> set offset to 20, show the "Older" button.
- If fewer than 20 rows -> hide the "Older" button (no more pages).

```js
function renderTscNudges(payload) {
  var el = $('tsc-nudges-list');
  if (!el) return;
  el.innerHTML = '';
  var olderBtn = $('tsc-nudges-older');
  if (!payload || !payload.ok || !payload.rows || payload.rows.length === 0) {
    el.innerHTML = '<li class="tsc-nudge-empty">No nudges yet.</li>';
    if (olderBtn) olderBtn.style.display = 'none';
    return;
  }
  payload.rows.forEach(function (row) {
    el.appendChild(_buildNudgeLi(row));   // factored out for reuse by appendOlder
  });
  // P12: if this page came back full, more history MIGHT exist.
  _tscNudgeHistoryOffset = payload.rows.length;
  if (olderBtn) {
    olderBtn.style.display = (payload.rows.length >= TSC_NUDGE_PAGE_SIZE) ? '' : 'none';
    olderBtn.disabled = false;
  }
}

// Factored from renderTscNudges so loadOlderNudges can reuse the row builder.
function _buildNudgeLi(row) {
  var li = document.createElement('li');
  var arrow = document.createElement('span');
  arrow.className = 'tsc-nudge-arrow ' +
    (row.direction === 'teacher' ? 'tsc-nudge-teacher' : 'tsc-nudge-student');
  arrow.textContent = row.direction === 'teacher' ? '>>' : '<<';
  var block = document.createElement('div');
  block.className = 'tsc-nudge-text-block';
  var meta = document.createElement('span');
  meta.className = 'tsc-nudge-meta';
  var when = (row.created_at || '').slice(0, 16).replace('T', ' ');
  var who = row.sender_username || 'unknown';
  meta.textContent = when + ' \xB7 ' + who;
  var text = document.createElement('span');
  text.className = 'tsc-nudge-text';
  text.textContent = row.text || '';
  block.appendChild(meta);
  block.appendChild(text);
  li.appendChild(arrow);
  li.appendChild(block);
  return li;
}
```

### 4.4 `_loadOlderNudges`

Append-only fetch that uses the current offset:

```js
async function _loadOlderNudges() {
  if (!_tscCurrentStudentStub) return;
  if (_tscNudgeHistoryLoading) return;
  // Stale-click guard: if the drawer opened a different student since
  // the button was last bound, ignore the click.
  if (_tscCurrentStudentStub.username !== _tscNudgeHistoryStudentUsername) return;

  var olderBtn = $('tsc-nudges-older');
  _tscNudgeHistoryLoading = true;
  if (olderBtn) { olderBtn.disabled = true; olderBtn.textContent = 'Loading...'; }

  try {
    var headers = teacherAuthHeaders();
    var url = svcUrl() + '/teacher/nudge-history?studentUsername=' +
              encodeURIComponent(_tscCurrentStudentStub.username) +
              '&limit=' + TSC_NUDGE_PAGE_SIZE +
              '&offset=' + _tscNudgeHistoryOffset;
    var res = await fetch(url, { headers: headers });
    var j = null;
    try { j = await res.json(); } catch (_) {}
    if (!res.ok || !j || !j.ok) {
      // Re-enable + leave button in place so user can retry.
      if (olderBtn) { olderBtn.disabled = false; olderBtn.textContent = 'Load older'; }
      _tscNudgeHistoryLoading = false;
      return;
    }
    var rows = Array.isArray(j.rows) ? j.rows : [];
    var el = $('tsc-nudges-list');
    rows.forEach(function (row) { el.appendChild(_buildNudgeLi(row)); });
    _tscNudgeHistoryOffset += rows.length;
    if (olderBtn) {
      olderBtn.textContent = 'Load older';
      if (rows.length < TSC_NUDGE_PAGE_SIZE) {
        // No more pages.
        olderBtn.style.display = 'none';
      } else {
        olderBtn.disabled = false;
      }
    }
  } catch (_) {
    if (olderBtn) { olderBtn.disabled = false; olderBtn.textContent = 'Load older'; }
  } finally {
    _tscNudgeHistoryLoading = false;
  }
}
```

### 4.5 Button wire-up

Add to the existing dashboard DOMContentLoaded:

```js
var olderBtn = $('tsc-nudges-older');
if (olderBtn) olderBtn.addEventListener('click', _loadOlderNudges);
```

## 5. Tests: `tests/teacher-student-console-nudges-pagination.test.js`

Vitest + jsdom. Mirror the existing nudges-test harness.

Required cases:

**describe('Older button DOM presence')**
- `#tsc-nudges-older` exists.
- The button is hidden by default (`style.display === 'none'`).
- The `.tsc-nudges-older` CSS rule is defined.

**describe('Initial render -- offset + button visibility')**
- Initial fetch returns 20 rows -> button is shown + offset is 20.
- Initial fetch returns 5 rows -> button stays hidden + offset is 5.
- Initial fetch returns 0 rows -> empty-state placeholder + button hidden.

**describe('Older button click')**
- Click fires fetch to `/teacher/nudge-history?studentUsername=X&limit=20&offset=20`.
- 20 fresh rows -> appended to list (now 40 total), offset becomes 40, button still visible.
- 5 fresh rows -> appended (25 total), offset becomes 25, button hidden.
- 0 rows on a subsequent click -> button hidden.

**describe('Stale click guard')**
- Open drawer for student A -> button is in scope for A.
- Switch drawer to student B (different username) -> click on the old Older button is a no-op.

**describe('In-flight click guard')**
- During a fetch, button disabled + clicks are no-ops.
- After fetch resolves, button re-enabled (if more pages).

**describe('Error handling')**
- 401 response -> button re-enabled, no rows appended, list unchanged.
- Network throw -> same.

Test count target: 14-18.

## 6. What is explicitly OUT of P12

- **"Newer" direction** -- pagination only loads OLDER history; the
  initial fetch is newest-first and that stays.
- **Infinite scroll** -- explicit button click only. No scroll-trigger.
- **Server-side total count** -- the server doesn't return a total;
  the button's hide-or-show is purely based on "did this page have
  fewer than PAGE_SIZE rows?".

## 7. Smoke checks

1. `cd roster-server && npm test` -- 589/589 unchanged.
2. `npm test` from root -- expect +14-18 cases. 1 known
   study-guide.test.js fail unchanged.
3. **Manual**: open dashboard drawer for a student with >20 nudges in
   history -> "Load older" button visible -> click -> 20 more rows
   appended.

## 8. Dispatch

ONE Sonnet agent.

After return: planner smoke + Codex review + fold + commit + push.

## 9. Notes for the agent

- **ASCII-only**.
- **Edit ONLY teacher-dashboard.html** for the source change; never Write.
- **Stage own paths only**.
- **The existing P7 `renderTscNudges` test (`tests/teacher-student-console-nudges.test.js`)** asserts specific behaviors on the rendered list. Be careful NOT to break those when factoring out `_buildNudgeLi`. The factor-out is a behavior-preserving refactor; the test assertions should keep passing. If any assertions break, update the sibling test the same way P11 did.

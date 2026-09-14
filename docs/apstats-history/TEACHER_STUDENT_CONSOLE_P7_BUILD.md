# Teacher -> Student Console -- Phase 7 (Nudge History) BUILD Contract

> FROZEN, session 113, 2026-05-24. Implements item #5 of session-112's
> NEXT queue (carried into session 113 after P6 closed #1/#6/#7). Adds
> a read-only nudge-history surface on top of the existing P3
> `nudges_log` table.
>
> Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` (section 15 deferred
> "nudge history view"). Sibling BUILDs: P3 (the nudge plumbing this
> reads), P1 (the drawer this extends).
>
> NO migration. The `nudges_log` table (migration 0008, run in s112)
> already carries all the rows needed. NO Desk change. NO cockpit
> change. NO `curriculum_render/data/curriculum.js` change (sacred).

## 0. Scope

A teacher opens the P1 drawer for a student; alongside Grade Summary
+ Recent Submissions + Lesson Unlocks, a new "Nudge History" section
shows the chronological thread between this teacher and that student:
both directions (teacher -> student original + student -> teacher
replies), newest-first, default limit 20.

NO mutation surface in P7. Send-nudge already happens via the cockpit
panel; the dashboard is read-only.

## 1. File ownership (disjoint -> both waves run in parallel)

| Wave | Files                                                                                                                                                                  | Touched by |
|------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| A    | `roster-server/nudge.js` (1 new route block), `roster-server/nudge-db.js` (1 new DAL method), `roster-server/tests/nudge-history.test.js` (NEW)                         | Sonnet     |
| B    | `teacher-dashboard.html` (drawer section + render + 4th fetch), `tests/teacher-student-console-nudges.test.js` (NEW)                                                   | Sonnet     |

Two waves, disjoint files. Wave B's tests stub the fetch; Wave A is
not a hard runtime dependency for Wave B's tests.

## 2. Wave A -- Server: nudge history endpoint

### 2.1 `roster-server/nudge-db.js`: add `listConversation`

The existing DAL exports `listForTeacher`, `listForStudent`, plus
`insertNudges`, `insertReply`, `markDelivered`, `findParent`. Add a
sixth method tailored to the dyadic teacher-student view:

```js
// listConversation({ teacherUsername, studentUsername, limit, offset })
// -> { data: [row, ...], error }
//
// Returns every row in nudges_log that belongs to the conversation
// between THIS teacher and THIS student, regardless of direction.
// Newest-first by created_at. Used by GET /teacher/nudge-history.
//
// The conversation set is the UNION of:
//   (direction='teacher' AND sender_username=teacher AND recipient_username=student)
//   (direction='student' AND sender_username=student AND recipient_username=teacher)
//
// Supabase's PostgREST does not support OR across two conjunctions in a
// single .or() string cleanly, so we use the .or() qualifier with a
// composite filter expression: every condition must match the dyad
// (teacher,student) tuple regardless of direction.
async function listConversation({ teacherUsername, studentUsername, limit = 20, offset = 0 }) {
  return client
    .from('nudges_log')
    .select('*')
    .or(
      'and(direction.eq.teacher,sender_username.eq.' + teacherUsername + ',recipient_username.eq.' + studentUsername + ')' +
      ',' +
      'and(direction.eq.student,sender_username.eq.' + studentUsername + ',recipient_username.eq.' + teacherUsername + ')'
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + Math.max(0, limit) - 1);
}
```

Add `listConversation` to the exported object alongside the existing
methods. **IMPORTANT**: the `.or()` filter expression interpolates
two username values verbatim into the PostgREST filter string. The
teacher route MUST validate `studentUsername` shape (no commas, no
parens, no leading dots) before calling the DAL -- the route does
this; the DAL trusts its caller.

### 2.2 `roster-server/nudge.js`: add `GET /teacher/nudge-history`

Insert directly after the existing `POST /teacher/nudge` handler
(after line 80). Mirror the auth + identity-from-token pattern.

```js
// GET /teacher/nudge-history?studentUsername=X&limit=N&offset=N
// Auth: teacher (x-teacher-secret OR Bearer token resolving to role='teacher').
// Returns the conversation thread between the calling teacher and the
// specified student. Newest-first; limit defaults to 20, max 100;
// offset defaults to 0.
app.get('/teacher/nudge-history', async (req, res) => {
  if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

  var rawStudent = typeof req.query.studentUsername === 'string' ? req.query.studentUsername.trim() : '';
  // Defense: PostgREST .or() filter is built by interpolation; reject any
  // value that could escape the filter syntax (commas, parens, dots, quotes).
  if (!rawStudent || !/^[a-zA-Z0-9_-]+$/.test(rawStudent)) {
    return res.status(400).json({ ok: false, error: 'studentUsername must be alphanumeric (with - or _)' });
  }
  var limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > 100) limit = 100;
  var offset = Number(req.query.offset);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  // Resolve calling teacher's identity from the Bearer token (same pattern as P3).
  var teacherUsername = '';
  var authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  var token = '';
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  if (token) {
    try {
      var sid = verifyToken(token);
      if (sid) {
        var { data: rosterRow } = await db.findByStudentId(sid);
        if (rosterRow) teacherUsername = rosterRow.login_username || '';
      }
    } catch (_) {}
  }
  // Break-glass: x-teacher-secret callers can pass ?teacherUsername= as a
  // last resort (NOT required; the secret is single-teacher anyway).
  if (!teacherUsername && req.headers['x-teacher-secret']) {
    var bodyTeacher = typeof req.query.teacherUsername === 'string' ? req.query.teacherUsername.trim() : '';
    if (bodyTeacher && /^[a-zA-Z0-9_-]+$/.test(bodyTeacher)) teacherUsername = bodyTeacher;
  }
  if (!teacherUsername) {
    return res.status(400).json({ ok: false, error: 'could not resolve teacherUsername from auth' });
  }

  try {
    var { data, error } = await nudgesDb.listConversation({
      teacherUsername, studentUsername: rawStudent, limit, offset,
    });
    if (error) {
      if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
      console.error('GET /teacher/nudge-history error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    return res.json({
      ok: true,
      teacherUsername: teacherUsername,
      studentUsername: rawStudent,
      limit: limit,
      offset: offset,
      rows: data || [],
    });
  } catch (err) {
    console.error('GET /teacher/nudge-history throw:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});
```

NO change to `roster-server/server.js` -- the new GET route mounts
inside the existing `mountNudge` function body.

### 2.3 Tests: `roster-server/tests/nudge-history.test.js`

Mirror the harness from `roster-server/tests/nudge-endpoints.test.js`
or `tests/lesson-unlock-revoke.test.js`. TestServer + fake roster db
+ fake nudgesDb with `listConversation` exposed.

Required cases:

**describe('GET /teacher/nudge-history endpoint')**
- 401 without teacher auth (no secret + no token)
- 200 with valid teacher secret -> envelope `{ ok:true, teacherUsername, studentUsername, limit:20, offset:0, rows:[...] }`
- 200 with valid teacher Bearer token (role='teacher') -> teacherUsername derived from `login_username`
- 400 when `studentUsername` is missing
- 400 when `studentUsername` contains a comma, paren, dot, or quote (filter-injection guard)
- 400 when `studentUsername` is empty string
- 200 with valid `studentUsername` containing letters + numbers + `_` + `-`
- limit clamping: query `?limit=999` -> request lands with limit=100
- limit fallback: query `?limit=banana` -> request lands with limit=20
- limit fallback: query `?limit=0` or negative -> 20
- offset clamping: query `?offset=-5` -> 0
- offset fallback: query `?offset=banana` -> 0
- 503 when the table is missing (`error.code === '42P01'`)
- 500 when the DAL throws
- The DAL is called with the resolved teacherUsername (NOT a body value)

**describe('nudge-db.listConversation (DAL unit)')**
- The `.or()` filter expression includes BOTH direction branches with the correct username assignment.
- limit + offset map to `.range(offset, offset + limit - 1)`.
- Empty list -> data:[] error:null.

Test count target: 14-18.

## 3. Wave B -- Dashboard: Nudge History drawer section

### 3.1 DOM

Insert a new section in `teacher-dashboard.html`'s `<aside
class="tsc-drawer-panel">` between "Lesson Unlocks" and the
`<nav class="tsc-actions">`:

```html
<section class="tsc-section" id="tsc-section-nudges">
  <h3 class="tsc-section-title">Nudge History</h3>
  <ul id="tsc-nudges-list" class="tsc-nudges-list"></ul>
</section>
```

### 3.2 CSS

Append to the existing `.tsc-*` CSS block:

```css
.tsc-nudges-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 0.85rem; }
.tsc-nudges-list li {
  border: 1px solid var(--sg-border); border-radius: 6px;
  padding: 8px 10px; background: var(--sg-bg);
  display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start;
}
.tsc-nudges-list .tsc-nudge-arrow {
  font-weight: 700; line-height: 1.4;
  font-family: var(--sg-mono, monospace);
}
.tsc-nudges-list .tsc-nudge-teacher { color: var(--sg-accent); }       /* teacher -> student */
.tsc-nudges-list .tsc-nudge-student { color: #15803d; }                 /* student -> teacher */
.tsc-nudges-list .tsc-nudge-text-block { display: grid; gap: 2px; }
.tsc-nudges-list .tsc-nudge-meta { color: var(--sg-text-dim); font-size: 0.78rem; }
.tsc-nudges-list .tsc-nudge-text { white-space: pre-wrap; word-wrap: break-word; line-height: 1.35; }
.tsc-nudges-list .tsc-nudge-empty { color: var(--sg-text-dim); font-style: italic; }
```

### 3.3 JS

Extend `openTscDrawer`'s `Promise.allSettled` to a 4th fetch:

```js
Promise.allSettled([
  fetch(base + '/teacher/student/' + sid + '/grade', { headers: headers }).then(jsonOrErr),
  fetch(base + '/teacher/student/' + sid + '/recent?limit=20', { headers: headers }).then(jsonOrErr),
  fetch(base + '/teacher/student/' + sid + '/lesson-unlocks', { headers: headers }).then(jsonOrErr),
  fetch(base + '/teacher/nudge-history?studentUsername=' + encodeURIComponent(stub.username || '') + '&limit=20', { headers: headers }).then(jsonOrErr),
]).then(function (results) {
  if (reqId !== _tscReqSeq) return;
  // ... existing branches for gradeRes, recentRes, unlocksRes ...
  var nudgesRes = results[3];
  if (nudgesRes.status === 'fulfilled') {
    renderTscNudges(nudgesRes.value);
  } else {
    // 503 (migration not run) or other error -> empty state.
    renderTscNudges({ ok: false, rows: [] });
  }
});
```

Add a synchronous clear at drawer open (mirroring the M2 fold from
P6 for the unlocks list):

```js
var nudgesList = $('tsc-nudges-list');
if (nudgesList) nudgesList.innerHTML = '';
```

Render function:

```js
function renderTscNudges(payload) {
  var el = $('tsc-nudges-list');
  if (!el) return;
  el.innerHTML = '';
  if (!payload || !payload.ok || !payload.rows || payload.rows.length === 0) {
    el.innerHTML = '<li class="tsc-nudge-empty">No nudges yet.</li>';
    return;
  }
  payload.rows.forEach(function (row) {
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
    el.appendChild(li);
  });
}
```

XSS safety: all text from the row goes through `textContent`, never
`innerHTML`. The arrow glyphs (`>>` / `<<`) are inline ASCII.

### 3.4 Tests: `tests/teacher-student-console-nudges.test.js`

Vitest + jsdom. Same harness pattern as the existing P6 dashboard
test files.

Required cases:

**describe('Nudge History DOM presence')**
- `#tsc-section-nudges` exists with `#tsc-nudges-list` inside.
- The section sits between unlocks and actions in DOM order.
- `.tsc-nudges-list` CSS is defined.
- `.tsc-nudge-arrow` CSS is defined.
- `renderTscNudges` function is defined.

**describe('Fetch wiring')**
- `openTscDrawer` now fires 4 fetches (grade + recent + lesson-unlocks + nudge-history).
- The nudge-history fetch URL contains `studentUsername=<encoded>` and `limit=20`.
- All 4 fetches carry `x-teacher-secret` when a secret is set.
- 503 on the nudge-history fetch renders the empty state and does NOT break the drawer.

**describe('Render')**
- 0 rows -> empty-state "No nudges yet."
- 2 rows (one teacher, one student) -> 2 `<li>` items; the teacher row has class `tsc-nudge-teacher` and arrow `>>`; the student row has class `tsc-nudge-student` and arrow `<<`.
- Each row's meta line shows the created_at ISO prefix (YYYY-MM-DD HH:MM) + sender_username.
- Text content is set via textContent (XSS-safe).

**describe('Drawer switching clears stale nudges')**
- Open student A with 2 nudges, then open student B (deferred fetch); the nudges-list is cleared synchronously, before B's fetch settles.

Test count target: 12-16.

## 4. What is explicitly OUT of P7

- **Pagination UI**. Limit=20 is the default; an "older" button or scroll-load is a follow-up.
- **Mark-as-read**. No read/unread state in the dashboard.
- **Delete or hide rows**. Read-only.
- **Search / filter** within the conversation.
- **Cross-student aggregate view** (e.g., "show every nudge I sent today across the section"). Out of scope; the drawer is per-student.
- **A new endpoint for the cockpit's sent-nudges history**. Future polish; P7 only touches the dashboard.
- **A migration for read receipts or threads**. The existing schema is sufficient.

## 5. Smoke checks (planner-run after Codex fold)

1. `cd roster-server && npm test` -- expect +14-18 cases (Wave A); total fails unchanged from 566/566 baseline.
2. `npm test` from repo root -- expect +12-16 cases (Wave B); fails unchanged from 5190/5191 baseline (1 known study-guide fail).
3. **Manual Wave A**: `curl "$ROSTER/teacher/nudge-history?studentUsername=papaya-otter&limit=5" -H "x-teacher-secret: $SEC"` for a student known to have nudge rows -> 200 with rows array.
4. **Manual Wave B**: open `teacher-dashboard.html`, enter the secret, click a student row -> drawer opens with the new "Nudge History" section populated alongside the other three.

## 6. Dispatch instructions

Two waves dispatch in parallel via the Agent tool (`general-purpose`,
sonnet). Each prompt embeds the relevant section verbatim + the
parent SPEC + P3 BUILD reference for pattern source.

After both return:
1. Planner runs smoke (section 5).
2. Cross-agent.py to Codex (`task-type=review`, read-only, 540s
   timeout). Same prompt structure as P6: identify changed files,
   focus areas (DAL .or() injection guard, fetch wiring, drawer
   switching clear).
3. Fold all findings.
4. Re-run tests.
5. ONE commit: `feat: Teacher Student Console Phase 7 (nudge history)`.
6. Push. roster-server auto-deploys on `roster-server/**` paths.

## 7. Notes for the build agents

- **PowerShell 5.1 + git**: use Bash heredoc for commit messages.
- **Stage own paths only**: explicit paths, never `-A`. Checkout
  `data/skill-map.js` before staging if it regenerated.
- **ASCII-only**. No `§` / `─` / curly quotes / etc. P6's BLOCKER
  was exactly this.
- **PostgREST `.or()` filter injection**: the route MUST validate
  `studentUsername` against `/^[a-zA-Z0-9_-]+$/` before calling the
  DAL. The DAL trusts its caller.
- **The drawer is now 4-fetch instead of 3**. Existing P1/P6 tests
  that pin "3 fetches" need to update to "4 fetches". This is a
  legitimate sibling-file update (out of strict ownership but
  required by the structural change), the same pattern P6 used.

## 8. Recall on reload

- Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` (section 15 deferred items).
- P3 BUILD documents the existing nudge plumbing this reads.
- P1 BUILD documents the drawer this extends.
- P6 BUILD documents the most recent extension pattern (the lesson
  unlocks section + the M2/m1 folds for synchronous clear + empty
  state).

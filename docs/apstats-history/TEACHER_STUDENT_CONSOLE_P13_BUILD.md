# Teacher -> Student Console -- Phase 13 (student-initiated DM) BUILD Contract

> FROZEN, session 113, 2026-05-24. Implements item #2 of the s113
> NEXT queue. Students can now compose a free-text DM to the
> teacher from the Desk (per the user's explicit decision: full
> text from student, no preset palette). Persists to the existing
> nudges_log table with direction='student' + parent_nudge_id=null.
>
> Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` section 15 deferred DM.
> Sibling BUILDs: P3 (the WRITE side this extends), P7 (the read
> side the teacher consumes).
>
> NO migration. The existing `nudges_log` schema already supports
> `parent_nudge_id IS NULL` for the student-initiated case.

## 0. Scope -- MVP

A student opens a new "Message teacher" surface on the Desk (a small
modal launched from the menu bar), types a message (280 chars max),
hits Send. The DM persists to `nudges_log` with:
- `direction = 'student'`
- `parent_nudge_id = NULL`  (distinguishes a fresh initiate from a reply)
- `sender_username = the student's roster login_username`
- `recipient_username = the teacher's roster login_username` (resolved server-side)

The teacher reads it from the existing P7 nudge-history drawer
section (`listConversation` already returns ALL nudges_log rows for
the dyad regardless of direction or parent).

The modal ALSO shows the student's own recent thread with the
teacher (read-only history view) so the student can see past
exchanges.

**OUT OF SCOPE for MVP:**
- **Live notification to the teacher's cockpit.** This would
  require a cr WS server-side change (new `classroom_student_dm`
  message type, fan-out to teacher) + a cockpit-side incoming
  handler. Deferred to a follow-up. The teacher discovers the DM
  by opening the P7 drawer (which she already does for
  grade/recent/unlocks).
- **Multi-teacher deployments.** Single-teacher resolution: the
  server picks the FIRST row with `role='teacher'` from the roster.

## 1. File ownership (two waves, disjoint)

| Wave | Files                                                                                                                                                                       | Touched by |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| A    | `roster-server/db.js` (1 new helper), `roster-server/nudge-db.js` (1 new method), `roster-server/nudge.js` (2 new routes), `roster-server/tests/student-dm.test.js` (NEW)    | Sonnet     |
| B    | `ap_stats_roadmap_square_mode.html` (menu item + modal DOM/CSS/JS), `tests/desk-student-dm.test.js` (NEW)                                                                   | Sonnet     |

## 2. Wave A -- server endpoints

### 2.1 `roster-server/db.js` -- `findTeacherUsername` helper

Add a new exported helper after `findByStudentId`:

```js
// P13: find the teacher's roster row (single-teacher prod assumed).
// Returns { data: row|null, error }. Used by /student/nudge to
// resolve the DM recipient since the student doesn't pick one.
//
// In a multi-teacher deployment, this would need a section filter +
// a way to pick the section's teacher (e.g. roster carries
// teacher_id_for_section). Today's single-teacher posture is
// explicit per P13 BUILD section 0.
async function findTeacherUsername() {
  return client
    .from('roster')
    .select('login_username, real_name, section, student_id')
    .eq('role', 'teacher')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}
```

Append `findTeacherUsername` to the exported object on line 24.

### 2.2 `roster-server/nudge-db.js` -- `insertStudentDm` DAL method

Add a new exported method after the existing `insertReply`:

```js
// P13: insert a student-initiated DM. Mirrors insertReply but with
// parent_nudge_id=NULL (this is a fresh thread, not a reply).
async function insertStudentDm({ nudgeId, senderUsername, recipientUsername, text, section }) {
  return client.from('nudges_log').insert({
    nudge_id: nudgeId,
    parent_nudge_id: null,
    sender_username: senderUsername,
    recipient_username: recipientUsername,
    text: text,
    direction: 'student',
    section: section,
    created_at: new Date().toISOString(),
    delivered_at: null,   // live delivery deferred; teacher polls via P7 dashboard surface
  }).select('*').single();
}
```

Add `insertStudentDm` to the exported object alongside the existing
six methods.

### 2.3 `roster-server/nudge.js` -- two new routes

Insert directly after the existing `GET /teacher/nudge-history`
handler:

```js
// POST /student/nudge { text }  -- student-initiated DM to teacher.
// Auth: student Bearer token. Resolves the teacher recipient
// server-side via db.findTeacherUsername (single-teacher prod).
// Persists with direction='student' + parent_nudge_id=NULL.
app.post('/student/nudge', async (req, res) => {
  var authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  var token = '';
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });

  var studentId;
  try { studentId = verifyToken(token); } catch (_) { return res.status(401).json({ ok: false, error: 'unauthorized' }); }
  if (!studentId) return res.status(401).json({ ok: false, error: 'unauthorized' });

  // Resolve the student's identity from their roster row.
  var roster;
  try {
    var { data: rosterRow, error: rosterErr } = await db.findByStudentId(studentId);
    if (rosterErr || !rosterRow) return res.status(401).json({ ok: false, error: 'unauthorized' });
    roster = rosterRow;
  } catch (_) { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

  var body = req.body || {};
  var text = (typeof body.text === 'string') ? body.text : '';
  if (!text.trim()) {
    return res.status(400).json({ ok: false, error: 'text required' });
  }
  if (text.length > 280) text = text.slice(0, 280);

  // Resolve the teacher recipient.
  var teacher;
  try {
    var { data: teacherRow, error: teacherErr } = await db.findTeacherUsername();
    if (teacherErr) {
      console.error('POST /student/nudge findTeacher error:', teacherErr);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!teacherRow) {
      return res.status(503).json({ ok: false, error: 'no teacher available' });
    }
    teacher = teacherRow;
  } catch (err) {
    console.error('POST /student/nudge findTeacher throw:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }

  // Insert the DM.
  var nudgeId = 'student-dm-' + studentId + '-' + Date.now();
  try {
    var { data, error } = await nudgesDb.insertStudentDm({
      nudgeId: nudgeId,
      senderUsername: roster.login_username,
      recipientUsername: teacher.login_username,
      text: text,
      section: roster.section,
    });
    if (error) {
      if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
      console.error('POST /student/nudge insert error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    return res.json({ ok: true, nudgeId: nudgeId, row: data });
  } catch (err) {
    console.error('POST /student/nudge throw:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// GET /student/nudge-history?limit=&offset=  -- student's own dyad
// thread with the teacher (both directions). Mirrors the teacher-side
// GET /teacher/nudge-history but the dyad is fixed by the auth token.
app.get('/student/nudge-history', async (req, res) => {
  var authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  var token = '';
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
  } else if (req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  }
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });

  var studentId;
  try { studentId = verifyToken(token); } catch (_) { return res.status(401).json({ ok: false, error: 'unauthorized' }); }
  if (!studentId) return res.status(401).json({ ok: false, error: 'unauthorized' });

  var roster;
  try {
    var { data: rosterRow, error: rosterErr } = await db.findByStudentId(studentId);
    if (rosterErr || !rosterRow) return res.status(401).json({ ok: false, error: 'unauthorized' });
    roster = rosterRow;
  } catch (_) { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

  // Resolve the teacher recipient.
  var teacher;
  try {
    var { data: teacherRow } = await db.findTeacherUsername();
    if (!teacherRow) return res.json({ ok: true, rows: [] });  // no teacher -> empty thread
    teacher = teacherRow;
  } catch (_) { return res.status(500).json({ ok: false, error: 'Database error' }); }

  var limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > 100) limit = 100;
  var offset = Number(req.query.offset);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  // Validate usernames before passing to PostgREST (same gate as P7).
  if (!/^[a-zA-Z0-9_-]+$/.test(roster.login_username) || !/^[a-zA-Z0-9_-]+$/.test(teacher.login_username)) {
    return res.status(400).json({ ok: false, error: 'resolved usernames have invalid characters' });
  }

  try {
    // Reuse listConversation -- the dyad is teacherUsername / studentUsername.
    var { data, error } = await nudgesDb.listConversation({
      teacherUsername: teacher.login_username,
      studentUsername: roster.login_username,
      limit: limit,
      offset: offset,
    });
    if (error) {
      if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
      console.error('GET /student/nudge-history error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    return res.json({
      ok: true,
      studentUsername: roster.login_username,
      teacherUsername: teacher.login_username,
      limit: limit,
      offset: offset,
      rows: data || [],
    });
  } catch (err) {
    console.error('GET /student/nudge-history throw:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});
```

NO change to `server.js` (the routes mount inside `mountNudge`).

### 2.4 Tests: `roster-server/tests/student-dm.test.js`

Mirror the harness from `tests/nudge-history.test.js`. Fake roster
db + fake nudgesDb with insertStudentDm + listConversation.

**describe('POST /student/nudge endpoint')**
- 401 without Bearer token
- 401 with bogus token
- 200 with valid student token + text -> nudge row inserted with direction='student' + parent_nudge_id=null + correct sender/recipient
- 400 when text is missing or empty
- 400 when text is whitespace-only
- text > 280 chars is truncated to 280
- 503 when nudges_log table missing (42P01)
- 503 when no teacher in roster (findTeacherUsername returns null)
- 500 when DAL throws
- The inserted row's section comes from the STUDENT's roster row (not body)
- The recipient_username comes from findTeacherUsername (not body)

**describe('GET /student/nudge-history endpoint')**
- 401 without Bearer
- 200 with valid student token -> dyad rows returned
- limit clamping (>100 -> 100, NaN -> 20)
- offset clamping (negative -> 0)
- The dyad lookup uses the STUDENT's username from token + the
  resolved teacher's username
- 400 if resolved usernames have invalid characters (defensive)
- 503 when table missing

**describe('db.findTeacherUsername helper')**
- Builds the right query (.from('roster').select(...).eq('role','teacher').order(...).limit(1).maybeSingle())
- Returns the single teacher row or null

Test count target: 16-22.

## 3. Wave B -- Desk client

### 3.1 Menu bar entry

The Desk has a Mac-style menu bar in `ap_stats_roadmap_square_mode.html`.
Add a "Message teacher..." item to the File menu (or wherever the
existing menu structure most naturally houses it; the agent should
pick the slot that feels least disruptive).

Look for the existing menu bar HTML around the top of the body --
add an entry like:

```html
<div class="menu-dd-item" id="menu-message-teacher" onclick="_openStudentDmModal()">Message teacher...</div>
```

### 3.2 Modal DOM

Insert before `</body>` (mirroring the existing P5 override-gate
modal pattern):

```html
<!-- P13: student-initiated DM modal. Opens via the "Message teacher" menu item. -->
<div id="student-dm-modal" style="display:none">
  <div class="sdm-backdrop" data-sdm-close="backdrop"></div>
  <div class="sdm-panel" role="dialog" aria-labelledby="sdm-title">
    <h3 id="sdm-title">Message your teacher</h3>
    <p class="sdm-desc">Send a private note. Your teacher will see it the next time they check the dashboard.</p>
    <label for="sdm-text">Message (280 chars max)</label>
    <textarea id="sdm-text" maxlength="280" rows="3" placeholder="Type your message..."></textarea>
    <div class="sdm-status" id="sdm-status"></div>
    <div class="sdm-actions">
      <button type="button" class="sdm-cancel" id="sdm-cancel">Cancel</button>
      <button type="button" class="sdm-send" id="sdm-send">Send</button>
    </div>
    <hr class="sdm-divider">
    <h4 class="sdm-history-title">Recent conversation</h4>
    <ul id="sdm-history-list" class="sdm-history-list">
      <li class="sdm-history-empty">No messages yet.</li>
    </ul>
  </div>
</div>
```

### 3.3 CSS

Append to the existing `<style>` block in
`ap_stats_roadmap_square_mode.html`. Match the System 7 aesthetic
that the rest of the Desk uses (Chicago/Geneva fonts, beveled
buttons, platinum gray).

```css
/* P13: student DM modal. */
#student-dm-modal { position: fixed; inset: 0; z-index: 12000; display: none; }
#student-dm-modal[style*="display:block"], #student-dm-modal[style*="display: block"] { display: block; }
.sdm-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.42); }
.sdm-panel {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 440px; max-width: 92vw; max-height: 86vh; overflow-y: auto;
  background: #f7f2e8;
  border: 2px solid #2a2520; border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.32);
  padding: 16px 18px;
  font: 13px "Geneva", "Lucida Grande", system-ui, sans-serif;
  display: flex; flex-direction: column; gap: 8px;
}
.sdm-panel h3 { margin: 0 0 6px; font: bold 14px "Chicago", system-ui, sans-serif; color: #2a2520; }
.sdm-panel h4 { margin: 0; font-size: 12px; color: #5a5045; letter-spacing: 0.04em; }
.sdm-desc { margin: 0 0 6px; color: #5a5045; font-size: 0.82rem; }
.sdm-panel label { font-size: 0.78rem; color: #5a5045; }
.sdm-panel textarea {
  font: inherit; padding: 6px 8px;
  border: 1px solid #5a5045; border-radius: 4px;
  background: #fff; width: 100%; box-sizing: border-box; resize: vertical;
}
.sdm-status { min-height: 18px; font-size: 0.82rem; color: #5a5045; }
.sdm-status.is-error { color: #b91c1c; }
.sdm-status.is-success { color: #15803d; }
.sdm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.sdm-cancel, .sdm-send {
  padding: 6px 14px; border: 1px solid #5a5045; border-radius: 4px;
  font: inherit; cursor: pointer; background: #fff;
}
.sdm-send { background: #5a5045; color: #fff; }
.sdm-send[disabled] { opacity: 0.55; cursor: not-allowed; }
.sdm-divider { border: 0; border-top: 1px solid #d8ccb0; margin: 8px 0 4px; }
.sdm-history-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; font-size: 0.82rem; }
.sdm-history-list li {
  border: 1px solid #d8ccb0; border-radius: 4px;
  padding: 6px 8px; background: #fff;
  display: grid; grid-template-columns: auto 1fr; gap: 6px;
}
.sdm-history-list .sdm-history-arrow { font-family: monospace; font-weight: 700; }
.sdm-history-list .sdm-from-student { color: #2a2520; }
.sdm-history-list .sdm-from-teacher { color: #7a4a1f; }
.sdm-history-list .sdm-history-meta { font-size: 0.74rem; color: #5a5045; }
.sdm-history-list .sdm-history-text { white-space: pre-wrap; word-wrap: break-word; line-height: 1.35; }
.sdm-history-list .sdm-history-empty { color: #5a5045; font-style: italic; grid-template-columns: 1fr; }
```

### 3.4 JS handlers

Add near the existing P3 nudge toast helpers (around line 4070+ of
`ap_stats_roadmap_square_mode.html`):

```js
// P13: student-initiated DM modal. Composes a free-text message to
// the teacher (resolved server-side) + shows the student's own
// recent thread.

function _openStudentDmModal() {
  var modal = document.getElementById('student-dm-modal');
  if (!modal) return;
  // Reset state.
  document.getElementById('sdm-text').value = '';
  var statusEl = document.getElementById('sdm-status');
  statusEl.textContent = '';
  statusEl.classList.remove('is-error', 'is-success');
  document.getElementById('sdm-send').disabled = false;
  modal.style.display = 'block';
  setTimeout(function () { document.getElementById('sdm-text').focus(); }, 30);
  _fetchStudentDmHistory();
}

function _closeStudentDmModal() {
  var modal = document.getElementById('student-dm-modal');
  if (modal) modal.style.display = 'none';
}

async function _fetchStudentDmHistory() {
  var listEl = document.getElementById('sdm-history-list');
  if (!listEl) return;
  listEl.innerHTML = '<li class="sdm-history-empty">Loading...</li>';
  try {
    var base = window.ROSTER_SERVICE_URL;
    var token = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (!base || !token) {
      listEl.innerHTML = '<li class="sdm-history-empty">Not signed in.</li>';
      return;
    }
    var res = await fetch(base + '/student/nudge-history?limit=20', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j || !j.ok) {
      listEl.innerHTML = '<li class="sdm-history-empty">No messages yet.</li>';
      return;
    }
    var rows = Array.isArray(j.rows) ? j.rows : [];
    if (rows.length === 0) {
      listEl.innerHTML = '<li class="sdm-history-empty">No messages yet.</li>';
      return;
    }
    listEl.innerHTML = '';
    rows.forEach(function (row) {
      listEl.appendChild(_buildSdmHistoryLi(row));
    });
  } catch (_) {
    listEl.innerHTML = '<li class="sdm-history-empty">Error loading history.</li>';
  }
}

function _buildSdmHistoryLi(row) {
  var li = document.createElement('li');
  var arrow = document.createElement('span');
  // direction='teacher' = from teacher (incoming); direction='student' = from me (outgoing).
  arrow.className = 'sdm-history-arrow ' +
    (row.direction === 'teacher' ? 'sdm-from-teacher' : 'sdm-from-student');
  arrow.textContent = row.direction === 'teacher' ? '<<' : '>>';
  var block = document.createElement('div');
  var meta = document.createElement('div');
  meta.className = 'sdm-history-meta';
  var when = (row.created_at || '').slice(0, 16).replace('T', ' ');
  var who = (row.direction === 'teacher')
    ? (row.sender_username || 'teacher')
    : 'me';
  meta.textContent = when + ' \xB7 ' + who;
  var text = document.createElement('div');
  text.className = 'sdm-history-text';
  text.textContent = row.text || '';
  block.appendChild(meta);
  block.appendChild(text);
  li.appendChild(arrow);
  li.appendChild(block);
  return li;
}

async function _sendStudentDm() {
  var textEl = document.getElementById('sdm-text');
  var statusEl = document.getElementById('sdm-status');
  var btn = document.getElementById('sdm-send');
  var rawText = textEl ? String(textEl.value || '').trim() : '';
  statusEl.classList.remove('is-error', 'is-success');
  if (!rawText) {
    statusEl.textContent = 'Type a message first.';
    statusEl.classList.add('is-error');
    return;
  }
  if (rawText.length > 280) rawText = rawText.slice(0, 280);
  btn.disabled = true;
  statusEl.textContent = 'Sending...';
  try {
    var base = window.ROSTER_SERVICE_URL;
    var token = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (!base || !token) {
      statusEl.textContent = 'Not signed in.';
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    var res = await fetch(base + '/student/nudge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text: rawText }),
    });
    var j = await res.json().catch(function () { return {}; });
    if (res.status === 503) {
      statusEl.textContent = (j && j.error) || 'Server unavailable.';
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    if (!res.ok || !j.ok) {
      statusEl.textContent = (j && j.error) || ('HTTP ' + res.status);
      statusEl.classList.add('is-error');
      btn.disabled = false;
      return;
    }
    statusEl.textContent = 'Sent.';
    statusEl.classList.add('is-success');
    textEl.value = '';
    // Refresh the history so the student sees their own message immediately.
    _fetchStudentDmHistory();
    btn.disabled = false;
  } catch (err) {
    statusEl.textContent = 'Network error: ' + (err && err.message ? err.message : 'unknown');
    statusEl.classList.add('is-error');
    btn.disabled = false;
  }
}

// Wire on DOMContentLoaded.
try {
  document.addEventListener('DOMContentLoaded', function () {
    var sendBtn = document.getElementById('sdm-send');
    if (sendBtn) sendBtn.addEventListener('click', _sendStudentDm);
    var cancelBtn = document.getElementById('sdm-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', _closeStudentDmModal);
    document.querySelectorAll('#student-dm-modal [data-sdm-close]')
      .forEach(function (el) { el.addEventListener('click', _closeStudentDmModal); });
    // ESC closes.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var m = document.getElementById('student-dm-modal');
        if (m && m.style.display === 'block') {
          e.stopPropagation();
          _closeStudentDmModal();
        }
      }
    }, true);
  });
} catch (_) {}
```

### 3.5 Tests: `tests/desk-student-dm.test.js`

Vitest + jsdom. Test against the Desk's inline script in a vm sandbox.

**describe('DM modal DOM presence')**
- `#student-dm-modal` exists.
- `#sdm-text`, `#sdm-send`, `#sdm-cancel`, `#sdm-history-list` exist.
- The menu item `#menu-message-teacher` (or equivalent) exists in the menu bar.
- `.sdm-panel` CSS rule is defined.

**describe('Open / close')**
- `_openStudentDmModal()` sets the modal's display to block + clears the textarea + clears status + re-enables send.
- `_closeStudentDmModal()` sets display to none.
- ESC closes the modal when it's open.
- Click on `.sdm-backdrop` closes.

**describe('Send')**
- Empty textarea + click Send -> status "Type a message first."; no fetch.
- Filled textarea + Send -> POST /student/nudge with body `{ text: 'X' }`.
- 200 -> status "Sent."; textarea cleared; history fetch re-runs.
- 503 -> status shows server error; button re-enabled.
- 401 -> status shows error; button re-enabled.
- Network throw -> status shows error; button re-enabled.

**describe('History render')**
- `_fetchStudentDmHistory()` calls GET /student/nudge-history?limit=20.
- 0 rows -> empty-state "No messages yet."
- Teacher-direction row -> '<<' + sdm-from-teacher class.
- Student-direction row -> '>>' + sdm-from-student class + 'me' as sender.
- Rows are listed in order returned by the server.

Test count target: 14-20.

## 4. What is explicitly OUT of P13

- **Live notification to the teacher's cockpit** (deferred -- needs
  a cr WS change + cockpit handler).
- **Multi-teacher routing** (the recipient is the first
  role='teacher' row in roster; single-teacher prod).
- **Student preset palette** (per user's explicit decision: full
  text from student, no presets).
- **Receipt indicator** (no delivered_at update path for the
  student's own send).
- **Read receipts** (the teacher reading a DM doesn't notify the
  student).
- **Bulk export** of the student's DM history.

## 5. Smoke checks

1. `cd roster-server && npm test` -- expect +16-22 cases (Wave A).
   Total fails unchanged from 589/589 baseline.
2. `npm test` from root -- expect +14-20 cases (Wave B). 1 known
   study-guide.test.js fail unchanged.
3. **Manual**: sign in as a student on the Desk. Click File -> Message
   teacher. Type "hi". Send. Status reads "Sent." The history list
   shows the new message at top. Now sign in as teacher on the
   dashboard, open the drawer for that student, scroll the Nudge
   History section -> the student's DM appears.

## 6. Dispatch

Two Sonnet agents dispatched in parallel.

After return: planner smoke + Codex review + fold + commit + push.
roster-server auto-deploys on the Wave A push.

## 7. Notes for the build agents

- **ASCII-only**.
- **Edit-not-Write for `ap_stats_roadmap_square_mode.html`** (BOM lesson).
- **Stage own paths only**.
- **The roster table's `role` column** was added in migration 0005;
  pre-existing rows might be NULL. `findTeacherUsername` filters by
  `.eq('role', 'teacher')` which excludes nulls correctly.
- **Student token resolves to studentId**, then `findByStudentId` to
  the roster row (the P7 BLOCKER FIX ensured login_username is in
  the SELECT).

## 8. Recall on reload

- Parent: spec section 15 deferred items.
- P3 BUILD documents the WRITE side this extends.
- P7 BUILD documents the READ side the teacher uses to see the DM.
- The user explicitly chose "full text from student, no presets" --
  do NOT introduce a preset palette.

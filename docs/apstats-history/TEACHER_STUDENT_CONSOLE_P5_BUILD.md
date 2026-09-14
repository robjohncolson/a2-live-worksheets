# Teacher -> Student Console -- Phase 5 BUILD Contract

> FROZEN, session 112, 2026-05-24. Implements `TEACHER_STUDENT_CONSOLE_SPEC.md`
> Section 9 (Override gate) + Section 13 row P5.
>
> Scope: a teacher in View-as mode (P2) can override the lesson-
> sequence gate for the impersonated student. Sticky -- adds an
> `active` row to a new `lesson_unlock` table; the student's Desk
> consults the unlock list at sign-in and bypasses the gate for
> unlocked lessons. ONE user-run migration: `0009_lesson_unlock.sql`.
>
> Touches: roster-server (NEW endpoints + migration + DAL), Desk
> (gate-check extension + view-as banner override button + modal).
> NO cr change. NO cockpit change. NO `curriculum_render/data/curriculum.js` change.

## 1. File ownership (2 disjoint waves)

| Unit | Files                                                                          | Touched by      |
|------|--------------------------------------------------------------------------------|-----------------|
| 5A   | `roster-server/lesson-unlock.js` (NEW), `roster-server/lesson-unlock-db.js` (NEW), `roster-server/server.js` (1 import + 1 mount call), `roster-server/migrations/0009_lesson_unlock.sql` (NEW), `roster-server/tests/lesson-unlock-endpoints.test.js` (NEW, ~16 tests) | Sonnet |
| 5B   | `ap_stats_roadmap_square_mode.html` (Desk gate-check extension + unlock-list fetch + cache + override modal + view-as button), `tests/desk-lesson-unlock.test.js` (NEW, ~15 tests) | Planner-direct  |

Wave 5A is roster-server only. Wave 5B touches the contended Desk
file. Both can run in parallel since files are disjoint.

## 2. Wave 5A -- roster-server lesson_unlock

### 2.1 Migration `0009_lesson_unlock.sql`

```sql
-- 0009_lesson_unlock.sql -- lesson_unlock persistence (Phase 5 of
-- TEACHER_STUDENT_CONSOLE_SPEC.md). Records teacher overrides of the
-- sequential lesson gate. Sticky (status='active' persists across
-- sessions). One row per (student, lesson) -- UNIQUE constraint.
-- Idempotent.

create table if not exists lesson_unlock (
  id                 bigserial primary key,
  student_username   text not null,
  lesson_key         text not null,
  unlocked_by        text not null,
  unlocked_at        timestamptz not null default now(),
  reason             text,
  status             text not null default 'active' check (status in ('active', 'revoked')),
  unique (student_username, lesson_key)
);

create index if not exists lesson_unlock_student_idx on lesson_unlock (student_username) where status = 'active';
create index if not exists lesson_unlock_lesson_idx on lesson_unlock (lesson_key);

alter table lesson_unlock enable row level security;
-- Intentionally NO policies. Service-role only (mirrors 0007 + 0008).
```

### 2.2 `roster-server/lesson-unlock-db.js`

Mirror `roster-server/nudge-db.js` pattern:

```js
// lesson-unlock-db.js -- Supabase DAL for lesson_unlock (Phase 5 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Pure CRUD; no business rules.

import { createClient } from '@supabase/supabase-js';

export function createLessonUnlockDb(client) {
  return {
    upsertUnlock,                // teacher overrides -- INSERT ON CONFLICT (student,lesson) UPDATE
    listActiveForStudent,        // student-side: their active unlocks
  };

  // upsertUnlock({ studentUsername, lessonKey, unlockedBy, reason })
  // -> { data: row|null, error }
  async function upsertUnlock({ studentUsername, lessonKey, unlockedBy, reason }) {
    var row = {
      student_username: studentUsername,
      lesson_key: lessonKey,
      unlocked_by: unlockedBy,
      reason: reason || null,
      status: 'active',
      unlocked_at: new Date().toISOString(),
    };
    return client
      .from('lesson_unlock')
      .upsert([row], { onConflict: 'student_username,lesson_key' })
      .select('*')
      .single();
  }

  // listActiveForStudent(studentUsername) -> { data: [row, ...], error }
  // Returns ONLY active (not revoked) unlocks.
  async function listActiveForStudent(studentUsername) {
    return client
      .from('lesson_unlock')
      .select('*')
      .eq('student_username', studentUsername)
      .eq('status', 'active');
  }
}

export function createLiveLessonUnlockDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  var client = createClient(url, key);
  return createLessonUnlockDb(client);
}
```

### 2.3 `roster-server/lesson-unlock.js`

Mirror the mount-function pattern from `teacher.js` + `nudge.js`:

```js
// lesson-unlock.js -- mounts lesson-unlock endpoints (Phase 5 of
// TEACHER_STUDENT_CONSOLE_SPEC.md).
//
//   POST /teacher/lesson-unlock              -> teacher overrides one (student, lesson)
//   GET  /student/lesson-unlocks             -> caller's own active unlocks
//   GET  /teacher/student/:id/lesson-unlocks -> target's active unlocks (used by view-as Desk)
//
// 42P01 (table missing) degrades to 503 so the service stays up until
// the user runs migrations/0009_lesson_unlock.sql.

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';

export function mountLessonUnlock(app, { db, lessonUnlockDb }) {
  if (!lessonUnlockDb) return;

  // POST /teacher/lesson-unlock { studentUsername, lessonKey, reason? }
  app.post('/teacher/lesson-unlock', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    var body = req.body || {};
    var studentUsername = (typeof body.studentUsername === 'string') ? body.studentUsername.trim() : '';
    var lessonKey = (typeof body.lessonKey === 'string') ? body.lessonKey.trim() : '';
    var reason = (typeof body.reason === 'string') ? body.reason.trim() : '';
    if (!studentUsername || !lessonKey) {
      return res.status(400).json({ ok: false, error: 'studentUsername + lessonKey required' });
    }
    if (reason.length > 500) reason = reason.slice(0, 500);

    // Derive unlockedBy from the authenticated teacher token (mirror of
    // P3 MAJOR fold: never trust client-supplied identity).
    var unlockedBy = '';
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
          if (rosterRow) unlockedBy = rosterRow.login_username || '';
        }
      } catch (_) {}
    }
    // Break-glass fallback for x-teacher-secret callers.
    if (!unlockedBy && req.headers['x-teacher-secret']) {
      unlockedBy = (typeof body.unlockedBy === 'string') ? body.unlockedBy.trim() : 'teacher-secret';
    }
    if (!unlockedBy) {
      return res.status(400).json({ ok: false, error: 'could not resolve unlockedBy from auth' });
    }

    try {
      var { data, error } = await lessonUnlockDb.upsertUnlock({
        studentUsername, lessonKey, unlockedBy, reason,
      });
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'lesson_unlock not provisioned -- run migration 0009' });
        console.error('POST /teacher/lesson-unlock error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, row: data });
    } catch (err) {
      console.error('POST /teacher/lesson-unlock throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // GET /student/lesson-unlocks
  // Auth: student token. Returns caller's OWN active unlocks.
  app.get('/student/lesson-unlocks', async (req, res) => {
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
      var { data, error } = await db.findByStudentId(studentId);
      if (error || !data) return res.status(401).json({ ok: false, error: 'unauthorized' });
      roster = data;
    } catch (_) { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

    return _listUnlocks(res, roster.login_username);
  });

  // GET /teacher/student/:studentId/lesson-unlocks
  // Auth: teacher (secret or token). Returns target's active unlocks.
  // Used by the view-as Desk to apply the same gate-bypass.
  app.get('/teacher/student/:studentId/lesson-unlocks', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    var studentId = req.params.studentId;
    var roster;
    try {
      var { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:id/lesson-unlocks roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:id/lesson-unlocks roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return _listUnlocks(res, roster.login_username);
  });

  async function _listUnlocks(res, studentUsername) {
    try {
      var { data, error } = await lessonUnlockDb.listActiveForStudent(studentUsername);
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'lesson_unlock not provisioned -- run migration 0009' });
        console.error('listActiveForStudent error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      var rows = Array.isArray(data) ? data : [];
      var lessonKeys = rows.map(function(r) { return r.lesson_key; });
      return res.json({ ok: true, studentUsername: studentUsername, lessonKeys: lessonKeys, rows: rows });
    } catch (err) {
      console.error('listActiveForStudent throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  }
}
```

### 2.4 server.js wiring

Two additive insertions (mirror P3's nudge wiring):
- `import { mountLessonUnlock } from './lesson-unlock.js';` + `import { createLiveLessonUnlockDb } from './lesson-unlock-db.js';`
- Add `lessonUnlockDb` as the 13th positional `createApp` parameter (preserves back-compat)
- Conditional mount after the existing mountNudge block

### 2.5 Tests `roster-server/tests/lesson-unlock-endpoints.test.js`

Vitest + http + TestServer harness (mirror `nudge-endpoints.test.js`).

Fake `lessonUnlockDb`:
```js
function createFakeLessonUnlockDb({ failWith42P01 = false } = {}) {
  var unlocks = new Map();   // key: 'sid|lessonKey' -> row
  return {
    _unlocks: unlocks,
    async upsertUnlock({ studentUsername, lessonKey, unlockedBy, reason }) {
      if (failWith42P01) return { data: null, error: { code: '42P01' } };
      var key = studentUsername + '|' + lessonKey;
      var row = { id: unlocks.size + 1, student_username: studentUsername, lesson_key: lessonKey, unlocked_by: unlockedBy, reason: reason, status: 'active', unlocked_at: new Date().toISOString() };
      unlocks.set(key, row);
      return { data: row, error: null };
    },
    async listActiveForStudent(studentUsername) {
      if (failWith42P01) return { data: null, error: { code: '42P01' } };
      var rows = [];
      unlocks.forEach(function(v) { if (v.student_username === studentUsername && v.status === 'active') rows.push(v); });
      return { data: rows, error: null };
    },
  };
}
```

Required test cases (~16):

**describe('POST /teacher/lesson-unlock')**
- 401 without teacher auth
- 200 with teacher secret + body -> upsert row; response carries the row
- 200 with token-auth (Bearer teacher token)
- 401 with student-role token
- 400 when studentUsername or lessonKey missing
- 200 same (student, lesson) twice -> upsert (UNIQUE constraint respected)
- 503 when lessonUnlockDb returns 42P01
- reason truncated to 500 chars

**describe('GET /student/lesson-unlocks')**
- 401 without token
- 200 with student token -> returns lessonKeys array + rows array
- 200 with empty unlocks -> empty arrays
- 503 when 42P01

**describe('GET /teacher/student/:id/lesson-unlocks')**
- 401 without teacher auth
- 200 with teacher secret -> returns target student's unlocks
- 404 when studentId unknown
- 503 when 42P01

Total: ~16 tests.

## 3. Wave 5B -- Desk gate + view-as override

### 3.1 Unlock-list cache

Cache key:
- Normal mode: `localStorage.apstats_lesson_unlocks` (string array of lesson_keys; per-domain, shared across tabs of the same user)
- View-as mode: `sessionStorage.apstats_view_as_lesson_unlocks` (per-tab; cleared on view-as exit)

Reader function:
```js
function _readLessonUnlocks() {
  try {
    // View-as: per-tab cache (target student's unlocks).
    if (typeof _viewAsContext === 'function' && _viewAsContext()) {
      var vRaw = sessionStorage.getItem('apstats_view_as_lesson_unlocks');
      if (!vRaw) return [];
      var vArr = JSON.parse(vRaw);
      return Array.isArray(vArr) ? vArr : [];
    }
    // Normal mode: localStorage (own unlocks).
    var raw = localStorage.getItem('apstats_lesson_unlocks');
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

function _isTopicLessonUnlocked(topic) {
  // Topic is the lesson identifier on the calendar (e.g. "1.7"). The
  // unlock list stores lesson_keys (e.g. "u1-l7" or "1.7"); use a loose
  // match that handles both. (Spec leaves the key format open; the
  // Desk and POST /teacher/lesson-unlock must agree -- BUILD freezes
  // the format as the topic string verbatim, see Section 3.6.)
  var unlocks = _readLessonUnlocks();
  return unlocks.indexOf(topic) >= 0;
}
```

### 3.2 Extend `_isLessonUnlocked`

```js
function _isLessonUnlocked(topic, lessonDate, prevTopic, today, marks, signedIn) {
  try {
    if (!signedIn) return true;
    if (_deskIsTeacher()) return true;
    // P5: teacher-applied override (typeof-guarded so existing vm-based
    // tests don't need to inject _isTopicLessonUnlocked).
    if (typeof _isTopicLessonUnlocked === 'function' && _isTopicLessonUnlocked(topic)) return true;
    if (!prevTopic) return true;
    if (lessonDate && today && lessonDate.getTime() <= today.getTime()) return true;
    return _isLessonComplete(prevTopic, marks);
  } catch (_) { return true; }
}
```

### 3.3 Fetch unlock list at sign-in / on view-as bootstrap

Add to the bootstrap path (probably after `_mountClassroomBoard` -- search
for where the Desk runs at sign-in success):

```js
async function _refreshLessonUnlocks() {
  try {
    var base = window.ROSTER_SERVICE_URL;
    if (!base) return;
    var ctx = (typeof _viewAsContext === 'function') ? _viewAsContext() : null;
    if (ctx) {
      // View-as: fetch the TARGET student's unlocks via the teacher endpoint.
      var teacherToken = (window.rosterClient && window.rosterClient.token) ? window.rosterClient.token() : null;
      if (!teacherToken) return;
      var res = await fetch(base + '/teacher/student/' + encodeURIComponent(ctx.studentId) + '/lesson-unlocks', {
        headers: { 'Authorization': 'Bearer ' + teacherToken },
      });
      if (!res.ok) return;
      var data = await res.json();
      if (data && data.ok) {
        try { sessionStorage.setItem('apstats_view_as_lesson_unlocks', JSON.stringify(data.lessonKeys || [])); } catch (_) {}
      }
      return;
    }
    // Normal mode: fetch own unlocks.
    var studentToken = (window.rosterClient && window.rosterClient.token) ? window.rosterClient.token() : null;
    if (!studentToken) return;
    var r2 = await fetch(base + '/student/lesson-unlocks', {
      headers: { 'Authorization': 'Bearer ' + studentToken },
    });
    if (!r2.ok) return;
    var d2 = await r2.json();
    if (d2 && d2.ok) {
      try { localStorage.setItem('apstats_lesson_unlocks', JSON.stringify(d2.lessonKeys || [])); } catch (_) {}
    }
  } catch (_) {}
}
```

Call this on sign-in success + on view-as bootstrap reload-completion.

### 3.4 View-as banner: "Override gate" button

In the view-as banner DOM (the `<div id="view-as-banner">` from P2):
add a NEW button between the readonly badge + Exit:

```html
<button type="button" class="vab-override" id="view-as-override-gate" aria-label="Override gate">Override gate</button>
```

The button is always present but only ENABLES + fires when the teacher
clicks a locked lesson cell (banner button = entry point for the modal).
Simpler MVP: always-enabled; click opens a modal that asks WHICH lesson
to unlock (input field) + reason.

CSS:
```css
#view-as-banner .vab-override {
  background: #fef3c7; color: #92400e; border: 1px solid #fff;
  padding: 3px 12px; border-radius: 3px;
  font: inherit; font-weight: 700; cursor: pointer;
}
#view-as-banner .vab-override:hover { background: #fed7aa; }
```

### 3.5 Override modal

```html
<div id="override-gate-modal" style="display:none">
  <div class="ogm-backdrop"></div>
  <div class="ogm-panel" role="dialog" aria-labelledby="ogm-title">
    <h3 id="ogm-title">Override lesson gate</h3>
    <p>Unlock a lesson for <strong id="ogm-student-name">Student</strong>.
       The override is sticky -- it applies on their next page load.</p>
    <label for="ogm-lesson-key">Lesson (e.g. "1.7"):</label>
    <input type="text" id="ogm-lesson-key" maxlength="20">
    <label for="ogm-reason">Reason (optional, 500 chars):</label>
    <textarea id="ogm-reason" maxlength="500" rows="3"></textarea>
    <div class="ogm-status" id="ogm-status"></div>
    <div class="ogm-actions">
      <button type="button" class="ogm-cancel" id="ogm-cancel">Cancel</button>
      <button type="button" class="ogm-confirm" id="ogm-confirm">Override</button>
    </div>
  </div>
</div>
```

CSS uses the existing System 7 / orange-banner aesthetic.

JS:
```js
function _showOverrideGateModal(prefillTopic) {
  var modal = document.getElementById('override-gate-modal');
  if (!modal) return;
  var ctx = _viewAsContext();
  if (!ctx) return;
  document.getElementById('ogm-student-name').textContent = ctx.realName || ctx.username || 'Student';
  document.getElementById('ogm-lesson-key').value = prefillTopic || '';
  document.getElementById('ogm-reason').value = '';
  document.getElementById('ogm-status').textContent = '';
  modal.style.display = 'block';
}

function _hideOverrideGateModal() {
  var modal = document.getElementById('override-gate-modal');
  if (modal) modal.style.display = 'none';
}

async function _confirmOverrideGate() {
  var ctx = _viewAsContext();
  if (!ctx) { _hideOverrideGateModal(); return; }
  var lessonKey = String(document.getElementById('ogm-lesson-key').value || '').trim();
  var reason = String(document.getElementById('ogm-reason').value || '').trim().slice(0, 500);
  var status = document.getElementById('ogm-status');
  if (!lessonKey) { if (status) status.textContent = 'Enter a lesson key.'; return; }
  var btn = document.getElementById('ogm-confirm');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Posting...';
  try {
    var base = window.ROSTER_SERVICE_URL;
    var token = (window.rosterClient && window.rosterClient.token) ? window.rosterClient.token() : null;
    if (!base || !token) { if (status) status.textContent = 'Not signed in.'; if (btn) btn.disabled = false; return; }
    var resp = await fetch(base + '/teacher/lesson-unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        studentUsername: ctx.username,
        lessonKey: lessonKey,
        reason: reason,
      }),
    });
    var data = null; try { data = await resp.json(); } catch (_) {}
    if (resp.ok && data && data.ok) {
      if (status) status.textContent = 'Override saved. Refresh to see the effect.';
      // Optimistically add to the in-tab cache so a refresh isn't needed.
      try {
        var raw = sessionStorage.getItem('apstats_view_as_lesson_unlocks') || '[]';
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.indexOf(lessonKey) < 0) {
          arr.push(lessonKey);
          sessionStorage.setItem('apstats_view_as_lesson_unlocks', JSON.stringify(arr));
        }
      } catch (_) {}
      setTimeout(_hideOverrideGateModal, 1500);
    } else {
      if (status) status.textContent = 'Error: ' + ((data && data.error) || resp.status);
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    if (status) status.textContent = 'Network error.';
    if (btn) btn.disabled = false;
  }
}
```

Wire on DOMContentLoaded (alongside view-as banner wires):
```js
var ovrBtn = document.getElementById('view-as-override-gate');
if (ovrBtn) ovrBtn.addEventListener('click', function () { _showOverrideGateModal(''); });
var ovrCancel = document.getElementById('ogm-cancel');
if (ovrCancel) ovrCancel.addEventListener('click', _hideOverrideGateModal);
var ovrConfirm = document.getElementById('ogm-confirm');
if (ovrConfirm) ovrConfirm.addEventListener('click', _confirmOverrideGate);
```

### 3.6 Lesson key format

The unlock list stores the topic string as the calendar uses it -- e.g.
`"1.7"`, `"5.3"`. NO normalization (no `u1-l7` translation). The Desk
calls `_isTopicLessonUnlocked(topic)` with the topic string from the
calendar; the modal accepts the topic string verbatim. Roster-server
stores it verbatim. Future format changes need to coordinate both ends.

### 3.7 Fetch on sign-in trigger

Find where the Desk runs at startup after sign-in (probably right after
`renderDoNow()` or in `_mountClassroomBoard()`). Add:

```js
if (typeof _refreshLessonUnlocks === 'function') {
  _refreshLessonUnlocks().catch(function() {});
}
```

For view-as: the bootstrap IIFE reloads after hydration. On the reload,
sessionStorage has viewAsContext + the unlock fetch fires for the
TARGET student. So calling `_refreshLessonUnlocks` from the normal
startup path covers both cases.

### 3.8 Tests `tests/desk-lesson-unlock.test.js`

Mirror `desk-view-as.test.js` fnBody + mockStorage pattern.

Required test cases (~15):

**describe('view-as override structure')**
- view-as banner has #view-as-override-gate button
- override modal markup is present, hidden by default
- modal has all required IDs: lesson-key input, reason textarea, status, cancel, confirm
- CSS rules for the modal + button

**describe('_readLessonUnlocks')**
- Returns [] when localStorage empty
- Returns parsed array when localStorage has JSON
- Returns [] on malformed JSON
- In view-as mode reads sessionStorage instead of localStorage
- View-as mode falls back to [] when sessionStorage empty

**describe('_isTopicLessonUnlocked')**
- True when topic in cache
- False when topic absent
- False when cache empty

**describe('_isLessonUnlocked extension')**
- Returns true when topic is in unlock cache (override path)
- Existing behavior still works (signed-in non-teacher, prev complete -> unlocked)

**describe('_showOverrideGateModal / _confirmOverrideGate')**
- Show: prefills lesson-key + clears reason
- Confirm: no-op without lesson key
- Confirm: POSTs to /teacher/lesson-unlock with derived studentUsername
- Confirm: optimistically updates sessionStorage cache
- Confirm: shows error status on non-ok response

Target: ~15 tests.

## 4. Smoke checks (planner-run after Codex fold)

1. `cd roster-server && npm test` -- ~16 new tests; baseline 532/532.
2. `npm test` from root -- ~15 new tests; baseline 5104/5105.
3. Manual smoke (after Railway redeploy + migration 0009 user-run):
   - Teacher opens dashboard, clicks View as for a student.
   - In the impersonated Desk, sees the view-as banner with an "Override gate" button.
   - Click Override gate -> modal opens. Enter "1.7" + reason "for the slow track" -> Confirm.
   - Status says "Override saved". Modal closes.
   - The student's lesson 1.7 is now in `lesson_unlock` table (`SELECT * FROM lesson_unlock`).
   - Open the student's actual Desk in another browser (sign in as that student) -> the gate for 1.7 is bypassed.

## 5. Dispatch

- Wave 5A: Sonnet, background, roster-server.
- Wave 5B: Planner-direct, Desk file.

After both: Codex review (read-only, cross-cutting check on auth + cache invalidation).

## 6. What is explicitly OUT of P5

- Revocation UI (status='revoked' is in the schema for future use; no
  UI in P5).
- Override expiry / scheduled re-lock.
- Bulk-unlock for a section.
- Unlock notification to the student (the unlock takes effect on next
  Desk reload without any notification).
- Audit log view in cockpit (the lesson_unlock rows persist; no UI to
  browse them in P5).
- Override gate from outside View-as (always launched from inside the
  impersonated Desk's view-as banner).

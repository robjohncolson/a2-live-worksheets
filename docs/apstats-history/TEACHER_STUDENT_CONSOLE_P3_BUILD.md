# Teacher -> Student Console -- Phase 3 BUILD Contract

> FROZEN, session 112, 2026-05-24. Implements `TEACHER_STUDENT_CONSOLE_SPEC.md`
> Section 6 (Nudges) + Section 13 row P3.
>
> Scope: free-text bidirectional messaging. Teacher in cockpit picks an
> online student from a dropdown + types a message + Send. Student's
> Desk shows a toast with a Reply textarea + Send button. Replies route
> back to the cockpit. All exchanges log to `nudges_log` in Supabase
> (migration `0008_nudges_log.sql`, user-run).
>
> ## P3 scope cut from spec
> Spec Section 4.1 calls for a **floating popup** next to the clicked
> avatar with SIX action buttons (View as / View grade / Send nudge /
> View recent / Apply remediation / Override gate). P3 ships JUST the
> nudge action, via a **section-level "Send nudge" panel in the cockpit**
> (dropdown of online students + text field + Send). The avatar-click
> popup with the full 6-action wrapper is deferred to a later phase
> that bundles the remaining console actions (View as is already wired
> from the `/class/grades` drawer in P2 -- the popup is convenience).
> RATIONALE: avatar hit-testing requires modifying `classroom-board.js`
> in cr (source of truth) + re-copying to follow-alongs -- significant
> shared-file coordination that adds scope without adding new feature.
> Dropdown is a clean P3 MVP; popup wraps later phases.
>
> NO `curriculum_render/data/curriculum.js` change (sacred).
> ONE user-run migration: `0008_nudges_log.sql`.

## 1. File ownership (3 disjoint waves)

| Unit | Files                                                                                                                  | Touched by      |
|------|------------------------------------------------------------------------------------------------------------------------|-----------------|
| 3A   | `curriculum_render/railway-server/classroom.js` (2 new methods), `curriculum_render/railway-server/server.js` (2 switch cases), `curriculum_render/railway-server/tests/classroom.test.js` (~12 new tests) | Sonnet (cr repo) |
| 3B   | `roster-server/nudge.js` (NEW), `roster-server/nudge-db.js` (NEW), `roster-server/server.js` (1 import + 1 mount call), `roster-server/migrations/0008_nudges_log.sql` (NEW), `roster-server/tests/nudge-endpoints.test.js` (NEW, ~15 tests) | Sonnet (follow-alongs) |
| 3C   | `ap_stats_roadmap_square_mode.html` (Desk toast component + chime + reply field), `teacher-classroom.html` (cockpit nudge panel + reply toast), `tests/desk-nudge-toast.test.js` (NEW, ~15 tests), `tests/cockpit-nudge-panel.test.js` (NEW, ~12 tests) | Planner-direct  |

Waves can run in parallel (disjoint files). 3A is in a separate repo
from 3B + 3C. 3B + 3C are disjoint within follow-alongs.

## 2. Wave 3A -- curriculum_render WS handlers

### 2.1 New method: `teacherNudge`

In `curriculum_render/railway-server/classroom.js`, add as a sibling to
`openDoorways` / `setLive` / `position`:

```js
function teacherNudge(ws, nudgeId, recipientUsernames, text, now) {
  // Resolve sender's section + role from socket.
  var entry = _wsEntry(ws);
  if (!entry) return { broadcasts: [], sends: [] };
  var room = rooms[entry.section];
  if (!room) return { broadcasts: [], sends: [] };
  var sender = room.members[entry.username];
  if (!sender || sender.role !== 'teacher') return { broadcasts: [], sends: [] };
  if (!Array.isArray(recipientUsernames) || recipientUsernames.length === 0) return { broadcasts: [], sends: [] };
  if (typeof text !== 'string' || text.trim().length === 0) return { broadcasts: [], sends: [] };
  if (text.length > 280) text = text.slice(0, 280);

  // For each requested recipient, look up online socket(s) in the same section.
  var deliveredUsernames = [];
  var broadcasts = [];
  for (var i = 0; i < recipientUsernames.length; i++) {
    var ru = recipientUsernames[i];
    var sockets = findSocketByUsername(entry.section, ru);
    if (!sockets || sockets.length === 0) continue;  // offline -> dropped
    deliveredUsernames.push(ru);
    broadcasts.push({
      sockets: sockets,
      payload: {
        type: 'classroom_teacher_nudge',
        nudgeId: nudgeId,
        text: text,
        fromUsername: entry.username,
        ts: now,
      },
    });
  }

  // Send ack back to teacher with the delivery breakdown.
  var sends = [{
    ws: ws,
    payload: {
      type: 'classroom_teacher_nudge_ack',
      nudgeId: nudgeId,
      delivered: deliveredUsernames,
      offline: recipientUsernames.filter(function(u) { return deliveredUsernames.indexOf(u) < 0; }),
      ts: now,
    },
  }];

  _fanoutToMonitors(broadcasts);
  return { broadcasts: broadcasts, sends: sends };
}
```

### 2.2 New method: `studentNudgeReply`

```js
function studentNudgeReply(ws, nudgeId, text, now) {
  var entry = _wsEntry(ws);
  if (!entry) return { broadcasts: [] };
  var room = rooms[entry.section];
  if (!room) return { broadcasts: [] };
  var sender = room.members[entry.username];
  if (!sender || sender.role !== 'student') return { broadcasts: [] };
  if (typeof text !== 'string' || text.trim().length === 0) return { broadcasts: [] };
  if (text.length > 280) text = text.slice(0, 280);

  // Find all teacher sockets in the same section.
  var teacherSockets = [];
  Object.keys(room.members).forEach(function(uname) {
    var m = room.members[uname];
    if (m.role === 'teacher' && m.ws && m.ws.readyState === 1) teacherSockets.push(m.ws);
  });
  if (teacherSockets.length === 0) return { broadcasts: [] };

  var broadcasts = [{
    sockets: teacherSockets,
    payload: {
      type: 'classroom_student_nudge_reply',
      nudgeId: nudgeId,
      fromUsername: entry.username,
      text: text,
      ts: now,
    },
  }];
  _fanoutToMonitors(broadcasts);
  return { broadcasts: broadcasts };
}
```

### 2.3 Export both methods

Add to the registry's return object alongside `armGate`, `openDoorways`, etc.

### 2.4 server.js routing

Add two cases in the WS switch:

```js
case 'classroom_teacher_nudge': {
  var nudgeId = (typeof data.nudgeId === 'string') ? data.nudgeId : '';
  var recipientUsernames = Array.isArray(data.recipientUsernames) ? data.recipientUsernames : [];
  var text = (typeof data.text === 'string') ? data.text : '';
  var tnResult = classroomRegistry.teacherNudge(ws, nudgeId, recipientUsernames, text, Date.now());
  if (tnResult.sends) {
    tnResult.sends.forEach(function(s) {
      if (s.ws.readyState === 1) {
        try { s.ws.send(JSON.stringify(s.payload)); } catch (e) {}
      }
    });
  }
  // teacher_nudge broadcasts go to specific student sockets, not the whole room.
  if (tnResult.broadcasts && tnResult.broadcasts.length > 0) {
    tnResult.broadcasts.forEach(function(bc) {
      var msg = JSON.stringify(bc.payload);
      bc.sockets.forEach(function(sock) {
        if (sock.readyState === 1) {
          try { sock.send(msg); } catch (e) {}
        }
      });
    });
  }
  break;
}

case 'classroom_student_nudge_reply': {
  var nudgeId = (typeof data.nudgeId === 'string') ? data.nudgeId : '';
  var text = (typeof data.text === 'string') ? data.text : '';
  var srResult = classroomRegistry.studentNudgeReply(ws, nudgeId, text, Date.now());
  if (srResult.broadcasts && srResult.broadcasts.length > 0) {
    srResult.broadcasts.forEach(function(bc) {
      var msg = JSON.stringify(bc.payload);
      bc.sockets.forEach(function(sock) {
        if (sock.readyState === 1) {
          try { sock.send(msg); } catch (e) {}
        }
      });
    });
  }
  break;
}
```

(NOT `broadcastToClassroom` -- those broadcast to ALL sockets in section.
Nudges go to SPECIFIC sockets only.)

### 2.5 Tests (classroom.test.js)

Append to existing file. Mirror the existing test harness (recon §D).

**describe('teacherNudge')**
- Returns empty broadcasts when sender is not a teacher (silent no-op)
- Returns empty broadcasts when no recipient names provided
- Returns empty broadcasts when text is empty / blank-only
- Truncates text to 280 chars when longer
- Online recipient receives `classroom_teacher_nudge` with nudgeId + text + fromUsername + ts
- Offline recipient (no socket in section) is silently dropped (not in delivered list)
- Mixed online + offline recipients: only online appear in delivered, others in offline
- Ack back to teacher carries delivered + offline arrays + nudgeId
- Recipients in OTHER section are NOT delivered (section isolation)
- _fanoutToMonitors hook called so cockpit monitor sees the nudge

**describe('studentNudgeReply')**
- Returns empty broadcasts when sender is not a student (silent no-op)
- Returns empty broadcasts when text is empty
- Truncates text to 280 chars
- Reply payload reaches all teacher sockets in section
- Reply payload does NOT reach other students (only teachers)
- Reply payload includes nudgeId + fromUsername + text + ts
- No teachers online -> empty broadcasts (no error)
- Replies in OTHER section don't bleed (section isolation)

Total: ~18 tests.

## 3. Wave 3B -- roster-server endpoints + migration

### 3.1 Migration `0008_nudges_log.sql`

```sql
-- 0008_nudges_log.sql -- nudges_log persistence (Phase 3 of
-- TEACHER_STUDENT_CONSOLE_SPEC.md). One row per teacher -> student
-- nudge AND per student -> teacher reply. Idempotent.

create table if not exists nudges_log (
  id                 bigserial primary key,
  nudge_id           text not null,
  parent_nudge_id    text,
  sender_username    text not null,
  recipient_username text not null,
  text               text not null check (char_length(text) <= 280),
  direction          text not null check (direction in ('teacher', 'student')),
  section            text,
  created_at         timestamptz not null default now(),
  delivered_at       timestamptz
);

create index if not exists nudges_log_nudge_id_idx on nudges_log (nudge_id);
create index if not exists nudges_log_recipient_section_idx on nudges_log (recipient_username, section, created_at desc);
create index if not exists nudges_log_sender_section_idx on nudges_log (sender_username, section, created_at desc);
create index if not exists nudges_log_parent_idx on nudges_log (parent_nudge_id) where parent_nudge_id is not null;

alter table nudges_log enable row level security;
-- Intentionally NO policies. Service-role only (mirrors 0007 + 0004 pattern).
```

### 3.2 `roster-server/nudge-db.js`

Mirror `remediation-db.js` shape:

```js
// nudge-db.js -- Supabase DAL for the nudges_log table (Phase 3 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Pure CRUD; no business rules.

import { createClient } from '@supabase/supabase-js';

export function createNudgesDb(client) {
  return {
    insertNudges,        // batch insert (one row per recipient)
    insertReply,         // single reply row
    listForTeacher,      // teacher viewing their sent nudges
    listForStudent,      // student viewing nudges they received
    markDelivered,       // update delivered_at for a (nudge_id, recipient) pair
  };

  async function insertNudges({ nudgeId, senderUsername, recipientUsernames, text, section, deliveredUsernames }) {
    var deliveredSet = new Set(deliveredUsernames || []);
    var nowIso = new Date().toISOString();
    var rows = recipientUsernames.map(function(ru) {
      return {
        nudge_id: nudgeId,
        sender_username: senderUsername,
        recipient_username: ru,
        text: text,
        direction: 'teacher',
        section: section,
        created_at: nowIso,
        delivered_at: deliveredSet.has(ru) ? nowIso : null,
      };
    });
    return client.from('nudges_log').insert(rows).select('*');
  }

  async function insertReply({ parentNudgeId, senderUsername, recipientUsername, text, section }) {
    var nowIso = new Date().toISOString();
    return client.from('nudges_log').insert({
      nudge_id: parentNudgeId + ':reply:' + Date.now(),
      parent_nudge_id: parentNudgeId,
      sender_username: senderUsername,
      recipient_username: recipientUsername,
      text: text,
      direction: 'student',
      section: section,
      created_at: nowIso,
      delivered_at: nowIso,  // student replies are sent live; delivery confirmed if teacher online
    }).select('*').single();
  }

  async function listForTeacher({ senderUsername, section, limit = 50 }) {
    return client
      .from('nudges_log')
      .select('*')
      .eq('sender_username', senderUsername)
      .eq('section', section)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  async function listForStudent({ recipientUsername, limit = 50 }) {
    return client
      .from('nudges_log')
      .select('*')
      .eq('recipient_username', recipientUsername)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  async function markDelivered({ nudgeId, recipientUsername }) {
    return client
      .from('nudges_log')
      .update({ delivered_at: new Date().toISOString() })
      .eq('nudge_id', nudgeId)
      .eq('recipient_username', recipientUsername)
      .select('*')
      .single();
  }
}

export function createLiveNudgesDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  var client = createClient(url, key);
  return createNudgesDb(client);
}
```

### 3.3 `roster-server/nudge.js`

Mirror `teacher.js` mount-function pattern:

```js
// nudge.js -- mounts nudge log endpoints (Phase 3 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). The endpoints are WRITE-LOG only;
// live delivery rides the cr classroom WS (see classroom.js teacherNudge).
//
//   POST /teacher/nudge       -> write log rows for one or many recipients
//   POST /student/nudge-reply -> write a single reply row
//
// 42P01 (table missing) degrades to 503 so the service stays up until
// the user runs migrations/0008_nudges_log.sql in Supabase.

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';

export function mountNudge(app, { db, nudgesDb }) {
  if (!nudgesDb) return;

  // POST /teacher/nudge { nudgeId, recipientUsernames, text, section, deliveredUsernames }
  app.post('/teacher/nudge', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    var body = req.body || {};
    var nudgeId = (typeof body.nudgeId === 'string') ? body.nudgeId.trim() : '';
    var recipientUsernames = Array.isArray(body.recipientUsernames) ? body.recipientUsernames.filter(function(u) { return typeof u === 'string' && u.length > 0; }) : [];
    var text = (typeof body.text === 'string') ? body.text : '';
    var section = (typeof body.section === 'string') ? body.section.trim() : null;
    var deliveredUsernames = Array.isArray(body.deliveredUsernames) ? body.deliveredUsernames : [];
    var senderUsername = (typeof body.senderUsername === 'string') ? body.senderUsername.trim() : '';

    if (!nudgeId || recipientUsernames.length === 0 || !text.trim() || !senderUsername) {
      return res.status(400).json({ ok: false, error: 'nudgeId, recipientUsernames, text, senderUsername required' });
    }
    if (text.length > 280) text = text.slice(0, 280);

    try {
      var { data, error } = await nudgesDb.insertNudges({
        nudgeId, senderUsername, recipientUsernames, text, section, deliveredUsernames,
      });
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
        console.error('POST /teacher/nudge insert error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, nudgeId: nudgeId, rows: data || [] });
    } catch (err) {
      console.error('POST /teacher/nudge throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // POST /student/nudge-reply { parentNudgeId, recipientUsername, text, section }
  // Auth: student token (resolves to senderUsername via roster lookup).
  app.post('/student/nudge-reply', async (req, res) => {
    // Verify token + resolve to student_id.
    var authHeader = req.headers['authorization'] || '';
    var token = authHeader.replace(/^Bearer\s+/i, '').trim();
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
    var senderUsername = roster.login_username;
    var section = roster.section;

    var body = req.body || {};
    var parentNudgeId = (typeof body.parentNudgeId === 'string') ? body.parentNudgeId.trim() : '';
    var recipientUsername = (typeof body.recipientUsername === 'string') ? body.recipientUsername.trim() : '';
    var text = (typeof body.text === 'string') ? body.text : '';
    if (!parentNudgeId || !recipientUsername || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'parentNudgeId, recipientUsername, text required' });
    }
    if (text.length > 280) text = text.slice(0, 280);

    try {
      var { data, error } = await nudgesDb.insertReply({
        parentNudgeId, senderUsername, recipientUsername, text, section,
      });
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
        console.error('POST /student/nudge-reply insert error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, row: data });
    } catch (err) {
      console.error('POST /student/nudge-reply throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });
}
```

### 3.4 server.js wiring

```js
// Imports section (after the mountTeacherStudent import):
import { mountNudge } from './nudge.js';
import { createLiveNudgesDb } from './nudge-db.js';

// In createApp signature: add nudgesDb parameter (defaults to live or null).
// In createApp body, after existing mounts:
const nudgesDb = (typeof nudgesDbOverride !== 'undefined') ? nudgesDbOverride : createLiveNudgesDb();
if (nudgesDb && db) {
  mountNudge(app, { db, nudgesDb });
}
```

(Inspect server.js's createApp signature for the right placement; add as the LAST parameter to preserve positional-arg compatibility with existing tests.)

### 3.5 Tests `roster-server/tests/nudge-endpoints.test.js`

Vitest + http + TestServer, mirroring `teacher-endpoints.test.js` harness.

Fake nudgesDb:
```js
function createFakeNudgesDb({ failWith42P01 = false } = {}) {
  var inserted = [];
  var replies = [];
  return {
    _inserted: inserted,
    _replies: replies,
    async insertNudges(args) {
      if (failWith42P01) return { data: null, error: { code: '42P01', message: 'table missing' } };
      var rows = args.recipientUsernames.map(function(ru) {
        return { ...args, recipient_username: ru, id: inserted.length + 1 };
      });
      inserted.push.apply(inserted, rows);
      return { data: rows, error: null };
    },
    async insertReply(args) {
      if (failWith42P01) return { data: null, error: { code: '42P01' } };
      var row = { ...args, id: replies.length + 1 };
      replies.push(row);
      return { data: row, error: null };
    },
    async listForTeacher() { return { data: inserted, error: null }; },
    async listForStudent() { return { data: inserted, error: null }; },
    async markDelivered() { return { data: {}, error: null }; },
  };
}
```

**describe('POST /teacher/nudge')**
- 401 without teacher auth
- 200 with valid teacher secret + body -> one row per recipient
- 400 when nudgeId / recipientUsernames / text missing
- 400 when text empty / whitespace-only
- text > 280 chars is truncated
- 200 with deliveredUsernames marks delivered_at, others stay NULL
- 503 when nudgesDb returns 42P01
- 500 on other db error
- 200 with token-auth (Bearer teacher token)

**describe('POST /student/nudge-reply')**
- 401 without token
- 401 with malformed token
- 401 when token resolves to unknown student
- 400 when parentNudgeId / recipientUsername / text missing
- text > 280 chars truncated
- 200 inserts a reply row with parent_nudge_id set + direction='student'
- 503 when nudgesDb returns 42P01

Total: ~15 tests.

## 4. Wave 3C -- Desk toast + cockpit panel (planner-direct)

### 4.1 Desk toast component (ap_stats_roadmap_square_mode.html)

**DOM insertion** -- right after the view-as banner (Section 3.5 of P2 BUILD):
```html
<!-- Teacher -> Student Console: nudge toast (P3 of TEACHER_STUDENT_CONSOLE_SPEC.md).
     Hidden until a classroom_teacher_nudge WS message arrives. -->
<div id="nudge-toast" style="display:none" aria-live="polite">
  <div class="nt-header">
    <span class="nt-from-label">From</span>
    <strong class="nt-from-name" id="nudge-toast-from">Mr. Colson</strong>
    <button type="button" class="nt-close" id="nudge-toast-close" aria-label="Dismiss">&times;</button>
  </div>
  <p class="nt-text" id="nudge-toast-text"></p>
  <div class="nt-reply">
    <textarea id="nudge-toast-reply" maxlength="280" rows="2" placeholder="Reply (optional, 280 chars max)..."></textarea>
    <button type="button" class="nt-send" id="nudge-toast-send">Send</button>
  </div>
</div>
```

**CSS** -- in the existing style block:
```css
#nudge-toast {
  position: fixed; top: 60px; right: 18px; z-index: 9500;
  width: 320px; max-width: 88vw;
  background: #fffbe6; color: #2a2520;
  border: 1px solid #d97706; border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.22);
  padding: 12px 14px;
  font: 13px "Geneva", system-ui, sans-serif;
}
#nudge-toast .nt-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
#nudge-toast .nt-from-label { color: #92400e; font-weight: 700; letter-spacing: 0.08em; font-size: 10px; }
#nudge-toast .nt-from-name { color: #92400e; }
#nudge-toast .nt-close { margin-left: auto; background: transparent; border: 0; font-size: 18px; cursor: pointer; color: #92400e; }
#nudge-toast .nt-text { margin: 4px 0 8px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; }
#nudge-toast .nt-reply { display: flex; gap: 6px; }
#nudge-toast .nt-reply textarea {
  flex: 1; resize: vertical; min-height: 36px; max-height: 80px;
  border: 1px solid #d97706; border-radius: 4px; padding: 6px;
  font: inherit; box-sizing: border-box;
}
#nudge-toast .nt-send {
  padding: 6px 10px; background: #d97706; color: #fff;
  border: 0; border-radius: 4px; cursor: pointer; font: inherit; font-weight: 700;
}
#nudge-toast .nt-send:hover { background: #92400e; }
#nudge-toast .nt-send:disabled { background: #e5d3a8; cursor: not-allowed; }
```

**JS** -- add near the view-as helpers (after `_renderViewAsBanner`):

```js
// Soft chime on nudge delivery. Single short tone via Web Audio API (no
// audio file needed). Replicates the TI-84 keystroke beep at low volume.
function _playNudgeChime() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (_) { /* audio disabled or context unavailable -> silent */ }
}

// Active nudge state (single nudge at a time in P3; future P3.1 may stack).
var _activeNudge = null;

function _showNudgeToast(payload) {
  // payload: { nudgeId, text, fromUsername, ts }
  var toast = document.getElementById('nudge-toast');
  if (!toast) return;
  _activeNudge = { nudgeId: payload.nudgeId, fromUsername: payload.fromUsername };
  document.getElementById('nudge-toast-from').textContent = payload.fromUsername || 'Teacher';
  document.getElementById('nudge-toast-text').textContent = payload.text || '';
  document.getElementById('nudge-toast-reply').value = '';
  var sendBtn = document.getElementById('nudge-toast-send');
  if (sendBtn) sendBtn.disabled = false;
  toast.style.display = 'block';
  _playNudgeChime();
}

function _hideNudgeToast() {
  var toast = document.getElementById('nudge-toast');
  if (!toast) return;
  toast.style.display = 'none';
  _activeNudge = null;
}

async function _sendNudgeReply() {
  if (!_activeNudge) return;
  var textEl = document.getElementById('nudge-toast-reply');
  var text = textEl ? textEl.value.trim().slice(0, 280) : '';
  if (!text) return;
  var sendBtn = document.getElementById('nudge-toast-send');
  if (sendBtn) sendBtn.disabled = true;
  // 1) Send over classroom WS for live delivery.
  try {
    if (window._classroomBoardHandle && window._classroomBoardHandle.sendMessage) {
      window._classroomBoardHandle.sendMessage({
        type: 'classroom_student_nudge_reply',
        nudgeId: _activeNudge.nudgeId,
        text: text,
      });
    }
  } catch (_) {}
  // 2) POST to roster-server for log persistence.
  try {
    var base = window.ROSTER_SERVICE_URL;
    var token = (window.rosterClient && window.rosterClient.token) ? window.rosterClient.token() : null;
    if (base && token) {
      await fetch(base + '/student/nudge-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          parentNudgeId: _activeNudge.nudgeId,
          recipientUsername: _activeNudge.fromUsername,
          text: text,
        }),
      });
    }
  } catch (_) {}
  _hideNudgeToast();
}

// Wire close + send buttons on DOMContentLoaded.
document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.getElementById('nudge-toast-close');
  if (closeBtn) closeBtn.addEventListener('click', _hideNudgeToast);
  var sendBtn = document.getElementById('nudge-toast-send');
  if (sendBtn) sendBtn.addEventListener('click', _sendNudgeReply);
});
```

**WS subscription** -- the Desk mounts ClassroomBoard at line ~10755. Extend the `onStateChange` callback OR add an `onClassroomMessage` callback that receives RAW messages. Since `_reduce` is the reducer and nudges don't go INTO state, we need a separate event subscription.

For P3, add a NEW callback option to `ClassroomBoard.mount`: `onClassroomMessage(msg)` that fires for EVERY raw incoming message before `_reduce`. The Desk's mount call adds:
```js
onClassroomMessage: function(msg) {
  if (msg && msg.type === 'classroom_teacher_nudge') {
    _showNudgeToast(msg);
  }
}
```

Adding `onClassroomMessage` to classroom-board.js is a small additive change. It needs to be made in cr (source of truth) AND copied to follow-alongs.

**Avoid the shared-file requirement**: instead of modifying classroom-board.js, monkey-patch the WS at the Desk level. Expose `_classroomBoardHandle.ws` (the underlying WebSocket) and add a `message` listener in the Desk that filters for nudge messages. But this requires classroom-board.js to expose `ws` -- still a shared-file change.

**Decision**: extend `ClassroomBoard.mount` with an `onClassroomMessage` callback. Make the change in BOTH repos (cr is source of truth, follow-alongs gets the copy). Coordinate via the BUILD; both wave 3A AND wave 3C touch the relevant lines.

Actually -- to keep waves cleanly disjoint -- bundle the classroom-board.js change into Wave 3C (planner-direct). Wave 3A doesn't need to touch classroom-board.js (it just adds server-side WS handlers). The cr copy of classroom-board.js gets edited along with the follow-alongs copy, both by the planner.

### 4.2 Cockpit nudge panel (teacher-classroom.html)

**DOM insertion** -- add a new section after the existing doorways/poll panels:
```html
<section class="ctrl-panel" id="nudge-panel">
  <h3>Send Nudge</h3>
  <label for="nudge-recipient">Student:</label>
  <select id="nudge-recipient" disabled>
    <option value="">(no students online)</option>
  </select>
  <label for="nudge-text">Message (280 chars max):</label>
  <textarea id="nudge-text" maxlength="280" rows="3" placeholder="Type your nudge..."></textarea>
  <button type="button" id="btn-send-nudge" disabled>Send Nudge</button>
  <div id="nudge-status" class="nudge-status"></div>
  <div id="nudge-replies-list" class="nudge-replies"></div>
</section>
```

**CSS** -- match existing cockpit aesthetic (cream/brown System-7-ish).

**JS** -- in the inline `<script>` after the existing onStateChange callback:

```js
// Cockpit nudge panel (P3 of TEACHER_STUDENT_CONSOLE_SPEC.md).
// Populate dropdown from onStateChange.members (online students).
// Send: WS classroom_teacher_nudge + POST /teacher/nudge to roster-server.
// Listen for classroom_student_nudge_reply via the board's
// onClassroomMessage callback.

var _nudgeIdSeq = 0;
function _newNudgeId() {
  _nudgeIdSeq += 1;
  return 'nudge_' + Date.now() + '_' + _nudgeIdSeq;
}

function _refreshNudgeRecipients(summary) {
  var sel = document.getElementById('nudge-recipient');
  if (!sel) return;
  var students = ((summary && summary.members) || {});
  var onlineStudents = Object.keys(students).filter(function(u) {
    var m = students[u];
    return m && m.role === 'student' && m.online !== false;
  });
  var prev = sel.value;
  sel.innerHTML = '';
  if (onlineStudents.length === 0) {
    var opt = document.createElement('option');
    opt.value = ''; opt.textContent = '(no students online)';
    sel.appendChild(opt);
    sel.disabled = true;
  } else {
    onlineStudents.sort();
    onlineStudents.forEach(function(u) {
      var opt = document.createElement('option');
      opt.value = u;
      opt.textContent = (currentNameMap[u] || u) + ' (@' + u + ')';
      sel.appendChild(opt);
    });
    sel.disabled = false;
    if (onlineStudents.indexOf(prev) >= 0) sel.value = prev;
  }
  // Send button enabled when both a recipient AND text are present.
  _updateNudgeSendButton();
}

function _updateNudgeSendButton() {
  var sel = document.getElementById('nudge-recipient');
  var text = document.getElementById('nudge-text');
  var btn = document.getElementById('btn-send-nudge');
  if (!sel || !text || !btn) return;
  btn.disabled = !sel.value || !text.value.trim();
}

async function _sendNudgeFromCockpit() {
  var sel = document.getElementById('nudge-recipient');
  var textEl = document.getElementById('nudge-text');
  var status = document.getElementById('nudge-status');
  if (!sel || !textEl) return;
  var recipient = sel.value;
  var text = textEl.value.trim().slice(0, 280);
  if (!recipient || !text) return;
  var nudgeId = _newNudgeId();
  var btn = document.getElementById('btn-send-nudge');
  if (btn) btn.disabled = true;
  // 1) Send via WS for live delivery.
  try {
    if (window._classroomBoardHandle && window._classroomBoardHandle.sendMessage) {
      window._classroomBoardHandle.sendMessage({
        type: 'classroom_teacher_nudge',
        nudgeId: nudgeId,
        recipientUsernames: [recipient],
        text: text,
      });
    }
  } catch (_) {}
  // 2) POST to roster-server for log.
  try {
    var resp = await fetch(window.ROSTER_SERVICE_URL + '/teacher/nudge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (window.rosterClient && window.rosterClient.token ? window.rosterClient.token() : ''),
      },
      body: JSON.stringify({
        nudgeId: nudgeId,
        recipientUsernames: [recipient],
        text: text,
        section: (window._classroomBoardHandle && window._classroomBoardHandle.section) || null,
        senderUsername: (window.rosterClient && window.rosterClient.current ? (window.rosterClient.current() || {}).username : '') || 'teacher',
        deliveredUsernames: [recipient],  // optimistic; the ack would refine this
      }),
    });
    var data = null;
    try { data = await resp.json(); } catch (_) {}
    if (status) {
      status.textContent = (data && data.ok) ? 'Sent.' : 'Sent (log failed).';
      setTimeout(function() { if (status) status.textContent = ''; }, 3500);
    }
  } catch (_) {
    if (status) status.textContent = 'Sent (log failed).';
  }
  textEl.value = '';
  _updateNudgeSendButton();
}

function _renderReplyInList(payload) {
  var list = document.getElementById('nudge-replies-list');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'nudge-reply-row';
  var who = document.createElement('strong');
  who.textContent = (currentNameMap[payload.fromUsername] || payload.fromUsername) + ': ';
  var msg = document.createElement('span');
  msg.textContent = payload.text || '';
  row.appendChild(who); row.appendChild(msg);
  list.prepend(row);
  // Keep only last 20.
  while (list.children.length > 20) list.removeChild(list.lastChild);
}
```

**Wire** -- on DOMContentLoaded:
```js
var nudgeSel = document.getElementById('nudge-recipient');
var nudgeText = document.getElementById('nudge-text');
var nudgeBtn = document.getElementById('btn-send-nudge');
if (nudgeSel) nudgeSel.addEventListener('change', _updateNudgeSendButton);
if (nudgeText) nudgeText.addEventListener('input', _updateNudgeSendButton);
if (nudgeBtn) nudgeBtn.addEventListener('click', _sendNudgeFromCockpit);
```

**WS subscription** -- in the cockpit's mount-board call, add `onClassroomMessage`:
```js
onClassroomMessage: function(msg) {
  if (msg && msg.type === 'classroom_student_nudge_reply') {
    _renderReplyInList(msg);
  }
  // Also handle 'classroom_teacher_nudge_ack' if delivered != recipient list.
  if (msg && msg.type === 'classroom_teacher_nudge_ack') {
    var offline = (msg.offline || []);
    if (offline.length > 0) {
      var status = document.getElementById('nudge-status');
      if (status) status.textContent = 'Offline: ' + offline.join(', ');
      setTimeout(function() { if (status) status.textContent = ''; }, 5000);
    }
  }
}
```

Add `_refreshNudgeRecipients(summary)` call in the existing onStateChange.

### 4.3 classroom-board.js -- `onClassroomMessage` callback

Add to `ClassroomBoard.mount` options. In the WS `onmessage` handler, after parsing the message but BEFORE calling `_reduce`, invoke the optional callback:

```js
// classroom-board.js -- inside ClassroomBoard.mount, in the WebSocket
// onmessage handler. After parsing JSON:
if (typeof opts.onClassroomMessage === 'function') {
  try { opts.onClassroomMessage(message); } catch (_) {}
}
state = _reduce(state, message);
// ... existing onStateChange call
```

Also expose `sendMessage(payload)` on the returned handle so cockpit + Desk can send WS messages without re-implementing connection management:
```js
handle.sendMessage = function(payload) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(payload)); } catch (_) {}
  }
};
handle.section = section;  // expose for nudge endpoint POST
```

This change applies to BOTH cr and follow-alongs copies of `classroom-board.js`. Per CONTINUATION rules, cr is source-of-truth; planner makes the change in cr first then copies to follow-alongs.

### 4.4 Tests

**`tests/desk-nudge-toast.test.js`** -- jsdom + vm pattern (mirror `desk-view-as.test.js`):
- _showNudgeToast renders the from/text + plays chime + reveals the toast
- _hideNudgeToast hides + clears _activeNudge
- _sendNudgeReply calls sendMessage + POSTs to roster-server when text is non-empty
- _sendNudgeReply no-ops when text is empty
- _sendNudgeReply truncates text > 280
- Soft chime helper tolerates missing AudioContext (no throw)
- The toast DOM structure exists in the source
- The CSS rules are present
- Close button is wired to _hideNudgeToast

Target: ~15 tests.

**`tests/cockpit-nudge-panel.test.js`** -- jsdom + vm pattern:
- _newNudgeId returns a unique-per-call string
- _refreshNudgeRecipients populates dropdown from online students only
- _refreshNudgeRecipients disables send button when no recipients
- _refreshNudgeRecipients preserves selection when previous still online
- _updateNudgeSendButton enables only when recipient + text present
- _sendNudgeFromCockpit sends WS + POSTs to roster + clears textarea
- _sendNudgeFromCockpit no-ops when recipient or text missing
- Truncates text > 280
- _renderReplyInList prepends a reply row + keeps to 20 entries
- onClassroomMessage callback wiring filters for `classroom_student_nudge_reply`
- Offline ack shows status message

Target: ~12 tests.

## 5. Smoke checks (planner-run after Codex fold)

1. `cd curriculum_render && npm test` -- expect ~18 new tests in classroom.test.js; baseline 164/165 fail (study-guide unrelated) stays.
2. `cd roster-server && npm test` -- expect ~15 new tests; baseline 516/516 must not regress.
3. `npm test` from follow-alongs root -- expect ~27 new tests (15 + 12); baseline 5033/5034 must not regress.
4. Manual smoke (after Railway redeploy of cr WS server + roster-server + GH Pages republish + migration 0008 run by user):
   - Teacher opens cockpit, sees a student online.
   - Teacher types "Try problem 3" in nudge panel + clicks Send.
   - Student sees toast appear in top-right of Desk + hears chime.
   - Student types "On it!" + clicks Send.
   - Cockpit shows reply row in the panel.
   - Supabase `nudges_log` table has 2 rows: 1 teacher nudge + 1 student reply (with parent_nudge_id set).

## 6. Dispatch instructions

- Wave 3A: Sonnet agent (general-purpose, model=sonnet, run_in_background=true) in cr repo.
- Wave 3B: Sonnet agent (run_in_background=true) in follow-alongs.
- Wave 3C: Planner-direct.

After all three: cross-agent.py to Codex (review, read-only, 600s, cross-repo scope).

## 7. Recall

- `TEACHER_STUDENT_CONSOLE_SPEC.md` Section 6 (parent spec)
- `TEACHER_STUDENT_CONSOLE_P2_BUILD.md` (the prior pattern + the carry-forward gotchas)
- `LIVE_CLASSROOM_V2_1_BUILD.md` (the precedent for cockpit-driven WS + REST hybrid)
- `roster-server/teacher.js` (the mount-function pattern)
- `roster-server/remediation-db.js` (the DAL pattern for nudge-db.js)
- `curriculum_render/railway-server/classroom.js` (the WS-method-with-broadcasts pattern)
- `curriculum_render/railway-server/tests/classroom.test.js` (the test harness)
- `tests/preview-as-student.test.js` (the fnBody + mockStorage harness for Desk/cockpit tests)

## 7.5 Known limitation (Codex BLOCKER 1, accepted)

The cr WebSocket `classroom_join` lets the client self-assert
`role: 'teacher' | 'student'` with no server-side verification. A
malicious student could join as `role: 'teacher'` and then call any
teacher-gated WS method (armGate, openPoll, openDoorways, AND the new
teacherNudge). This is an EXISTING vulnerability in cr that pre-dates
P3 (since v1a). Nudges raise the stakes because they're private 1:1
messages instead of public broadcasts, but the root cause is the
classroom_join trust model -- fixing it requires WS-level token auth
(a shared HMAC between cr and roster-server, or a roster-server
roundtrip on every join) which is a cross-cutting hardening task too
large to fold into P3.

P3 mitigations in place:
- The audit log (`nudges_log`) is gated by `requireTeacher` on the
  roster-server side (real bcrypt token auth). A WS-impersonator
  cannot create log rows -- they can only spam ephemeral DMs.
- The recentNudges ownership check (BLOCKER 3 fold) prevents
  impersonators from sending unsolicited replies to teachers, even
  if they could impersonate the recipient role.

A separate ticket should be opened to introduce WS-level token auth
(scope: ALL classroom_* methods, not just nudges). Until then, accept
the limitation.

## 8. What is explicitly OUT of P3

- Avatar-click popup with 6 actions -- deferred to a phase that bundles View as (already in drawer), Apply remediation (P4), Override gate (P5). For P3, the nudge panel is a section-level cockpit control.
- Multi-student nudge (one teacher -> N students) -- P3 ships single-student nudges. P4 (Select Students mode) adds multi.
- Stacked toasts on the student side -- in P3, a second incoming nudge REPLACES the first if not yet dismissed. Stack support is a P3.1 polish.
- Per-nudge delivery confirmation back to the cockpit (the cockpit currently assumes "delivered if request succeeded" -- the cr server's ack carries `delivered` + `offline` arrays but the cockpit only surfaces offline as a status note, doesn't update the log row's delivered_at).
- Nudge history view in the cockpit. The `nudges_log` rows exist but no UI browses them.
- Nudge throttling / per-student rate limits. Spec says NO guardrails for v1 (cohort is small, teacher knows the kids).

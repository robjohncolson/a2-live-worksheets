# Teacher -> Student Console -- Phase 6 (Polish Trio) BUILD Contract

> FROZEN, session 113, 2026-05-24. Closes the three gaps left after the
> P1-P5 ship. Implements items #1 (Apply Remediation modal wiring),
> #6 (stacked toasts on student side), and #7 (lesson_unlock revocation
> UI) from `CONTINUATION_PROMPT.md` session-112's NEXT queue.
>
> Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md` (§6 nudges, §9 override
> gate, §15 deferred polish items). The three tasks here all CLOSE
> deferred items the spec already named.
>
> NO migration. NO `curriculum_render/data/curriculum.js` change.
> NO cockpit (`teacher-classroom.html`) change. NO `roster.real_name`
> change. roster-server's `lesson_unlock` table already exists
> (migration `0009`, run during session 112) and already has the
> `status` column with the `'revoked'` value in its check constraint
> -- Wave A wires the revoke path; no DB migration needed.

## 0. Scope -- the three independent tasks

| Task | What it does | What it touches |
|------|--------------|-----------------|
| T1 (Apply Remediation) | Wires P1's 4th disabled drawer button to the existing `/remediation/propose` endpoint via a new modal in `teacher-dashboard.html`. | `teacher-dashboard.html` (modal + handler) |
| T2 (Stacked toasts) | Refactors the Desk's single-slot nudge toast into a stack -- a 2nd incoming nudge no longer replaces the 1st; up to 4 toasts co-exist, oldest dropped on overflow. | `ap_stats_roadmap_square_mode.html` (DOM + CSS + JS) |
| T3 (Lesson unlock revocation) | Adds `POST /teacher/lesson-unlock/revoke` + DAL method + a new "Lesson Unlocks" section in the P1 drawer with per-row Revoke buttons. | `roster-server/lesson-unlock.js`, `lesson-unlock-db.js`, `teacher-dashboard.html` |

All three are independent. File ownership is disjoint so the three
waves run as parallel Sonnet agents. Codex reviews all three diffs
together at the end.

## 1. File ownership (disjoint -> all 3 waves run in parallel)

| Wave | Files                                                                                                                                | Touched by |
|------|--------------------------------------------------------------------------------------------------------------------------------------|------------|
| A    | `roster-server/lesson-unlock.js` (1 new route block), `roster-server/lesson-unlock-db.js` (1 new DAL method), `roster-server/tests/lesson-unlock-revoke.test.js` (NEW) | Sonnet     |
| B    | `ap_stats_roadmap_square_mode.html` (toast DOM + CSS + `_showNudgeToast`/`_hideNudgeToast`/`_sendNudgeReply` rewrite), `tests/nudge-toast-stack.test.js` (NEW) | Sonnet     |
| C    | `teacher-dashboard.html` (remediation modal + unlocks section + 2 new fetch handlers), `tests/teacher-student-console-remediation.test.js` (NEW), `tests/teacher-student-console-unlocks.test.js` (NEW) | Sonnet     |

No file appears in more than one wave. **Wave C is the only one that
needs a Wave A endpoint to be ready** -- but the Wave C dashboard
tests stub the fetch, so Wave C does not block on Wave A's runtime
existence. Codex review (post-fold) verifies the cross-wave
contract.

## 2. Wave A -- Server: lesson-unlock revocation

### 2.1 `roster-server/lesson-unlock-db.js`: add `revokeUnlock`

The existing DAL exports `upsertUnlock` + `listActiveForStudent`. Add
a third method:

```js
async function revokeUnlock({ studentUsername, lessonKey, revokedBy }) {
  // UPDATE lesson_unlock
  //    SET status = 'revoked'
  //  WHERE student_username = $1 AND lesson_key = $2 AND status = 'active'
  // RETURNING *;
  //
  // Returns { data: row|null, error }. `data` is null when nothing was
  // updated (no active unlock for that (student, lesson)) -- the route
  // translates that to 404.
  //
  // `revokedBy` is recorded in a NEW free-form `notes` style by
  // APPENDING to the existing `reason` column:
  //   reason = (reason ? reason + ' | ' : '') + 'revoked by ' + revokedBy
  // Rationale: the migration does not have a `revoked_by` column;
  // adding one is a separate migration (deferred). Appending to
  // `reason` is reversible (the row is sticky -- a future re-unlock
  // upserts a fresh row with a clean reason).
  return client
    .from('lesson_unlock')
    .update({
      status: 'revoked',
      reason: revokedBy
        ? client.rpc // placeholder -- see below: do the read-modify-write in two steps
        : undefined,
    })
    .eq('student_username', studentUsername)
    .eq('lesson_key', lessonKey)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
}
```

**IMPORTANT**: the snippet above is a sketch. Supabase's update API
does not support concatenation in a single UPDATE; do the
read-modify-write in two steps:

```js
async function revokeUnlock({ studentUsername, lessonKey, revokedBy }) {
  // 1. Fetch the active row.
  var found = await client
    .from('lesson_unlock')
    .select('*')
    .eq('student_username', studentUsername)
    .eq('lesson_key', lessonKey)
    .eq('status', 'active')
    .maybeSingle();
  if (found.error) return { data: null, error: found.error };
  if (!found.data) return { data: null, error: null };          // nothing to revoke -> route returns 404

  // 2. Compose the new reason + flip the status atomically (single row, no concurrency
  //    concern in single-teacher prod; the unique constraint prevents duplicates).
  var newReason = found.data.reason
    ? (found.data.reason + ' | revoked by ' + (revokedBy || 'teacher'))
    : ('revoked by ' + (revokedBy || 'teacher'));

  return client
    .from('lesson_unlock')
    .update({ status: 'revoked', reason: newReason })
    .eq('id', found.data.id)
    .select('*')
    .single();
}
```

Add `revokeUnlock` to the exported object alongside the two existing
methods.

### 2.2 `roster-server/lesson-unlock.js`: add `POST /teacher/lesson-unlock/revoke`

Insert directly after the existing `POST /teacher/lesson-unlock`
handler (after line 93). Mirrors the existing handler's auth +
validation + error mapping verbatim.

```js
// POST /teacher/lesson-unlock/revoke { studentUsername, lessonKey }
// Auth: teacher (x-teacher-secret OR Bearer token resolving to role='teacher').
// Flips status from 'active' to 'revoked'. Idempotent against an already-revoked row:
// returns 404 with reason "no active unlock" so the UI knows to refresh.
app.post('/teacher/lesson-unlock/revoke', async (req, res) => {
  if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

  var body = req.body || {};
  var studentUsername = (typeof body.studentUsername === 'string') ? body.studentUsername.trim() : '';
  var lessonKey = (typeof body.lessonKey === 'string') ? body.lessonKey.trim() : '';
  if (!studentUsername || !lessonKey) {
    return res.status(400).json({ ok: false, error: 'studentUsername + lessonKey required' });
  }
  if (!LESSON_KEY_RE.test(lessonKey)) {
    return res.status(400).json({ ok: false, error: 'lessonKey must match topic format like "1.7" or "5.3"' });
  }

  // Derive revokedBy from the authenticated teacher token (mirror of POST /teacher/lesson-unlock).
  var revokedBy = '';
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
        if (rosterRow) revokedBy = rosterRow.login_username || '';
      }
    } catch (_) {}
  }
  if (!revokedBy && req.headers['x-teacher-secret']) {
    revokedBy = 'teacher-secret';
  }
  if (!revokedBy) {
    return res.status(400).json({ ok: false, error: 'could not resolve revokedBy from auth' });
  }

  try {
    var { data, error } = await lessonUnlockDb.revokeUnlock({
      studentUsername, lessonKey, revokedBy,
    });
    if (error) {
      if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'lesson_unlock not provisioned -- run migration 0009' });
      console.error('POST /teacher/lesson-unlock/revoke error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!data) {
      return res.status(404).json({ ok: false, error: 'no active unlock for that (student, lesson)' });
    }
    return res.json({ ok: true, row: data });
  } catch (err) {
    console.error('POST /teacher/lesson-unlock/revoke throw:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});
```

NO change to the existing GET handlers or the upsert path. NO change
to `server.js` (the same `mountLessonUnlock` mounts the new route
since it lives inside the existing function body).

### 2.3 Tests: `roster-server/tests/lesson-unlock-revoke.test.js`

Mirror `tests/lesson-unlock-endpoints.test.js`'s harness (if it
exists; otherwise mirror `class.test.js`'s pattern -- TestServer +
fake roster db + fake `lessonUnlockDb` with all three methods).

The fake `lessonUnlockDb.revokeUnlock` returns:
- `{ data: row, error: null }` on success
- `{ data: null, error: null }` when no active unlock
- `{ data: null, error: { code: '42P01' } }` when table missing
- throws -> caught by handler -> 500

Required cases (`describe('POST /teacher/lesson-unlock/revoke')`):
- 401 without teacher auth (no secret + no token)
- 200 with valid teacher secret -> envelope `{ ok:true, row: {..., status:'revoked'} }`
- 200 with valid teacher Bearer token (role='teacher') -> same shape
- 400 when `studentUsername` is missing
- 400 when `lessonKey` is missing
- 400 when `lessonKey` is malformed (e.g. `"u1-l7"`)
- 404 when no active unlock exists for that (student, lesson) -- the DAL returns `{data:null, error:null}`
- 503 when the table is missing (`error.code === '42P01'`)
- 500 when the DAL throws
- `revokedBy` derivation: a valid Bearer token resolves to `rosterRow.login_username`; the resolved value flows into the DAL call

**Additional cases for DAL unit** (`describe('lesson-unlock-db.revokeUnlock')`):
- Reason composition: existing reason `"absent during lesson"` + `revokedBy='mr.colson'` -> new reason `"absent during lesson | revoked by mr.colson"`
- Reason composition with null prior reason -> new reason `"revoked by mr.colson"`
- An already-revoked row is NOT returned (the SELECT scopes to `status='active'`)

Test count target: 14-18.

## 3. Wave B -- Desk: stacked toasts

### 3.1 Current vs. new behavior

**Current (P3)**: a 2nd `classroom_teacher_nudge` REPLACES the 1st
(see `_showNudgeToast` at line 4098). The student loses the prior
message + any in-progress reply. `_activeNudge` is a singleton.

**New (T2)**: up to `MAX_NUDGE_STACK = 4` toasts co-exist. Each toast
has independent close + reply. Sorted oldest-on-top, newest-on-bottom
(matches the natural read order; new nudges appear in the gap below
the existing ones). On overflow (5th nudge arrives while 4 are
visible), the OLDEST is silently removed -- log a console line so
debugging is possible. The chime plays for EVERY incoming nudge
(rapid succession is intentional -- the student hears each ping).

### 3.2 DOM rework

In `ap_stats_roadmap_square_mode.html`, replace the single
`#nudge-toast` (lines 1254-1265) with a container + template:

```html
<!-- Nudge toast stack (T2 of P6 BUILD). Container holds up to
     MAX_NUDGE_STACK live toasts; the template is cloned per arrival. -->
<div id="nudge-toast-stack" aria-live="polite"></div>

<template id="nudge-toast-template">
  <div class="nudge-toast" role="status">
    <div class="nt-header">
      <span class="nt-from-label">FROM</span>
      <strong class="nt-from-name">Mr. Colson</strong>
      <button type="button" class="nt-close" aria-label="Dismiss">&times;</button>
    </div>
    <p class="nt-text"></p>
    <div class="nt-reply">
      <textarea maxlength="280" rows="2" placeholder="Reply (optional, 280 chars max)..."></textarea>
      <button type="button" class="nt-send">Send</button>
    </div>
  </div>
</template>
```

The `id="nudge-toast"` element is GONE; ditto its child element IDs
(`nudge-toast-from`, `nudge-toast-text`, etc.) -- per-toast scoping
uses class names within the cloned element.

### 3.3 CSS adjustment

In the existing `<style>` block (lines 1186-1211), replace the
`#nudge-toast { position: fixed; ... }` selector + its children with:

```css
/* Nudge toast stack (T2 of P6 BUILD §3). Container positions
   itself; individual toasts are children stacked with flex column +
   gap. The MAX_NUDGE_STACK cap is enforced in JS, not CSS. */
#nudge-toast-stack {
  position: fixed; top: 60px; right: 18px; z-index: 9500;
  display: flex; flex-direction: column; gap: 10px;
  width: 320px; max-width: 88vw;
  pointer-events: none;             /* container is a layout shell only -- children re-enable */
}
.nudge-toast {
  pointer-events: auto;
  background: #fffbe6; color: #2a2520;
  border: 1px solid #d97706; border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.22);
  padding: 12px 14px;
  font: 13px "Geneva", "Lucida Grande", system-ui, sans-serif;
  /* Subtle slide-in so successive arrivals feel sequenced.
     Falls back gracefully if animations are off. */
  animation: nudge-slide-in 180ms ease-out;
}
@keyframes nudge-slide-in {
  from { transform: translateX(20px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
.nudge-toast .nt-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.nudge-toast .nt-from-label { color: #92400e; font-weight: 700; letter-spacing: 0.08em; font-size: 10px; }
.nudge-toast .nt-from-name { color: #92400e; }
.nudge-toast .nt-close { margin-left: auto; background: transparent; border: 0; font-size: 18px; cursor: pointer; color: #92400e; line-height: 1; padding: 0 4px; }
.nudge-toast .nt-text { margin: 4px 0 8px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; }
.nudge-toast .nt-reply { display: flex; gap: 6px; }
.nudge-toast .nt-reply textarea {
  flex: 1; resize: vertical; min-height: 36px; max-height: 80px;
  border: 1px solid #d97706; border-radius: 4px; padding: 6px;
  font: inherit; box-sizing: border-box;
}
.nudge-toast .nt-send {
  padding: 6px 10px; background: #d97706; color: #fff;
  border: 0; border-radius: 4px; cursor: pointer; font: inherit; font-weight: 700;
}
.nudge-toast .nt-send:hover { background: #92400e; }
.nudge-toast .nt-send:disabled { background: #e5d3a8; cursor: not-allowed; }
```

### 3.4 JS rewrite

Replace lines 4076-4171 (the `_playNudgeChime` and toast helpers) with
a stack-aware version. The function names + their public contracts
(`_showNudgeToast(payload)`, `_hideNudgeToast()`) MUST remain
backward-compatible because `_mountClassroomBoard` calls
`_showNudgeToast` typeof-guarded (see line 11170).

```js
// ── P3+T2 (P6): stacked nudge toasts ─────────────────────────────
// Stack semantics: up to MAX_NUDGE_STACK toasts co-exist; oldest
// drops on overflow. Each toast has its own DOM node + own reply
// textarea + own close handler. Chime plays for every arrival.

var MAX_NUDGE_STACK = 4;
// Map keyed by nudgeId; each value:
//   { fromUsername: string, toastEl: HTMLElement, createdAt: number }
var _activeNudges = new Map();

function _playNudgeChime() {
  // UNCHANGED from P3 (lines 4078-4093). Inline here verbatim.
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = new AC();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (_) {}
}

function _showNudgeToast(payload) {
  // payload: { nudgeId, text, fromUsername, ts }
  var container = document.getElementById('nudge-toast-stack');
  var tmpl = document.getElementById('nudge-toast-template');
  if (!container || !tmpl) return;

  var nudgeId = (payload && payload.nudgeId) || ('nudge-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));

  // Idempotency: if the same nudgeId is already showing (server retry,
  // double-deliver), no-op. The server's recentNudges TTL prevents the
  // realistic case, but defense-in-depth.
  if (_activeNudges.has(nudgeId)) return;

  // Clone the template.
  var clone = tmpl.content.firstElementChild.cloneNode(true);
  clone.setAttribute('data-nudge-id', nudgeId);
  var fromEl = clone.querySelector('.nt-from-name');
  var textEl = clone.querySelector('.nt-text');
  var closeBtn = clone.querySelector('.nt-close');
  var replyEl = clone.querySelector('.nt-reply textarea');
  var sendBtn = clone.querySelector('.nt-send');
  if (fromEl) fromEl.textContent = (payload && payload.fromUsername) || 'Teacher';
  if (textEl) textEl.textContent = (payload && payload.text) || '';

  // Per-toast handlers -- close + send are closures over THIS nudgeId.
  if (closeBtn) closeBtn.addEventListener('click', function () { _hideNudgeToastById(nudgeId); });
  if (sendBtn) sendBtn.addEventListener('click', function () { _sendNudgeReplyForId(nudgeId); });

  // Register state BEFORE appending so an overflow-eviction does not race the new toast.
  _activeNudges.set(nudgeId, {
    fromUsername: (payload && payload.fromUsername) || '',
    toastEl: clone,
    createdAt: Date.now(),
  });

  container.appendChild(clone);

  // Overflow: drop the OLDEST until size <= MAX_NUDGE_STACK.
  while (_activeNudges.size > MAX_NUDGE_STACK) {
    var oldestId = null;
    var oldestTs = Infinity;
    _activeNudges.forEach(function (v, k) {
      if (v.createdAt < oldestTs) { oldestTs = v.createdAt; oldestId = k; }
    });
    if (oldestId == null) break;
    console.warn('[nudge-stack] dropping oldest nudge', oldestId, 'to make room');
    _hideNudgeToastById(oldestId);
  }

  _playNudgeChime();
}

// Backward-compatible: existing callers that did `_hideNudgeToast()`
// (with no arg) used to hide the singleton. Preserve that exact
// shape -- hide ALL active toasts when called with no args.
function _hideNudgeToast(nudgeId) {
  if (typeof nudgeId === 'string') return _hideNudgeToastById(nudgeId);
  // No-arg: clear everything (matches prior singleton semantics).
  var ids = Array.from(_activeNudges.keys());
  ids.forEach(_hideNudgeToastById);
}

function _hideNudgeToastById(nudgeId) {
  var entry = _activeNudges.get(nudgeId);
  if (!entry) return;
  try { entry.toastEl.parentNode && entry.toastEl.parentNode.removeChild(entry.toastEl); } catch (_) {}
  _activeNudges.delete(nudgeId);
}

async function _sendNudgeReplyForId(nudgeId) {
  var entry = _activeNudges.get(nudgeId);
  if (!entry) return;
  var replyEl = entry.toastEl.querySelector('.nt-reply textarea');
  var rawText = replyEl ? String(replyEl.value || '').trim() : '';
  if (!rawText) return;
  if (rawText.length > 280) rawText = rawText.slice(0, 280);
  var sendBtn = entry.toastEl.querySelector('.nt-send');
  if (sendBtn) sendBtn.disabled = true;

  // 1) Live delivery via the existing classroom WS.
  try {
    if (typeof _classroomBoardHandle !== 'undefined' && _classroomBoardHandle && typeof _classroomBoardHandle.sendMessage === 'function') {
      _classroomBoardHandle.sendMessage({
        type: 'classroom_student_nudge_reply',
        nudgeId: nudgeId,
        text: rawText,
      });
    }
  } catch (_) {}

  // 2) Log to roster-server.
  try {
    var base = window.ROSTER_SERVICE_URL;
    var token = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
    if (base && token) {
      await fetch(base + '/student/nudge-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          parentNudgeId: nudgeId,
          recipientUsername: entry.fromUsername,
          text: rawText,
        }),
      });
    }
  } catch (_) {}
  _hideNudgeToastById(nudgeId);
}

// Backward-compatible name -- some older code paths or tests may call it.
async function _sendNudgeReply() {
  // No-arg call: send the OLDEST active reply if the user filled it in.
  // Matches the prior singleton semantics for code that hasn't migrated.
  var oldestId = null;
  var oldestTs = Infinity;
  _activeNudges.forEach(function (v, k) {
    if (v.createdAt < oldestTs) { oldestTs = v.createdAt; oldestId = k; }
  });
  if (oldestId) return _sendNudgeReplyForId(oldestId);
}
```

The `DOMContentLoaded` hook (lines 4162-4171) is REMOVED -- per-toast
handlers attach inside `_showNudgeToast`, not via static DOM
selectors. Update accordingly.

### 3.5 Tests: `tests/nudge-toast-stack.test.js`

Vitest + jsdom. Mirror `tests/desk-modal-polish.test.js`'s pattern for
loading the Desk's inline `<script>` block into a jsdom window.

Required cases:

**describe('Stack DOM presence')**
- The container `#nudge-toast-stack` exists and is empty by default.
- The template `#nudge-toast-template` exists and is `<template>`.

**describe('_showNudgeToast appends to stack')**
- First call -> 1 child in `#nudge-toast-stack`.
- Second call (different nudgeId) -> 2 children, both visible.
- Both toasts show their respective `text` + `fromUsername`.
- `_activeNudges.size === 2`.

**describe('Idempotency')**
- Calling `_showNudgeToast({nudgeId:'X', ...})` twice with the SAME id -> only 1 child.

**describe('Per-toast close + reply')**
- Clicking `.nt-close` on toast A removes toast A but leaves toast B intact.
- Filling `.nt-reply textarea` on toast B + clicking `.nt-send` calls the WS handle's `sendMessage` with `{type:'classroom_student_nudge_reply', nudgeId:'B', text:'reply text'}`.
- After send: toast B removed, toast A still visible.

**describe('Overflow drops oldest')**
- Push 5 nudges -> stack size = 4 (= MAX_NUDGE_STACK).
- The 1st one (oldest) is gone; the other 4 remain in order.
- A `console.warn` line was emitted naming the dropped id.

**describe('Backward-compatible no-arg helpers')**
- `_hideNudgeToast()` with no args clears every toast.
- `_sendNudgeReply()` with no args targets the oldest visible toast.

**describe('Chime plays per arrival')**
- Spy on `_playNudgeChime`; each `_showNudgeToast` call invokes it.

**describe('Server roster log fetch')**
- When `window.ROSTER_SERVICE_URL` + `window.rosterClient.token()` are set, `_sendNudgeReplyForId` makes a `fetch` POST to `/student/nudge-reply` with the correct body shape.

Test count target: 18-22.

## 4. Wave C -- Dashboard: Remediation modal + Lesson Unlocks section

The Wave C agent edits `teacher-dashboard.html` ONLY. Two surfaces
get added: a new modal (`#tsc-remediation-modal`) for T1, and a new
drawer section (`#tsc-section-unlocks`) for T3. Both are independent;
the agent can do them in either order.

### 4.1 T1 -- Apply Remediation modal

#### 4.1.1 Enable the button

Line 503 (the existing `<button id="tsc-action-remediation" disabled ...>`)
loses the `disabled` attr and the `title` updates from `"Phase 4
wiring"` to `"Open the remediation form for this student"`.

#### 4.1.2 Modal DOM

Insert directly before the closing `</body>` (after the existing
drawer markup):

```html
<!-- T1 (P6 BUILD §4.1): Apply Remediation modal. Hidden until the
     drawer's "Apply remediation" button is clicked. -->
<div id="tsc-remediation-modal" class="tsc-modal" aria-hidden="true">
  <div class="tsc-modal-overlay" data-tsc-modal-close="overlay"></div>
  <div class="tsc-modal-panel" role="dialog" aria-labelledby="tsc-remediation-title">
    <header class="tsc-modal-header">
      <h3 id="tsc-remediation-title">Apply remediation</h3>
      <button type="button" class="tsc-modal-close" data-tsc-modal-close="button" aria-label="Close">&times;</button>
    </header>
    <p class="tsc-modal-desc">Propose a remediation assignment for
       <strong id="tsc-remediation-student-name">Student</strong>.
       Status will be <code>proposed</code>; approve from the
       Remediation tab to push it to the student.</p>
    <label for="tsc-rem-unit">Unit (required, e.g. <code>U3</code>):</label>
    <input type="text" id="tsc-rem-unit" maxlength="8" pattern="^U\d+$" title='Format like "U3"' placeholder="U3">
    <label for="tsc-rem-skill">Skill code (required, e.g. <code>3.A</code>):</label>
    <input type="text" id="tsc-rem-skill" maxlength="16" placeholder="3.A">
    <label for="tsc-rem-notes">Notes (optional):</label>
    <textarea id="tsc-rem-notes" rows="3" maxlength="500"
              placeholder="Free-form context for the student or for the approval review."></textarea>
    <div class="tsc-modal-status" id="tsc-remediation-status"></div>
    <div class="tsc-modal-actions">
      <button type="button" class="tsc-modal-cancel" data-tsc-modal-close="button">Cancel</button>
      <button type="button" class="tsc-modal-confirm" id="tsc-remediation-confirm">Propose</button>
    </div>
  </div>
</div>
```

#### 4.1.3 Modal CSS

Add to the dashboard `<style>` block (reuse existing CSS variables):

```css
/* T1 (P6 BUILD §4.1): Remediation modal -- shared shell that T3's
   future modals (if any) can also adopt. Variant of the drawer's
   palette. */
.tsc-modal { position: fixed; inset: 0; z-index: 250; display: none; }
.tsc-modal.tsc-modal-open { display: block; }
.tsc-modal-overlay {
  position: absolute; inset: 0;
  background: rgba(42, 37, 32, 0.42);
}
.tsc-modal-panel {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 440px; max-width: 92vw; max-height: 86vh;
  background: var(--sg-bg-card);
  border: 1px solid var(--sg-border); border-radius: 8px;
  box-shadow: 0 12px 32px rgba(42, 37, 32, 0.24);
  padding: 18px 20px;
  display: flex; flex-direction: column; gap: 8px;
  overflow-y: auto;
}
.tsc-modal-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tsc-modal-header h3 { margin: 0; color: var(--sg-accent); font-size: 1rem; }
.tsc-modal-close {
  background: transparent; border: 0; font-size: 1.4rem; line-height: 1;
  color: var(--sg-text-dim); cursor: pointer; padding: 0 4px;
}
.tsc-modal-desc { margin: 4px 0 8px; color: var(--sg-text-dim); font-size: 0.85rem; }
.tsc-modal-panel label { font-size: 0.78rem; color: var(--sg-text-dim); margin-top: 4px; }
.tsc-modal-panel input, .tsc-modal-panel textarea {
  font: inherit; padding: 6px 8px;
  border: 1px solid var(--sg-border); border-radius: 4px;
  background: var(--sg-bg);
}
.tsc-modal-status { min-height: 18px; font-size: 0.82rem; color: var(--sg-text-dim); }
.tsc-modal-status.is-error { color: #b91c1c; }
.tsc-modal-status.is-success { color: #15803d; }
.tsc-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.tsc-modal-cancel, .tsc-modal-confirm {
  padding: 8px 14px; border: 1px solid var(--sg-border); border-radius: 6px;
  font: inherit; cursor: pointer; background: var(--sg-bg);
}
.tsc-modal-confirm { background: var(--sg-accent); color: #fff; border-color: var(--sg-accent); }
.tsc-modal-confirm[disabled] { opacity: 0.55; cursor: not-allowed; }
```

#### 4.1.4 Modal JS

New helpers added to the dashboard inline `<script>` block. Capture
the existing `teacherSecret`/`svcUrl`/`$` helpers (verbatim names
already in the file).

**State**: P1 already declares `var _tscCurrentStudentId = null;`
(line 1301) -- the ID-only stub used by the View-as button. Add a
SIBLING variable for the full stub (additive, does NOT rename the
existing one; P2's View-as handler keeps reading `_tscCurrentStudentId`):

```js
// P6 §4: full stub of the currently-open drawer (sibling to
// _tscCurrentStudentId from P1). Populated by openTscDrawer.
var _tscCurrentStudentStub = null;
```

In `openTscDrawer`, add ONE line directly under the existing
`_tscCurrentStudentId = ...;` assignment (line 1308):

```js
_tscCurrentStudentStub = stub || null;
```

In `closeTscDrawer` (line 1350-1357), add ONE line under the seq++:

```js
_tscCurrentStudentStub = null;
```

Then add the modal handlers:

```js
// T1 (P6 BUILD §4.1): Apply Remediation modal handlers.

function openRemediationModal() {
  var modal = $('tsc-remediation-modal');
  if (!modal || !_tscCurrentStudentStub) return;
  // Populate the header with the student name from the drawer stub.
  $('tsc-remediation-student-name').textContent =
    _tscCurrentStudentStub.realName || _tscCurrentStudentStub.username || 'Student';
  // Reset fields + status.
  $('tsc-rem-unit').value = '';
  $('tsc-rem-skill').value = '';
  $('tsc-rem-notes').value = '';
  var statusEl = $('tsc-remediation-status');
  statusEl.textContent = '';
  statusEl.classList.remove('is-error', 'is-success');
  $('tsc-remediation-confirm').disabled = false;
  modal.classList.add('tsc-modal-open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(function () { $('tsc-rem-unit').focus(); }, 30);
}

function closeRemediationModal() {
  var modal = $('tsc-remediation-modal');
  if (!modal) return;
  modal.classList.remove('tsc-modal-open');
  modal.setAttribute('aria-hidden', 'true');
}

async function submitRemediationProposal() {
  if (!_tscCurrentStudentStub) return;
  var unit = $('tsc-rem-unit').value.trim();
  var skill = $('tsc-rem-skill').value.trim();
  var notes = $('tsc-rem-notes').value.trim();
  var statusEl = $('tsc-remediation-status');
  statusEl.classList.remove('is-error', 'is-success');
  if (!unit) { statusEl.textContent = 'Unit is required.'; statusEl.classList.add('is-error'); return; }
  if (!/^U\d+$/.test(unit)) { statusEl.textContent = 'Unit must look like "U3".'; statusEl.classList.add('is-error'); return; }
  if (!skill) { statusEl.textContent = 'Skill code is required.'; statusEl.classList.add('is-error'); return; }

  var confirmBtn = $('tsc-remediation-confirm');
  confirmBtn.disabled = true;
  statusEl.textContent = 'Submitting...';

  try {
    var res = await fetch(svcUrl() + '/remediation/propose', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, teacherAuthHeaders()),
      body: JSON.stringify({
        studentId: _tscCurrentStudentStub.studentId,
        unit: unit,
        skill: skill,
        notes: notes || undefined,
        proposedBy: 'teacher-dashboard',
      }),
    });
    if (res.status === 503) {
      var j503 = await res.json().catch(function () { return {}; });
      statusEl.textContent = (j503 && j503.error) || 'Remediation table not provisioned (run migration 0004).';
      statusEl.classList.add('is-error');
      confirmBtn.disabled = false;
      return;
    }
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j.ok) {
      statusEl.textContent = (j && j.error) || ('HTTP ' + res.status);
      statusEl.classList.add('is-error');
      confirmBtn.disabled = false;
      return;
    }
    statusEl.textContent = 'Proposed (assignment ' + (j.assignmentId || 'created') + ').';
    statusEl.classList.add('is-success');
    // Auto-close after 1.4 s so the user reads the success line.
    setTimeout(closeRemediationModal, 1400);
  } catch (err) {
    statusEl.textContent = 'Network error: ' + (err && err.message ? err.message : 'unknown');
    statusEl.classList.add('is-error');
    confirmBtn.disabled = false;
  }
}

// Wire the button + close affordances on DOMContentLoaded.
document.addEventListener('DOMContentLoaded', function () {
  var btn = $('tsc-action-remediation');
  if (btn) btn.addEventListener('click', openRemediationModal);
  var confirm = $('tsc-remediation-confirm');
  if (confirm) confirm.addEventListener('click', submitRemediationProposal);
  document.querySelectorAll('#tsc-remediation-modal [data-tsc-modal-close]')
    .forEach(function (el) { el.addEventListener('click', closeRemediationModal); });
  // ESC closes when the modal is open. Re-use the existing keydown listener
  // by adding this branch BEFORE the drawer's ESC handler.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var modal = $('tsc-remediation-modal');
      if (modal && modal.classList.contains('tsc-modal-open')) {
        e.stopPropagation();
        closeRemediationModal();
      }
    }
  }, true);
});
```

**IMPORTANT**: The two new lines in `openTscDrawer` +
`closeTscDrawer` (assigning `_tscCurrentStudentStub`) are the ONLY
edits to the existing drawer flow. The existing
`_tscCurrentStudentId` variable stays untouched so P2's View-as
button handler keeps working unchanged.

### 4.2 T3 -- Lesson Unlocks drawer section

#### 4.2.1 DOM

Add a new section between "Recent Submissions" (line 498) and the
`<nav class="tsc-actions">` (line 500):

```html
<section class="tsc-section" id="tsc-section-unlocks">
  <h3 class="tsc-section-title">Lesson Unlocks</h3>
  <ul id="tsc-unlocks-list" class="tsc-unlocks-list"></ul>
</section>
```

#### 4.2.2 CSS

Append to the existing tsc-* CSS block:

```css
.tsc-unlocks-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 0.85rem; }
.tsc-unlocks-list li {
  border: 1px solid var(--sg-border); border-radius: 6px;
  padding: 8px 10px; background: var(--sg-bg);
  display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center;
}
.tsc-unlocks-list .tsc-unlock-key { font-family: var(--sg-mono, monospace); color: var(--sg-accent); }
.tsc-unlocks-list .tsc-unlock-meta { color: var(--sg-text-dim); font-size: 0.78rem; }
.tsc-unlocks-list .tsc-unlock-revoke {
  padding: 4px 10px; font: inherit; font-size: 0.78rem;
  background: transparent; color: #b91c1c;
  border: 1px solid #fca5a5; border-radius: 4px; cursor: pointer;
}
.tsc-unlocks-list .tsc-unlock-revoke:hover { background: #fee2e2; }
.tsc-unlocks-list .tsc-unlock-empty { color: var(--sg-text-dim); font-style: italic; }
```

#### 4.2.3 JS

Extend `openTscDrawer` (P1) to ALSO fetch the active unlocks alongside
the existing grade + recent fetches:

```js
// In openTscDrawer, the Promise.all becomes Promise.allSettled
// (a-la P1's Codex MAJOR fold) and gains a 3rd promise:
Promise.allSettled([
  fetch(base + '/teacher/student/' + sid + '/grade', { headers: headers }).then(jsonOrErr),
  fetch(base + '/teacher/student/' + sid + '/recent?limit=20', { headers: headers }).then(jsonOrErr),
  fetch(base + '/teacher/student/' + sid + '/lesson-unlocks', { headers: headers }).then(jsonOrErr),
]).then(function (settled) {
  if (settled[0].status === 'fulfilled') renderTscGrade(settled[0].value);
  else { $('tsc-grade-card').textContent = 'Error loading grade.'; }
  if (settled[1].status === 'fulfilled') renderTscRecent(settled[1].value);
  else { $('tsc-recent-list').innerHTML = '<li class="dim">Error loading recent.</li>'; }
  if (settled[2].status === 'fulfilled') renderTscUnlocks(settled[2].value);
  else { /* unlocks endpoint may 503 if migration not run -- silently hide */
    renderTscUnlocks({ ok: false, lessonKeys: [], rows: [] });
  }
});
```

```js
function renderTscUnlocks(payload) {
  var el = $('tsc-unlocks-list');
  el.innerHTML = '';
  if (!payload || !payload.ok || !payload.rows || payload.rows.length === 0) {
    el.innerHTML = '<li class="tsc-unlock-empty">No active overrides.</li>';
    return;
  }
  payload.rows.forEach(function (row) {
    var li = document.createElement('li');
    var key = document.createElement('span');
    key.className = 'tsc-unlock-key';
    key.textContent = row.lesson_key;
    var meta = document.createElement('span');
    meta.className = 'tsc-unlock-meta';
    var when = (row.unlocked_at || '').slice(0, 10);
    var by = row.unlocked_by || 'teacher';
    meta.textContent = when + ' · by ' + by + (row.reason ? ' · ' + row.reason : '');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tsc-unlock-revoke';
    btn.textContent = 'Revoke';
    btn.addEventListener('click', function () { revokeUnlock(row, li); });
    li.appendChild(key); li.appendChild(meta); li.appendChild(btn);
    el.appendChild(li);
  });
}

async function revokeUnlock(row, liEl) {
  if (!_tscCurrentStudentStub) return;
  // Confirm before destructive op -- single-click revoke is too easy to misfire.
  if (!window.confirm('Revoke override for lesson ' + row.lesson_key + '?')) return;
  // Resolve studentUsername from _tscCurrentStudentStub.username (set by the row click).
  try {
    var res = await fetch(svcUrl() + '/teacher/lesson-unlock/revoke', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, teacherAuthHeaders()),
      body: JSON.stringify({
        studentUsername: _tscCurrentStudentStub.username,
        lessonKey: row.lesson_key,
      }),
    });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j.ok) {
      showError('Revoke failed: ' + (j && j.error ? j.error : ('HTTP ' + res.status)));
      return;
    }
    // Optimistic: fade the row out, then remove from DOM.
    liEl.style.opacity = '0.4';
    liEl.style.pointerEvents = 'none';
    setTimeout(function () { try { liEl.remove(); } catch (_) {} }, 240);
  } catch (err) {
    showError('Network error revoking: ' + (err && err.message ? err.message : 'unknown'));
  }
}
```

### 4.3 Tests: `tests/teacher-student-console-remediation.test.js`

Vitest + jsdom. Same harness pattern as
`tests/teacher-student-console-drawer.test.js` (P1 test scaffolding).

Required cases:

**describe('Remediation modal DOM presence')**
- `#tsc-remediation-modal` exists and is hidden by default (`aria-hidden="true"`, no `.tsc-modal-open`).
- All four form controls (`tsc-rem-unit`, `tsc-rem-skill`, `tsc-rem-notes`, `tsc-remediation-confirm`) exist.
- `#tsc-action-remediation` does NOT have `disabled`.

**describe('Open modal from drawer button')**
- After `openTscDrawer({...})`, click `#tsc-action-remediation` -> modal opens.
- Student name appears in `#tsc-remediation-student-name`.
- All form fields are empty.

**describe('Validation')**
- Submit with empty unit -> status text "Unit is required."; no fetch.
- Submit with `unit="abc"` -> status "Unit must look like 'U3'."; no fetch.
- Submit with `unit="U3"` + empty skill -> status "Skill code is required."; no fetch.

**describe('Successful POST')**
- Submit with `unit="U3"`, `skill="3.A"`, `notes=""` -> 1 fetch POST to `/remediation/propose` with body `{studentId, unit:"U3", skill:"3.A", notes:undefined, proposedBy:"teacher-dashboard"}`.
- The `x-teacher-secret` header is present when a secret is entered.
- 200 response with `{ok:true, assignmentId:'xyz'}` -> status text "Proposed (assignment xyz)."; modal closes after 1.4 s.

**describe('Error paths')**
- 503 response -> status shows the server's error string; modal stays open; confirm button re-enabled.
- 400 response with `{ok:false, error:'studentId, unit, and skill are required'}` -> shows the error.
- Network throw -> shows "Network error: ...".

**describe('Close affordances')**
- Click `.tsc-modal-close` -> modal closes.
- Click `.tsc-modal-overlay` -> modal closes.
- Click `Cancel` -> modal closes.
- ESC closes when modal open and does NOT also close the drawer behind it (because of the capture-phase listener + stopPropagation).

Test count target: 16-20.

### 4.4 Tests: `tests/teacher-student-console-unlocks.test.js`

Vitest + jsdom.

**describe('Lesson Unlocks section DOM presence')**
- `#tsc-section-unlocks` exists with `#tsc-unlocks-list` inside.
- It sits between the recent section and the actions nav.

**describe('Fetch wiring')**
- On `openTscDrawer`, 3 fetches fire (grade + recent + lesson-unlocks).
- All carry `x-teacher-secret` when set.
- 503 on the unlocks fetch -> the section renders the empty state, NOT an error; the drawer remains functional.

**describe('Render active unlocks')**
- Server returns 2 unlocks -> 2 `<li>` items with `lesson_key`, ISO date prefix, `unlocked_by`, and (if present) the reason.
- Each li has a `.tsc-unlock-revoke` button.
- 0 unlocks -> empty-state line "No active overrides.".

**describe('Revoke flow')**
- Stub `window.confirm` to return true.
- Click Revoke on row 1 -> POST `/teacher/lesson-unlock/revoke` with `{studentUsername, lessonKey:'1.7'}`.
- 200 response -> row fades to opacity 0.4 then is removed from DOM.
- 404 response -> error banner shown, row remains.
- Stub `confirm` to return false -> no fetch fired.

Test count target: 12-15.

## 5. What is explicitly OUT of P6

- **Remediation pre-fill from recent submissions.** A click affordance on each `#tsc-recent-list <li>` to open the modal pre-populated with that row's `itemId` as `sourceAttempt` + an inferred `skill` -- nice UX, but it requires reading the answer-key/skill-map in the dashboard (or a new pre-fill endpoint). Deferred; the manual modal is the MVP.
- **Skill-code dropdown.** The MVP uses a free-text input for `skill`. A dropdown of valid skill codes (from `skill-map.js`) is a follow-up.
- **Approve / Waive / Complete buttons in the drawer.** P6's modal only PROPOSES. Approval still happens from the existing Remediation tab in the dashboard.
- **Remediation list in the drawer.** A section showing the student's existing assignments (proposed / assigned / completed). Useful, but adds a 4th fetch + a new endpoint surface; deferred.
- **Stacked toasts on the cockpit side.** The cockpit's nudge panel already supports the `_renderReplyInList` history; a fan-out to multiple cards is more invasive. Out of scope.
- **Toast persistence across page reloads.** The student refreshes -> active toasts vanish. Acceptable; the server's `nudges_log` keeps the record.
- **Sound preference toggle.** Chime always plays. A teacher-side or student-side mute is deferred.
- **Lesson-unlock revoke with reason capture.** The revoke confirm is a `window.confirm` Y/N -- no reason textarea. The server appends `"revoked by X"` to the row's `reason` field; a structured `revoked_reason` would require a new migration. Deferred.
- **Bulk revoke** of all unlocks for a student. Each row revokes individually.
- **Migration 0010** for a dedicated `revoked_by` + `revoked_at` column on `lesson_unlock`. Deferred; the reason-append model is acceptable for single-teacher prod.

## 6. Smoke checks (planner-run after Codex fold)

1. `cd roster-server && npm test` -- expect +14-18 cases (Wave A); total fails should NOT increase from the 550/550 P5 baseline.
2. `npm test` from repo root -- expect +30-37 cases (Waves B + C); total fails should NOT increase from the 5129/5130 baseline (the 1 long-standing study-guide fail stays as-is).
3. **Manual Wave A**: `curl -X POST $ROSTER/teacher/lesson-unlock/revoke -H "x-teacher-secret: $SEC" -H 'Content-Type: application/json' -d '{"studentUsername":"some-real-student","lessonKey":"1.7"}'` -> expect `{ok:false, error:"no active unlock..."}` for an unrevoked student, `{ok:true, row:{status:"revoked"}}` after first creating then revoking.
4. **Manual Wave B**: Open the Desk over GH Pages, open DevTools, paste:
   ```js
   _showNudgeToast({nudgeId:'a', text:'first',  fromUsername:'mr.colson'});
   _showNudgeToast({nudgeId:'b', text:'second', fromUsername:'mr.colson'});
   _showNudgeToast({nudgeId:'c', text:'third',  fromUsername:'mr.colson'});
   _showNudgeToast({nudgeId:'d', text:'fourth', fromUsername:'mr.colson'});
   _showNudgeToast({nudgeId:'e', text:'fifth',  fromUsername:'mr.colson'});
   ```
   Expect 4 stacked toasts, 'a' missing, console warn about dropping 'a'.
5. **Manual Wave C T1**: Open `teacher-dashboard.html` over a local server (or GH Pages), enter the secret, click a student row -> drawer opens. Click "Apply remediation" -> modal opens. Fill `U3` + `3.A` + notes -> Propose -> success line; modal closes.
6. **Manual Wave C T3**: For a student with an active unlock (use P5's flow: enter View-as on the Desk + override 1.7), open the dashboard drawer for the same student -> "Lesson Unlocks" lists `1.7`. Click Revoke -> confirm -> row fades.

## 7. Dispatch instructions

All three waves dispatch in parallel via the Agent tool
(`general-purpose` agents at sonnet). Each prompt embeds the relevant
section verbatim (Wave A: §2; Wave B: §3; Wave C: §4) PLUS this
header's scope + the parent SPEC reference. NO paraphrase.

Each agent MUST:
- Read its assigned section + the parent `TEACHER_STUDENT_CONSOLE_SPEC.md` + the relevant P1-P5 BUILD doc for context.
- Touch ONLY the files in its row of §1's ownership table.
- Run its wave's tests locally before reporting success.
- Stage own paths only (`git add` explicit paths, never `-A`).

After all three return:
1. Planner runs the smoke checks (§6 #1 + #2).
2. Cross-agent.py to Codex with `task-type=review`, read-only, 600 s
   timeout, prompt embeds this BUILD doc + the three diffs +
   wave-by-wave summary. Use the standard BLOCKER / MAJOR / MINOR
   triage.
3. Fold all findings.
4. Re-run tests.
5. Decide commit. ONE commit per wave is fine; alternatively a single
   `feat: Teacher Student Console Phase 6 (polish trio)` commit.
6. Push. roster-server auto-deploys (Wave A); no other deploy step.

## 8. Recall on reload

- Parent: `TEACHER_STUDENT_CONSOLE_SPEC.md`. The §15 deferred items
  list names these three (apply remediation modal, stacked toasts,
  revocation UI).
- Sibling BUILDs: `TEACHER_STUDENT_CONSOLE_P[1-5]_BUILD.md`. P1 is
  the template for the dashboard drawer; P3 is the template for the
  nudge plumbing; P5 is the template for the lesson_unlock surface.
- Code pointers:
  - `roster-server/lesson-unlock.js` (~160 lines) + `lesson-unlock-db.js` (~50 lines) for Wave A's existing context.
  - `ap_stats_roadmap_square_mode.html` lines 1184-1265 (CSS + DOM for the old singleton toast) + 4070-4171 (JS) for Wave B's rewrite target.
  - `teacher-dashboard.html` lines 484-508 (drawer + the four action buttons) + 549-627 (`renderGradesTable`) + 605-650 (existing helpers) for Wave C.
  - `roster-server/remediation.js` lines 87-118 for the existing `/remediation/propose` shape -- Wave C does NOT touch this file; it only consumes the endpoint.

## 9. Notes the build agents should keep in mind

- **PowerShell 5.1 + git**: never `git commit -m` from PowerShell; use `git commit -F-` with a heredoc.
- **Stage own paths only**: never `git add -A`. The audit test regenerates `data/skill-map.js` -- `git checkout` before staging.
- **Typeof-guard cross-sprint calls**: P3's `_showNudgeToast` is called from `_mountClassroomBoard` via `typeof === 'function'`. Wave B preserves that public name + the same call shape; existing tests of `_mountClassroomBoard` do not need to change.
- **Cross-agent prompts ASCII-only**. Wave dispatch prompts must avoid `§` and other non-ASCII glyphs.
- **The lifted engine files** (`canvas_engine.js`, `sprite_sheet.js`) are sacred -- this phase does not touch them.
- **The cockpit test pattern** (`tests/poll-archive-cockpit.test.js`) does NOT apply here; Wave C uses the dashboard test pattern (`tests/teacher-student-console-drawer.test.js`).

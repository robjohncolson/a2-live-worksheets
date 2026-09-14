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

  // POST /teacher/nudge { nudgeId, recipientUsernames, text, deliveredUsernames }
  // Codex MAJOR fold P3: senderUsername + section are derived from the
  // authenticated teacher token; body values for these fields are IGNORED
  // (a teacher could otherwise forge audit rows as another teacher or
  // cross-section). Break-glass x-teacher-secret falls back to body.
  app.post('/teacher/nudge', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    var body = req.body || {};
    var nudgeId = (typeof body.nudgeId === 'string') ? body.nudgeId.trim() : '';
    var recipientUsernames = Array.isArray(body.recipientUsernames) ? body.recipientUsernames.filter(function(u) { return typeof u === 'string' && u.length > 0; }) : [];
    var text = (typeof body.text === 'string') ? body.text : '';
    var deliveredUsernames = Array.isArray(body.deliveredUsernames) ? body.deliveredUsernames : [];

    // Resolve sender identity from the authenticated token (Path B).
    var senderUsername = '';
    var section = null;
    var authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    var token = '';
    if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
      token = authHeader.replace(/^Bearer\s+/i, '').trim();
    } else if (req.query && typeof req.query.token === 'string') {
      token = req.query.token;
    }
    if (token) {
      try {
        var sid = verifyToken(token);
        if (sid) {
          var { data: rosterRow } = await db.findByStudentId(sid);
          if (rosterRow) {
            senderUsername = rosterRow.login_username || '';
            section = rosterRow.section || null;
          }
        }
      } catch (_) { /* fall through to break-glass fallback */ }
    }
    // Break-glass (x-teacher-secret): no token to resolve, accept body fields.
    if (!senderUsername && req.headers['x-teacher-secret']) {
      var bodySender = (typeof body.senderUsername === 'string') ? body.senderUsername.trim() : '';
      var bodySection = (typeof body.section === 'string') ? body.section.trim() : null;
      senderUsername = bodySender;
      section = bodySection;
    }

    if (!nudgeId || recipientUsernames.length === 0 || !text.trim() || !senderUsername) {
      return res.status(400).json({ ok: false, error: 'nudgeId, recipientUsernames, text required' });
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
    // Codex P7 MINOR fold: defense-in-depth. teacherUsername arrives from
    // rosterRow.login_username on the Bearer path; that column has only a
    // UNIQUE constraint today, not a character-set CHECK. Reject anything
    // that would let a stored username escape the PostgREST .or() filter
    // syntax. Today the API-generated usernames are safe; this guards against
    // future schema drift.
    if (!/^[a-zA-Z0-9_-]+$/.test(teacherUsername)) {
      return res.status(400).json({ ok: false, error: 'resolved teacherUsername has invalid characters' });
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
      var { data: rosterRow2, error: rosterErr2 } = await db.findByStudentId(studentId);
      if (rosterErr2 || !rosterRow2) return res.status(401).json({ ok: false, error: 'unauthorized' });
      roster = rosterRow2;
    } catch (_) { return res.status(401).json({ ok: false, error: 'unauthorized' }); }

    // Resolve the teacher recipient.
    var teacher2;
    try {
      var { data: teacherRow2, error: teacherErr2 } = await db.findTeacherUsername();
      // Codex P13 MINOR fold: do NOT mask a DB error as "no teacher". A real
      // 5xx from the DB lookup must surface so the client knows to retry,
      // not silently return an empty thread.
      if (teacherErr2) {
        console.error('GET /student/nudge-history findTeacher error:', teacherErr2);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!teacherRow2) return res.json({ ok: true, rows: [] });  // no teacher -> empty thread (acceptable)
      teacher2 = teacherRow2;
    } catch (err) {
      console.error('GET /student/nudge-history findTeacher throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    var limit = Number(req.query.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 20;
    if (limit > 100) limit = 100;
    var offset = Number(req.query.offset);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    // Validate usernames before passing to PostgREST (same gate as P7).
    if (!/^[a-zA-Z0-9_-]+$/.test(roster.login_username) || !/^[a-zA-Z0-9_-]+$/.test(teacher2.login_username)) {
      return res.status(400).json({ ok: false, error: 'resolved usernames have invalid characters' });
    }

    try {
      // Reuse listConversation -- the dyad is teacherUsername / studentUsername.
      var { data: histData, error: histError } = await nudgesDb.listConversation({
        teacherUsername: teacher2.login_username,
        studentUsername: roster.login_username,
        limit: limit,
        offset: offset,
      });
      if (histError) {
        if (histError.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
        console.error('GET /student/nudge-history error:', histError);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({
        ok: true,
        studentUsername: roster.login_username,
        teacherUsername: teacher2.login_username,
        limit: limit,
        offset: offset,
        rows: histData || [],
      });
    } catch (err) {
      console.error('GET /student/nudge-history throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // GET /student/nudge-history-guest?guestUsername=Guest_X&limit=N  (NO auth)
  // Guests have no roster token, so they can't use the token'd endpoint above —
  // this lets a guest READ the teacher's messages by their Guest_ alias. RESTRICTED
  // to Guest_* aliases (a real roster student MUST use /student/nudge-history).
  // The guest alias is stored with whatever case live presence used: the Desk
  // mounts a guest avatar as Title-case Guest_X (getGuestIdentity) and the server
  // never lowercases recipients, so the stored recipient is Title-case. We match
  // BOTH the verbatim alias and its lowercase form (listConversationGuest) so the
  // thread is found regardless of case. Low-sensitivity by design (teacher->guest
  // notes; the recipient is anonymous + temporary).
  app.get('/student/nudge-history-guest', async (req, res) => {
    var rawAlias = (typeof req.query.guestUsername === 'string' ? req.query.guestUsername : '').trim();
    if (!/^guest_[a-z0-9_-]+$/i.test(rawAlias)) {
      return res.status(400).json({ ok: false, error: 'guestUsername must be a Guest_ alias' });
    }
    // Match both the verbatim alias and its lowercase form (each passes the
    // PostgREST injection guard). De-duped so an all-lowercase alias is one clause.
    var aliasVariants = Array.from(new Set([rawAlias, rawAlias.toLowerCase()]));
    var teacher;
    try {
      var { data: tRow, error: tErr } = await db.findTeacherUsername();
      if (tErr) {
        console.error('GET /student/nudge-history-guest findTeacher error:', tErr);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!tRow) return res.json({ ok: true, studentUsername: rawAlias, teacherUsername: null, rows: [] });
      teacher = tRow;
    } catch (err) {
      console.error('GET /student/nudge-history-guest findTeacher throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(teacher.login_username)) {
      return res.status(400).json({ ok: false, error: 'resolved teacher username has invalid characters' });
    }
    var limit = Number(req.query.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 20;
    if (limit > 100) limit = 100;
    var offset = Number(req.query.offset);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    try {
      var { data, error } = await nudgesDb.listConversationGuest({
        teacherUsername: teacher.login_username,
        studentUsernames: aliasVariants,
        limit: limit, offset: offset,
      });
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
        console.error('GET /student/nudge-history-guest error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, studentUsername: rawAlias, teacherUsername: teacher.login_username, rows: data || [] });
    } catch (err) {
      console.error('GET /student/nudge-history-guest throw:', err);
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

    // Codex BLOCKER fold P3: verify the student was a delivered recipient
    // of the parent nudge before persisting the reply. Without this any
    // student could POST arbitrary reply rows with any parentNudgeId.
    if (typeof nudgesDb.findParent === 'function') {
      try {
        var { data: parentRow, error: parentErr } = await nudgesDb.findParent({
          nudgeId: parentNudgeId,
          recipientUsername: senderUsername,
        });
        if (parentErr) {
          if (parentErr.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
          console.error('POST /student/nudge-reply parent-lookup error:', parentErr);
          return res.status(500).json({ ok: false, error: 'Database error' });
        }
        if (!parentRow) {
          return res.status(403).json({ ok: false, error: 'no matching parent nudge for this recipient' });
        }
      } catch (err) {
        console.error('POST /student/nudge-reply parent-lookup throw:', err);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
    }

    try {
      var { data: replyData, error: replyError } = await nudgesDb.insertReply({
        parentNudgeId, senderUsername, recipientUsername, text, section,
      });
      if (replyError) {
        if (replyError.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
        console.error('POST /student/nudge-reply insert error:', replyError);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, row: replyData });
    } catch (err) {
      console.error('POST /student/nudge-reply throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // ── GET /teacher/nudge-inbox?section=&since=&limit= (teacher-gated) ─────────
  // 2026-09-09: student-initiated messages were only visible inside ONE student's
  // drawer, so the teacher found two of them a fortnight late. This lists every
  // student→teacher message across the class (optionally one section, optionally
  // only newer than `since`), newest first, so the dashboard can show an inbox
  // with an unread count. Read-only; grade-inert.
  app.get('/teacher/nudge-inbox', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (!nudgesDb || typeof nudgesDb.listStudentInbox !== 'function') {
      return res.status(503).json({ ok: false, error: 'nudges not provisioned' });
    }
    var section = typeof req.query.section === 'string' ? req.query.section.trim() : '';
    if (section && !/^[A-Za-z0-9_-]{1,40}$/.test(section)) {
      return res.status(400).json({ ok: false, error: 'section must be alphanumeric (with - or _)' });
    }
    var since = typeof req.query.since === 'string' ? req.query.since.trim() : '';
    if (since && Number.isNaN(Date.parse(since))) {
      return res.status(400).json({ ok: false, error: 'since must be an ISO timestamp' });
    }
    if (since) since = new Date(since).toISOString();   // canonical form only reaches PostgREST
    var limit = Number(req.query.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit > 200) limit = 200;
    try {
      var { data, error } = await nudgesDb.listStudentInbox({ section: section || null, since: since || null, limit: limit });
      if (error) {
        console.error('GET /teacher/nudge-inbox error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      var messages = (data || []).map(function (row) {
        return {
          nudgeId: row.nudge_id,
          senderUsername: row.sender_username,
          section: row.section || null,
          text: typeof row.text === 'string' ? row.text.slice(0, 2000) : '',
          createdAt: row.created_at,
          parentNudgeId: row.parent_nudge_id || null,
        };
      });
      return res.json({ ok: true, messages: messages, count: messages.length });
    } catch (err) {
      console.error('GET /teacher/nudge-inbox throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });
}

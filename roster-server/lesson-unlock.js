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

// Codex MAJOR fold P5: lesson key format gate. The Desk's calendar uses
// topic strings like "1.7" / "5.3" / "8.2"; rejecting other formats here
// prevents a typo (e.g., "u1-l7") from saving successfully but never
// clearing the gate (because _isTopicLessonUnlocked does exact-match).
const LESSON_KEY_RE = /^\d+\.\d+$/;

// Codex BLOCKER fold P5 (accepted, documented limitation):
// POST /teacher/lesson-unlock + GET /teacher/student/:id/lesson-unlocks
// do NOT enforce a teacher-to-section ownership check. Any teacher token
// can read/write unlocks for any student. This is CONSISTENT with the
// rest of the roster-server's teacher-gated surface (/class/grades,
// /class/mastery, /roster/list, /remediation/*) -- none of those check
// section ownership either. For this project's single-teacher cohort
// the risk is theoretical; production hardening for multi-teacher
// deployments would gate every teacher-authed endpoint by section
// administration (separate task, not P5 scope).

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
    // Codex MAJOR fold P5: reject lesson keys that don't match the Desk's
    // topic format. Without this, a typo like "u1-l7" saves silently but
    // never clears the gate (the Desk's _isTopicLessonUnlocked does exact
    // string match against the calendar's topic strings).
    if (!LESSON_KEY_RE.test(lessonKey)) {
      return res.status(400).json({ ok: false, error: 'lessonKey must match topic format like "1.7" or "5.3"' });
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

  // POST /teacher/lesson-unlock/revoke { studentUsername, lessonKey }
  // Auth: teacher (x-teacher-secret OR Bearer token resolving to role='teacher').
  // Flips status from 'active' to 'revoked'. Returns 404 when no active row
  // exists for that (student, lesson) -- idempotent against already-revoked rows.
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

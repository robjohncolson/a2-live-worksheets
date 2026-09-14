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

import { PHASE3_CONFIG } from './grade-config.js';
import { readFile } from 'node:fs/promises';
import { computeMastery, masteryObservations } from './mastery.js';
import { answerKeyMapOrNull, skillMapValidOrNull } from './scoring.js';
import { computeGrade } from './grade.js';
import { computeDonow } from './donow.js';
import { requireTeacher } from './teacher-auth.js';

// Studentizer: roster columns → the dashboard's per-student header.
function studentMeta(r) {
  return {
    studentId: r.student_id,
    realName: r.real_name,
    username: r.login_username,
    section: r.section,
  };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountTeacherStudent(app, {
  db, ledgerDb, loadAnswerKey, lessonSchedule, eventSchedule = null, config = PHASE3_CONFIG,
  worksheetBlankCounts = null, loadManifest = null,
  loadSkillMap = null, bkt = null,
  blooketPresence = null, blooketRequired = null, blooketLessons = null,
}) {
  const _presence = blooketPresence || blooketLessons || null;
  const _required = blooketRequired || null;

  // ── GET /teacher/student/:studentId/profile ─────────────────────────────────
  // Returns identity tuple: studentId, username, realName, section, role.
  app.get('/teacher/student/:studentId/profile', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const { studentId } = req.params;

    let roster, role;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/profile roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/profile roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    try {
      role = await db.getRoleByStudentId(studentId);
    } catch (_) {
      role = 'student';
    }

    return res.json({
      ok: true,
      studentId: roster.student_id,
      username: roster.login_username,
      realName: roster.real_name,
      section: roster.section,
      role,
    });
  });

  // ── GET /teacher/student/:studentId/grade ───────────────────────────────────
  // Single-student variant of /class/grades. Reuses computeGrade identically.
  app.get('/teacher/student/:studentId/grade', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    let answerKeyDoc;
    try { answerKeyDoc = await loadAnswerKey(); }
    catch (err) {
      console.error('GET /teacher/student/:studentId/grade answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) {
      console.error('GET /teacher/student/:studentId/grade answer-key malformed');
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }

    const { studentId } = req.params;

    let roster;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/grade roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/grade roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let ledgerRows = [];
    try {
      const { data, error } = await ledgerDb.getLedgerByStudent(studentId);
      if (!error) ledgerRows = Array.isArray(data) ? data : [];
    } catch (_) {
      // defensive: one student error → empty ledger, not a 500
      ledgerRows = [];
    }

    const computed = computeGrade(ledgerRows, answerKey, config, {
      lessonSchedule,
      eventSchedule,
      section: roster.section || null,
      worksheetBlankCounts,
      blooketPresence: _presence || undefined,
      blooketRequired: _required || undefined,
      blooketLessons: _presence || undefined,
    });

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      ...studentMeta(roster),
      ...computed,
      config: {
        C: config.C,
        feederWeights: config.feederWeights,
        frqBand: config.frqBand,
        quarters: config.quarters,
      },
    });
  });

  // ── GET /teacher/student/:studentId/recent?limit=N ──────────────────────────
  // Returns the N most recent ledger rows. Default 20; min 1; max 100.
  app.get('/teacher/student/:studentId/recent', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    // Parse limit: NaN/null/<1 → 20; Infinity or >100 → 100; else floor.
    // (Codex MINOR fold: Infinity used to fall to 20; now clamps to 100.)
    const raw = Number(req.query.limit);
    let limit;
    if (Number.isNaN(raw) || raw < 1) limit = 20;
    else if (!Number.isFinite(raw) || raw > 100) limit = 100;
    else limit = Math.floor(raw);

    const { studentId } = req.params;

    let roster;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/recent roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/recent roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let rows;
    try {
      const { data, error } = await ledgerDb.getLedgerByStudent(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/recent ledger error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      rows = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('GET /teacher/student/:studentId/recent ledger throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // A skill review must include every contributing attempt, even beyond the
    // generic recent-work limit. Reuse the diagnostic observation stream.
    if (req.query.skill != null) {
      if (typeof req.query.skill !== 'string' || !/^[0-9]+\.[A-Z]$/.test(req.query.skill)) {
        return res.status(400).json({ ok: false, error: 'Invalid skill' });
      }
      try {
        const answerKey = answerKeyMapOrNull(await loadAnswerKey());
        const skillMap = loadSkillMap && skillMapValidOrNull(await loadSkillMap());
        if (!answerKey || !skillMap || !bkt) throw new Error('Diagnostic inputs unavailable');
        const skill = req.query.skill;
        const catalog = JSON.parse(await readFile(new URL('./data/teacher-question-catalog.json', import.meta.url), 'utf8'));
        const observations = masteryObservations(rows, answerKey, skillMap, config).filter(o => o.skill === skill);
        const mastery = computeMastery(rows, answerKey, skillMap, bkt, config);
        const submissions = observations.map(o => ({
          recordedAt: o.row.recorded_at, itemId: o.row.item_id, source: o.row.source,
          response: o.row.response, score: o.row.score, attempt: o.row.attempt,
          correct: o.correct, expectedAnswer: answerKey[o.row.item_id]?.answerKey ?? null,
          question: catalog.questions[o.row.item_id] || null,
        }));
        return res.json({ ok: true, ...studentMeta(roster), skill,
          summary: mastery.skills[skill] || { observations: 0, correct: 0, pKnow: null },
          flagged: mastery.weakSkills.includes(skill), theta: config.diagnosticTheta,
          frqThreshold: config.frqDiagnosticCorrectThreshold, submissions });
      } catch (err) {
        console.error('Teacher skill evidence unavailable:', err.message);
        return res.status(503).json({ ok: false, error: 'Skill evidence unavailable' });
      }
    }

    // Sort by recorded_at desc (ISO 8601 sorts lexicographically), then slice.
    // (Codex MINOR fold: comparator returns 0 on equality so V8 stable sort
    // preserves relative order of equal-timestamp rows.)
    const sorted = rows.slice().sort((a, b) => {
      const ar = a.recorded_at || '';
      const br = b.recorded_at || '';
      if (br < ar) return -1;
      if (br > ar) return 1;
      return 0;
    });
    const sliced = sorted.slice(0, limit);

    // Map snake_case → camelCase per BUILD §2.2.3.
    const submissions = sliced.map(r => ({
      recordedAt: r.recorded_at,
      itemId:     r.item_id,
      source:     r.source,
      response:   r.response,
      score:      r.score,
      unit:       r.unit,
      attempt:    r.attempt,
    }));

    return res.json({
      ok: true,
      ...studentMeta(roster),
      submissions,
    });
  });

  // ── GET /teacher/student/:studentId/donow ────────────────────────────────────
  // Mirror of GET /donow but teacher-authed and student resolved from path param.
  // Requires loadManifest dep (passed through from server.js). Degrades to 500 if
  // loadManifest is not provided.
  // → 200 { ok:true, nextTask, lessons, units, earlierGapFlag }
  app.get('/teacher/student/:studentId/donow', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const { studentId } = req.params;

    let roster;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/donow roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/donow roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Load ledger rows for the target student.
    let ledgerRows = [];
    try {
      const { data, error } = await ledgerDb.getLedgerByStudent(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/donow ledger error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      ledgerRows = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('GET /teacher/student/:studentId/donow ledger throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Load work-manifest.
    if (!loadManifest) {
      return res.status(500).json({ ok: false, error: 'Work manifest not available' });
    }
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      console.error('GET /teacher/student/:studentId/donow manifest error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load work manifest' });
    }

    const computed = computeDonow(ledgerRows, manifest);

    return res.json({ ok: true, ...computed });
  });


}

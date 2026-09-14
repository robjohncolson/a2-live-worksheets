// remediation.js — mounts /remediation/* routes onto an Express app
// (Gradebook Phase 4b — GRADEBOOK_PHASE4B_BUILD.md §2.3).
//
// All routes are ADDITIVE. The DB-access is wrapped so the new table being
// absent (Postgres '42P01' relation-does-not-exist) returns 503 with a
// uniform "remediation table not yet provisioned" reason — the rest of the
// service stays up until the user runs migrations/0004_remediation_assignment.sql
// on the curriculum_render Supabase project.
//
// Endpoints:
//   POST /remediation/propose                  (teacher-gated)
//   POST /remediation/approve                  (teacher-gated)
//   POST /remediation/complete                 (token OR teacher-gated)
//   POST /remediation/waive                    (teacher-gated)
//   POST /remediation/propose-from-mastery     (teacher-gated; needs mastery deps)
//   GET  /remediation/student?token=           (token-gated)
//   GET  /remediation/list?section=&status=    (teacher-gated)
//   GET  /remediation/unlocks?token=&skill=    (token-gated; retake gate per §6)

import { computeMastery } from './mastery.js';
import { PHASE3_CONFIG } from './grade-config.js';
import { answerKeyMapOrNull, skillMapValidOrNull } from './scoring.js';
import { requireTeacher } from './teacher-auth.js';

function isTableMissing(error) {
  return !!(error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')));
}

function respondTableMissing(res) {
  return res.status(503).json({
    ok: false,
    error: 'remediation table not yet provisioned',
    hint: 'run roster-server/migrations/0004_remediation_assignment.sql',
  });
}

function respondDbError(res, where, error) {
  // eslint-disable-next-line no-console
  console.error(`remediation ${where} DB error:`, error);
  return res.status(500).json({ ok: false, error: 'Database error' });
}

function extractTokenFromQueryOrBody(req) {
  // Routes accept ?token= for GETs and body.token for POSTs (matches /mastery).
  const q = req.query && typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (q) return q;
  const b = req.body && typeof req.body.token === 'string' ? req.body.token.trim() : '';
  if (b) return b;
  return null;
}

// Defensive async wrapper (Codex Phase 4b MAJOR): Express 4 does NOT convert
// an awaited promise rejection inside an async handler into a JSON response —
// it would surface as an unhandled rejection and a hung request. Every
// remediation route is wrapped here so a thrown / rejected DB call always
// resolves to a 500 (or 503 when the error is the migration-pending sentinel),
// never blocks the caller, never leaks a stack. Mirrors class.js's defensive
// try/catch pattern.
function safeAsync(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('remediation handler unexpected error:', err);
      if (!res.headersSent) {
        if (isTableMissing(err)) return respondTableMissing(res);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
    }
  };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountRemediation(app, {
  verifyToken,
  remediationDb,
  db,
  ledgerDb,
  loadAnswerKey,
  loadSkillMap,
  bkt,
  config = PHASE3_CONFIG,
}) {

  // ── POST /remediation/propose (teacher-gated) ───────────────────────────────
  app.post('/remediation/propose', safeAsync(async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const { studentId, unit, skill, sourceAttempt, assignedRefs, unlocks, notes, proposedBy } = req.body || {};
    if (!studentId || !unit || !skill) {
      return res.status(400).json({ ok: false, error: 'studentId, unit, and skill are required' });
    }

    const { data, error } = await remediationDb.insertAssignment({
      studentId,
      unit,
      skill,
      sourceAttempt,
      assignedRefs,
      proposedBy: proposedBy || 'teacher',
      unlocks,
      notes,
    });

    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'propose', error);
    }

    return res.json({
      ok: true,
      assignmentId: data.assignment_id,
      status: data.status,
      assignment: data,
    });
  }));

  // ── POST /remediation/approve (teacher-gated) ───────────────────────────────
  app.post('/remediation/approve', safeAsync(async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const { assignmentId, approvedBy } = req.body || {};
    if (!assignmentId) return res.status(400).json({ ok: false, error: 'assignmentId is required' });

    const fetched = await remediationDb.getAssignmentById(assignmentId);
    if (fetched.error) {
      if (isTableMissing(fetched.error)) return respondTableMissing(res);
      // Supabase .single() returns code 'PGRST116' for no rows — treat as 404.
      if (fetched.error.code === 'PGRST116' || /no rows/i.test(fetched.error.message || '')) {
        return res.status(404).json({ ok: false, error: 'assignment not found' });
      }
      return respondDbError(res, 'approve.fetch', fetched.error);
    }
    const row = fetched.data;
    if (!row) return res.status(404).json({ ok: false, error: 'assignment not found' });
    if (row.status !== 'proposed') {
      return res.status(409).json({ ok: false, error: `cannot approve from status '${row.status}'`, status: row.status });
    }

    const { data, error } = await remediationDb.updateAssignmentStatus({
      assignmentId,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
      approvedBy: approvedBy || 'teacher',
    });

    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'approve.update', error);
    }

    return res.json({
      ok: true,
      status: data.status,
      assignedAt: data.assigned_at,
      assignment: data,
    });
  }));

  // ── POST /remediation/complete (token OR teacher-gated) ─────────────────────
  app.post('/remediation/complete', safeAsync(async (req, res) => {
    const { assignmentId, completedScore, recheckItemId } = req.body || {};
    if (!assignmentId) return res.status(400).json({ ok: false, error: 'assignmentId is required' });

    const token = extractTokenFromQueryOrBody(req);
    const teacherOk = await requireTeacher(req, db);
    let verifiedStudentId = null;
    if (token) {
      try { verifiedStudentId = verifyToken(token); } catch (_) { verifiedStudentId = null; }
    }
    if (!teacherOk && !verifiedStudentId) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const fetched = await remediationDb.getAssignmentById(assignmentId);
    if (fetched.error) {
      if (isTableMissing(fetched.error)) return respondTableMissing(res);
      if (fetched.error.code === 'PGRST116' || /no rows/i.test(fetched.error.message || '')) {
        return res.status(404).json({ ok: false, error: 'assignment not found' });
      }
      return respondDbError(res, 'complete.fetch', fetched.error);
    }
    const row = fetched.data;
    if (!row) return res.status(404).json({ ok: false, error: 'assignment not found' });
    if (row.status !== 'assigned') {
      return res.status(409).json({ ok: false, error: `cannot complete from status '${row.status}'`, status: row.status });
    }
    // Token branch: enforce that the verified student owns this assignment.
    if (verifiedStudentId && !teacherOk && row.student_id !== verifiedStudentId) {
      return res.status(403).json({ ok: false, error: 'this assignment is not yours' });
    }

    const { data, error } = await remediationDb.updateAssignmentStatus({
      assignmentId,
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedScore: completedScore == null ? null : Number(completedScore),
      recheckItemId: recheckItemId ?? null,
    });

    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'complete.update', error);
    }

    return res.json({
      ok: true,
      status: data.status,
      completedAt: data.completed_at,
      assignment: data,
    });
  }));

  // ── POST /remediation/waive (teacher-gated) ─────────────────────────────────
  app.post('/remediation/waive', safeAsync(async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const { assignmentId, notes } = req.body || {};
    if (!assignmentId) return res.status(400).json({ ok: false, error: 'assignmentId is required' });

    const fetched = await remediationDb.getAssignmentById(assignmentId);
    if (fetched.error) {
      if (isTableMissing(fetched.error)) return respondTableMissing(res);
      if (fetched.error.code === 'PGRST116' || /no rows/i.test(fetched.error.message || '')) {
        return res.status(404).json({ ok: false, error: 'assignment not found' });
      }
      return respondDbError(res, 'waive.fetch', fetched.error);
    }
    const row = fetched.data;
    if (!row) return res.status(404).json({ ok: false, error: 'assignment not found' });

    const { data, error } = await remediationDb.updateAssignmentStatus({
      assignmentId,
      status: 'waived',
      notes: notes ?? row.notes,
    });

    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'waive.update', error);
    }

    return res.json({ ok: true, status: data.status, assignment: data });
  }));

  // ── GET /remediation/student?token= (token-gated) ───────────────────────────
  app.get('/remediation/student', safeAsync(async (req, res) => {
    const token = extractTokenFromQueryOrBody(req);
    if (!token) return res.status(401).json({ ok: false, error: 'invalid token' });
    let studentId = null;
    try { studentId = verifyToken(token); } catch (_) { studentId = null; }
    if (!studentId) return res.status(401).json({ ok: false, error: 'invalid token' });

    const { data, error } = await remediationDb.listAssignmentsForStudent(studentId, {});
    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'student.list', error);
    }

    return res.json({ ok: true, assignments: data || [] });
  }));

  // ── GET /remediation/list?section=&status= (teacher-gated) ──────────────────
  app.get('/remediation/list', safeAsync(async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const section = (typeof req.query.section === 'string' && req.query.section.trim()) || null;
    const status = (typeof req.query.status === 'string' && req.query.status.trim()) || null;

    const { data, error } = await remediationDb.listAssignmentsForSection({ section, status });
    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'list', error);
    }

    return res.json({ ok: true, section, status, assignments: data || [] });
  }));

  // ── GET /remediation/unlocks?token=&skill= (token-gated) ────────────────────
  // Retake gate per GRADEBOOK_GRADING_SPEC.md §6: unlocked iff every 'assigned'
  // remediation for (student, skill) is 'completed' (or 'waived').
  app.get('/remediation/unlocks', safeAsync(async (req, res) => {
    const token = extractTokenFromQueryOrBody(req);
    if (!token) return res.status(401).json({ ok: false, error: 'invalid token' });
    let studentId = null;
    try { studentId = verifyToken(token); } catch (_) { studentId = null; }
    if (!studentId) return res.status(401).json({ ok: false, error: 'invalid token' });

    const skill = (typeof req.query.skill === 'string' && req.query.skill.trim()) || null;
    if (!skill) return res.status(400).json({ ok: false, error: 'skill is required' });

    const { data, error } = await remediationDb.findAssignment({ studentId, skill, statuses: ['assigned'] });
    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'unlocks', error);
    }

    const pending = (data || []).map(r => r.assignment_id);
    return res.json({ ok: true, skill, unlocked: pending.length === 0, pending });
  }));

  // ── POST /remediation/propose-from-mastery (teacher-gated) ──────────────────
  // Needs the mastery dependency set (db + ledgerDb + loadAnswerKey +
  // loadSkillMap + bkt). If any are missing, this route is skipped from the
  // mount entirely (the other routes still mount). See server.js guard.
  if (db && ledgerDb && loadAnswerKey && loadSkillMap && bkt) {
    app.post('/remediation/propose-from-mastery', safeAsync(async (req, res) => {
      if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

      const { section, dryRun, proposedBy } = req.body || {};
      if (!section) return res.status(400).json({ ok: false, error: 'section is required' });

      let answerKeyDoc, skillMapDoc;
      try { answerKeyDoc = await loadAnswerKey(); } catch (err) {
        return respondDbError(res, 'propose-from-mastery.answer-key', err);
      }
      try { skillMapDoc = await loadSkillMap(); } catch (err) {
        return respondDbError(res, 'propose-from-mastery.skill-map', err);
      }

      const answerKey = answerKeyMapOrNull(answerKeyDoc);
      const skillMap = skillMapValidOrNull(skillMapDoc);
      if (!answerKey || !skillMap) {
        return res.status(500).json({ ok: false, error: 'answer-key or skill-map malformed' });
      }

      // List the section's roster.
      let rosterRows = [];
      try {
        const rosterRes = await db.listRoster(section);
        if (rosterRes.error) return respondDbError(res, 'propose-from-mastery.roster', rosterRes.error);
        rosterRows = Array.isArray(rosterRes.data) ? rosterRes.data : [];
      } catch (err) {
        return respondDbError(res, 'propose-from-mastery.roster', err);
      }

      const proposed = [];
      const skipped = [];

      for (const r of rosterRows) {
        const sid = r.student_id;
        if (!sid) continue;

        // Fetch this student's ledger, compute mastery, get weakSkills.
        let ledgerRows = [];
        try {
          const lRes = await ledgerDb.getLedgerByStudent(sid);
          ledgerRows = lRes.error ? [] : (Array.isArray(lRes.data) ? lRes.data : []);
        } catch (_) {
          ledgerRows = [];
        }

        let mastery;
        try {
          mastery = computeMastery(ledgerRows, answerKey, skillMap, bkt, config);
        } catch (_) {
          mastery = { weakSkills: [] };
        }

        const weakSkills = Array.isArray(mastery.weakSkills) ? mastery.weakSkills : [];
        for (const skill of weakSkills) {
          // Idempotency: skip if a row already exists for this (student, skill)
          // in any open or completed status. Re-proposing after 'waived' is
          // fine, so 'waived' rows do NOT block a new proposal.
          let existing = [];
          try {
            const ex = await remediationDb.findAssignment({
              studentId: sid,
              skill,
              statuses: ['proposed', 'assigned', 'completed'],
            });
            if (ex.error) {
              if (isTableMissing(ex.error)) return respondTableMissing(res);
              // skip on transient error — don't block the rest of the batch
              continue;
            }
            existing = Array.isArray(ex.data) ? ex.data : [];
          } catch (_) {
            continue;
          }

          if (existing.length > 0) {
            skipped.push({
              studentId: sid,
              skill,
              existingStatus: existing[0].status,
              existingAssignmentId: existing[0].assignment_id,
            });
            continue;
          }

          if (dryRun) {
            proposed.push({ studentId: sid, skill, dryRun: true });
            continue;
          }

          // Derive a sensible 'unit' from the skill code's first segment when
          // possible (e.g., '3.A' → 'U3'); fall back to empty if unparseable.
          // The migration requires unit NOT NULL — supply a derived value so
          // bulk-propose doesn't fail. Teachers can refine on approve.
          const unitGuess = (() => {
            const m = /^(\d+)\./.exec(String(skill));
            return m ? `U${m[1]}` : 'U?';
          })();

          try {
            const ins = await remediationDb.insertAssignment({
              studentId: sid,
              unit: unitGuess,
              skill,
              proposedBy: proposedBy || 'system',
            });
            if (ins.error) {
              if (isTableMissing(ins.error)) return respondTableMissing(res);
              continue;
            }
            proposed.push({
              studentId: sid,
              skill,
              assignmentId: ins.data && ins.data.assignment_id,
            });
          } catch (_) {
            continue;
          }
        }
      }

      return res.json({ ok: true, section, dryRun: !!dryRun, proposed, skipped });
    }));
  }
}

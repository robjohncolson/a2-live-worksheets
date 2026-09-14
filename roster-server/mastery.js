// mastery.js — mounts GET /mastery onto an Express app (Gradebook Phase 3).
// Call mountMastery(app, { verifyToken, ledgerDb, loadAnswerKey, loadSkillMap, bkt })
// from createApp().
//
// The DIAGNOSTIC engine, fully DECOUPLED from the grade (GRADEBOOK_PHASE3_BUILD.md
// §2, GRADEBOOK_GRADING_SPEC.md §3). Rolls Bayesian Knowledge Tracing over the
// T2 skill-map tags from item_ledger and flags weak skills at θ=0.65. θ never
// enters any grade arithmetic. The BKT engine is the study-guide's lib/bkt.js,
// reused AS-IS via a byte-identical bundled copy (NOT a fork — §4 guardrail).
//
// READ-ONLY w.r.t. item_ledger. Student-facing rendering (Phase 4) shows a
// motivational per-skill view only — never BKT jargon / θ / probabilities.

import { PHASE3_CONFIG } from './grade-config.js';
import {
  isCorrect,
  answerKeyMapOrNull,
  skillMapValidOrNull,
} from './scoring.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractToken(req) {
  const authHeader =
    typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
  if (authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const q = req.query?.token;
  if (typeof q === 'string' && q.trim()) return q;
  return null;
}

function correctnessSignal(row, answerKey, frqThreshold) {
  const src = row?.source;
  if (src === 'curriculum_quiz' || src === 'pc') {
    const keyEntry = answerKey[row.item_id];
    if (!keyEntry || keyEntry.answerKey == null) return null;
    return isCorrect(row.response, keyEntry.answerKey);
  }
  if (src === 'frq') {
    const raw = row.score;
    // Number(null)===0 (finite) — nullish guard MUST precede Number() or an
    // ungraded FRQ would fold in as a (false) BKT observation.
    if (raw === null || raw === undefined || raw === '') return null;
    const s = Number(raw);
    if (!Number.isFinite(s)) return null;
    return s >= frqThreshold;
  }
  return null; // worksheet (no key/score) and unknown sources
}

// ── Pure compute (extracted for class fan-out reuse; behaviour-identical) ────
export function masteryObservations(ledgerRows, answerKey, skillMap, config = PHASE3_CONFIG) {
  // BKT consumes the FULL observation STREAM (every retry is evidence).
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];
  const observations = [];
  for (const row of rows) {
    const signal = correctnessSignal(row, answerKey, config.frqDiagnosticCorrectThreshold);
    if (signal == null) continue;
    const entry = skillMap[row.item_id];
    const skill = entry && entry.skill ? entry.skill : null;
    if (!skill) continue;
    observations.push({
      row,
      skill,
      correct: signal,
      at: Date.parse(row.recorded_at || '') || 0,
      attempt: Number(row.attempt) || 0,
    });
  }
  observations.sort((a, b) => (a.at - b.at) || (a.attempt - b.attempt));

  return observations;
}

// computeMastery(ledgerRows, answerKey, skillMap, bkt, config)
//   → { skills, weakSkills, totalObservations }
// Phase-3 tests pin behaviour; class.js fans out over the roster calling this.
export function computeMastery(ledgerRows, answerKey, skillMap, bkt, config = PHASE3_CONFIG) {
  const theta = config.diagnosticTheta;
  const pInit =
    bkt && bkt.DEFAULT_PARAMS && Number.isFinite(bkt.DEFAULT_PARAMS.pInit)
      ? bkt.DEFAULT_PARAMS.pInit
      : 0.3;

  const observations = masteryObservations(ledgerRows, answerKey, skillMap, config);

  const skills = {};
  for (const o of observations) {
    const s = skills[o.skill] || (skills[o.skill] = { pKnow: pInit, observations: 0, correct: 0 });
    s.pKnow = bkt.updateMastery(s.pKnow, o.correct);
    s.observations += 1;
    if (o.correct) s.correct += 1;
  }

  const skillsOut = {};
  const weakSkills = [];
  for (const skill of Object.keys(skills).sort()) {
    const s = skills[skill];
    if (s.pKnow < theta) weakSkills.push(skill); // raw posterior — not rounded
    skillsOut[skill] = {
      pKnow: Math.round(s.pKnow * 1000) / 1000,
      observations: s.observations,
      correct: s.correct,
    };
  }

  return { skills: skillsOut, weakSkills, totalObservations: observations.length };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountMastery(
  app,
  { verifyToken, ledgerDb, loadAnswerKey, loadSkillMap, bkt, config = PHASE3_CONFIG }
) {

  // GET /mastery
  //   Auth: roster token (Authorization: Bearer <t> OR ?token=).
  //   → 200 { ok, asOf, theta, skills:{ "<skill>":{pKnow,observations,correct} },
  //           weakSkills:[...], totalObservations }
  //   Read-only w.r.t. item_ledger.
  app.get('/mastery', async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Token required' });
    }
    const studentId = verifyToken(rawToken);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    if (!bkt || typeof bkt.updateMastery !== 'function') {
      console.error('GET /mastery: BKT engine unavailable');
      return res.status(500).json({ ok: false, error: 'Diagnostic engine unavailable' });
    }

    let ledgerResult;
    try {
      ledgerResult = await ledgerDb.getLedgerByStudent(studentId);
    } catch (err) {
      console.error('GET /mastery ledger error:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const { data: ledgerRows, error: ledgerError } = ledgerResult || {};
    if (ledgerError) {
      console.error('GET /mastery ledger error:', ledgerError);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let answerKeyDoc, skillMap;
    try {
      answerKeyDoc = await loadAnswerKey();
    } catch (err) {
      console.error('GET /mastery answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) {
      console.error('GET /mastery answer-key malformed:', typeof answerKeyDoc);
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }
    try {
      skillMap = await loadSkillMap();
    } catch (err) {
      console.error('GET /mastery skill-map error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load skill map' });
    }
    if (!skillMapValidOrNull(skillMap)) {
      console.error('GET /mastery skill-map malformed:', typeof skillMap);
      return res.status(500).json({ ok: false, error: 'Skill map malformed' });
    }

    const { skills, weakSkills, totalObservations } =
      computeMastery(ledgerRows, answerKey, skillMap, bkt, config);

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      theta: config.diagnosticTheta,
      skills,
      weakSkills,
      totalObservations,
    });
  });
}

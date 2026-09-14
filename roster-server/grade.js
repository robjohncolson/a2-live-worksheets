import { computeA2V3 } from './a2-v3-grade.js';
import { computeDistrictGrade } from './district-ledger.js';
// @ts-check
// grade.js — mounts GET /grade onto an Express app (Gradebook Phase 3+6).
// Call mountGrade(app, { verifyToken, ledgerDb, loadAnswerKey, lessonSchedule }) from createApp().
//
// Phase 3: unitGrade(u) = max( min(B(u), C=85), P(u) )
// Phase 6 additions:
//   - lessons[] array on the response (per-lesson grade breakdown)
//   - quarters[].quarterGrade is REPLACED with lesson-weighted, date-driven calc
//   - quarters[].lessonsDue / lessonsGraded / lessonsTotal added
//   - Quarter bands updated: Q1=[1,2,3], Q2=[4,5], Q3=[6,7], Q4=[8,9]
//
// The `units` field on the response is UNCHANGED in shape and values
// (teacher dashboard via class.js fans out computeGrade and reads it).

import {
  PHASE3_CONFIG,
  unitNumber,
  quarterOfUnit,
  quarterOfDate,
} from './grade-config.js';
import {
  latestPerItem,
  unitOf,
  answerKeyMapOrNull,
  scoreAgainstKey,
} from './scoring.js';
import {
  buildWorksheetBlankCounts,
  computeLessonGrades,
  computeQuarterFromLessons,
  computeQuarterV3,
  buildLessonsArray,
  computeQuizTotals,
  todayInTz,
  sectionToPeriod,
  deriveQuarterBands,
} from './lesson-grade.js';
import { buildGradebook } from './gradebook-grid.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Blooket lists from gen-blooket-lessons.mjs (M2a presence/required split):
//   topics / allTopics     = PRESENCE (has a Blooket) → hasBlooket UI columns
//   requiredTopics         = REQUIRED denominator (core 66) → blooketDue track
//   bonusTopics            = enrichment (G4: visible, never required)
// useV3 path is the primary consumer of the required list (computeQuarterV3);
// env USE_V3_GRADING=true gates v3 (default false in code). Railway env unverifiable.
function _loadBlooketDoc() {
  try {
    const p = resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'blooket-lessons.json');
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}
const _blooketDoc = _loadBlooketDoc();
/** @deprecated Prefer BLOOKET_PRESENCE / BLOOKET_REQUIRED — kept as presence for back-compat. */
const BLOOKET_LESSONS = Array.isArray(_blooketDoc?.topics) ? _blooketDoc.topics : [];
/** All topicKeys that HAVE a Blooket (UI / hasBlooket). */
export const BLOOKET_PRESENCE = Array.isArray(_blooketDoc?.topics)
  ? _blooketDoc.topics
  : Array.isArray(_blooketDoc?.allTopics)
    ? _blooketDoc.allTopics
    : [];
/** Core topicKeys for the required Blooket Due denominator. */
export const BLOOKET_REQUIRED = Array.isArray(_blooketDoc?.requiredTopics)
  ? _blooketDoc.requiredTopics
  : BLOOKET_PRESENCE.slice(); // pre-split files: all present were required
/** Bonus enrichment keys (never in required denominator). */
export const BLOOKET_BONUS_TOPICS = Array.isArray(_blooketDoc?.bonusTopics)
  ? _blooketDoc.bonusTopics
  : [];

/**
 * Resolve the effective Blooket lists the same way computeGrade does.
 * - presence: opts.blooketPresence || opts.blooketLessons (legacy) || module PRESENCE
 * - required: opts.blooketRequired || module REQUIRED
 *   (legacy blooketLessons is NEVER the required denominator — presence only)
 * Used by transcript artifactHash so hash inputs bind to the lists actually graded.
 * @param {object} [opts]
 * @returns {{ blooketPresence: string[], blooketRequired: string[] }}
 */
export function resolveBlooketLists(opts = {}) {
  const blooketPresence =
    (opts && opts.blooketPresence) ||
    (opts && opts.blooketLessons) ||
    BLOOKET_PRESENCE;
  const blooketRequired =
    (opts && opts.blooketRequired) ||
    BLOOKET_REQUIRED;
  return { blooketPresence, blooketRequired };
}

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

// Resolve a worksheet/frq row's unit: prefer the recorded `unit` column
// (DN2b stamps "U4"), else parse the item_id ("WS-U4L1-2-reflect1" → U4).
function unitKeyOf(row) {
  if (row && row.unit != null && String(row.unit).trim() !== '') {
    const n = unitNumber(row.unit);
    if (n != null) return `U${n}`;
  }
  return unitOf(row?.item_id, null);
}

// DN2b records frq score ∈ {1,0.5,0} (E/P/I). Remap to the teacher band.
// Tolerant of float noise: nearest of E(1)/P(0.5)/I(0). A null/blank/non-
// numeric score = "recorded but not gradable" → excluded from the W
// denominator (completion-only). NOTE: Number(null)===0 (finite), so the
// nullish guard MUST precede Number() or an ungraded FRQ would score as I.
function frqScoreToPct(score, frqBand) {
  if (score === null || score === undefined || score === '') return null;
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  if (s >= 0.75) return frqBand.E;
  if (s >= 0.25) return frqBand.P;
  return frqBand.I;
}

export function computeGrade(ledgerRows, answerKey, config = PHASE3_CONFIG, opts = {}) {
  const a2Input = (opts.items || config.a2Items || []).length || (ledgerRows || []).some(row => ['lesson-check', 'try-it', 'topic-assessment', 'flashcard'].includes(row.source))
    || /(?:Period)?[CDG]$/i.test(opts.section || '');
  if (!config.useDistrictFormula && config.useV3 && a2Input) return computeA2V3(ledgerRows, config, opts, todayInTz(config.schoolTz || 'America/New_York', opts.asOf));
  if (config.useDistrictFormula) return computeDistrictGrade(ledgerRows, config, opts, todayInTz(config.schoolTz || 'America/New_York', opts.asOf));
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];
  const bySource = (s) => rows.filter((r) => r && r.source === s);
  
  const eventSchedule = (opts && opts.eventSchedule) || null;

  // ── Q: cr-quiz correctness % per unit (re-scored vs key) ─────────────────
  const qAgg = scoreAgainstKey(bySource('curriculum_quiz'), answerKey);
  // ── W: AI-FRQ pct per unit (worksheet fill-ins = completion-only, §5) ────
  const wByUnit = {};       // U# → { sum, n }
  for (const row of latestPerItem(bySource('frq'))) {
    const pct = frqScoreToPct(row.score, config.frqBand);
    if (pct == null) continue; // not yet graded → excluded from W denominator
    const u = unitKeyOf(row);
    const w = wByUnit[u] || (wByUnit[u] = { sum: 0, n: 0 });
    w.sum += pct;
    w.n += 1;
  }

  // ── Completion readout (SEPARATE accountability, NOT the grade) ──────────
  const completion = {};
  const bumpCompletion = (u, src) => {
    const c = completion[u] || (completion[u] = { worksheet: 0, frq: 0, curriculum_quiz: 0 });
    if (src in c) c[src] += 1;
  };
  for (const src of ['worksheet', 'frq']) {
    for (const row of latestPerItem(bySource(src))) bumpCompletion(unitKeyOf(row), src);
  }
  for (const row of latestPerItem(bySource('curriculum_quiz'))) {
    bumpCompletion(unitOf(row.item_id, answerKey[row.item_id]), 'curriculum_quiz');
  }
  // ── Per-unit grade math ──────────────────────────────────────────────────
  const allUnitKeys = new Set([
    ...Object.keys(qAgg.units),
    ...Object.keys(wByUnit),
    ...Object.keys(completion),
  ]);

  const C = config.C;
  const { W: wWeight, Q: qWeight } = config.feederWeights;

  const units = {};
  
  for (const uKey of allUnitKeys) {
    const unitNum = unitNumber(uKey);

    const W = wByUnit[uKey] ? Math.round((wByUnit[uKey].sum / wByUnit[uKey].n) * 10) / 10 : null;
    const Q = qAgg.units[uKey] ? qAgg.units[uKey].pct : null;

    let B = null;
    {
      let num = 0, den = 0;
      if (W != null) { num += wWeight * W; den += wWeight; }
      if (Q != null) { num += qWeight * Q; den += qWeight; }
      if (den > 0) B = Math.round((num / den) * 10) / 10;
    }
    const banked = B == null ? null : Math.round(Math.min(B, C) * 10) / 10;

    const graded = banked != null;
    const unitGrade = banked;

    units[uKey] = { W, Q, B, banked, unitGrade, graded };
  }

  // ── Phase 6: lesson-level aggregation + date-driven quarter grade ─────────
  //
  // The schedule is passed via opts.lessonSchedule. If missing or malformed,
  // we degrade gracefully: every lesson treated as "due" (no date filter),
  // using the old unit-mean quarter grade as the lesson-weighted result.
  const schedule = (opts && opts.lessonSchedule) || null;
  const section  = (opts && opts.section) || null;
  const schoolTz = (config && config.schoolTz) || 'America/New_York';
  const todayStr = todayInTz(schoolTz, opts && opts.asOf);

  // Compute per-lesson grades from all ledger rows (latest-per-item already
  // handled inside computeLessonGrades for the sources it cares about).
  // Codex MAJOR 2 fold 2026-05-20: when schedule is null we still populate
  // lessonMap — `expandLessonKey` synthesizes a "{unit}.{lessonKey}" topicKey
  // so the lesson-level math works without a schedule. The fallback in the
  // quarter-aggregation block (below) then iterates this populated map and
  // produces a lesson-weighted quarter grade, not the old unit-mean.
  const worksheetBlankCounts = (opts && opts.worksheetBlankCounts) || null;
  // Presence (hasBlooket UI) vs required (Due denominator) — M2a / G4.
  // Shared resolver so transcript artHash / offline clients bind the same lists.
  const { blooketPresence, blooketRequired } = resolveBlooketLists(opts || {});
  // Bonus = presence minus required. Derived (not a new input) so it is
  // automatically year-aware AND already bound by artifactHash, which hashes
  // both source lists. SY2526's freeze has required == presence -> empty set.
  const _requiredSet = new Set(blooketRequired);
  const bonusTopicSet = new Set(blooketPresence.filter((t) => !_requiredSet.has(t)));
  const allLatestRows = latestPerItem(rows);
  const lessonMap = computeLessonGrades(allLatestRows, config.frqBand, answerKey, schedule, {
    worksheetBlankCounts,
    weights: config.lessonFeederWeights || { ws: 1, W: 2, Q: 3 },
    bonusTopics: bonusTopicSet,
  });

  // Quiz-bearing topics (gradable quizTotal > 0) — the v3 Quiz-track denominator,
  // so quiz-less openers don't unfairly drag the quiz average down. Computed once
  // here (it was previously built only for buildLessonsArray below) and reused.
  const quizTotals = (schedule && answerKey) ? computeQuizTotals(answerKey, schedule) : {};
  const quizLessons = Object.keys(quizTotals).filter((k) => quizTotals[k] > 0);

  // ── Per-quarter lesson-weighted grade ─────────────────────────────────────
  const quarters = {};
  // Unit bands are DERIVED from the schedule dates (deriveQuarterBands) so the
  // unit roll-up, the P_quarter mean, the gradebook columns and the dashboard's
  // quarter labels all follow the same date logic that already assigns lessons
  // to quarters (quarterOfLesson). The static config list is only the fallback.
  const _quarterBands = deriveQuarterBands(
    config, schedule, sectionToPeriod(section), (config && config.gradingWindowStart) || null,
  );
  for (const qKey of Object.keys(config.quarters)) {
    const band = _quarterBands[qKey] || config.quarters[qKey].units;
    // Unit-level data (UNCHANGED — teacher dashboard reads this).
    const unitGrades = {};
    for (const n of band) {
      const uKey = `U${n}`;
      unitGrades[uKey] = units[uKey] ? units[uKey].unitGrade : null;
    }

    const P_quarter = 0;

    let qResult;
    if (config.useV3 && schedule) {
      // v3 (GRADING_MODEL_V3_BUILD.md): two-track max/mean conditional. Same
      // single gate point covers /grade (student) and /class/grades (teacher)
      // because both fan out through computeGrade.
      // NOTE: v3 REQUIRES a schedule. If useV3 is on but the schedule failed to
      // load (logged at boot), this branch is skipped and grades fall through
      // to the Phase 6 no-schedule path below — different math, pcAvg/workAvg
      // null. Normal operation ships the bundled schedule, so this is an edge.
      qResult = computeQuarterV3({
        quarterKey: qKey,
        config,
        lessonMap,
        schedule,
        todayDateStr: todayStr,
        section,
        gradingWindowStart: (config && config.gradingWindowStart) || null,
        blooketLessons: blooketRequired, // REQUIRED denominator only (core 66)
        quizLessons,
        eventSchedule,
      });
    } else if (schedule) {
      qResult = computeQuarterFromLessons({
        quarterKey: qKey,
        config,
        lessonMap,
        schedule,
        todayDateStr: todayStr,
        section,
        pcBandData: { P_quarter },
        C,
        // 2026-05-20 hotfix: gradingWindowStart filters out stale prior-year
        // dates left in the schedule from a finished cohort. Without this
        // Q3/Q4 showed 0% + ceiling 100 because U6-U9 still carried April-2026
        // dates from SY25-26 and were flagged "past-due" for the new cohort.
        gradingWindowStart: (config && config.gradingWindowStart) || null,
      });
    } else {
      // Codex MAJOR 2 fold (2026-05-20): the contract says missing schedule
      // should disable only the DATE FILTER, not revert to old unit-mean.
      // Use lesson-level aggregation over the lessons we can SEE in the
      // ledger (parsed from item_ids), treating each parsed lesson as "due"
      // (no date filter). This preserves the lesson-weighted shape so the
      // teacher dashboard and student pill don't disagree on math just
      // because the bundled schedule file is missing.
      //
      // Note: without a schedule we don't know UNATTEMPTED lessons exist —
      // the denominator is only the lessons present in lessonMap whose unit
      // is in the band. That's a softer "current quality at lesson level"
      // grade, not the strict "ungraded-due counted as 0" semantics.
      const vals = [];
      for (const [topicKey, result] of lessonMap.entries()) {
        const m = /^(\d+)\./.exec(topicKey);
        if (!m) continue;
        const unitNum = Number(m[1]);
        if (!band.includes(unitNum)) continue;
        if (result && result.lessonGrade != null) vals.push(result.lessonGrade);
      }
      const rawQ = vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;
      const bankedQ = rawQ == null ? null : Math.round(Math.min(rawQ, C) * 10) / 10;
      const qGrade = rawQ == null && P_quarter === 0
        ? null
        : Math.round(Math.max(bankedQ == null ? 0 : bankedQ, P_quarter) * 10) / 10;
      qResult = {
        quarterGrade: qGrade,
        ceiling: null,            // no ceiling without a schedule denominator
        lessonsDue: null,         // not knowable without schedule
        lessonsGraded: vals.length,
        lessonsTotal: null,       // not knowable without schedule
      };
    }

    const unitsGraded = Object.values(unitGrades).filter(v => v != null).length;

    quarters[qKey] = {
      units: band,
      
      unitGrades,
      quarterGrade: qResult.quarterGrade,
      // SY2627 early-completion bonus surface (v3 only; explicit pick, see below).
      quarterGradeBase: typeof qResult.quarterGradeBase === 'number' ? qResult.quarterGradeBase : null,
      earlyBonus: typeof qResult.earlyBonus === 'number' ? qResult.earlyBonus : 0,
      earlyLessons: typeof qResult.earlyLessons === 'number' ? qResult.earlyLessons : 0,
      earlyKeys: Array.isArray(qResult.earlyKeys) ? qResult.earlyKeys : [],
      aheadLessons: typeof qResult.aheadLessons === 'number' ? qResult.aheadLessons : 0,
      aheadKeys: Array.isArray(qResult.aheadKeys) ? qResult.aheadKeys : [],
      unitsGraded,
      unitsTotal: band.length,
      ceiling: qResult.ceiling,
      // Phase 6 additions:
      lessonsDue: qResult.lessonsDue,
      lessonsGraded: qResult.lessonsGraded,
      lessonsTotal: qResult.lessonsTotal,
      // v3 additions (null on the Phase 6 path):
      pcAvg: qResult.pcAvg != null ? qResult.pcAvg : null,
      workAvg: qResult.workAvg != null ? qResult.workAvg : null,
      // Raw [0,1] track fractions for the reconciliation branch (null on Phase 6).
      pcAvgRaw: qResult.pcAvgRaw != null ? qResult.pcAvgRaw : null,
      workAvgRaw: qResult.workAvgRaw != null ? qResult.workAvgRaw : null,
      // Work sub-track breakdown + Blooket make-up surface (v3 only; the "Why so
      // low?" coach reads these). Undefined on the Phase 6 path → client guards.
      workTracks: qResult.workTracks || null,
      blooketDue: typeof qResult.blooketDue === 'number' ? qResult.blooketDue : null,
      blooketDone: typeof qResult.blooketDone === 'number' ? qResult.blooketDone : null,
      blooketTodo: Array.isArray(qResult.blooketTodo) ? qResult.blooketTodo : [],
      // Quiz surface (symmetry with Blooket) — powers the dashboard's
      // "Quizzes X (n/m taken)" verification line. quarters[qKey] is an explicit
      // pick, NOT a spread, so these must be threaded or they never reach the client.
      quizDue: typeof qResult.quizDue === 'number' ? qResult.quizDue : null,
      quizDone: typeof qResult.quizDone === 'number' ? qResult.quizDone : null,
      quizTodo: Array.isArray(qResult.quizTodo) ? qResult.quizTodo : [],
      
    };
  }

  // ── Phase 6: build the lessons[] array ────────────────────────────────────
  // (quizTotals computed above, reused here.)
  // M2d: stamp blooketBonus from bonus list (opts override or module default).
  const blooketBonusTopics =
    (opts && opts.blooketBonusTopics) ||
    BLOOKET_BONUS_TOPICS;
  const lessons = schedule
    ? buildLessonsArray(
        lessonMap,
        schedule,
        undefined,
        (config && config.gradingWindowStart) || null,
        quizTotals,
        blooketPresence,
        undefined,
        blooketBonusTopics,
      )
    : [];

  // Stable sorted unit / completion order.
  const unitsOut = {};
  for (const u of Object.keys(units).sort()) unitsOut[u] = units[u];
  const completionOut = {};
  for (const u of Object.keys(completion).sort()) completionOut[u] = completion[u];

  return { units: unitsOut, quarters, completion: completionOut, lessons, formula: 'v3' };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountGrade(app, {
  verifyToken, ledgerDb, loadAnswerKey, lessonSchedule, eventSchedule = null, db,
  config = PHASE3_CONFIG, worksheetBlankCounts = null,
  // Presence (hasBlooket UI) vs required (Due denominator). blooketLessons is a
  // legacy alias for presence when only one list is supplied.
  blooketLessons = null, blooketPresence = null, blooketRequired = null,
  blooketBonusTopics = null,
}) {
  const _presence = blooketPresence || blooketLessons || null;
  const _required = blooketRequired || null;
  const _bonus = blooketBonusTopics || null;

  // GET /grade
  //   Auth: roster token (Authorization: Bearer <t> OR ?token=).
  //   → 200 { ok, asOf, config, units, quarters, completion, lessons }
  //   Read-only w.r.t. item_ledger.
  app.get('/grade', async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Token required' });
    }
    const studentId = verifyToken(rawToken);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    let ledgerResult;
    try {
      ledgerResult = await ledgerDb.getLedgerByStudent(studentId);
    } catch (err) {
      console.error('GET /grade ledger error:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const { data: ledgerRows, error: ledgerError } = ledgerResult || {};
    if (ledgerError) {
      console.error('GET /grade ledger error:', ledgerError);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let answerKeyDoc;
    try {
      answerKeyDoc = await loadAnswerKey();
    } catch (err) {
      console.error('GET /grade answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) {
      console.error('GET /grade answer-key malformed:', typeof answerKeyDoc);
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }

    // Resolve the student's section for the lesson-due date filter.
    // BLOCKER fold (Codex 2026-05-20): the ledger doesn't persist `section`,
    // so the previous "scan ledger rows" pattern always fell through to the
    // B/E union. Look up the roster row by student_id instead — that's the
    // only source of truth for section.
    let section = null;
    if (db && typeof db.findByStudentId === 'function') {
      try {
        const { data: rosterRow } = await db.findByStudentId(studentId);
        if (rosterRow && rosterRow.section) section = rosterRow.section;
      } catch (_) {
        // section stays null → date filter uses union of B+E (defensive degrade)
      }
    }

    const computed = computeGrade(
      ledgerRows,
      answerKey,
      config,
      {
        lessonSchedule,
        eventSchedule,
        section,
        worksheetBlankCounts,
        blooketPresence: _presence || undefined,
        blooketRequired: _required || undefined,
        blooketBonusTopics: _bonus || undefined,
        // legacy single-list alias (presence) for older callers
        blooketLessons: _presence || undefined,
      }
    );

    const { units, quarters, completion, lessons } = computed;
    return res.json({
      ...computed,
      ok: true,
      asOf: new Date().toISOString(),
      config: {
        C: config.C,
        feederWeights: config.feederWeights,
        frqBand: config.frqBand,
        quarters: config.quarters,
      },
      units,
      quarters,
      completion,
      lessons,
      // In-app "1:1 Schoology gradebook" grid (additive). The student self-view
      // renders this; per-quarter component cells + the Schoology category-weighted
      // total alongside the v3 total. Clients that don't know the field ignore it.
      // lessonSchedule + section + today stamp each column with `due` so date-gating
      // clients (teacher dashboard) can hide future, not-yet-started work.
      gradebook: buildGradebook(
        computed,
        { lessonSchedule, eventSchedule, section, todayStr: todayInTz((config && config.schoolTz) || 'America/New_York', undefined) }
      ),
    });
  });
}

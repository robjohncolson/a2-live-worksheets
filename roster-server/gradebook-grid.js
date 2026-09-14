import { districtGradebook } from './district-ledger.js';


import { sectionToPeriod } from './lesson-grade.js';

export const SCHOOLOGY_CATEGORY_WEIGHTS = { Assessments: 50, Assignments: 40, Engagement: 10 };

// Historical fixtures retain their original category blend.
const LEGACY_CATEGORY_WEIGHTS = {
  Lesson: 15,
  Quizzes: 15,
  Blooket: 5,
};

const KIND_CATEGORY = {
  followalong: 'Lesson',
  quiz: 'Quizzes',
  blooket: 'Blooket',
};

const KIND_RANK = { followalong: 0, quiz: 1, blooket: 2 };

function round1(x) {
  return x == null ? null : Math.round(x * 10) / 10;
}

function groupLabel(unit, worksheetKey) {
  return `${unit}.${worksheetKey}`;
}

function topicNum(topicKey) {
  const m = /^\d+\.(\d+)/.exec(String(topicKey || ''));
  return m ? Number(m[1]) : 9999;
}

function _columnDueDate(col, lessons, period, events) {
  if (!lessons) return null;
  function pdate(entry) {
    const p = entry && entry.periods;
    if (!p) return null;
    if (period) return p[period] || null;
    if (p.B && p.E) return p.B < p.E ? p.B : p.E;
    return p.B || p.E || null;
  }
  if (col.topicKeys && col.topicKeys.length) {
    let latest = null;
    for (const tk of col.topicKeys) {
      const ds = pdate(lessons[tk]);
      if (ds && (!latest || ds > latest)) latest = ds;
    }
    return latest;
  }
  let earliest = null;
  for (const k of Object.keys(lessons)) {
    const L = lessons[k];
    if (L && L.unit === col.unit) {
      const ds = pdate(L);
      if (ds && (!earliest || ds < earliest)) earliest = ds;
    }
  }
  return earliest;
}

// ── Column generator (schedule-driven; identical for every student) ────────────
//
// gradeObj: a computeGrade() result ({ lessons, units, quarters, ... }).
// quarterKey: 'Q1'..'Q4'. Columns cover the quarter's unit band.
// dueOpts (optional): { lessons, section, todayStr } — when given, each column is
// stamped with a `due` boolean (its calendar date has arrived by todayStr). Omitted
// → columns carry no `due` field, and date-gating clients show everything (degrade).
export function buildGradebookColumns(gradeObj, quarterKey, dueOpts) {
  if (gradeObj?.items) return districtGradebook(gradeObj).quarters[quarterKey]?.columns || [];
  const quarter = gradeObj && gradeObj.quarters && gradeObj.quarters[quarterKey];
  const band = quarter && Array.isArray(quarter.units) ? quarter.units : [];
  const bandSet = new Set(band);
  const lessons = Array.isArray(gradeObj && gradeObj.lessons) ? gradeObj.lessons : [];

  // Group lessons by unit.worksheetKey so a combined worksheet yields ONE
  // Follow-Along / Blooket column (quizzes stay per-topic).
  const groups = new Map();
  for (const L of lessons) {
    if (!L || !bandSet.has(L.unit) || L.worksheetKey == null) continue;
    const label = groupLabel(L.unit, L.worksheetKey);
    let g = groups.get(label);
    if (!g) { g = { unit: L.unit, worksheetKey: L.worksheetKey, topics: [] }; groups.set(label, g); }
    g.topics.push(L);
  }

  const cols = [];
  for (const [label, g] of groups) {
    const topicKeys = g.topics.map((t) => t.lessonKey);
    cols.push({ key: `FA:${label}`, kind: 'followalong', category: 'Lesson',
      title: `${label} Follow-Along`, unit: g.unit, topicKeys });
    for (const t of g.topics) {
      if ((t.quizTotal || 0) > 0) {
        cols.push({ key: `QUIZ:${t.lessonKey}`, kind: 'quiz', category: 'Quizzes',
          title: `${t.lessonKey} Quiz`, unit: g.unit, topicKeys: [t.lessonKey] });
      }
    }
    if (g.topics.some((t) => t.hasBlooket)) {
      // M2d: teacher-facing bonus label when every Blooket-bearing topic in the
      // group is enrichment (never-required). Mixed groups stay unlabeled as
      // required (core presence dominates the column).
      const blTopics = g.topics.filter((t) => t.hasBlooket);
      const allBonus = blTopics.length > 0 && blTopics.every((t) => t.blooketBonus);
      cols.push({
        key: `BL:${label}`,
        kind: 'blooket',
        category: 'Blooket',
        title: allBonus ? `${label} Blooket (bonus)` : `${label} Blooket`,
        unit: g.unit,
        topicKeys,
        blooketBonus: allBonus,
      });
    }
  }

  cols.sort((a, b) => (
    a.unit - b.unit ||
    topicNum(a.topicKeys[0]) - topicNum(b.topicKeys[0]) ||
    (KIND_RANK[a.kind] - KIND_RANK[b.kind])
  ));

  // Stamp `due` only when the schedule + today are supplied. A column with no
  // resolvable date is left without a `due` field (clients show it).
  if (dueOpts && dueOpts.todayStr) {
    const period = sectionToPeriod(dueOpts.section);
    for (const col of /** @type {Array<{due?: boolean, [k: string]: any}>} */ (cols)) {
      const ds = _columnDueDate(col, dueOpts.lessons, period, dueOpts.events || null);
      if (ds != null) col.due = ds <= dueOpts.todayStr;
    }
  }

  return cols;
}

// ── One cell's value for a student ─────────────────────────────────────────────
function cellValue(col, lessonsByKey, units) {
  if (col.kind === 'quiz') {
    const L = lessonsByKey[col.topicKeys[0]];
    return L && L.Q != null ? L.Q : null;
  }
  // followalong = the v3 Lessons-track value (lessonGradeNoQuiz: worksheet blanks
  // + AI-graded reflections), so the cell is apples-to-apples with v3's Lessons
  // track. Falls back to Cws if the server predates the field. blooket = blooket.
  // Combined constituents share the same value → first non-null across the group.
  const primary = col.kind === 'blooket' ? 'blooket' : 'lessonGradeNoQuiz';
  const fallback = col.kind === 'blooket' ? 'blooket' : 'Cws';
  for (const tk of col.topicKeys) {
    const L = lessonsByKey[tk];
    if (!L) continue;
    if (L[primary] != null) return L[primary];
    if (L[fallback] != null) return L[fallback];
  }
  return null;
}

// ── Reconciliation: WHY Schoology and v3 differ for one quarter ─────────────────
// Both totals are already computed; this explains the gap using the v3 branch
// logic (quarterGradeV3 + combineV3). pcAvg / workAvg are 0..100 on the quarter
// object (null when that track has nothing due yet).
export function reconcileQuarter(gradeObj, quarterKey, schoologyTotal, v3Total) {
  var q = (gradeObj && gradeObj.quarters && gradeObj.quarters[quarterKey]) || {};
  // Display values (0..100) shown to the teacher.
  var pcDisp = q.pcAvg != null ? q.pcAvg : null;
  var workDisp = q.workAvg != null ? q.workAvg : null;
  // BRANCH on the UNROUNDED [0,1] fractions the engine actually used (combineV3 /
  // quarterGradeV3 gate on 0.40), so the explanation can never contradict v3Total
  // at the floor boundary (a rounded 40.0 is ambiguous). Fall back to the rounded
  // display value /100 only for an old server that doesn't surface the raw values.
  var pcF = q.pcAvgRaw != null ? q.pcAvgRaw : (pcDisp != null ? pcDisp / 100 : null);
  var workF = q.workAvgRaw != null ? q.workAvgRaw : (workDisp != null ? workDisp / 100 : null);
  var delta = (schoologyTotal != null && v3Total != null) ? round1(v3Total - schoologyTotal) : null;

  var branch, reason;
  if (pcF == null && workF == null) {
    if (v3Total != null) {
      // A real grade exists but the two-track breakdown doesn't (Phase-6 fallback
      // or v3 off / schedule failed to load) — don't claim "nothing due yet".
      branch = 'non-v3';
      reason = 'The two-track breakdown is unavailable for this quarter (v3 model not active, ' +
        'or the schedule did not load); the quarter grade shown is ' + round1(v3Total) + '.';
    } else {
      branch = 'none';
      reason = 'No graded tracks yet this quarter.';
    }
  } else if (pcF == null) {
    branch = 'work-only';
    reason = 'Only the Work track is active (no Progress Check due yet), so v3 = Work (' + round1(workDisp) + ').';
  } else if (workF == null) {
    branch = 'pc-only';
    reason = 'Only the PC track is active, so v3 = PC (' + round1(pcDisp) + ').';
  } else if (pcF >= 0.40 && workF >= 0.40) {
    branch = 'max';
    var which = pcF >= workF ? ('PC ' + round1(pcDisp)) : ('Work ' + round1(workDisp));
    reason = 'Both tracks clear the 40 floor, so v3 takes the higher (' + which +
      '), while Schoology averages the categories (' + round1(schoologyTotal) + ').';
  } else {
    branch = 'ceiling';
    var a = 0.7 * pcF, b = 0.7 * workF, m = (pcF + workF) / 2;
    var top = Math.max(a, b, m);
    var EPS = 1e-9;
    var srcs = [];
    if (Math.abs(a - top) < EPS) srcs.push('70% of PC');
    if (Math.abs(b - top) < EPS) srcs.push('70% of Work');
    if (Math.abs(m - top) < EPS) srcs.push('the mean of the two tracks');
    reason = 'A track is below the 40 floor, so v3 caps at ' + srcs.join(' = ') + ' (' + round1(top * 100) +
      '); Schoology applies no floor or ceiling.';
  }

  // SY2627 early-completion bonus: v3Total includes it, Schoology never does.
  var bonus = typeof q.earlyBonus === 'number' ? q.earlyBonus : 0;
  if (bonus > 0) {
    var nEarly = typeof q.earlyLessons === 'number' ? q.earlyLessons : 0;
    reason += ' Plus +' + bonus + ' early-completion bonus (' + nEarly + ' worksheet' + (nEarly === 1 ? '' : 's') +
      ' finished by the 11:59 PM deadline) — included in the v3 total, never in Schoology.';
  }

  return {
    pcAvg: pcDisp, workAvg: workDisp,
    earlyBonus: bonus,
    schoologyTotal: schoologyTotal != null ? schoologyTotal : null,
    v3Total: v3Total != null ? v3Total : null,
    delta: delta, branch: branch, reason: reason,
  };
}

// ── One student's row for a set of columns ─────────────────────────────────────
export function buildGradebookRow(gradeObj, columns, weights = LEGACY_CATEGORY_WEIGHTS) {
  if (gradeObj?.items) {
    const keys = new Set(columns.map(column => column.key));
    const grid = districtGradebook({ ...gradeObj, items: gradeObj.items.filter(item => keys.has(item.itemId)) });
    const quarter = Object.values(grid.quarters).find(value => value.columns.length);
    return { cells: quarter?.cells || {}, categoryAverages: quarter?.categoryAverages || {}, schoologyTotal: quarter?.schoologyTotal ?? null };
  }
  const lessonsByKey = {};
  for (const L of (Array.isArray(gradeObj && gradeObj.lessons) ? gradeObj.lessons : [])) {
    if (L && L.lessonKey != null) lessonsByKey[L.lessonKey] = L;
  }
  const units = (gradeObj && gradeObj.units) || {};

  const cells = {};
  const catVals = {};
  // SY2627 (teacher 2026-09-03): schoologyTotal = what the Schoology gradebook
  // shows TODAY — only columns that are DUE (col.due !== false; a column with no
  // resolvable date is included) and COMPLETED (non-null). Ahead-of-schedule
  // work stays visible in `cells` but does not enter the total, because the
  // Schoology sync (tools/schoology_sync_section.py --through) only pushes due
  // columns. Blanks are never 0 here, matching Schoology.
  for (const col of columns) {
    const v = cellValue(col, lessonsByKey, units);
    cells[col.key] = v;
    if (v != null && col.due !== false) (catVals[col.category] || (catVals[col.category] = [])).push(v);
  }

  const categoryAverages = {};
  for (const cat of Object.keys(catVals)) {
    const arr = catVals[cat];
    categoryAverages[cat] = round1(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  return {
    cells,
    categoryAverages,
    schoologyTotal: schoologyWeightedTotal(categoryAverages, weights),
  };
}

// ── Schoology category-weighted blend (renormalized over PRESENT categories) ────
export function schoologyWeightedTotal(categoryAverages, weights = null) {
  weights ||= Object.keys(categoryAverages || {}).some(key => key in LEGACY_CATEGORY_WEIGHTS) ? LEGACY_CATEGORY_WEIGHTS : SCHOOLOGY_CATEGORY_WEIGHTS;
  let num = 0, den = 0;
  for (const cat of Object.keys(weights)) {
    const v = categoryAverages ? categoryAverages[cat] : null;
    if (v == null) continue;
    num += weights[cat] * v;
    den += weights[cat];
  }
  return den > 0 ? round1(num / den) : null;
}

// ── Full per-student gradebook (all quarters) — for /grade + /class/grades ──────
export function buildGradebook(gradeObj, { weights = LEGACY_CATEGORY_WEIGHTS, lessonSchedule = /** @type {any} */ (null), eventSchedule = /** @type {any} */ (null), section = /** @type {string|null} */ (null), todayStr = /** @type {string|null} */ (null) } = {}) {
  if (gradeObj?.items) return districtGradebook(gradeObj);
  // Date-gating opts are passed to the column builder only when both the schedule
  // and today are present; otherwise columns carry no `due` field (degrade to all).
  const dueOpts = (lessonSchedule && todayStr) ? { lessons: lessonSchedule, section, todayStr, events: eventSchedule || null } : null;
  const quartersOut = {};
  const quarterKeys = Object.keys((gradeObj && gradeObj.quarters) || {});
  for (const qk of quarterKeys) {
    const columns = buildGradebookColumns(gradeObj, qk, dueOpts);
    const row = buildGradebookRow(gradeObj, columns, weights);
    var v3Total = gradeObj.quarters[qk].quarterGrade != null ? gradeObj.quarters[qk].quarterGrade : null;
    quartersOut[qk] = {
      columns,
      cells: row.cells,
      categoryAverages: row.categoryAverages,
      schoologyTotal: row.schoologyTotal,
      v3Total: v3Total,
      // Why the two totals differ (for the Phase 4 per-student breakdown).
      reconciliation: reconcileQuarter(gradeObj, qk, row.schoologyTotal, v3Total),
    };
  }
  return { weights, quarters: quartersOut };
}

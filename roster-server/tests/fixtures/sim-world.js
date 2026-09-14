// sim-world.js — the canonical fixture world for the grade-policy simulator.
// GRADE_SIMULATION_SPEC.md §2.2. ONE small-but-realistic world that every
// simulator property + the Layer-B sweep + the Layer-C cross-check reuse, so a
// failing property is debugged against a single inspectable schedule.
//
// Shape requirements (spec §2.2): >= 2 units, combined-worksheet lessons,
// quiz-less openers, period B/E dates spanning the quarter, a null-date
// (not-yet-scheduled) lesson, a unit with a PC, and a Blooket-bearing lesson.
//
// NOTHING here imports the engine — it is pure data + a couple of row builders.
// The oracle (computeGrade) is wired in the test file, not here.

// ── Config (PHASE3_CONFIG shape, v3 ON) ───────────────────────────────────────
// Units 1 and 2 both land in Q1 so one quarter exercises PC bucketing for a
// due unit (1) and a not-yet-due unit (2).
export const CONFIG = {
  C: 85,
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  feederWeights: { W: 1, Q: 2 },
  frqBand: { E: 100, P: 70, I: 35 },
  v3LessonsExcludeQuiz: true,
  useV3: true,
  schoolTz: 'America/New_York',
  gradingWindowStart: '2026-09-01',
  // F2: explicit v3 work weights + gates (mirror grade-config.js defaults), so
  // the Layer-B sweep can vary them. Same values as the engine fallbacks, so
  // grading stays byte-identical.
  v3WorkWeights: { lessons: 0.30, quizzes: 0.30, posters: 0.30, blooket: 0.10 },
  v3Gates: { floor: 0.40, ceiling: 0.70 },
  quarters: {
    Q1: { units: [1, 2], start: '2026-09-01', end: '2026-12-31', pcAnchor: { p85: 40, p100: 60 } },
  },
};

// The quarter every property reads (single-quarter world).
export const QUARTER_KEY = 'Q1';

// Section + "today". asOf is handed to computeGrade → todayInTz → the due-date
// filter. With today = 2026-09-20 (period B), lessons 1.1–1.5 are due, 2.1
// (10-01) and 2.2 (null) are future, unit-1 PC is due, unit-2 PC is not.
export const SECTION = 'PeriodB';
export const AS_OF = '2026-09-20T12:00:00-04:00';

// ── Schedule (topicKey → { unit, worksheetKey, periods }) ─────────────────────
// 1.1            quiz-less opener (worksheet only)
// 1.2            worksheet + quiz(2) + Blooket (core / required)
// 1.3            worksheet + quiz(3)
// 1.4 + 1.5      combined worksheet (share worksheetKey '4-5'), no quiz
// 2.1            worksheet + quiz(2), due in the FUTURE (10-01)
// 2.2            worksheet, NULL dates (not yet scheduled)
// 2.9            REAL crosswalk bonus topic + Blooket (enrichment; not in Due)
//                — future date so it does not change due-denominator math
export const SCHEDULE = {
  '1.1': { unit: 1, worksheetKey: '1',   periods: { B: '2026-09-09', E: '2026-09-09' } },
  '1.2': { unit: 1, worksheetKey: '2',   periods: { B: '2026-09-11', E: '2026-09-11' } },
  '1.3': { unit: 1, worksheetKey: '3',   periods: { B: '2026-09-16', E: '2026-09-16' } },
  '1.4': { unit: 1, worksheetKey: '4-5', periods: { B: '2026-09-18', E: '2026-09-18' } },
  '1.5': { unit: 1, worksheetKey: '4-5', periods: { B: '2026-09-18', E: '2026-09-18' } },
  '2.1': { unit: 2, worksheetKey: '1',   periods: { B: '2026-10-01', E: '2026-10-01' } },
  '2.2': { unit: 2, worksheetKey: '2',   periods: { B: null,          E: null } },
  '2.9': { unit: 2, worksheetKey: '9',   periods: { B: '2026-11-01', E: '2026-11-01' } },
};

// Worksheet blank counts (the Cws denominator), keyed "<unit>.<worksheetKey>"
// exactly as parseItemLesson derives wsCountKey. The combined lesson shares one
// key ("1.4-5").
export const WORKSHEET_BLANK_COUNTS = {
  '1.1': 4,
  '1.2': 4,
  '1.3': 4,
  '1.4-5': 4,
  '2.1': 4,
  '2.2': 4,
};

// Answer key: gradable quiz + PC items. answerKey value is the correct response.
// (computeGrade derives quizLessons/quizTotals from this + the schedule.)
export const ANSWER_KEY = {
  // unit 1 quizzes
  'U1-L2-Q1': { answerKey: 'a' }, 'U1-L2-Q2': { answerKey: 'b' },
  'U1-L3-Q1': { answerKey: 'a' }, 'U1-L3-Q2': { answerKey: 'b' }, 'U1-L3-Q3': { answerKey: 'c' },
  // unit 2 quiz
  'U2-L1-Q1': { answerKey: 'a' }, 'U2-L1-Q2': { answerKey: 'b' },
  // unit 1 PC (4 questions)
  'U1-PC-Q1': { answerKey: 'a' }, 'U1-PC-Q2': { answerKey: 'b' },
  'U1-PC-Q3': { answerKey: 'c' }, 'U1-PC-Q4': { answerKey: 'd' },
  // unit 2 PC (4 questions)
  'U2-PC-Q1': { answerKey: 'a' }, 'U2-PC-Q2': { answerKey: 'b' },
  'U2-PC-Q3': { answerKey: 'c' }, 'U2-PC-Q4': { answerKey: 'd' },
};

// Blooket-bearing lessons in this fixture world.
// M2a/M2d: presence (hasBlooket) vs required (Due) vs bonus (enrichment label).
// 1.2 = core required Blooket; 2.9 = REAL bonus topic (crosswalk status:bonus).
export const BLOOKET_LESSONS = ['1.2', '2.9']; // legacy alias = presence
export const BLOOKET_PRESENCE = ['1.2', '2.9'];
export const BLOOKET_REQUIRED = ['1.2']; // Due denom — bonus excluded
export const BLOOKET_BONUS_TOPICS = ['2.9'];

// TI-84 trainer lesson map (the trainer-track denominator + procedure
// bucketing). Only 1.2 has a mapped skill. Passed EXPLICITLY so server and
// bundled-client runs resolve the same map (the bundle neutralizes the
// fs-backed default) and the trainer surface is exercised by the parity test.
// Grade-inert at the default weight 0 (TI84_GRADE_INTEGRATION_SPEC.md §C).
export const TRAINER_MAP = { '1.2': ['histogram'] };

// opts object for computeGrade(rows, ANSWER_KEY, CONFIG, GRADE_OPTS).
// Pass presence + required + bonus so server module defaults and the
// empty-bundle client defaults cannot diverge (parity + offline contract).
// Bundle empties BLOOKET_BONUS_TOPICS=[]; opts must supply bonus for stamping.
export const GRADE_OPTS = {
  lessonSchedule: SCHEDULE,
  section: SECTION,
  worksheetBlankCounts: WORKSHEET_BLANK_COUNTS,
  blooketLessons: BLOOKET_LESSONS, // legacy alias = presence
  blooketPresence: BLOOKET_PRESENCE,
  blooketRequired: BLOOKET_REQUIRED,
  blooketBonusTopics: BLOOKET_BONUS_TOPICS,
  trainerMap: TRAINER_MAP,
  asOf: AS_OF,
};

// EARLY snapshot: a date before unit-1's last lesson (09-18) and its PC are due.
// At this moment only lessons 1.1/1.2 are due and NO PC is due, so the PC track
// is null — the only way to exercise null-track renormalization (A9) in this
// world (at AS_OF both tracks are always present). Same world, earlier clock.
export const AS_OF_EARLY = '2026-09-12T12:00:00-04:00';
export const GRADE_OPTS_EARLY = { ...GRADE_OPTS, asOf: AS_OF_EARLY };

const WRONG_RESPONSE = '<<wrong>>'; // never equals any answerKey value

// ── Atoms: every gradable decision a student can make in this world ───────────
// An atom is one raisable unit of work. A "plan" maps atom.id → value v ∈ [0,1]
// (absent = not attempted). value semantics per kind:
//   worksheet/frq/blooket → row.score = v (already 0..1)
//   quiz/pc               → correct iff v >= 0.5 (response = key, else wrong)
// "Raise" = increase v; every kind is monotonic in v by construction, so the
// generator and the A3/A4 mutations share one notion of "more credit".
//
// id is the row's item_id EXCEPT worksheet blanks, where one set of blank
// item_ids feeds the combined lesson's BOTH topics — so the atom id IS the
// item_id and materializes a single row regardless of how many topics it backs.

// Topics a (unit, worksheetKey) pair backs — the combined lesson's worksheet
// backs BOTH its constituent topics; a solo worksheet backs one.
function topicsForWorksheet(unit, worksheetKey) {
  return Object.keys(SCHEDULE).filter(
    (tk) => SCHEDULE[tk].unit === unit && SCHEDULE[tk].worksheetKey === worksheetKey,
  );
}

function wsAtom(unit, worksheetKey, n) {
  const itemId = `WS-U${unit}L${worksheetKey}-Q${n}`;
  return {
    id: itemId, kind: 'worksheet', unit, backingTopics: topicsForWorksheet(unit, worksheetKey),
    makeRow: (v) => ({ item_id: itemId, source: 'worksheet', score: v, attempt: 1, recorded_at: AS_OF }),
  };
}
function frqAtom(unit, worksheetKey) {
  const itemId = `WS-U${unit}L${worksheetKey}-reflect1`;
  return {
    id: itemId, kind: 'frq', unit, backingTopics: topicsForWorksheet(unit, worksheetKey),
    makeRow: (v) => ({ item_id: itemId, source: 'frq', score: v, attempt: 1, recorded_at: AS_OF }),
  };
}
function quizAtom(itemId, unit, topicKey) {
  return {
    id: itemId, kind: 'quiz', unit, backingTopics: SCHEDULE[topicKey] ? [topicKey] : [],
    makeRow: (v) => ({ item_id: itemId, source: 'curriculum_quiz',
      response: v >= 0.5 ? ANSWER_KEY[itemId].answerKey : WRONG_RESPONSE, attempt: 1, recorded_at: AS_OF }),
  };
}
function pcAtom(itemId, unit) {
  return {
    id: itemId, kind: 'pc', unit, backingTopics: [],
    makeRow: (v) => ({ item_id: itemId, source: 'pc',
      response: v >= 0.5 ? ANSWER_KEY[itemId].answerKey : WRONG_RESPONSE, attempt: 1, recorded_at: AS_OF }),
  };
}
function blooketAtom(unit, worksheetKey) {
  const itemId = `BLOOKET-U${unit}L${worksheetKey}`;
  return {
    id: itemId, kind: 'blooket', unit, backingTopics: topicsForWorksheet(unit, worksheetKey),
    makeRow: (v) => ({ item_id: itemId, source: 'blooket', score: v, attempt: 1, recorded_at: AS_OF }),
  };
}

// Build the atom list from the world. Worksheet blanks: one set per worksheetKey
// (so the combined lesson's blanks aren't duplicated); FRQ: one per worksheetKey;
// quiz/pc: one per answer-key item; blooket: one per Blooket lesson.
function buildAtoms() {
  const atoms = [];
  const seenWsKey = new Set();
  for (const [, entry] of Object.entries(SCHEDULE)) {
    const wk = entry.worksheetKey;
    const key = `${entry.unit}.${wk}`;
    if (seenWsKey.has(key)) continue;
    seenWsKey.add(key);
    const count = WORKSHEET_BLANK_COUNTS[key] || 0;
    for (let n = 1; n <= count; n++) atoms.push(wsAtom(entry.unit, wk, n));
    atoms.push(frqAtom(entry.unit, wk));
  }
  for (const itemId of Object.keys(ANSWER_KEY)) {
    const m = itemId.match(/^U(\d+)-(L(\d+)|PC)-Q/);
    if (!m) continue;
    const unit = Number(m[1]);
    if (m[2] === 'PC') atoms.push(pcAtom(itemId, unit));
    else atoms.push(quizAtom(itemId, unit, `${unit}.${m[3]}`));
  }
  for (const topicKey of BLOOKET_LESSONS) {
    const entry = SCHEDULE[topicKey];
    if (entry) atoms.push(blooketAtom(entry.unit, entry.worksheetKey));
  }
  return atoms;
}

export const ATOMS = buildAtoms();
export const ATOMS_BY_ID = new Map(ATOMS.map((a) => [a.id, a]));

// Materialize a plan (Map<atomId, v>) into ledger rows for computeGrade.
export function materialize(plan) {
  const rows = [];
  for (const [id, v] of plan.entries()) {
    if (v == null) continue;
    const atom = ATOMS_BY_ID.get(id);
    if (atom) rows.push(atom.makeRow(v));
  }
  return rows;
}

// ── Due-by-today, derived from the schedule (NOT by re-parsing item IDs) ───────
// The simulator world is period B with today = AS_OF's date, so a lesson is due
// iff its B date is set and <= today. A unit's PC is "due" once the unit's
// latest scheduled lesson is due (mirrors computeQuarterV3.unitPcDue).
const TODAY = AS_OF.slice(0, 10); // '2026-09-20'

function lessonDue(topicKey) {
  const b = SCHEDULE[topicKey] && SCHEDULE[topicKey].periods && SCHEDULE[topicKey].periods.B;
  return !!b && b <= TODAY;
}
function unitPcDue(unit) {
  let latest = null;
  for (const tk of Object.keys(SCHEDULE)) {
    if (SCHEDULE[tk].unit !== unit) continue;
    const b = SCHEDULE[tk].periods && SCHEDULE[tk].periods.B;
    if (b && (latest === null || b > latest)) latest = b;
  }
  return !!latest && latest <= TODAY;
}

// Is this atom's lesson/unit DUE-by-today? worksheet/frq/quiz/blooket: due iff
// ANY topic the item backs is scheduled-due (the combined worksheet is due once
// either constituent is). pc: due iff the unit's PC is due. Used by the
// archetypes and the A4 ("add a 100% item to an already-due slot") domain.
export function isDueAtom(atom) {
  if (atom.kind === 'pc') return unitPcDue(atom.unit);
  return atom.backingTopics.some(lessonDue);
}

// ── Student archetypes (spec §5) — shared by the property tests + the Layer-B
// population. A plan is Map<atomId, v∈[0,1]|null>. NOTE: row timestamps are fixed
// (recorded_at = AS_OF) and "due" is keyed on the LESSON date, not submission
// time, so "behind then sprints" is outcome-identical to on-pace here and is
// intentionally omitted; add it only if/when the row model gains a time axis.
export function allAt(value, filter = () => true) {
  return new Map(ATOMS.map((a) => [a.id, filter(a) ? value : null]));
}
export const ARCHETYPES = {
  // Every DUE slot done perfectly; nothing ahead of schedule.
  diligent_on_pace: () => allAt(1.0, isDueAtom),
  // Aces the (due, unit-1) PC; does zero work.
  pc_ace_work_skipper: () => allAt(1.0, (a) => a.kind === 'pc' && isDueAtom(a)),
  // Does all due work perfectly; never takes the PC.
  work_grinder_pc_skipper: () => allAt(1.0, (a) => a.kind !== 'pc' && isDueAtom(a)),
  // The F1 driver: all due work perfect, no PC, PLUS a future lesson (2.1)
  // started and done poorly — the perverse-incentive case.
  ahead_then_mediocre: () => {
    const plan = allAt(1.0, (a) => a.kind !== 'pc' && isDueAtom(a));
    for (const a of ATOMS) {
      if (a.kind === 'worksheet' && a.backingTopics.includes('2.1')) plan.set(a.id, 0.2);
    }
    return plan;
  },
  // A middling student: due work ~70%, PC ~60%.
  mixed_typical: () => {
    const plan = new Map(ATOMS.map((a) => [a.id, null]));
    for (const a of ATOMS) {
      if (!isDueAtom(a)) continue;
      plan.set(a.id, a.kind === 'pc' ? 0.6 : 0.7);
    }
    return plan;
  },
};

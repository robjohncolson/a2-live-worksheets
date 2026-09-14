// lesson-grade.test.js — pure-function unit tests for Gradebook Phase 6.
// Tests parseItemLesson, expandLessonKey, computeLessonGrades,
// computeQuarterFromLessons, todayInTz, sectionToPeriod.
// NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  parseItemLesson,
  expandLessonKey,
  buildWorksheetBlankCounts,
  computeLessonGrades,
  computeQuarterFromLessons,
  quarterOfLesson,
  buildLessonsArray,
  computeQuizTotals,
  todayInTz,
  sectionToPeriod,
} from '../lesson-grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';

// ── parseItemLesson ────────────────────────────────────────────────────────────

describe('parseItemLesson — item-ID pattern coverage', () => {

  it('WS-U1L2-Q5 → unit=1, lessonKey="2"', () => {
    expect(parseItemLesson('WS-U1L2-Q5')).toEqual({ unit: 1, lessonKey: '2' });
  });

  it('WS-U4L1-2-reflect1 → unit=4, lessonKey="1-2"', () => {
    expect(parseItemLesson('WS-U4L1-2-reflect1')).toEqual({ unit: 4, lessonKey: '1-2' });
  });

  it('WS-U4L3-4-5-reflect1 → unit=4, lessonKey="3-4-5"', () => {
    expect(parseItemLesson('WS-U4L3-4-5-reflect1')).toEqual({ unit: 4, lessonKey: '3-4-5' });
  });

  it('WS-U6L1-2-frq1 → unit=6, lessonKey="1-2"', () => {
    expect(parseItemLesson('WS-U6L1-2-frq1')).toEqual({ unit: 6, lessonKey: '1-2' });
  });

  it('U6-L3-Q1 (curriculum_quiz) → unit=6, lessonKey="3"', () => {
    expect(parseItemLesson('U6-L3-Q1')).toEqual({ unit: 6, lessonKey: '3' });
  });

  it('CR-U2-L4-DESK_DONE → unit=2, lessonKey="4"', () => {
    expect(parseItemLesson('CR-U2-L4-DESK_DONE')).toEqual({ unit: 2, lessonKey: '4' });
  });

  it('WS-U2-L4-DESK_DONE → unit=2, lessonKey="4"', () => {
    expect(parseItemLesson('WS-U2-L4-DESK_DONE')).toEqual({ unit: 2, lessonKey: '4' });
  });

  it('BL-U1-L1-DESK_DONE (blooket flashcard make-up) → unit=1, lessonKey="1"', () => {
    expect(parseItemLesson('BL-U1-L1-DESK_DONE')).toEqual({ unit: 1, lessonKey: '1' });
  });

  

  

  it('unparseable → null', () => {
    expect(parseItemLesson('garbage-item-id')).toBe(null);
    expect(parseItemLesson('')).toBe(null);
    expect(parseItemLesson(null)).toBe(null);
    expect(parseItemLesson(undefined)).toBe(null);
  });

  it('blooket ID → null (not a gradeable source)', () => {
    expect(parseItemLesson('blooket-123')).toBe(null);
  });
});

// ── expandLessonKey ────────────────────────────────────────────────────────────

const SAMPLE_SCHEDULE = {
  '4.1': { unit: 4, topicKey: '4.1', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.2'] },
  '4.2': { unit: 4, topicKey: '4.2', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.1'] },
  '4.6': { unit: 4, topicKey: '4.6', worksheetKey: '6', periods: { B: null, E: null } },
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2020-01-02' } },
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2020-01-03', E: '2020-01-04' } },
};

describe('expandLessonKey — combined-worksheet expansion', () => {

  it('combined key "1-2" in unit 4 → [4.1, 4.2]', () => {
    const result = expandLessonKey(4, '1-2', SAMPLE_SCHEDULE);
    expect(result.sort()).toEqual(['4.1', '4.2']);
  });

  it('solo key "6" in unit 4 → ["4.6"]', () => {
    expect(expandLessonKey(4, '6', SAMPLE_SCHEDULE)).toEqual(['4.6']);
  });

  // Bonus-aware expansion (Codex HIGH 2026-08-07: old-3.7 via the shared
  // 3.6-7 worksheet). Year-aware by construction — SY2526's frozen context
  // derives an empty bonus set, so historical expansion is unchanged.
  it('combined key filters bonus members when a bonus set is provided', () => {
    const result = expandLessonKey(4, '1-2', SAMPLE_SCHEDULE, new Set(['4.2']));
    expect(result).toEqual(['4.1']);
  });

  it('combined key keeps legacy expansion when the bonus set is empty', () => {
    const result = expandLessonKey(4, '1-2', SAMPLE_SCHEDULE, new Set());
    expect(result.sort()).toEqual(['4.1', '4.2']);
  });

  it('combined key with ALL members bonus keeps the unfiltered expansion', () => {
    const result = expandLessonKey(4, '1-2', SAMPLE_SCHEDULE, new Set(['4.1', '4.2']));
    expect(result.sort()).toEqual(['4.1', '4.2']);
  });

  it('solo keys ignore the bonus set (bonus credit for direct rows is unchanged)', () => {
    expect(expandLessonKey(4, '6', SAMPLE_SCHEDULE, new Set(['4.6']))).toEqual(['4.6']);
  });

  it('solo key "1" in unit 1 → ["1.1"]', () => {
    expect(expandLessonKey(1, '1', SAMPLE_SCHEDULE)).toEqual(['1.1']);
  });

  it('key not in schedule → []', () => {
    expect(expandLessonKey(4, '99', SAMPLE_SCHEDULE)).toEqual([]);
  });

  it('null lessonKey → [] (PC items skipped)', () => {
    expect(expandLessonKey(1, null, SAMPLE_SCHEDULE)).toEqual([]);
  });

  it('null schedule → synthesizes "{unit}.{lessonKey}" so the no-schedule fallback works (Codex MAJOR 2 fold 2026-05-20)', () => {
    // Prior behaviour returned [] which left lessonMap empty in the graceful-
    // degrade path, collapsing quarterGrade to null. New behaviour: synthesize
    // a topicKey so lesson-level math still runs without a real schedule.
    expect(expandLessonKey(1, '1', null)).toEqual(['1.1']);
    expect(expandLessonKey(4, '1-2', null)).toEqual(['4.1-2']);
    // Null lessonKey still returns [] (PC items remain unit-scoped).
    expect(expandLessonKey(1, null, null)).toEqual([]);
  });
});

// ── computeLessonGrades ────────────────────────────────────────────────────────

const FRQ_BAND = { E: 100, P: 70, I: 35 };
const SAMPLE_ANSWER_KEY = {
  'U1-L1-Q01': { answerKey: 'B', unit: '1' },
  'U1-L2-Q01': { answerKey: 'C', unit: '1' },
};

function makeRow(itemId, opts = {}) {
  return {
    item_id: itemId,
    source: opts.source || 'frq',
    score: opts.score !== undefined ? opts.score : null,
    response: opts.response || null,
    unit: opts.unit || null,
    recorded_at: opts.recorded_at || '2026-01-01T00:00:00Z',
  };
}

describe('computeLessonGrades — shared-worksheet bonus filter (3.6-7 shape)', () => {
  const SCHEDULE_367 = {
    '3.6': { unit: 3, topicKey: '3.6', worksheetKey: '6-7', periods: { B: null, E: null }, combinedWith: ['3.7'] },
    '3.7': { unit: 3, topicKey: '3.7', worksheetKey: '6-7', periods: { B: null, E: null }, combinedWith: ['3.6'] },
  };
  const rows = [
    { source: 'frq', item_id: 'WS-U3L6-7-reflect1', score: 1, ts: 1 },
    { source: 'worksheet', item_id: 'WS-U3L6-7-b1', response: 'x', ts: 1 },
  ];
  const FRQ_BAND = { E: 100, P: 70, I: 35 };

  it('SY2627 lists (3.7 bonus): rows land in 3.6 only — no resurrected bonus lesson', () => {
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SCHEDULE_367, { bonusTopics: new Set(['3.7']) });
    expect(map.has('3.6')).toBe(true);
    expect(map.has('3.7')).toBe(false);
  });

  it('SY2526-style lists (empty bonus set): historical double expansion preserved', () => {
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SCHEDULE_367, { bonusTopics: new Set() });
    expect(map.has('3.6')).toBe(true);
    expect(map.has('3.7')).toBe(true);
  });
});

describe('computeLessonGrades — lesson math', () => {

  it('two FRQ-Is on 1.1 → W=35, lessonGrade=35', () => {
    const rows = [
      makeRow('WS-U1L1-r1', { source: 'frq', score: 0 }),
      makeRow('WS-U1L1-r2', { source: 'frq', score: 0 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l).toBeDefined();
    expect(l.W).toBe(35);
    expect(l.Q).toBe(null);
    expect(l.lessonGrade).toBe(35);
  });

  it('FRQ-E + quiz 0% → weighted W:Q=2:3 (lessonFeederWeights renorm), grade=(2*100+3*0)/5=40', () => {
    // With lessonFeederWeights ws:W:Q=1:2:3, when ws absent W:Q renormalize to 2:3.
    // grade = (2*100 + 3*0) / (2+3) = 200/5 = 40.
    const rows = [
      makeRow('WS-U1L2-r1', { source: 'frq', score: 1 }),                 // E → 100
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'X' }), // wrong → 0%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE);
    const l = map.get('1.2');
    expect(l).toBeDefined();
    expect(l.W).toBe(100);
    expect(l.Q).toBe(0);   // 1 graded, 0 correct
    expect(l.lessonGrade).toBeCloseTo(40, 1);
  });

  it('FRQ-E + quiz 80% (4/5) → weighted W:Q=2:3 (lessonFeederWeights renorm), grade=(2*100+3*80)/5=88', () => {
    // With lessonFeederWeights ws:W:Q=1:2:3, when ws absent W:Q renormalize to 2:3.
    // grade = (2*100 + 3*80) / (2+3) = (200+240)/5 = 88.
    const extendedKey = Object.assign({}, SAMPLE_ANSWER_KEY, {
      'U1-L2-Q01': { unit: 'U1', answerKey: 'B' },
      'U1-L2-Q02': { unit: 'U1', answerKey: 'B' },
      'U1-L2-Q03': { unit: 'U1', answerKey: 'B' },
      'U1-L2-Q04': { unit: 'U1', answerKey: 'B' },
      'U1-L2-Q05': { unit: 'U1', answerKey: 'B' },
    });
    const rows = [
      makeRow('WS-U1L2-r1', { source: 'frq', score: 1 }),                  // E → 100
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q04', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q05', { source: 'curriculum_quiz', response: 'X' }),  // wrong → 4/5 = 80%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, extendedKey, SAMPLE_SCHEDULE);
    const l = map.get('1.2');
    expect(l).toBeDefined();
    expect(l.W).toBe(100);
    expect(l.Q).toBe(80);
    expect(l.lessonGrade).toBeCloseTo(88, 1);
    // lessonGradeNoQuiz (the v3 Lessons-track value / the in-app Follow-Along cell)
    // EXCLUDES the quiz feeder: W-only (no Cws here) = 100, not the 88 that folds
    // the quiz in. This is the gap the in-app gradebook reconciliation surfaces.
    expect(l.lessonGradeNoQuiz).toBe(100);
  });

  it('lessonGradeNoQuiz === lessonGrade when there is no quiz', () => {
    const rows = [makeRow('WS-U1L1-r1', { source: 'frq', score: 1 })]; // FRQ-E only
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.lessonGradeNoQuiz).toBe(100);
    expect(l.lessonGradeNoQuiz).toBe(l.lessonGrade);
  });

  it('lessonGradeNoQuiz is null when neither Cws nor W present (quiz-only lesson)', () => {
    const rows = [makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'B' })];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.Q).not.toBe(null);
    expect(l.lessonGradeNoQuiz).toBe(null);
  });

  it('FRQ-E only (no quiz) → W=100, Q=null, lessonGrade=100 (W-only renormalized)', () => {
    const rows = [
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.W).toBe(100);
    expect(l.Q).toBe(null);
    expect(l.lessonGrade).toBe(100);
  });

  it('quiz-only (no frq) → W=null, Q=score, lessonGrade=Q', () => {
    const rows = [
      makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'B' }), // correct
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.W).toBe(null);
    expect(l.Q).toBe(100);   // 1/1 correct
    expect(l.lessonGrade).toBe(100);
  });

  it('combined WS-U4L1-2 contributes to both 4.1 AND 4.2', () => {
    const rows = [
      makeRow('WS-U4L1-2-reflect1', { source: 'frq', score: 0 }), // I → 35
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l41 = map.get('4.1');
    const l42 = map.get('4.2');
    expect(l41).toBeDefined();
    expect(l42).toBeDefined();
    expect(l41.lessonGrade).toBe(35);
    expect(l42.lessonGrade).toBe(35);
  });

  it('both null (no frq + no quiz) → lessonGrade null', () => {
    const rows = [
      makeRow('WS-U1L1-done', { source: 'worksheet' }), // completion-only
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    const l = map.get('1.1');
    expect(l.W).toBe(null);
    expect(l.Q).toBe(null);
    expect(l.lessonGrade).toBe(null);
  });

  it('PC items are NOT included in lesson grades (skipped)', () => {
    const rows = [
      makeRow('U1-PC-Q01', { source: 'pc', score: 1 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE);
    // No lesson entry should have been created for PC items.
    expect(map.size).toBe(0);
  });
});

// ── todayInTz + sectionToPeriod ───────────────────────────────────────────────

describe('todayInTz', () => {
  it('returns a YYYY-MM-DD string for valid timezone', () => {
    const result = todayInTz('America/New_York');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a YYYY-MM-DD string for invalid timezone (graceful fallback)', () => {
    const result = todayInTz('Fake/Timezone');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('sectionToPeriod', () => {
  it('PeriodB → B', () => expect(sectionToPeriod('PeriodB')).toBe('B'));
  it('PeriodE → E', () => expect(sectionToPeriod('PeriodE')).toBe('E'));
  it('PeriodX → E (live universal section follows Period E pacing)', () => expect(sectionToPeriod('PeriodX')).toBe('E'));
  it('B → B (bare)', () => expect(sectionToPeriod('B')).toBe('B'));
  it('null → null', () => expect(sectionToPeriod(null)).toBe(null));
  it('unknown string → null', () => expect(sectionToPeriod('Section1')).toBe(null));
});

// ── computeQuarterFromLessons ─────────────────────────────────────────────────

describe('computeQuarterFromLessons — date-driven quarter grade', () => {

  const ALL_PAST_SCHEDULE = {
    '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2020-01-01' } },
    '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2020-01-02', E: '2020-01-02' } },
  };

  const ALL_FUTURE_SCHEDULE = {
    '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2099-01-01', E: '2099-01-01' } },
    '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2099-01-01', E: '2099-01-01' } },
  };

  const MIXED_SCHEDULE = {
    '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2020-01-01', E: '2020-01-01' } },
    '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2099-01-01', E: '2099-01-01' } },
  };

  const TODAY = '2026-05-20';

  function lessonMap(entries) {
    const m = new Map();
    for (const [k, v] of Object.entries(entries)) m.set(k, v);
    return m;
  }

  it('empty band → quarterGrade null, lessonsDue=0, lessonsTotal=0', () => {
    const result = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: new Map(),
      schedule: {},
      todayDateStr: TODAY,
      section: null,
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(null);
    expect(result.lessonsDue).toBe(0);
    expect(result.lessonsTotal).toBe(0);
  });

  it('all lessons future → quarterGrade null, lessonsDue=0', () => {
    const result = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: new Map(),
      schedule: ALL_FUTURE_SCHEDULE,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(null);
    expect(result.lessonsDue).toBe(0);
    expect(result.lessonsTotal).toBe(2);
  });

  it('1 lesson due-and-graded at 35, 1 due-ungraded → quarterGrade = 35/2 = 17.5', () => {
    const map = lessonMap({ '1.1': { lessonGrade: 35, W: 35, Q: null, frqItems: [], quizItems: [], worksheetItems: [] } });
    const result = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule: ALL_PAST_SCHEDULE,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(17.5);
    expect(result.lessonsDue).toBe(2);
    expect(result.lessonsGraded).toBe(1);
  });

  it('1 due graded at 35, 1 future → quarterGrade=35, ceiling=(35+100)/2=67.5', () => {
    const map = lessonMap({ '1.1': { lessonGrade: 35, W: 35, Q: null, frqItems: [], quizItems: [], worksheetItems: [] } });
    const result = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule: MIXED_SCHEDULE,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(35);
    expect(result.ceiling).toBe(67.5);
    expect(result.lessonsDue).toBe(1);
    expect(result.lessonsTotal).toBe(2);
  });

  it('26 lessons all due, all graded at 100 → rawQuarter=100, banked=85, quarterGrade=85', () => {
    // Build a schedule of 26 lessons in U1 (simulates Q1 band).
    const schedule26 = {};
    const lm = new Map();
    for (let i = 1; i <= 26; i++) {
      const k = `1.${i}`;
      schedule26[k] = { unit: 1, topicKey: k, worksheetKey: String(i), periods: { B: '2020-01-01', E: '2020-01-01' } };
      lm.set(k, { lessonGrade: 100, W: 100, Q: null, frqItems: [], quizItems: [], worksheetItems: [] });
    }
    const result = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: lm,
      schedule: schedule26,
      todayDateStr: TODAY,
      section: 'PeriodB',
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.quarterGrade).toBe(85);
    expect(result.ceiling).toBe(null);  // all done, no room to grow
    expect(result.lessonsDue).toBe(26);
    expect(result.lessonsGraded).toBe(26);
    expect(result.lessonsTotal).toBe(26);
  });

  

  

  it('unknown section → uses union of B+E dates', () => {
    // Both B and E are in the past → lessons are due even without knowing section.
    const result = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: new Map(),
      schedule: ALL_PAST_SCHEDULE,
      todayDateStr: TODAY,
      section: null,   // unknown
      pcBandData: { P_quarter: 0 },
      C: 85,
    });
    expect(result.lessonsDue).toBe(2);
  });
});

// ── W1: buildWorksheetBlankCounts ─────────────────────────────────────────────

// Minimal manifest fixture for blank-count tests.
const MANIFEST_FIXTURE = {
  generatedFrom: 'fixture',
  units: [
    {
      unit: 'U1',
      lessons: [
        {
          lesson: '1.1',
          activities: [
            {
              activity: 'worksheet',
              source: 'worksheet',
              itemIds: [
                'WS-U1L1-Q1',
                'WS-U1L1-Q2',
                'WS-U1L1-Q3',
                'WS-U1L1-reflect1',   // NOT a blank
                'WS-U1L1-exitTicket', // NOT a blank
              ],
            },
          ],
        },
        {
          lesson: '1.2',
          activities: [
            {
              activity: 'worksheet',
              source: 'worksheet',
              itemIds: [
                'WS-U1L2-Q1',
                'WS-U1L2-Q2',
              ],
            },
          ],
        },
      ],
    },
    {
      unit: 'U4',
      lessons: [
        {
          lesson: '4.1-2',
          activities: [
            {
              activity: 'worksheet',
              source: 'worksheet',
              itemIds: [
                'WS-U4L1-2-Q1',
                'WS-U4L1-2-Q2',
                'WS-U4L1-2-Q3',
                'WS-U4L1-2-reflect1', // NOT a blank
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('buildWorksheetBlankCounts — manifest parsing', () => {

  it('counts only -Q# itemIds (not reflections or exitTickets)', () => {
    const counts = buildWorksheetBlankCounts(MANIFEST_FIXTURE);
    expect(counts['1.1']).toBe(3);  // Q1, Q2, Q3 only
    expect(counts['1.2']).toBe(2);  // Q1, Q2
    expect(counts['4.1-2']).toBe(3); // Q1, Q2, Q3 only
  });

  it('keys by the manifest lesson string verbatim', () => {
    const counts = buildWorksheetBlankCounts(MANIFEST_FIXTURE);
    expect(Object.keys(counts).sort()).toEqual(['1.1', '1.2', '4.1-2']);
  });

  it('returns {} on null/undefined manifest', () => {
    expect(buildWorksheetBlankCounts(null)).toEqual({});
    expect(buildWorksheetBlankCounts(undefined)).toEqual({});
  });

  it('returns {} on malformed manifest (missing units array)', () => {
    expect(buildWorksheetBlankCounts({})).toEqual({});
    expect(buildWorksheetBlankCounts({ units: 'notanarray' })).toEqual({});
  });

  it('skips lesson entries without a string lesson key', () => {
    const badManifest = {
      units: [
        { unit: 'U1', lessons: [{ lesson: 42, activities: [] }] },
      ],
    };
    expect(buildWorksheetBlankCounts(badManifest)).toEqual({});
  });
});

// ── W1: computeLessonGrades with worksheet blank scoring ──────────────────────

const W1_WEIGHTS = { ws: 1, W: 2, Q: 3 };
const BLANK_COUNTS = { '1.1': 3, '4.1-2': 3 };

function makeBlankRow(itemId, score, opts = {}) {
  return {
    item_id: itemId,
    source: 'worksheet',
    score: score,
    response: null,
    unit: opts.unit || null,
    recorded_at: opts.recorded_at || '2026-01-01T00:00:00Z',
  };
}

describe('W1: computeLessonGrades — worksheet blank scoring', () => {

  it('three-way weighted mean: all feeders present → (Cws*1 + W*2 + Q*3)/6', () => {
    // Lesson 1.1: 3 blanks in manifest (count key "1.1").
    // 3 blank rows all correct (score=1): Cws = (3*1)/3 * 100 = 100.
    // 1 FRQ-E: W = 100. 1 quiz correct/1: Q = 100.
    // B = (1*100 + 2*100 + 3*100) / (1+2+3) = 600/6 = 100.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 1),
      makeBlankRow('WS-U1L1-Q3', 1),
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),                     // E → 100
      makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'B' }),      // correct
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l).toBeDefined();
    expect(l.Cws).toBe(100);
    expect(l.W).toBe(100);
    expect(l.Q).toBe(100);
    expect(l.lessonGrade).toBe(100);
  });

  it('three-way weighted mean: mixed scores → (Cws*1 + W*2 + Q*3)/6', () => {
    // 3-blank lesson: 1 correct (1), 1 partial (0.5), 1 wrong (0).
    // sum = 1.5, blankCount = 3 → Cws = (1.5/3)*100 = 50.
    // FRQ-E: W = 100. Quiz: 0% (wrong). Q = 0.
    // B = (1*50 + 2*100 + 3*0) / 6 = (50+200+0)/6 = 250/6 ≈ 41.7
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),    // correct
      makeBlankRow('WS-U1L1-Q2', 0.5),  // partial
      makeBlankRow('WS-U1L1-Q3', 0),    // wrong
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),                     // E → 100
      makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'X' }),     // wrong → 0%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBeCloseTo(50, 1);
    expect(l.W).toBe(100);
    expect(l.Q).toBe(0);
    expect(l.lessonGrade).toBeCloseTo(41.7, 1);
  });

  it('worksheet-only lesson: only Cws present → lessonGrade=Cws', () => {
    // 3 blanks, all scored 1. No FRQ, no quiz.
    // Cws = 100. B = (1*100)/(1) = 100.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 1),
      makeBlankRow('WS-U1L1-Q3', 1),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBe(100);
    expect(l.W).toBe(null);
    expect(l.Q).toBe(null);
    expect(l.lessonGrade).toBe(100);
  });

  it('a flashcard self-attest (BL-…-DESK_DONE) is the Blooket MAKE-UP, but stays out of Cws/lessonGrade', () => {
    // BLOOKET_MAKEUP_BUILD.md: the BL- row no longer touches Cws (fails
    // BLANK_ITEM_PATTERN) or lessonGrade, but it NOW stands in as the Blooket
    // score (make-up) when there's no game score. Score is 0..100 (the pass %).
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 1),
      makeBlankRow('WS-U1L1-Q3', 1),
      makeRow('BL-U1-L1-DESK_DONE', { source: 'worksheet', score: 80 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBe(100);          // Cws untouched (BL- is not a blank)
    expect(l.blooket).toBe(80);       // make-up Blooket from the flashcard pass
    expect(l.lessonGrade).toBe(100);  // lessonGrade is Cws/W/Q only — no blooket
  });

  it('blooket = the BETTER of the game and the flashcard (max, not game-wins)', () => {
    // FLASHCARD_TIMED_DECK_BUILD.md: a strong timed-deck run beats a mediocre game.
    const higherFlash = computeLessonGrades([
      makeRow('BLOOKET-U1L1', { source: 'blooket', score: 0.6 }),        // game 60%
      makeRow('BL-U1-L1-DESK_DONE', { source: 'worksheet', score: 80 }), // flashcard 80%
    ], FRQ_BAND, {}, SAMPLE_SCHEDULE, { worksheetBlankCounts: BLANK_COUNTS, weights: W1_WEIGHTS });
    expect(higherFlash.get('1.1').blooket).toBe(80);  // flashcard wins (it's higher)

    const higherGame = computeLessonGrades([
      makeRow('BLOOKET-U1L1', { source: 'blooket', score: 0.9 }),        // game 90%
      makeRow('BL-U1-L1-DESK_DONE', { source: 'worksheet', score: 80 }), // flashcard 80%
    ], FRQ_BAND, {}, SAMPLE_SCHEDULE, { worksheetBlankCounts: BLANK_COUNTS, weights: W1_WEIGHTS });
    expect(higherGame.get('1.1').blooket).toBe(90);   // game wins (it's higher)
  });

  it('renormalization when ws feeder absent (no blank rows): W:Q = 2:3', () => {
    // No blanks submitted. Cws = null. FRQ-E (W=100), quiz 0%.
    // B = (2*100 + 3*0) / (2+3) = 200/5 = 40.
    const rows = [
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),                     // E → 100
      makeRow('U1-L1-Q01', { source: 'curriculum_quiz', response: 'X' }),     // wrong → 0%
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, SAMPLE_ANSWER_KEY, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBe(null);
    expect(l.W).toBe(100);
    expect(l.Q).toBe(0);
    expect(l.lessonGrade).toBeCloseTo(40, 1);
  });

  it('partial-credit blank (score=0.5) contributes 0.5 to the numerator', () => {
    // 3 blanks: 1 correct, 1 partial, 1 unattempted (absent from ledger).
    // sum recorded = 1 + 0.5 = 1.5; blankCount from manifest = 3.
    // Cws = (1.5/3) * 100 = 50.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 0.5),
      // Q3 absent — contributes 0 to numerator, still in denominator (count=3)
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBeCloseTo(50, 1);
  });

  it('Cws denominator from manifest (unattempted blanks absent from ledger count as 0)', () => {
    // 3 blanks in manifest. Only 1 recorded blank (score=1).
    // Cws = (1/3) * 100 ≈ 33.3. The 2 absent blanks weigh down the score.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      // Q2, Q3 never submitted — 0 in numerator, 3 in denominator
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l.Cws).toBeCloseTo(33.3, 1);
  });

  it('DESK_DONE row is excluded from blank scoring', () => {
    // The synthetic DESK_DONE row must NOT appear in worksheetItems for blank scoring.
    const rows = [
      { item_id: 'WS-U1-L1-DESK_DONE', source: 'worksheet', score: null, response: null, recorded_at: '2026-01-01T00:00:00Z' },
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    // DESK_DONE parses to unit=1, lessonKey='1'. Schedule maps 1.1 → '1.1'
    // but the item_id doesn't match BLANK_ITEM_PATTERN so worksheetItems is empty.
    const l = map.get('1.1');
    expect(l).toBeDefined();
    expect(l.worksheetItems).toHaveLength(0);
    expect(l.Cws).toBe(null);
  });

  it('null/undefined score on a blank row treated as 0', () => {
    // A blank row with score=null (e.g. not yet wired by W1 client script).
    // Should count as 0 in numerator but the blank still appears in worksheetItems.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', null),
      makeBlankRow('WS-U1L1-Q2', undefined),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: BLANK_COUNTS,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    // sum = 0 + 0 = 0; blankCount = 3 → Cws = 0.
    expect(l.Cws).toBe(0);
  });

  it('missing manifest → Cws null, no crash, W/Q still compute', () => {
    // opts.worksheetBlankCounts = null → Cws = null; B from W+Q only.
    const rows = [
      makeBlankRow('WS-U1L1-Q1', 1),
      makeBlankRow('WS-U1L1-Q2', 1),
      makeRow('WS-U1L1-r1', { source: 'frq', score: 1 }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: null,
      weights: W1_WEIGHTS,
    });
    const l = map.get('1.1');
    expect(l).toBeDefined();
    expect(l.Cws).toBe(null);
    expect(l.W).toBe(100);
    expect(l.lessonGrade).toBe(100); // only W present → W-only renormalized
  });

  it('combined worksheet Cws lands on both topic keys (4.1 AND 4.2)', () => {
    // WS-U4L1-2-Q1 expands to both 4.1 and 4.2 via the schedule.
    // 3 blanks, all score 1 → Cws = 100 on both topics.
    const rows = [
      makeBlankRow('WS-U4L1-2-Q1', 1),
      makeBlankRow('WS-U4L1-2-Q2', 1),
      makeBlankRow('WS-U4L1-2-Q3', 1),
    ];
    const blanks = { '4.1-2': 3 };
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SAMPLE_SCHEDULE, {
      worksheetBlankCounts: blanks,
      weights: W1_WEIGHTS,
    });
    const l41 = map.get('4.1');
    const l42 = map.get('4.2');
    expect(l41).toBeDefined();
    expect(l42).toBeDefined();
    expect(l41.Cws).toBe(100);
    expect(l42.Cws).toBe(100);
    expect(l41.lessonGrade).toBe(100);
    expect(l42.lessonGrade).toBe(100);
  });
});

// ── computeQuizTotals + buildLessonsArray quizTotal ───────────────────────────
// The Desk quiz-Done gate needs a per-topic total of gradable quiz questions
// (the "% answered" denominator). computeQuizTotals derives it from the answer
// key, bucketing via expandLessonKey so combined-worksheet topics sum their
// constituent lessons.

describe('computeQuizTotals — per-topic gradable quiz counts from the answer key', () => {
  const KEY = {
    'U1-L1-Q01': { answerKey: 'A', unit: '1' },     // → 1.1 (1)
    'U1-L2-Q01': { answerKey: 'B', unit: '1' },     // → 1.2
    'U1-L2-Q02': { answerKey: 'C', unit: '1' },     // → 1.2
    'U1-L2-Q03': { answerKey: null, unit: '1' },    // ungradable → excluded
    'U4-L1-Q01': { answerKey: 'D', unit: '4' },     // combined → 4.1 + 4.2
    'U4-L2-Q01': { answerKey: 'E', unit: '4' },     // combined → 4.1 + 4.2
    'U4-L6-Q01': { answerKey: 'A', unit: '4' },     // → 4.6
    'U1-PC-Q01': { answerKey: 'B', unit: '1' },     // PC → excluded (no L#-Q)
    'WS-U1L2-Q5': { answerKey: 'A' },               // worksheet blank → excluded
  };

  it('counts gradable L#-Q quiz items per topic, excluding ungradable/PC/worksheet', () => {
    const totals = computeQuizTotals(KEY, SAMPLE_SCHEDULE);
    expect(totals['1.1']).toBe(1);
    expect(totals['1.2']).toBe(2);          // Q03 ungradable, excluded
    expect(totals['4.6']).toBe(1);
    expect(totals['1.PC']).toBeUndefined(); // PC not counted
  });

  it('buckets per-topic quizzes to their own topic, matching buildLessonMap bucketing', () => {
    const totals = computeQuizTotals(KEY, SAMPLE_SCHEDULE);
    // cr quiz itemIds use SOLO lesson keys (U4-L1-Q, U4-L2-Q), so expandLessonKey
    // maps each to its own topic only — NOT the combined group. This is the same
    // expandLessonKey buildLessonMap uses for attempted items, so a topic's
    // "% answered" = attempted/total compares like-for-like even when 4.1/4.2
    // share a worksheet.
    expect(totals['4.1']).toBe(1);
    expect(totals['4.2']).toBe(1);
  });

  it('null answerKey or schedule → {}', () => {
    expect(computeQuizTotals(null, SAMPLE_SCHEDULE)).toEqual({});
    expect(computeQuizTotals(KEY, null)).toEqual({});
  });

  it('buildLessonsArray surfaces quizTotal per lesson (0 when the topic has no quiz)', () => {
    const totals = computeQuizTotals(KEY, SAMPLE_SCHEDULE);
    const lessons = buildLessonsArray(new Map(), SAMPLE_SCHEDULE, undefined, null, totals);
    const byKey = Object.fromEntries(lessons.map(l => [l.lessonKey, l]));
    expect(byKey['1.2'].quizTotal).toBe(2);
    expect(byKey['4.6'].quizTotal).toBe(1);
    // A scheduled topic with no answer-key quiz items defaults to 0.
    const l11 = byKey['1.1'];
    expect(l11.quizTotal).toBe(1);
    // Omitting quizTotals entirely defaults every lesson to 0 (back-compat).
    const lessonsNoTotals = buildLessonsArray(new Map(), SAMPLE_SCHEDULE);
    expect(lessonsNoTotals.every(l => l.quizTotal === 0)).toBe(true);
  });
});

// ── Q = correct / TOTAL (unanswered counts as wrong) ──────────────────────────
// Aligns the quiz track with the Desk button: 1 right of 3 = 33%, not 100%.
// Requires a schedule so computeQuizTotals can resolve the denominator.

describe('computeLessonGrades — Q scores correct/total (unanswered = wrong)', () => {
  const KEY3 = {
    'U1-L2-Q01': { answerKey: 'A', unit: '1' },
    'U1-L2-Q02': { answerKey: 'B', unit: '1' },
    'U1-L2-Q03': { answerKey: 'C', unit: '1' },
  };

  it('1 of 3 answered correctly → Q = 33.3 (NOT 100 — no longer correct/attempted)', () => {
    const rows = [makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' })];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {});
    expect(map.get('1.2').Q).toBe(33.3);
  });

  it('3 of 3 answered, 2 correct → Q = 66.7', () => {
    const rows = [
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' }),  // correct
      makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'B' }),  // correct
      makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'X' }),  // wrong
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {});
    expect(map.get('1.2').Q).toBe(66.7);
  });

  it('all 3 correct → Q = 100', () => {
    const rows = [
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' }),
      makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'B' }),
      makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'C' }),
    ];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {});
    expect(map.get('1.2').Q).toBe(100);
  });

  it('no quiz attempted → Q stays null (never tanks a not-yet-taken lesson)', () => {
    const rows = [makeRow('WS-U1L2-frq1', { source: 'frq', score: 1 })];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {});
    expect(map.get('1.2').Q).toBe(null);
  });

  it('no schedule → defensive fallback to correct/attempted (1/1 = 100)', () => {
    const rows = [makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' })];
    const map = computeLessonGrades(rows, FRQ_BAND, KEY3, null, {});
    // Without a schedule computeQuizTotals can't resolve the denominator, so Q
    // falls back to correct/attempted. expandLessonKey synthesizes "1.2".
    expect(map.get('1.2').Q).toBe(100);
  });
});

// ── AI-granted quiz exceptions (source='quiz_exception', item_id `<base>#exc`) ──
// A wrong quiz item the AI accepted on appeal counts correct, lifting Q.

describe('computeLessonGrades — AI-granted quiz exceptions flip an item correct', () => {
  const KEY3 = {
    'U1-L2-Q01': { answerKey: 'A', unit: '1' },
    'U1-L2-Q02': { answerKey: 'B', unit: '1' },
    'U1-L2-Q03': { answerKey: 'C', unit: '1' },
  };

  it('an exception row flips a wrong item to correct (1/3 → 2/3)', () => {
    const rows = [
      makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' }),  // correct
      makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'X' }),  // wrong (key B)
      makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'Y' }),  // wrong (key C)
    ];
    expect(computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {}).get('1.2').Q).toBe(33.3);

    const withExc = computeLessonGrades(
      [...rows, makeRow('U1-L2-Q02#exc', { source: 'quiz_exception', response: 'X' })],
      FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {}
    );
    expect(withExc.get('1.2').Q).toBe(66.7);                 // Q02 forgiven → 2 of 3
    expect(withExc.get('1.2').quizItems.length).toBe(3);     // no phantom quiz item added
  });

  it('exception with no matching quiz row is inert (cannot manufacture a score)', () => {
    const rows = [makeRow('U1-L2-Q99#exc', { source: 'quiz_exception', response: 'Z' })];
    const acc = computeLessonGrades(rows, FRQ_BAND, KEY3, SAMPLE_SCHEDULE, {}).get('1.2');
    expect(acc ? acc.Q : null).toBe(null);
  });
});

// ── quiz_review partial credit (E=1, P=2/3, I=1/3) ────────────────────────────
// AI-review rows (source='quiz_review', item_id <base>#rev, score=credit) give a
// wrong quiz item partial credit; per-item credit = MAX(answer-key, review).

describe('computeLessonGrades — quiz_review partial credit (E=1, P=2/3, I=1/3)', () => {
  const PKEY = {
    'U1-L2-Q01': { answerKey: 'A', unit: '1' },
    'U1-L2-Q02': { answerKey: 'B', unit: '1' },
    'U1-L2-Q03': { answerKey: 'C', unit: '1' },
  };
  const base = [
    makeRow('U1-L2-Q01', { source: 'curriculum_quiz', response: 'A' }),  // correct → 1
    makeRow('U1-L2-Q02', { source: 'curriculum_quiz', response: 'X' }),  // wrong
    makeRow('U1-L2-Q03', { source: 'curriculum_quiz', response: 'Y' }),  // wrong
  ];

  it('a P review (2/3) lifts a wrong item to partial credit: 1 + 2/3 of 3 = 55.6', () => {
    const rows = [...base, makeRow('U1-L2-Q02#rev', { source: 'quiz_review', response: 'X', score: 2 / 3 })];
    expect(computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {}).get('1.2').Q).toBe(55.6);
  });

  it('P + I reviews stack: 1 + 2/3 + 1/3 = 2 of 3 = 66.7', () => {
    const rows = [
      ...base,
      makeRow('U1-L2-Q02#rev', { source: 'quiz_review', response: 'X', score: 2 / 3 }),
      makeRow('U1-L2-Q03#rev', { source: 'quiz_review', response: 'Y', score: 1 / 3 }),
    ];
    expect(computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {}).get('1.2').Q).toBe(66.7);
  });

  it('credit = MAX(key, review): a correct item is not lowered by a low review', () => {
    const rows = [...base, makeRow('U1-L2-Q01#rev', { source: 'quiz_review', response: 'A', score: 1 / 3 })];
    const acc = computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {}).get('1.2');
    expect(acc.Q).toBe(33.3); // Q01 stays 1; Q02/Q03 = 0
    expect(acc.quizItems.find(q => q.itemId === 'U1-L2-Q01').credit).toBe(1);
  });

  it('legacy quiz_exception still reads as full credit (1.0)', () => {
    const rows = [...base, makeRow('U1-L2-Q02#exc', { source: 'quiz_exception', response: 'X' })];
    expect(computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {}).get('1.2').Q).toBe(66.7);
  });

  it('buildLessonsArray surfaces a per-item credit field', () => {
    const rows = [...base, makeRow('U1-L2-Q02#rev', { source: 'quiz_review', response: 'X', score: 2 / 3 })];
    const map = computeLessonGrades(rows, FRQ_BAND, PKEY, SAMPLE_SCHEDULE, {});
    const lessons = buildLessonsArray(map, SAMPLE_SCHEDULE, undefined, null, computeQuizTotals(PKEY, SAMPLE_SCHEDULE));
    const q02 = lessons.find(x => x.lessonKey === '1.2').items.quiz.find(q => q.itemId === 'U1-L2-Q02');
    expect(q02.credit).toBeCloseTo(2 / 3, 5);
  });
});

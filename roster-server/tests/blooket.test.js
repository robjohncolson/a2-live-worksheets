// blooket.test.js -- pure-function tests for the Blooket track: blooketScore
// (the authoritative game formula, BLOOKET_IMPORT_P2_BUILD.md), parseItemLesson's
// BLOOKET-* pattern, computeLessonGrades attaching the per-topic blooket score,
// and computeQuarterV3's make-up Blooket track (BLOOKET_MAKEUP_BUILD.md) --
// denominator = due lessons that HAVE a Blooket, a missing-but-due Blooket = 0
// (replaces the old mean-of-recorded/missing-excluded track). INCLUDING the
// load-bearing back-compat + renormalization proofs. NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { blooketScore } from '../scoring.js';
import {
  parseItemLesson,
  computeLessonGrades,
  computeQuarterV3,
  buildLessonsArray,
} from '../lesson-grade.js';

// ── blooketScore -- authoritative formula (spec section 1) ─────────────────────

describe('blooketScore -- the authoritative 0..1 formula', () => {
  it('worked cases from the spec', () => {
    expect(blooketScore(30, 30, 30)).toBeCloseTo(1.0, 6);     // perfect
    expect(blooketScore(20, 25, 30)).toBeCloseTo(0.6667, 4);  // walkaway penalty
    expect(blooketScore(15, 15, 30)).toBeCloseTo(0.5, 6);     // half coverage
    expect(blooketScore(33, 35, 30)).toBeCloseTo(0.9429, 4);  // over-total -> pure acc
    expect(blooketScore(0, 0, 30)).toBe(0);                   // no-show
  });

  it('attempted <= 0 -> 0 (no division by zero)', () => {
    expect(blooketScore(5, 0, 30)).toBe(0);
    expect(blooketScore(5, -3, 30)).toBe(0);
  });

  it('clamps into [0,1] and tolerates bad inputs', () => {
    expect(blooketScore(-5, 10, 30)).toBe(0);   // negative correct -> 0
    expect(blooketScore(40, 30, 30)).toBeCloseTo(1.0, 6); // over-perfect -> 1
    expect(blooketScore(10, 10, 0)).toBe(0);    // total <= 0 -> 0
    expect(blooketScore('x', 10, 30)).toBe(0);  // NaN correct -> 0
    expect(blooketScore(5, 'y', 30)).toBe(0);   // NaN attempted -> 0
  });

  it('== correct/total when attempted <= total (coverage is the multiplier)', () => {
    // 20 correct out of 25 attempted, total 30: acc=0.8, cov=25/30 -> 20/30
    expect(blooketScore(20, 25, 30)).toBeCloseTo(20 / 30, 6);
  });
});

// ── parseItemLesson -- BLOOKET pattern ─────────────────────────────────────────

describe('parseItemLesson -- BLOOKET-U{N}L{key}', () => {
  it('BLOOKET-U1L2 -> unit=1, lessonKey="2"', () => {
    expect(parseItemLesson('BLOOKET-U1L2')).toEqual({ unit: 1, lessonKey: '2' });
  });

  it('BLOOKET-U4L1-2 -> unit=4, lessonKey="1-2" (combined worksheet)', () => {
    expect(parseItemLesson('BLOOKET-U4L1-2')).toEqual({ unit: 4, lessonKey: '1-2' });
  });

  it('lowercase blooket-123 is NOT matched (stays null, existing contract)', () => {
    expect(parseItemLesson('blooket-123')).toBe(null);
  });

  it('a trailing suffix after the lessonKey does NOT match (anchored pattern)', () => {
    expect(parseItemLesson('BLOOKET-U1L2-Q1')).toBe(null);
  });
});

// ── computeLessonGrades -- attaches result.blooket ─────────────────────────────

const FRQ_BAND = { E: 100, P: 75, I: 25 };
const SCHEDULE = {
  '1.1': { unit: 1, topicKey: '1.1', worksheetKey: '1', periods: { B: '2026-09-09', E: '2026-09-09' } },
  '1.2': { unit: 1, topicKey: '1.2', worksheetKey: '2', periods: { B: '2026-09-11', E: '2026-09-11' } },
};

function row(itemId, { source = 'blooket', score = null, recorded_at } = {}) {
  return { item_id: itemId, source, score, response: null, attempt: 1, recorded_at: recorded_at || '2026-09-10T00:00:00Z' };
}

describe('computeLessonGrades -- blooket attachment', () => {
  it('a blooket row attaches result.blooket on 0..100 (clamped from stored 0..1)', () => {
    const rows = [row('BLOOKET-U1L2', { score: 0.8 })];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SCHEDULE, {});
    expect(map.get('1.2').blooket).toBe(80);
  });

  it('a stored score > 1 is clamped to 100; < 0 is clamped to 0', () => {
    const hi = computeLessonGrades([row('BLOOKET-U1L2', { score: 1.5 })], FRQ_BAND, {}, SCHEDULE, {});
    expect(hi.get('1.2').blooket).toBe(100);
    const lo = computeLessonGrades([row('BLOOKET-U1L2', { score: -0.2 })], FRQ_BAND, {}, SCHEDULE, {});
    expect(lo.get('1.2').blooket).toBe(0);
  });

  it('a topic with no blooket row has blooket null', () => {
    const rows = [row('BLOOKET-U1L2', { score: 0.8 })];
    const map = computeLessonGrades(rows, FRQ_BAND, {}, SCHEDULE, {});
    // 1.2 has a blooket; the (untouched) 1.1 never gets an accumulator -> not in map
    expect(map.has('1.1')).toBe(false);
  });

  it('a combined blooket (BLOOKET-U4L1-2) attaches to BOTH expanded topics', () => {
    const schedule = {
      '4.1': { unit: 4, topicKey: '4.1', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.2'] },
      '4.2': { unit: 4, topicKey: '4.2', worksheetKey: '1-2', periods: { B: null, E: null }, combinedWith: ['4.1'] },
    };
    const map = computeLessonGrades([row('BLOOKET-U4L1-2', { score: 0.6 })], FRQ_BAND, {}, schedule, {});
    expect(map.get('4.1').blooket).toBe(60);
    expect(map.get('4.2').blooket).toBe(60);
  });

  it('a null/blank/non-numeric score leaves blooket ABSENT (not a spurious 0)', () => {
    // Number(null)===0 and Number('')===0 are finite, so the guard must reject
    // null/blank BEFORE coercion or a score-less row writes a real 0. The topic's
    // accumulator still exists (the row parsed to a lesson) but blooket stays null.
    const nullGame = computeLessonGrades([row('BLOOKET-U1L2', { score: null })], FRQ_BAND, {}, SCHEDULE, {});
    expect(nullGame.get('1.2').blooket).toBe(null);

    const blankFlash = computeLessonGrades(
      [{ item_id: 'BL-U1-L2-DESK_DONE', source: 'worksheet', score: '', response: null, attempt: 1, recorded_at: '2026-09-10T00:00:00Z' }],
      FRQ_BAND, {}, SCHEDULE, {}
    );
    expect(blankFlash.get('1.2').blooket).toBe(null);
  });
});

// ── buildLessonsArray -- surfaces blooket in the per-lesson display ────────────

describe('buildLessonsArray -- per-lesson blooket display', () => {
  it('carries the blooket score into the lessons[] entry', () => {
    const map = computeLessonGrades([row('BLOOKET-U1L2', { score: 0.8 })], FRQ_BAND, {}, SCHEDULE, {});
    const lessons = buildLessonsArray(map, SCHEDULE);
    const l12 = lessons.find((l) => l.lessonKey === '1.2');
    expect(l12).toBeTruthy();
    expect(l12.blooket).toBe(80);
  });

  it('a lesson with no blooket row has blooket null in the display', () => {
    const map = computeLessonGrades([row('BLOOKET-U1L2', { score: 0.8 })], FRQ_BAND, {}, SCHEDULE, {});
    const lessons = buildLessonsArray(map, SCHEDULE);
    const l11 = lessons.find((l) => l.lessonKey === '1.1');
    expect(l11).toBeTruthy();
    expect(l11.blooket).toBe(null);
  });

  it('marks hasBlooket per lesson from the blooketLessons set', () => {
    const map = computeLessonGrades([row('BLOOKET-U1L2', { score: 0.8 })], FRQ_BAND, {}, SCHEDULE, {});
    const lessons = buildLessonsArray(map, SCHEDULE, undefined, null, {}, ['1.2']);
    expect(lessons.find((l) => l.lessonKey === '1.2').hasBlooket).toBe(true);
    expect(lessons.find((l) => l.lessonKey === '1.1').hasBlooket).toBe(false); // not in the set
  });

  it('hasBlooket defaults to false when no blooketLessons passed (back-compat)', () => {
    const map = computeLessonGrades([row('BLOOKET-U1L2', { score: 0.8 })], FRQ_BAND, {}, SCHEDULE, {});
    const lessons = buildLessonsArray(map, SCHEDULE);
    expect(lessons.find((l) => l.lessonKey === '1.2').hasBlooket).toBe(false);
  });

  it('M2d: blooketBonus stamps enrichment topics (not required)', () => {
    const map = computeLessonGrades([], FRQ_BAND, {}, SCHEDULE, {});
    // presence both 1.1+1.2; only 1.2 is bonus enrichment
    const lessons = buildLessonsArray(
      map, SCHEDULE, undefined, null, {},
      ['1.1', '1.2'], // presence
      [],
      ['1.2'], // bonus
    );
    const l11 = lessons.find((l) => l.lessonKey === '1.1');
    const l12 = lessons.find((l) => l.lessonKey === '1.2');
    expect(l11.hasBlooket).toBe(true);
    expect(l11.blooketBonus).toBe(false);
    expect(l12.hasBlooket).toBe(true);
    expect(l12.blooketBonus).toBe(true);
  });
});

// ── computeQuarterV3 -- the Blooket track ──────────────────────────────────────

const CFG = {
  C: 85,
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  v3LessonsExcludeQuiz: true,
  useV3: true,
  quarters: {
    Q1: { units: [1], start: '2026-09-01', end: '2026-11-30', pcAnchor: { p85: 40, p100: 60 } },
  },
};

function lessonMapOf(obj) {
  return new Map(Object.entries(obj));
}

describe('computeQuarterV3 -- Blooket track (make-up; missing-due = 0)', () => {
  const schedule = {
    '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } },
    '1.2': { unit: 1, periods: { B: '2026-09-11', E: '2026-09-11' } },
  };

  it('BACK-COMPAT: no blooketLessons -> track null, workAvg == lessons+quizzes only', () => {
    // An older caller that never passes blooketLessons gets the empty-set path:
    // blooketAvg null -> renormalized away. Byte-identical to the pre-blooket grade.
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null },
      '1.2': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    });
    // lessons .8, quizzes .6 -> mean = .7 -> 70.0
    expect(r.workAvg).toBeCloseTo(70.0, 1);
  });

  it('a played game score on a Blooket-bearing due lesson engages the track', () => {
    // blooketLessons = ['1.1']: only 1.1 counts toward the Blooket denominator.
    // lessons .8, quizzes .6, blooket 1.0 ->
    //   workAvg = (.30*.8 + .30*.6 + .10*1.0)/.70 = .52/.70 = .742857 -> 74.3
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: 100 },
      '1.2': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      blooketLessons: ['1.1'],
    });
    expect(r.workAvg).toBeCloseTo(74.3, 1);
  });

  it('MISSING-DUE = 0: a Blooket-bearing due lesson with no score drags the track', () => {
    // NEW semantics (BLOOKET_MAKEUP_BUILD.md): unlike the old mean-of-recorded
    // track, a missing-but-due Blooket counts as 0 (like the lessons/quizzes
    // tracks). Both 1.1 and 1.2 HAVE a Blooket; only 1.1 was played (0.4).
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 40 },
      '1.2': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: null },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      blooketLessons: ['1.1', '1.2'],
    });
    // blooket track = (0.4 + 0)/2 = 0.2 (missing counted as 0, NOT excluded) ->
    //   (.30*1 + .30*1 + .10*.2)/.70 = .62/.70 = .885714 -> 88.6
    expect(r.workAvg).toBeCloseTo(88.6, 1);
  });

  it('a due lesson WITHOUT a Blooket is excluded from the denominator (no unfair 0)', () => {
    // 1.2 is NOT in blooketLessons, so it never contributes a 0. Only 1.1
    // (played 1.0) counts -> track = 1.0, not (1.0 + 0)/2.
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 100 },
      '1.2': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: null },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      blooketLessons: ['1.1'], // only 1.1 has a Blooket
    });
    // blooket track = mean(1.0) = 1.0 -> (.30*1 + .30*1 + .10*1)/.70 = 1.0 -> 100.0
    expect(r.workAvg).toBeCloseTo(100.0, 1);
  });

  it('a combined-worksheet Blooket counts as ONE slot (constituents collapsed)', () => {
    // 1.1 + 1.2 share worksheetKey "1-2" (a combined worksheet); a single
    // combined Blooket attaches the same score to BOTH. The track must count it
    // ONCE, not once per constituent, so it isn't over-weighted vs a solo Blooket.
    const combinedSchedule = {
      '1.1': { unit: 1, worksheetKey: '1-2', periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.2': { unit: 1, worksheetKey: '1-2', periods: { B: '2026-09-09', E: '2026-09-09' } },
      '1.3': { unit: 1, worksheetKey: '3',   periods: { B: '2026-09-11', E: '2026-09-11' } },
    };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 60 },  // combined game 60
      '1.2': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 60 },  // same game, same score
      '1.3': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 100 }, // solo game 100
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule: combinedSchedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      blooketLessons: ['1.1', '1.2', '1.3'],
    });
    // Collapsed: blooket track = mean(60, 100) = 0.80 (NOT (60+60+100)/3 = 73.3).
    // workAvg = (.30*1 + .30*1 + .10*.80)/.70 = .68/.70 = .971429 -> 97.1
    expect(r.workAvg).toBeCloseTo(97.1, 1);
  });

  it('two played Blookets -> the track is their MEAN', () => {
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 100 },
      '1.2': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: 0 },
    });
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule,
      todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      blooketLessons: ['1.1', '1.2'],
    });
    // blooket track = mean(1.0, 0.0) = 0.5
    // workAvg = (.30*1 + .30*1 + .10*.5)/.70 = .65/.70 = .928571 -> 92.9
    expect(r.workAvg).toBeCloseTo(92.9, 1);
  });

  it('blooket ceiling does NOT inflate: the ceiling uses the recorded mean, not 100', () => {
    // One due Blooket-bearing lesson, recorded blooket 0.5. The ceiling assumes
    // lessons/quizzes reach 100 for un-attempted items, but the blooket stays at
    // its recorded mean (0.5) -- a future blooket is never assumed to be a 100.
    const oneLesson = { '1.1': { unit: 1, periods: { B: '2026-09-09', E: '2026-09-09' } } };
    const lessonMap = lessonMapOf({
      '1.1': { Cws: 50, W: null, Q: 50, lessonGrade: 50, blooket: 50 },
    });
    const withBlooket = computeQuarterV3({
      quarterKey: 'Q1', config: CFG, lessonMap, schedule: oneLesson,
      todayDateStr: '2026-09-15', section: 'PeriodB', unitPcData: { 1: 50 },
      blooketLessons: ['1.1'],
    });
    // ceiling is bounded by 100 and >= the current grade
    expect(withBlooket.ceiling).toBeLessThanOrEqual(100);
    expect(withBlooket.ceiling).toBeGreaterThanOrEqual(withBlooket.quarterGrade);
  });
});

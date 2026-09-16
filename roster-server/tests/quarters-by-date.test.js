// B15: date-driven A2 quarter placement and published schedule sanity.
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { loadA2Lessons, lessonScheduleFromModel } from '../a2-lessons.js';

import { PHASE3_CONFIG, quarterOfDate, quarterOfUnit } from '../grade-config.js';
import { quarterOfLesson, computeQuarterFromLessons } from '../lesson-grade.js';


// ── quarterOfDate ─────────────────────────────────────────────────────────────

describe('quarterOfDate', () => {

  it('a date in each window returns that quarter', () => {
    expect(quarterOfDate('2026-10-01')).toBe('Q1');
    expect(quarterOfDate('2026-12-01')).toBe('Q2');
    expect(quarterOfDate('2027-03-01')).toBe('Q3');
    expect(quarterOfDate('2027-05-15')).toBe('Q4');
  });

  it('the exact start date of each window returns that quarter', () => {
    expect(quarterOfDate('2026-09-02')).toBe('Q1');
    expect(quarterOfDate('2026-11-09')).toBe('Q2');
    expect(quarterOfDate('2027-01-25')).toBe('Q3');
    expect(quarterOfDate('2027-04-15')).toBe('Q4');
  });

  it('the exact end date of each window returns that quarter', () => {
    expect(quarterOfDate('2026-11-06')).toBe('Q1');
    expect(quarterOfDate('2027-01-22')).toBe('Q2');
    expect(quarterOfDate('2027-04-14')).toBe('Q3');
    expect(quarterOfDate('2027-06-17')).toBe('Q4');
  });

  it('one day before Q1 start returns null', () => {
    expect(quarterOfDate('2026-09-01')).toBe(null);
  });

  it('one day after Q4 end returns null', () => {
    expect(quarterOfDate('2027-06-18')).toBe(null);
  });

  it('non-string / empty / null returns null', () => {
    expect(quarterOfDate(null)).toBe(null);
    expect(quarterOfDate(undefined)).toBe(null);
    expect(quarterOfDate('')).toBe(null);
    expect(quarterOfDate(20261001)).toBe(null);
  });

  it('boundary between Q1 and Q2: Q1 ends Fri 11-06, Q2 starts Mon 11-09 (the weekend between is no quarter)', () => {
    expect(quarterOfDate('2026-11-06')).toBe('Q1');
    expect(quarterOfDate('2026-11-07')).toBe(null);
    expect(quarterOfDate('2026-11-09')).toBe('Q2');
  });

  it('boundary between Q2 and Q3', () => {
    expect(quarterOfDate('2027-01-22')).toBe('Q2');
    expect(quarterOfDate('2027-01-25')).toBe('Q3');
  });

  it('boundary between Q3 and Q4', () => {
    expect(quarterOfDate('2027-04-14')).toBe('Q3');
    expect(quarterOfDate('2027-04-15')).toBe('Q4');
  });
});

// ── quarterOfLesson ───────────────────────────────────────────────────────────

describe('quarterOfLesson', () => {

  it('entry with a date in Q2 returns Q2 even when its unit is a Q1 unit', () => {
    // Unit 1 is a Q1 unit, but the lesson is scheduled in Q2 territory.
    const entry = { unit: 1, periods: { C: '2026-11-20', D: '2026-11-20' } };
    expect(quarterOfLesson(entry, 'C', PHASE3_CONFIG)).toBe('Q2');
    expect(quarterOfLesson(entry, 'D', PHASE3_CONFIG)).toBe('Q2');
  });

  it('entry with a Q1 date returns Q1', () => {
    const entry = { unit: 1, periods: { C: '2026-09-15', D: '2026-09-15' } };
    expect(quarterOfLesson(entry, 'C', PHASE3_CONFIG)).toBe('Q1');
  });

  it('entry with null dates falls back to quarterOfUnit', () => {
    const entry = { unit: 1, periods: { C: null, D: null } };
    expect(quarterOfLesson(entry, 'C', PHASE3_CONFIG)).toBe('Q1');
  });

  it('entry with no periods at all falls back to quarterOfUnit', () => {
    const entry = { unit: 4 };
    expect(quarterOfLesson(entry, null, PHASE3_CONFIG)).toBe('Q2');
  });

  it('uses period-specific date when period is provided', () => {
    // C is in Q1, D is in Q2. Quarter should follow the requested period.
    const entry = { unit: 1, periods: { C: '2026-10-01', D: '2026-11-20' } };
    expect(quarterOfLesson(entry, 'C', PHASE3_CONFIG)).toBe('Q1');
    expect(quarterOfLesson(entry, 'D', PHASE3_CONFIG)).toBe('Q2');
  });

  it('falls back to C/D/G union when period is null', () => {
    // period=null: picks periods.C first.
    const entry = { unit: 1, periods: { C: '2026-11-20', D: '2026-11-20' } };
    expect(quarterOfLesson(entry, null, PHASE3_CONFIG)).toBe('Q2');
  });

  it('date outside all windows falls back to quarterOfUnit', () => {
    // 2020 date: outside all quarter windows -> fallback to unit band.
    const entry = { unit: 6, periods: { C: '2020-01-01', D: '2020-01-01' } };
    expect(quarterOfLesson(entry, 'C', PHASE3_CONFIG)).toBe('Q3');
  });

  it('a known section with a null date falls back to the unit band, not the other section', () => {
    // C is unscheduled (null); D sits in Q2. Asking for section C must NOT
    // borrow D's Q2 date -- B has no schedule, so it falls back to unit 1's
    // band (Q1). Section D still resolves by its own date (Q2).
    const entry = { unit: 1, periods: { C: null, D: '2026-12-01' } };
    expect(quarterOfLesson(entry, 'C', PHASE3_CONFIG)).toBe('Q1');
    expect(quarterOfLesson(entry, 'D', PHASE3_CONFIG)).toBe('Q2');
  });
});

// ── computeQuarterFromLessons date-driven ─────────────────────────────────────

describe('computeQuarterFromLessons — date-driven quarter assignment (F2)', () => {

  const TODAY = '2027-06-30';

  function lessonMap(entries) {
    const m = new Map();
    for (const [k, v] of Object.entries(entries)) m.set(k, v);
    return m;
  }

  it('a unit-1 lesson dated in Q2 is counted in Q2 (not Q1)', () => {
    // schedule: lesson 1.1 has a Q2 date (2026-12-01), so quarterOfLesson=Q2.
    // When we ask computeQuarterFromLessons for Q1, it should NOT include 1.1.
    const schedule = {
      '1.1': { unit: 1, periods: { C: '2026-12-01', D: '2026-12-01' } },
      '1.2': { unit: 1, periods: { C: '2026-09-15', D: '2026-09-15' } },
    };
    const map = lessonMap({
      '1.1': { lessonGrade: 80 },
      '1.2': { lessonGrade: 60 },
    });

    // Q1 band: only 1.2 (Q1 date). 1.1 falls in Q2.
    const q1 = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodC',
      C: 85,
    });
    expect(q1.lessonsTotal).toBe(1);  // only 1.2 in Q1
    expect(q1.lessonsDue).toBe(1);
    expect(q1.quarterGrade).toBe(60); // only 1.2's grade

    // Q2 band: only 1.1 (Q2 date).
    const q2 = computeQuarterFromLessons({
      quarterKey: 'Q2',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodC',
      C: 85,
    });
    expect(q2.lessonsTotal).toBe(1);  // only 1.1 in Q2
    expect(q2.lessonsDue).toBe(1);
    expect(q2.quarterGrade).toBe(80); // only 1.1's grade
  });

  it('a null-date lesson falls back to its unit band', () => {
    // Lesson 1.1 has null dates -> falls back to Q1 (unit 1 is Q1).
    const schedule = {
      '1.1': { unit: 1, periods: { C: null, D: null } },
    };
    const map = lessonMap({ '1.1': { lessonGrade: 70 } });

    // Should appear in Q1 (unit-band fallback).
    const q1 = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodC',
      C: 85,
    });
    expect(q1.lessonsTotal).toBe(1);

    // Should NOT appear in Q2.
    const q2 = computeQuarterFromLessons({
      quarterKey: 'Q2',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodC',
      C: 85,
    });
    expect(q2.lessonsTotal).toBe(0);
  });

  it('lessons from multiple units in the same quarter window count together', () => {
    // Q1 has units 1, 2, 3. Schedule has one lesson from each, all with Q1 dates.
    const schedule = {
      '1.1': { unit: 1, periods: { C: '2026-09-15', D: '2026-09-15' } },
      '2.1': { unit: 2, periods: { C: '2026-10-01', D: '2026-10-01' } },
      '3.1': { unit: 3, periods: { C: '2026-11-01', D: '2026-11-01' } },
    };
    const map = lessonMap({
      '1.1': { lessonGrade: 90 },
      '2.1': { lessonGrade: 80 },
      '3.1': { lessonGrade: 70 },
    });

    const q1 = computeQuarterFromLessons({
      quarterKey: 'Q1',
      config: PHASE3_CONFIG,
      lessonMap: map,
      schedule,
      todayDateStr: TODAY,
      section: 'PeriodC',
      C: 85,
    });
    expect(q1.lessonsTotal).toBe(3);
    expect(q1.lessonsDue).toBe(3);
    // rawQuarter = (90+80+70)/3 = 80; banked = min(80,85) = 80.
    expect(q1.quarterGrade).toBe(80);
  });
});


describe('published A2 schedule sanity', () => {
  it('derives only authored lesson keys and C/D/G due dates from the published model', () => {
    const lessons = loadA2Lessons();
    const schedule = lessonScheduleFromModel(lessons);
    expect(lessons.length).toBeGreaterThan(0);
    expect(Object.keys(schedule).sort()).toEqual(lessons.map(lesson => lesson.key).sort());
    expect(PHASE3_CONFIG.meetingDays).toEqual({ C: [1, 2, 4], D: [1, 3, 5], G: [2, 3, 4, 5] });
    for (const lesson of lessons) {
      expect(Object.keys(schedule[lesson.key].periods).sort()).toEqual(['C', 'D', 'G']);
      for (const section of ['C', 'D', 'G']) {
        const date = schedule[lesson.key].periods[section];
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(PHASE3_CONFIG.meetingDays[section]).toContain(new Date(date + 'T12:00:00Z').getUTCDay());
        expect(quarterOfLesson(schedule[lesson.key], section, PHASE3_CONFIG)).toBe(quarterOfDate(date));
        expect(quarterOfDate(date)).not.toBeNull();
      }
      expect(schedule[lesson.key].items.map(item => item.itemId)).toEqual([
        'LC-' + lesson.key,
        ...lesson.tryIts.map(item => 'TI-' + lesson.key + '-' + item.n),
        'BL-U' + lesson.topic + '-L' + lesson.key.split('-')[1] + '-DESK_DONE',
      ]);
    }
  });

  it('keeps section-specific placement across the Q1/Q2 boundary, including G', () => {
    const entry = { unit: 1, periods: { C: '2026-11-05', D: '2026-11-09', G: '2026-11-10' } };
    expect(quarterOfLesson(entry, 'C', PHASE3_CONFIG)).toBe('Q1');
    expect(quarterOfLesson(entry, 'D', PHASE3_CONFIG)).toBe('Q2');
    expect(quarterOfLesson(entry, 'G', PHASE3_CONFIG)).toBe('Q2');
  });

  it('retains an early-release Wednesday as a D/G meeting day', () => {
    const entry = { unit: 1, periods: { C: null, D: '2026-09-16', G: '2026-09-16' } };
    expect(PHASE3_CONFIG.meetingDays.C).not.toContain(3);
    for (const section of ['D', 'G']) {
      expect(PHASE3_CONFIG.meetingDays[section]).toContain(3);
      expect(quarterOfLesson(entry, section, PHASE3_CONFIG)).toBe('Q1');
      const result = computeQuarterFromLessons({
        quarterKey: 'Q1', config: PHASE3_CONFIG, lessonMap: new Map(),
        schedule: { '1-1': entry }, todayDateStr: '2026-09-17', section,
      });
      expect(result.lessonsDue).toBe(1);
    }
  });
});

/**
 * tests/import-blooket.test.js
 *
 * Light, network-free unit for the Unit B Blooket import tool in
 * scripts/import-blooket.mjs (BLOOKET_IMPORT_P2_BUILD.md section 4). Covers:
 *   - blooketScore (the worked cases from spec section 1, plus clamps + skip),
 *   - CSV parse + header detection (student/name/nickname/username),
 *   - parseLessonKey ("1.2" / "U1.2" / "4.1-2" -> item id),
 *   - buildPlan (the dry-run plan: computed score + valid/invalid flagging).
 */

import { describe, it, expect, beforeAll } from 'vitest';

let blooketScore, parseBlooket, parseLessonKey, buildPlan;

beforeAll(async () => {
  const mod = await import('../scripts/import-blooket.mjs');
  blooketScore = mod.blooketScore;
  parseBlooket = mod.parseBlooket;
  parseLessonKey = mod.parseLessonKey;
  buildPlan = mod.buildPlan;
});

describe('blooketScore: the authoritative formula (spec section 1)', () => {
  it('matches the worked cases', () => {
    expect(blooketScore(30, 30, 30)).toBeCloseTo(1.0, 10);       // perfect
    expect(blooketScore(20, 25, 30)).toBeCloseTo(0.6667, 4);     // walkaway penalty
    expect(blooketScore(15, 15, 30)).toBeCloseTo(0.5, 10);       // half coverage
    expect(blooketScore(33, 35, 30)).toBeCloseTo(0.9429, 4);     // over-total -> pure accuracy
  });

  it('returns 0 when nothing was attempted (a recorded skip)', () => {
    expect(blooketScore(0, 0, 30)).toBe(0);
    expect(blooketScore(5, 0, 30)).toBe(0);
  });

  it('equals correct/total when attempted <= total', () => {
    expect(blooketScore(18, 24, 30)).toBeCloseTo(18 / 30, 10);
  });

  it('clamps into [0, 1]', () => {
    // Over-total perfect accuracy still caps at 1.
    expect(blooketScore(40, 40, 30)).toBe(1);
    expect(blooketScore(0, 10, 30)).toBe(0);
  });

  it('guards out-of-domain inputs to 0 (verbatim parity with the engine)', () => {
    expect(blooketScore(10, 10, 0)).toBe(0);     // total <= 0
    expect(blooketScore(NaN, 10, 30)).toBe(0);   // non-finite correct
    expect(blooketScore(10, NaN, 30)).toBe(0);   // non-finite attempted
    expect(blooketScore(-5, 10, 30)).toBe(0);    // negative correct
  });
});

describe('parseBlooket: header detection', () => {
  it('skips a header row when the first cell is a known student column name', () => {
    for (const head of ['student', 'name', 'nickname', 'username']) {
      const rows = parseBlooket(head + ',correct,attempted\ncoconut_shark,28,30\n');
      expect(rows).toEqual([{ student: 'coconut_shark', correct: 28, attempted: 30 }]);
    }
  });

  it('keeps the first data row when there is no header', () => {
    const rows = parseBlooket('coconut_shark,28,30\n');
    expect(rows).toEqual([{ student: 'coconut_shark', correct: 28, attempted: 30 }]);
  });
});

describe('parseBlooket: column handling', () => {
  it('parses correct/attempted as numbers and trims whitespace', () => {
    const rows = parseBlooket('student,correct,attempted\n  maple_otter , 20 , 25 \n');
    expect(rows).toEqual([{ student: 'maple_otter', correct: 20, attempted: 25 }]);
  });

  it('treats blank counts as NaN (an invalid row, not a silent zero)', () => {
    const rows = parseBlooket('student,correct,attempted\nmaple_otter,,\n');
    expect(rows[0].student).toBe('maple_otter');
    expect(Number.isNaN(rows[0].correct)).toBe(true);
    expect(Number.isNaN(rows[0].attempted)).toBe(true);
  });

  it('ignores blank lines and returns [] for empty input', () => {
    expect(parseBlooket('')).toEqual([]);
    expect(parseBlooket('student,correct,attempted\n')).toEqual([]);
    const rows = parseBlooket('student,correct,attempted\n\ncoconut_shark,28,30\n');
    expect(rows).toEqual([{ student: 'coconut_shark', correct: 28, attempted: 30 }]);
  });

  it('handles quoted real names containing commas', () => {
    const rows = parseBlooket('"Doe, Jane",10,12\n');
    expect(rows).toEqual([{ student: 'Doe, Jane', correct: 10, attempted: 12 }]);
  });
});

describe('parseLessonKey: lesson key -> item id', () => {
  it('parses a simple key', () => {
    expect(parseLessonKey('1.2')).toEqual({ unit: 1, lessonKey: '2', itemId: 'BLOOKET-U1L2' });
  });

  it('accepts the U-prefixed form', () => {
    expect(parseLessonKey('U1.2')).toEqual({ unit: 1, lessonKey: '2', itemId: 'BLOOKET-U1L2' });
  });

  it('parses a combined-worksheet (hyphenated) key', () => {
    expect(parseLessonKey('4.1-2')).toEqual({ unit: 4, lessonKey: '1-2', itemId: 'BLOOKET-U4L1-2' });
  });

  it('returns null on a malformed key', () => {
    expect(parseLessonKey('')).toBe(null);
    expect(parseLessonKey('abc')).toBe(null);
    expect(parseLessonKey('1')).toBe(null);
    expect(parseLessonKey(null)).toBe(null);
  });
});

describe('buildPlan: the dry-run plan (parse + compute + validity)', () => {
  it('computes the 0..1 score for each valid row', () => {
    const rows = parseBlooket('student,correct,attempted\ncoconut_shark,28,30\nmaple_otter,20,25\n');
    const plan = buildPlan(rows, 30);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ student: 'coconut_shark', valid: true });
    expect(plan[0].score).toBeCloseTo(blooketScore(28, 30, 30), 10);
    expect(plan[1].score).toBeCloseTo(blooketScore(20, 25, 30), 10);
  });

  it('flags a row with missing student as invalid with a null score', () => {
    const plan = buildPlan([{ student: '', correct: 5, attempted: 5 }], 30);
    expect(plan[0].valid).toBe(false);
    expect(plan[0].score).toBe(null);
  });

  it('flags a row with non-numeric counts as invalid (never a silent zero)', () => {
    const rows = parseBlooket('student,correct,attempted\nmaple_otter,,\n');
    const plan = buildPlan(rows, 30);
    expect(plan[0].valid).toBe(false);
    expect(plan[0].score).toBe(null);
  });

  it('treats an explicit 0/0 row as a valid recorded skip (score 0)', () => {
    const plan = buildPlan([{ student: 'maple_otter', correct: 0, attempted: 0 }], 30);
    expect(plan[0].valid).toBe(true);
    expect(plan[0].score).toBe(0);
  });
});

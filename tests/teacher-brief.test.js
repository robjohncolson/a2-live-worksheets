// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { teacherCardFor } from '../scripts/lib/teacher-brief.mjs';

const routine = Object.freeze({
  title: 'Three Reads and think-pair-share', mode: 'whiteboards', minutes: 11,
  frame: 'On the interval ___ the cost is ___.',
  body: '## Preparing\nRead the shipping table.\n\n## Interacting\nExample 5 on whiteboards.',
  marker: 'preserve other routine metadata',
});
const brief = Object.freeze({
  title: 'Piecewise functions: shipping and parking',
  ixl: Object.freeze(['LSG — Graph a linear function', 'RVD and W67 if time permits']),
  lastClass: 'Example 3 and WRZ completed; Example 5 carried over.',
  today: Object.freeze(['Inputs/context warm-up', 'LSG, then Example 5', 'Try It 5 in pairs']),
  next: '1-3 quiz tomorrow.',
});
const entry = Object.freeze({ date: '2026-10-26', section: 'C', observerCard: routine, teacherBrief: brief });

describe('teacherCardFor', () => {
  it('returns the original routine unchanged when there is no brief', () => {
    expect(teacherCardFor({ observerCard: routine })).toBe(routine);
    expect(teacherCardFor({ observerCard: routine, teacherBrief: null })).toBe(routine);
    expect(teacherCardFor({ section: 'C' })).toBeUndefined();
  });

  it('formats a concise phone card while preserving the detailed routine and its metadata', () => {
    const result = teacherCardFor(entry);
    expect(result).toEqual({ ...routine, title: brief.title, frame: null, body:
      '## IXL drills\nLSG — Graph a linear function\n\nRVD and W67 if time permits'
      + '\n\n## Last class\nExample 3 and WRZ completed; Example 5 carried over.'
      + '\n\n## Today\n1. Inputs/context warm-up\n\n2. LSG, then Example 5\n\n3. Try It 5 in pairs'
      + '\n\n## Next\n1-3 quiz tomorrow.',
    });
    expect(result).not.toBe(routine);
    expect(routine.title).toBe('Three Reads and think-pair-share');
    expect(routine.frame).toBe('On the interval ___ the cost is ___.');
    expect(routine.body).toContain('## Interacting');
    expect(entry.teacherBrief).toBe(brief);
  });

  it('supports optional whole-class metadata and omits an absent Next section', () => {
    const result = teacherCardFor({ ...entry, teacherBrief: { ...brief, mode: 'jam', minutes: 60, next: undefined } });
    expect(result).toMatchObject({ mode: 'jam', minutes: 60, frame: null });
    expect(result.body).not.toContain('## Next');
    expect(teacherCardFor({ ...entry, teacherBrief: { ...brief, mode: null, minutes: null } }))
      .toMatchObject({ mode: 'whiteboards', minutes: 11 });
  });

  it('keeps the same section’s briefs independent across different lesson days', () => {
    const tomorrow = { ...entry, date: '2026-10-27', teacherBrief: { ...brief,
      title: 'Piecewise quiz', ixl: ['RVD and W67 warm-up'],
      lastClass: 'Shipping and parking step functions completed.', today: ['Warm-up', '1-3 quiz'], next: undefined,
    } };
    const first = teacherCardFor(entry);
    const second = teacherCardFor(tomorrow);
    expect(first.title).toBe(brief.title);
    expect(second.title).toBe('Piecewise quiz');
    expect(first.body).toContain('LSG — Graph a linear function');
    expect(second.body).not.toContain('LSG');
    expect(second.body).toContain('2. 1-3 quiz');
    expect(teacherCardFor(entry)).toEqual(first);
    expect(tomorrow.observerCard).toBe(routine);
  });

  it('trims field edges while retaining useful non-ASCII text', () => {
    const result = teacherCardFor({ ...entry, teacherBrief: { ...brief,
      title: '  Interval reasoning  ', ixl: ['  LSG — Graph a line  '],
      lastClass: '  Open points: x < 2; closed points: x ≤ 2.  ', today: ['  Explain why.  '], next: null,
    } });
    expect(result.title).toBe('Interval reasoning');
    expect(result.body).toContain('## IXL drills\nLSG — Graph a line\n\n');
    expect(result.body).toContain('closed points: x ≤ 2.');
    expect(result.body).toContain('## Today\n1. Explain why.');
  });

  it('rejects malformed brief fields instead of publishing an incomplete card', () => {
    for (const [field, value] of [
      ['title', ' '], ['title', 7], ['ixl', []], ['ixl', 'LSG'], ['ixl', ['']],
      ['lastClass', null], ['today', []], ['today', [null]], ['next', ' '],
      ['mode', 'unknown'], ['mode', ''], ['minutes', '60'], ['minutes', 0], ['minutes', 181], ['minutes', 2.5],
    ]) {
      expect(() => teacherCardFor({ ...entry, teacherBrief: { ...brief, [field]: value } }), field)
        .toThrow(new RegExp(`teacherBrief\\.${field}`));
    }
    expect(() => teacherCardFor({ ...entry, teacherBrief: [] })).toThrow(/teacherBrief must be an object/);
    expect(() => teacherCardFor({ teacherBrief: brief })).toThrow(/requires an observerCard/);
    expect(() => teacherCardFor({ teacherBrief: brief, observerCard: [] })).toThrow(/requires an observerCard/);
  });

  it('accepts exactly 2000 Android text units and rejects overflow without truncating', () => {
    const small = { title: 'Brief', ixl: ['LSG'], lastClass: 'x', today: ['Example 5'] };
    const base = teacherCardFor({ observerCard: routine, teacherBrief: small }).body.length - 1;
    const exact = { ...small, lastClass: 'x'.repeat(2000 - base) };
    const result = teacherCardFor({ observerCard: routine, teacherBrief: exact });
    expect(result.body.length).toBe(2000);
    expect(() => teacherCardFor({ observerCard: routine, teacherBrief: { ...exact, lastClass: exact.lastClass + 'x' } }))
      .toThrow(/at most 2000 Android text units \(got 2001\)/);
  });

  it('counts supplementary Unicode characters the same way as Android', () => {
    const small = { title: 'Brief', ixl: ['LSG'], lastClass: 'x', today: ['Example 5'] };
    const base = teacherCardFor({ observerCard: routine, teacherBrief: small }).body.length - 1;
    const room = 2000 - base;
    const text = '😀'.repeat(Math.floor(room / 2)) + (room % 2 ? 'x' : '');
    const result = teacherCardFor({ observerCard: routine, teacherBrief: { ...small, lastClass: text } });
    expect(result.body.length).toBe(2000);
    expect([...result.body].length).toBeLessThan(2000);
    expect(() => teacherCardFor({ observerCard: routine, teacherBrief: { ...small, lastClass: text + '😀' } }))
      .toThrow(/got 2002/);
  });
});

// @vitest-environment node
// Exercise the live access policy, rather than a second copy of the retired gate.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
const source = html.match(/function _isLessonUnlocked\([^)]*\)\s*\{[^}]*\}/)[0];
const unlocked = new Function('return (' + source + ');')();

describe('lessons remain accessible independently of completion', () => {
  it.each(['2026-08-01', '2026-09-10', '2027-04-01'])('opens lessons dated %s with empty completion marks', date => {
    for (const topic of ['1.1', '1.2', '1.2+1.3', '2.1', '9.5']) {
      expect(unlocked(topic, new Date(date), '1.1', new Date('2026-09-10'), {}, true)).toBe(true);
    }
  });
  it('does not read or mutate saved progress to allow access', () => {
    const marks = new Proxy({}, {get() {throw Error('must not consult marks');}, set() {throw Error('must not alter marks');}});
    expect(unlocked('1.3', null, '1.2', null, marks, true)).toBe(true);
  });
  it('does not require a role, override, or synchronized grade state', () => {
    expect(unlocked('1.3', null, '1.2', null, null, true)).toBe(true);
    expect(unlocked('1.3', null, '1.2', null, null, false)).toBe(true);
  });
});

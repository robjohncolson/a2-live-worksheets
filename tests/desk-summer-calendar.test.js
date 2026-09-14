// desk-summer-calendar.test.js — during summer (today < firstDayOfSchool) the
// Desk calendar GRID itself shows the summer schedule (Unit 1, weekly due dates
// → Sept 1) as real amber Mon–Fri week rows woven in front of the blue
// school-year weeks. rCal prepends _summerWeeks() so the focus window, nav,
// today highlight, and completion overlays all work on them natively.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const SRC = ['_ymdISO', '_parseISODate', '_mondayOf', '_summerWeeks'].map((n) => fnBody(DESK, n)).join('\n');

const SCHED = {
  firstDayOfSchool: '2026-09-01',
  startDate: '2026-06-16',
  unit: 1,
  lessons: [
    { topic: '1.1', due: '2026-06-23' },
    { topic: '1.2', due: '2026-06-30' },
    { topic: '1.10', due: '2026-08-25' },
  ],
};
// One school-year row so _summerWeeks can reuse the 1.1 lesson NAME (month 8 = Sep).
const S = [[2026, 8, 1,
  { t: '1.1', n: 'Intro: Learning from Data', u: 1 },
  { t: '1.1', n: 'Intro: Learning from Data', u: 1 }]];

function run({ schedule = SCHED, today, sched = S }) {
  const d = (t, n, u, due, as, db) => ({ t, n, u, due: due || '', as: as || '', db: db || false });
  const NC = 'noclass';
  const tdy = () => { const p = today.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const window = { _summerSchedule: schedule };
  // eslint-disable-next-line no-new-func
  return new Function('window', 'tdy', 'S', 'd', 'NC', SRC + '\nreturn _summerWeeks();')(window, tdy, sched, d, NC);
}

// Find the [y,m,d,infB,infE] entry for a given ISO date across all weeks.
function cellFor(weeks, iso) {
  const p = iso.split('-').map(Number);
  for (const wk of weeks) {
    for (const e of wk.d) {
      if (e[0] === p[0] && e[1] === p[1] - 1 && e[2] === p[2]) return e;
    }
  }
  return null;
}

describe('Desk summer weeks — _summerWeeks()', () => {
  it('builds amber week rows during summer, all flagged _summer', () => {
    const weeks = run({ today: '2026-06-22' });
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks.every((w) => w._summer === true)).toBe(true);
  });

  it('places each lesson on its due date, reusing the school-year name', () => {
    const weeks = run({ today: '2026-06-22' });
    const c11 = cellFor(weeks, '2026-06-23');     // 1.1 due
    expect(c11).not.toBeNull();
    expect(c11[3].t).toBe('1.1');
    expect(c11[3].n).toBe('Intro: Learning from Data');   // name reused from S
    const c110 = cellFor(weeks, '2026-08-25');    // 1.10 due (no S name → fallback)
    expect(c110[3].t).toBe('1.10');
    expect(c110[3].n).toBe('Unit 1 lesson');
  });

  it('stops before the first school-year week (no overlap with Sept 1)', () => {
    const weeks = run({ today: '2026-06-22' });
    const firstSchoolMonday = new Date(2026, 7, 31); // Mon of the week containing Tue Sep 1
    for (const w of weeks) expect(w.m.getTime()).toBeLessThan(firstSchoolMonday.getTime());
  });

  it('includes today\'s week (anchored at min(today, startDate))', () => {
    const weeks = run({ today: '2026-06-22' });
    // startDate Jun 16 < today → anchor Jun 16, whose Monday is Jun 15.
    expect(weeks[0].m.getFullYear()).toBe(2026);
    expect(weeks[0].m.getMonth()).toBe(5);   // June
    expect(weeks[0].m.getDate()).toBe(15);
  });

  it('returns [] once school has started', () => {
    expect(run({ today: '2026-09-15' })).toEqual([]);
  });

  it('returns [] when no summer schedule is loaded', () => {
    expect(run({ schedule: null, today: '2026-06-22' })).toEqual([]);
  });
});

describe('Desk summer weeks — woven into rCal (structural)', () => {
  it('rCal prepends the summer weeks to its week list', () => {
    expect(DESK).toContain('function _summerWeeks');
    expect(DESK).toMatch(/W = _sumW\.concat\(W\)/);
  });

  it('summer rows get the amber .wk-summer class + CSS, and skip the quarter band', () => {
    expect(DESK).toContain('wk._summer?" wk-summer"');
    expect(DESK).toContain('.wk-row.wk-summer .dc');
    expect(DESK).toContain('!wk._summer'); // quarter-band divider suppressed for summer weeks
  });

  it('the old separate agenda was removed (rSummerCal / #summer-cal gone)', () => {
    expect(DESK).not.toContain('rSummerCal');
    expect(DESK).not.toContain('id="summer-cal"');
  });

  it('anchors the focus window on weekends too (bracket today by the week span)', () => {
    // the weekday-only day-cell scan misses Sat/Sun → without this, a summer
    // weekend jumped the calendar to the end of summer. Bracket fallback fixes it.
    expect(DESK).toContain('t >= _wm && t <= _we');
  });

  it('keeps the summer cell title readable on hover (white on black)', () => {
    expect(DESK).toContain('.wk-row.wk-summer .dc:hover .tl');
  });
});

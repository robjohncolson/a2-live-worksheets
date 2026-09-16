// desk-grade-checkin.test.js — the Desk monthly Grade Check-in reminder
// (DESK_GRADE_CHECKIN_SPEC.md). Two layers:
//   1. Pure schedule/state helpers, extracted and run in a VM against an inline
//      A2 C/D/G schedule (same extraction style as desk-year-opener).
//   2. Source-level structure + role-gate + privacy guards on the Desk HTML.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!m) throw new Error('fn not found: ' + name);
  const i = DESK.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < DESK.length; j++) {
    if (DESK[j] === '{') depth++;
    else if (DESK[j] === '}') { depth--; if (depth === 0) return DESK.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
// Inline A2 calendar rows use the Desk's C/D/G cell positions.
// No removed pacing arrays, videos, or Progress Check event injector.
const SY_CFG = { range: { start: [2026, 8, 2], end: [2027, 5, 17] } };
const REAL_S = [
  [2026, 8, 2, null, { t: '1-1', section: 'D' }, { t: '1-1', section: 'G' }],
  [2026, 8, 7, 'off', 'off', 'off'],
  [2026, 8, 30, null, { t: '1-2', section: 'D' }, { t: '1-2', section: 'G' }],
  [2026, 9, 30, null, { t: '2-1', section: 'D' }, { t: '2-1', section: 'G' }],
  [2026, 10, 30, { t: '2-2', section: 'C' }, { t: '2-2', section: 'D' }, null],
  [2026, 11, 23, null, { t: '3-1', earlyRelease: true }, { t: '3-1', earlyRelease: true }],
  [2026, 11, 24, 'off', 'off', 'off'],
  [2027, 5, 17, { t: '4-1', section: 'C' }, null, { t: '4-1', section: 'G' }],
];

const HELPER_FNS = ['calendarEntry', '_gcMidnight', '_gcISO', '_gcDaysBetween', '_gcIsInstructional', '_gcCleanMap',
  '_gcValidTimestamp', '_gcValidDateOnly',
  '_gradeCheckinToday', '_gradeCheckinPeriods', '_gradeCheckinLoad', '_gradeCheckinStatus'];
const HELPER_HEADER =
  "var _GRADE_CHECKIN_KEY='a2_teacher_grade_checkin_v1';var _GC_MS_DAY=86400000;"
  + "var _GC_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];";
const HELPER_SRC = HELPER_HEADER + '\n' + HELPER_FNS.map(fnBody).join('\n')
  + '\nreturn {' + HELPER_FNS.join(',') + '};';

function makeHelpers(store) {
  const data = Object.assign({}, store || {});
  const ls = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
  };
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', HELPER_SRC)(ls);
}
const H = makeHelpers();

function localDate(iso) { const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function period(key, dueISO, kind = 'monthly', label = key) {
  return { key, kind, label, due: localDate(dueISO), dueISO };
}

// A heavier sandbox that EXECUTES the real _gradeCheckinSnooze mutator against the
// live SY26-27 schedule (S) with a fake localStorage + document + teacher gate, so
// tests exercise the actual load→status→save path, not a hand-built expected state.
function makeSnoozeEnv(todayISO) {
  const data = { a2_desk_today_override: todayISO };
  const ls = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
  };
  const doc = { getElementById() { return null; } }; // no DOM → repaint no-ops
  const FNS = ['calendarEntry', '_gcMidnight', '_gcISO', '_gcDaysBetween', '_gcIsInstructional', '_gcCleanMap',
    '_gcValidTimestamp', '_gcValidDateOnly', '_gradeCheckinToday',
    '_gradeCheckinPeriods', '_gradeCheckinLoad', '_gradeCheckinSave', '_gradeCheckinStatus', '_gradeCheckinSnooze'];
  const src = HELPER_HEADER + '\n'
    + 'var cYear="SY26-27";var SCHEDULE_DEFS={"SY26-27":{range:CFG.range}};var S=SVAL;\n'
    + 'function _deskIsTeacher(){return true;}\n'
    + FNS.map(fnBody).join('\n')
    + '\nreturn {snooze:_gradeCheckinSnooze, load:_gradeCheckinLoad,'
    + ' setToday:function(t){localStorage.setItem("a2_desk_today_override",t);}};';
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', 'document', 'CFG', 'SVAL', src)(ls, doc, SY_CFG, REAL_S);
}
const SY = 'SY26-27';
const REAL_DEF = { range: SY_CFG.range };
const realPeriods = H._gradeCheckinPeriods({ yearKey: SY, def: REAL_DEF, S: REAL_S });

// ── Pure schedule tests (§8.1) ──────────────────────────────────────────────
describe('Grade Check-in — A2 calendar periods', () => {
  it('starts on the weekday before the school year', () => {
    expect(realPeriods[0]).toMatchObject({ kind: 'preseason', key: 'SY26-27:preseason', dueISO: '2026-09-01' });
  });
  it('uses the final instructional day and retains an early-release Wednesday', () => {
    expect(realPeriods.find(p => p.key === 'SY26-27:2026-09').dueISO).toBe('2026-09-30');
    expect(realPeriods.find(p => p.key === 'SY26-27:2026-12').dueISO).toBe('2026-12-23');
    expect(realPeriods.at(-1).dueISO).toBe('2027-06-17');
  });
  it('recognizes a G-only instructional row', () => {
    const periods = H._gradeCheckinPeriods({ yearKey: SY, def: REAL_DEF,
      S: [[2026, 8, 30, null, null, { t: '1-1', section: 'G' }]] });
    expect(periods.find(p => p.kind === 'monthly')?.dueISO).toBe('2026-09-30');
  });
  it('keeps stable monthly keys in due-date order', () => {
    for (const p of realPeriods.slice(1)) expect(p.key).toMatch(/^SY26-27:\d{4}-\d{2}$/);
    for (let i = 1; i < realPeriods.length; i++) {
      expect(realPeriods[i].due.getTime()).toBeGreaterThanOrEqual(realPeriods[i - 1].due.getTime());
    }
  });
  it('has no periods before a schedule is available', () => {
    expect(H._gradeCheckinPeriods({ yearKey: SY, def: REAL_DEF, S: [] })).toEqual([]);
    expect(H._gradeCheckinPeriods({ yearKey: SY, def: REAL_DEF, S: null })).toEqual([]);
  });
});

describe('Grade Check-in — reminder state machine', () => {
  const p1 = period('SY26-27:2026-09', '2026-09-30');
  const emptyState = { completed: {}, snoozedUntil: {} };
  const status = (today, periods = [p1], state = emptyState) =>
    H._gradeCheckinStatus({ today: localDate(today), periods, state });

  it('is "upcoming" (no banner) more than 7 days before due', () => {
    const s = status('2026-09-22'); // 8 days out
    expect(s.state).toBe('upcoming');
    expect(s.outstandingCount).toBe(0);
  });
  it('flips to "due-soon" exactly at the 7-day boundary', () => {
    const s = status('2026-09-23'); // 7 days out
    expect(s.state).toBe('due-soon');
    expect(s.outstandingCount).toBe(1);
    expect(s.period).toBe('SY26-27:2026-09');
  });
  it('is "due" on the due date and "overdue" after', () => {
    expect(status('2026-09-30').state).toBe('due');
    const od = status('2026-10-01');
    expect(od.state).toBe('overdue');
    expect(od.daysUntil).toBe(-1);
  });

  it('surfaces the oldest of multiple outstanding periods and counts them', () => {
    const p2 = period('SY26-27:2026-10', '2026-10-30');
    const s = status('2026-11-02', [p1, p2]);
    expect(s.period).toBe('SY26-27:2026-09'); // oldest
    expect(s.outstandingCount).toBe(2);
    expect(s.next && s.next.key).toBe('SY26-27:2026-10');
  });

  it('completion advances to the next period and records last-completed', () => {
    const p2 = period('SY26-27:2026-10', '2026-10-30');
    const state = { completed: { 'SY26-27:2026-09': '2026-09-30T12:00:00.000Z' }, snoozedUntil: {} };
    const s = status('2026-10-25', [p1, p2], state); // 5 days before p2
    expect(s.period).toBe('SY26-27:2026-10');
    expect(s.state).toBe('due-soon');
    expect(s.outstandingCount).toBe(1);
    expect(s.last && s.last.key).toBe('SY26-27:2026-09');
  });

  it('snooze suppresses the banner only through the snooze date', () => {
    const snoozedTo = { completed: {}, snoozedUntil: { 'SY26-27:2026-09': '2026-10-03' } };
    // On the snooze date: still suppressed.
    const onDate = status('2026-10-03', [p1], snoozedTo);
    expect(onDate.outstandingCount).toBe(0);
    // Day after: resurfaces (still overdue, never marked complete).
    const after = status('2026-10-04', [p1], snoozedTo);
    expect(after.outstandingCount).toBe(1);
    expect(after.state).toBe('overdue');
    expect(after.period).toBe('SY26-27:2026-09');
  });

  it('reports "reviewed" when every period is complete', () => {
    const state = { completed: { 'SY26-27:2026-09': 'x' }, snoozedUntil: {} };
    expect(status('2026-11-01', [p1], state).state).toBe('reviewed');
  });

  it('a snoozed sole outstanding period is "snoozed" (not falsely "reviewed") with a non-null period so the overlay can still act on it', () => {
    const snoozedTo = { completed: {}, snoozedUntil: { 'SY26-27:2026-09': '2026-10-03' } };
    const s = status('2026-10-01', [p1], snoozedTo); // overdue but snoozed
    expect(s.state).toBe('snoozed');
    expect(s.period).toBe('SY26-27:2026-09');
    expect(s.outstandingCount).toBe(0); // still no live banner while snoozed
  });

  it('exposes every outstanding period key, and snoozing ALL of them quiets the banner (fixes the multi-overdue snooze gap)', () => {
    const p2 = period('SY26-27:2026-10', '2026-10-30');
    const before = status('2026-11-02', [p1, p2]); // both overdue
    expect(before.outstandingKeys).toEqual(['SY26-27:2026-09', 'SY26-27:2026-10']);
    // What _gradeCheckinSnooze now writes: snooze every outstanding key.
    const snoozedUntil = {};
    before.outstandingKeys.forEach((k) => { snoozedUntil[k] = '2026-11-05'; });
    const after = status('2026-11-02', [p1, p2], { completed: {}, snoozedUntil });
    expect(after.outstandingCount).toBe(0); // banner fully quiet — not just advanced to Oct
    expect(after.state).toBe('snoozed');
  });

  it('two consecutive real _gradeCheckinSnooze calls extend EVERY open period, even ones already snoozed', () => {
    const env = makeSnoozeEnv('2026-11-02');
    env.snooze(); // Preseason/Sep/Oct all overdue on Nov 2 → snoozed to Nov 5
    const s1 = env.load().snoozedUntil;
    expect(s1['SY26-27:preseason']).toBe('2026-11-05');
    expect(s1['SY26-27:2026-09']).toBe('2026-11-05');
    expect(s1['SY26-27:2026-10']).toBe('2026-11-05');
    expect(s1['SY26-27:2026-11']).toBeUndefined(); // Nov 30 not yet in window → untouched
    // Re-snooze on Nov 4 while all three are still snoozed: all must extend to Nov 7,
    // NOT just the surfaced oldest (the bug _gradeCheckinSnooze had with outstandingKeys).
    env.setToday('2026-11-04');
    env.snooze();
    const s2 = env.load().snoozedUntil;
    expect(s2['SY26-27:preseason']).toBe('2026-11-07');
    expect(s2['SY26-27:2026-09']).toBe('2026-11-07');
    expect(s2['SY26-27:2026-10']).toBe('2026-11-07');
  });
});

// ── Storage tests (§8.1) ────────────────────────────────────────────────────
describe('Grade Check-in — local state', () => {
  it('malformed / non-object JSON does not throw and never fabricates completion', () => {
    for (const bad of ['{ not json', '[1,2,3]', 'null', '"str"', '42']) {
      const helpers = makeHelpers({ a2_teacher_grade_checkin_v1: bad });
      const st = helpers._gradeCheckinLoad();
      expect(st.completed).toEqual({});
      expect(st.snoozedUntil).toEqual({});
    }
  });
  it('rejects non-string completion values (true / arrays / nested objects) so a reminder is never silently skipped', () => {
    const helpers = makeHelpers({ a2_teacher_grade_checkin_v1: JSON.stringify({
      v: 1,
      completed: { 'SY26-27:2026-09': true, 'SY26-27:2026-10': { done: 1 }, 'SY26-27:2026-11': '2026-11-30T00:00:00.000Z' },
      snoozedUntil: { 'SY26-27:2026-09': 'garbage', 'SY26-27:2026-10': '2026-11-05' },
    }) });
    const st = helpers._gradeCheckinLoad();
    expect(st.completed['SY26-27:2026-09']).toBeUndefined(); // true → rejected
    expect(st.completed['SY26-27:2026-10']).toBeUndefined(); // object → rejected
    expect(st.completed['SY26-27:2026-11']).toBe('2026-11-30T00:00:00.000Z'); // valid string kept
    expect(st.snoozedUntil['SY26-27:2026-09']).toBeUndefined(); // non-date → rejected
    expect(st.snoozedUntil['SY26-27:2026-10']).toBe('2026-11-05'); // valid kept
  });
  it('a completed value that is an array is ignored (not treated as a map)', () => {
    const helpers = makeHelpers({ a2_teacher_grade_checkin_v1: JSON.stringify({ completed: ['SY26-27:2026-09'], snoozedUntil: {} }) });
    expect(helpers._gradeCheckinLoad().completed).toEqual({});
  });
  it('rejects non-canonical completion timestamps and non-exact / impossible snooze dates (round-trip validation)', () => {
    const helpers = makeHelpers({ a2_teacher_grade_checkin_v1: JSON.stringify({
      completed: {
        'SY26-27:preseason': 'banana',                  // not a date
        'SY26-27:2026-09': '2026-09-30',                // date-only, not a full ISO timestamp
        'SY26-27:2026-10': '2026-10-30T00:00:00.000Z',  // valid canonical ISO → kept
      },
      snoozedUntil: {
        'SY26-27:2026-09': '2099-12-31junk',            // trailing junk after a real date
        'SY26-27:2026-10': '2026-02-30',                // impossible calendar date
        'SY26-27:2026-11': '2026-11-05',                // valid → kept
      },
    }) });
    const st = helpers._gradeCheckinLoad();
    expect(st.completed['SY26-27:preseason']).toBeUndefined();   // "banana" no longer marks it complete
    expect(st.completed['SY26-27:2026-09']).toBeUndefined();     // date-only rejected
    expect(st.completed['SY26-27:2026-10']).toBe('2026-10-30T00:00:00.000Z');
    expect(st.snoozedUntil['SY26-27:2026-09']).toBeUndefined();  // "2099-12-31junk" no longer suppresses
    expect(st.snoozedUntil['SY26-27:2026-10']).toBeUndefined();  // Feb 30 rejected
    expect(st.snoozedUntil['SY26-27:2026-11']).toBe('2026-11-05');
  });
  it('a missing store loads the empty default', () => {
    const st = makeHelpers()._gradeCheckinLoad();
    expect(st).toEqual({ v: 1, completed: {}, snoozedUntil: {} });
  });
  it('keeps a valid completed/snoozed map and ignores unknown fields', () => {
    const helpers = makeHelpers({
      a2_teacher_grade_checkin_v1: JSON.stringify({
        v: 1, completed: { 'SY26-27:preseason': '2026-08-31T00:00:00.000Z' },
        snoozedUntil: { 'SY26-27:2026-09': '2026-09-28' }, bogus: 'ignored',
      }),
    });
    const st = helpers._gradeCheckinLoad();
    expect(st.completed['SY26-27:preseason']).toBeTruthy();
    expect(st.snoozedUntil['SY26-27:2026-09']).toBe('2026-09-28');
    expect(st.bogus).toBeUndefined();
  });
  it('parses a YYYY-MM-DD today-override as a LOCAL date (not UTC-sliced)', () => {
    const helpers = makeHelpers({ a2_desk_today_override: '2026-09-15' });
    const t = helpers._gradeCheckinToday();
    expect(t.getFullYear()).toBe(2026);
    expect(t.getMonth()).toBe(8); // September
    expect(t.getDate()).toBe(15);
  });
});

// ── Structure / role / privacy source guards (§8.2) ─────────────────────────
describe('Grade Check-in — Desk surfaces exist and are hidden by default', () => {
  it('adds a teacher-menu item with a due badge', () => {
    expect(DESK).toMatch(/openGradeCheckin\(\)/);
    expect(DESK).toMatch(/id="menu-gradecheckin-badge"\s+class="menu-nudge-badge"\s+hidden/);
  });
  it('has a hidden, aria-live roadmap banner', () => {
    expect(DESK).toMatch(/id="grade-checkin-banner"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
    expect(DESK).toMatch(/id="grade-checkin-banner-label"/);
  });
  it('has the overlay window (an .app-overlay, hidden by default via CSS)', () => {
    expect(DESK).toMatch(/class="app-overlay" id="app-gradecheckin-overlay"/);
    expect(DESK).toMatch(/id="gradecheckin-content"/);
    expect(DESK).toMatch(/onclick="closeGradeCheckin\(\)"/);
  });
  it('keeps Grade Check-in reachable through the workspace recovery action', () => {
    expect(DESK).toContain("event.data.action === 'checkin'");
  });
  it('defines the full function surface', () => {
    for (const fn of ['function _gradeCheckinToday', 'function _gradeCheckinPeriods', 'function _gradeCheckinLoad',
      'function _gradeCheckinSave', 'function _gradeCheckinStatus', 'function _renderGradeCheckinUI',
      'function openGradeCheckin', 'function closeGradeCheckin', 'function _gradeCheckinMarkReviewed',
      'function _gradeCheckinSnooze', 'function _gradeCheckinCopyCommand']) {
      expect(DESK, `missing ${fn}`).toContain(fn);
    }
  });
});

describe('Grade Check-in — every open/mutate entry point self-gates on _deskIsTeacher()', () => {
  for (const fn of ['openGradeCheckin', '_gradeCheckinMarkReviewed', '_gradeCheckinSnooze', '_renderGradeCheckinUI', '_gradeCheckinCopyCommand']) {
    it(`${fn} enforces _deskIsTeacher()`, () => {
      expect(fnBody(fn)).toContain('_deskIsTeacher');
    });
  }
  it('role changes and calendar refresh both re-render the reminder', () => {
    expect(fnBody('updateUserRoleUI')).toContain('_renderGradeCheckinUI');
    expect(fnBody('loadYear')).toContain('_renderGradeCheckinUI');
  });
});

describe('Grade Check-in — adversarial-review fixes', () => {
  it('snooze uses DST-safe calendar-field arithmetic, not fixed +72h milliseconds', () => {
    const body = fnBody('_gradeCheckinSnooze');
    expect(body).toMatch(/getDate\(\)\s*\+\s*3/);
    expect(body).not.toContain('3 * _GC_MS_DAY');
  });
  it('the snooze button gate includes the snoozed state (so Mark Reviewed stays reachable)', () => {
    expect(fnBody('_paintGradeCheckin')).toMatch(/st\.state === 'snoozed'/);
  });
  it('snooze targets pendingKeys (all open periods incl. already-snoozed), not just the surfaced one', () => {
    const body = fnBody('_gradeCheckinSnooze');
    expect(body).toMatch(/st\.pendingKeys/);
    expect(body).toMatch(/keys\.forEach/);
  });
  it.each([false, true])('clipboard rejection reaches fallback and reports success only when it copies (fallback=%s)', async (fallbackSucceeds) => {
    const command = 'node scripts/grade-checkin.mjs';
    const button = { textContent: 'Copy command' };
    const writes = [];
    const copies = [];
    const timers = [];
    const attached = [];
    let selected = false;
    const textarea = {
      style: {}, setAttribute() {}, select() { selected = true; },
    };
    const document = {
      createElement: () => textarea,
      body: {
        appendChild: element => attached.push(element),
        removeChild: element => attached.splice(attached.indexOf(element), 1),
      },
      execCommand: name => { copies.push(name); return fallbackSucceeds; },
    };
    const navigator = { clipboard: { writeText: text => {
      writes.push(text);
      return Promise.reject(new Error('Clipboard unavailable'));
    } } };
    // Execute the production handler with no toast helper in scope.
    const copy = new Function('document', 'navigator', 'setTimeout', '_GRADE_CHECKIN_CMD',
      fnBody('_gradeCheckinCopyCommand') + '\nreturn _gradeCheckinCopyCommand;')(
      document, navigator, callback => timers.push(callback), command);
    copy(button);
    expect(button.textContent).toBe('Copy command');
    await Promise.resolve();
    expect(writes).toEqual([command]);
    expect(copies).toEqual(['copy']);
    expect(selected).toBe(true);
    expect(textarea.value).toBe(command);
    expect(attached).toEqual([]);
    expect(button.textContent).toBe(fallbackSucceeds ? '✓ Copied' : 'Copy command');
    expect(timers).toHaveLength(fallbackSucceeds ? 1 : 0);
  });
});

describe('Grade Check-in — refresh + storage-boundary fixes', () => {
  it('the minute timer also refreshes the reminder (due-soon / snooze-expiry without a reload)', () => {
    expect(DESK).toMatch(/setInterval\(\(\)=>\{rCD\(\);rCal\(\);rProg\(\)[\s\S]{0,160}_renderGradeCheckinUI/);
  });
  it('the cross-tab storage listener re-gates the reminder surfaces', () => {
    expect(DESK).toMatch(/addEventListener\('storage'[\s\S]{0,600}_renderGradeCheckinUI/);
  });
  it('hides the menu item for non-teachers and ships it display:none in static HTML', () => {
    expect(DESK).toMatch(/id="menu-gradecheckin-item"[^>]*style="display:none"/);
    expect(fnBody('_renderGradeCheckinUI')).toContain('menu-gradecheckin-item');
  });
  it('opening the overlay does not bump icon usage (single-key storage boundary)', () => {
    expect(fnBody('openGradeCheckin')).not.toContain('bumpUsage');
  });
  it('the non-teacher branch also closes an already-open overlay window', () => {
    expect(fnBody('_renderGradeCheckinUI')).toMatch(/app-gradecheckin-overlay[\s\S]{0,90}display\s*=\s*'none'/);
  });
});

describe('Grade Check-in — privacy boundary', () => {
  // Isolate the added block so the guard is precise.
  const start = DESK.indexOf('// ── Grade Check-in (DESK_GRADE_CHECKIN_SPEC');
  const end = DESK.indexOf('// ── Nightly Review (NIGHTLY_REVIEW_SPEC', start);
  const block = DESK.slice(start, end);

  it('copies only the generic run command — no absolute path', () => {
    expect(block).toMatch(/_GRADE_CHECKIN_CMD = 'node [^']+\.mjs'/);
  });
  it('stores nothing under any key but the versioned check-in key', () => {
    expect(block).toContain("_GRADE_CHECKIN_KEY = 'a2_teacher_grade_checkin_v1'");
  });
  it('contains no absolute filesystem path or Windows username', () => {
    expect(block.length).toBeGreaterThan(0);
    expect(/[A-Za-z]:[\\/]Users/.test(block)).toBe(false);
    expect(/[A-Za-z]:\\\\Users/.test(block)).toBe(false);
    expect(block.includes('config.private')).toBe(false);
  });
  it('adds no server call, migration, or Supabase reference in the block', () => {
    expect(/fetch\s*\(/.test(block)).toBe(false);
    expect(block.toLowerCase().includes('supabase')).toBe(false);
    expect(block.includes('/class/')).toBe(false);
  });
});

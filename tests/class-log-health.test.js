// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const SOURCE = readFileSync(new URL('../lib/class-log-health.js', import.meta.url), 'utf8');
const DESK = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const context = createContext({ module: { exports: {} }, Intl, Date, Number });
runInContext(SOURCE, context);
const H = context.module.exports;

// Wed 2026-10-21 (SAT day), Thu 2026-10-22. EDT = UTC-4.
const SAT = { overrides: [
  { date: '2026-10-21', section: 'D', start: '11:20', end: '12:00', cancelled: false },
  ...['B', 'C', 'E', 'G'].map(section => ({ date: '2026-10-21', section, start: null, end: null, cancelled: true })),
], daysOff: [] };
const at = (date, hhmm) => ({ date, minutes: H.toMinutes(hhmm) });
const device = (over = {}, payload = {}) => ({
  device: 's24', ageMinutes: 12, receivedAt: '2026-10-21T14:00:00Z', ...over,
  payload: {
    at: '2026-10-21T10:00:00-04:00', battery: { pct: 84, charging: false }, mode: 'OffDay',
    nextBlock: { date: '2026-10-21', section: 'D', start: '11:20' }, queues: { uploads: 0, transcribing: 0, cardOutcomes: 0, summaryPosts: 0 },
    lastRecording: { date: '2026-10-20', section: 'G', end: '14:30' }, failures24h: 0, ...payload,
  },
});

describe('class-log-health: blocks', () => {
  it('uses the weekly table, then server overrides, and nothing on a day off', () => {
    expect(H.blocksForDate('2026-10-22', {}).map(b => `${b.section} ${b.start}-${b.end}`)).toEqual(['B 09:55-11:00', 'C 11:05-13:14', 'G 13:20-14:30']);
    expect(H.blocksForDate('2026-10-21', SAT).map(b => `${b.section} ${b.start}-${b.end}`)).toEqual(['D 11:20-12:00']);
    expect(H.blocksForDate('2026-10-21', {}).map(b => b.section)).toEqual(['G', 'E', 'D']);
    expect(H.blocksForDate('2026-11-03', { daysOff: ['2026-11-03'] })).toEqual([]);
    expect(H.blocksForDate('2026-10-24', {})).toEqual([]); // Saturday
  });
  it('nyParts reads the New York wall clock', () => {
    expect({ ...H.nyParts(new Date('2026-10-21T15:20:00Z')) }).toEqual({ date: '2026-10-21', minutes: 11 * 60 + 20 });
    expect({ ...H.nyParts(new Date('2026-10-22T02:30:00Z')) }).toEqual({ date: '2026-10-21', minutes: 22 * 60 + 30 });
  });
});

describe('class-log-health: the red rule', () => {
  const blocks = H.blocksForDate('2026-10-21', SAT);
  it('green when recent, no failures and nothing missed', () => {
    expect(H.verdict(device(), at('2026-10-21', '10:12'), blocks).red).toBe(false);
  });
  it('red when silent for more than 90 min during the school-day window only', () => {
    expect(H.verdict(device({ ageMinutes: 91 }), at('2026-10-21', '10:30'), blocks).reasons).toEqual(['no ping for 91 min']);
    expect(H.verdict(device({ ageMinutes: 90 }), at('2026-10-21', '10:30'), blocks).red).toBe(false);
    expect(H.verdict(device({ ageMinutes: 600 }), at('2026-10-21', '09:00'), blocks).red).toBe(false); // before 10:20
    expect(H.verdict(device({ ageMinutes: 600 }), at('2026-10-21', '12:31'), blocks).red).toBe(false); // after 12:30
    expect(H.verdict(device({ ageMinutes: 600 }), at('2026-10-24', '11:00'), H.blocksForDate('2026-10-24', {})).red).toBe(false); // no school
  });
  it('red when failures24h > 0', () => {
    expect(H.verdict(device({}, { failures24h: 2 }), at('2026-10-21', '10:12'), blocks).reasons).toEqual(['2 failure(s) in 24 h']);
  });
  it('red when the latest ended block has no recording, judged from a ping after it ended', () => {
    const after = { at: '2026-10-21T12:20:00-04:00' };
    expect(H.verdict(device({}, after), at('2026-10-21', '12:25'), blocks).reasons).toEqual(['no recording for D 11:20']);
    const recorded = { ...after, lastRecording: { date: '2026-10-21', section: 'D', end: '12:00' } };
    expect(H.verdict(device({}, recorded), at('2026-10-21', '12:25'), blocks).red).toBe(false);
    // Another section's later recording does not count for D.
    const other = { ...after, lastRecording: { date: '2026-10-21', section: 'G', end: '12:15' } };
    expect(H.verdict(device({}, other), at('2026-10-21', '12:25'), blocks).reasons).toEqual(['no recording for D 11:20']);
    // A D recording that ended before the block started (an earlier block) does not count.
    const early = { ...after, lastRecording: { date: '2026-10-21', section: 'D', end: '11:20' } };
    expect(H.verdict(device({}, early), at('2026-10-21', '12:25'), blocks).red).toBe(true);
    // The last ping came before the block ended: no judgement (the age rule covers silence).
    expect(H.verdict(device(), at('2026-10-21', '12:25'), blocks).red).toBe(false);
    // Inside the 15-minute grace after the end: not yet.
    expect(H.verdict(device({}, after), at('2026-10-21', '12:10'), blocks).red).toBe(false);
  });
  it('no device: not red', () => {
    expect(H.verdict(null, at('2026-10-21', '12:25'), blocks)).toEqual({ red: false, reasons: [] });
  });
});

describe('class-log-health: text', () => {
  it('renders the one-line strip', () => {
    expect(H.text(device(), at('2026-10-21', '10:12'))).toBe('Class Log · seen 12 min ago · 84 % · Waiting for D 11:20 · 0 queued');
    expect(H.text(device({ ageMinutes: 135 }, { mode: 'Recording', battery: { pct: 50, charging: true }, queues: { uploads: 2, transcribing: 1 } }), at('2026-10-21', '11:30')))
      .toBe('Class Log · seen 2 h 15 min ago · 50 % charging · Recording · 3 queued');
    expect(H.text(device({}, { nextBlock: { date: '2026-10-22', section: 'C', start: '11:05' }, failures24h: 1 }), at('2026-10-21', '16:00')))
      .toBe('Class Log · seen 12 min ago · 84 % · Waiting for C Thu 11:05 · 0 queued · 1 failed (24 h)');
    expect(H.text(null, at('2026-10-21', '10:00'))).toBe('Class Log · no health ping yet');
  });
});

describe('class-log-health: Desk wiring', () => {
  it('desk.html has the hidden strip div, its styles and the script; sw.js caches it', () => {
    expect(DESK).toMatch(/<div id="class-log-health" role="status" aria-live="polite" hidden><\/div>/);
    expect(DESK).toMatch(/#class-log-health\.is-red \{/);
    expect(DESK).toContain('<script src="lib/class-log-health.js"></script>');
    expect(SW).toContain("'lib/class-log-health.js',");
  });
  it('mount stays hidden and never fetches for a non-teacher', async () => {
    const el = { hidden: true, classList: { toggle() {} } };
    let fetched = 0;
    const win = {
      document: { getElementById: id => (id === 'class-log-health' ? el : null) },
      rosterClient: { current: () => ({ role: 'student' }), token: () => 't' }, ROSTER_SERVICE_URL: 'http://x',
      fetch: async () => { fetched++; return { ok: true, json: async () => ({ devices: [] }) }; }, setInterval() {},
    };
    H.mount(win);
    await new Promise(r => setTimeout(r, 0));
    expect(el.hidden).toBe(true);
    expect(fetched).toBe(0);
  });
  it('mount hides the strip when the schedule GET fails (no weekly-table fallback)', async () => {
    const el = { hidden: false, textContent: '', classList: { toggle() {} } };
    const win = {
      document: { getElementById: () => el },
      rosterClient: { current: () => ({ role: 'teacher' }), token: () => 'teacher-token' }, ROSTER_SERVICE_URL: 'http://x',
      fetch: async url => (url.includes('/teacher/health')
        ? { ok: true, json: async () => ({ devices: [device()] }) }
        : { ok: false, status: 503, json: async () => ({ error: 'Schedule service unavailable' }) }),
      setInterval() {},
    };
    H.mount(win);
    await new Promise(r => setTimeout(r, 10));
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe('');
  });
  it('mount renders for a teacher with the bearer token', async () => {
    const el = { hidden: true, textContent: '', title: '', red: null, classList: { toggle(_, on) { el.red = on; } } };
    const calls = [];
    const win = {
      document: { getElementById: () => el },
      rosterClient: { current: () => ({ role: 'teacher' }), token: () => 'teacher-token' }, ROSTER_SERVICE_URL: 'http://x',
      fetch: async (url, options) => {
        calls.push([url, options.headers.Authorization]);
        return { ok: true, json: async () => (url.includes('/teacher/health') ? { devices: [device({}, { failures24h: 1 })] } : { overrides: [], daysOff: [] }) };
      },
      setInterval() {},
    };
    H.mount(win);
    await new Promise(r => setTimeout(r, 10));
    expect(calls[0]).toEqual(['http://x/teacher/health', 'Bearer teacher-token']);
    expect(calls[1][0]).toMatch(/^http:\/\/x\/teacher\/schedule-overrides\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toMatch(/^Class Log · seen 12 min ago · 84 % /);
    expect(el.red).toBe(true);
  });
});

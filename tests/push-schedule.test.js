// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  SEED, buildSchedule, chunkBody, daysOffFromSchoolYear, formatSchedule, overridesFromDayLog, parseArgs, todayInNewYork,
} from '../scripts/push-schedule.mjs';

const script = fileURLToPath(new URL('../scripts/push-schedule.mjs', import.meta.url));
const dayLog = { entries: [
  { date: '2026-10-21', section: 'G', plan: 'No G block', student: 'No class (SAT day)' },
  { date: '2026-11-18', section: 'D', plan: 'early release', bell: { start: '10:00', end: '10:40' }, bellNote: 'Early release' },
  { date: '2026-11-19', section: 'C', plan: 'assembly', cancelled: true },
  { date: '2026-11-26', section: 'C', plan: 'planned on a holiday', student: 'Lesson 2-1' },
] };
const schoolYear = { daysOff: [[[2026, 10, 26], [2026, 10, 29]], [[2026, 10, 11]]] }; // Thu Nov 26 - Sun Nov 29, Wed Nov 11
const classLog = { daysOff: ['2026-11-11', '2027-06-18'], _earlyReleaseDays: { dates: ['2026-10-21', '2026-11-18', '2026-12-09'] } };

function withFiles(fn) {
  const dir = mkdtempSync(resolve(tmpdir(), 'schedule-'));
  try {
    writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify(dayLog));
    writeFileSync(resolve(dir, 'year.json'), JSON.stringify(schoolYear));
    writeFileSync(resolve(dir, 'schedule.json'), JSON.stringify(classLog));
    return fn(dir, ['--file', resolve(dir, 'day-log.json'), '--school-year', resolve(dir, 'year.json'), '--schedule', resolve(dir, 'schedule.json')]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('push-schedule', () => {
  it('the seed carries the 2026-10-21 SAT day', () => {
    const { overrides } = buildSchedule({ from: '2026-10-21', to: '2026-10-21' });
    expect(overrides).toEqual([
      { date: '2026-10-21', section: 'B', start: null, end: null, cancelled: true, note: 'SAT day: no block', source: 'desk' },
      { date: '2026-10-21', section: 'C', start: null, end: null, cancelled: true, note: 'SAT day: no block', source: 'desk' },
      { date: '2026-10-21', section: 'D', start: '11:20', end: '12:00', cancelled: false, note: 'SAT day: 40-minute block', source: 'desk' },
      { date: '2026-10-21', section: 'E', start: null, end: null, cancelled: true, note: 'SAT day: no block', source: 'desk' },
      { date: '2026-10-21', section: 'G', start: null, end: null, cancelled: true, note: 'SAT day: no block', source: 'desk' },
    ]);
    expect(SEED).toHaveLength(5);
  });
  it('reads bell and cancelled entries from the day log; the day log beats the seed', () => {
    expect(overridesFromDayLog(dayLog)).toEqual([
      { date: '2026-11-18', section: 'D', start: '10:00', end: '10:40', cancelled: false, note: 'Early release', source: 'desk' },
      { date: '2026-11-19', section: 'C', start: null, end: null, cancelled: true, note: null, source: 'desk' },
    ]);
    const log = { entries: [{ date: '2026-10-21', section: 'D', bell: { start: '11:25', end: '12:05' } }] };
    expect(buildSchedule({ dayLog: log, from: '2026-10-21', to: '2026-10-21' }).overrides.find(row => row.section === 'D'))
      .toMatchObject({ start: '11:25', end: '12:05', note: null });
  });
  it('rejects bad day-log bells with the server rules', () => {
    const one = entry => () => overridesFromDayLog({ entries: [{ date: '2026-11-18', section: 'D', ...entry }] });
    expect(one({ bell: { start: '10:40', end: '10:00' } })).toThrow(/before/);
    expect(one({ bell: { start: '10:00' } })).toThrow(/HH:MM/);
    expect(one({ section: 'all', cancelled: true })).toThrow(/single section/);
    expect(one({ date: '2026-02-30', cancelled: true })).toThrow(/date/);
  });
  it('expands school-year ranges (0-based months, weekdays only) and unions every days-off source', () => {
    expect(daysOffFromSchoolYear(schoolYear)).toEqual(['2026-11-26', '2026-11-27', '2026-11-11']);
    const built = buildSchedule({ seed: [], schoolYear, classLogSchedule: classLog, extraDaysOff: ['2026-12-01'], from: '2026-10-20', to: '2026-12-31' });
    expect(built.daysOff.map(row => row.date)).toEqual(['2026-11-11', '2026-11-26', '2026-11-27', '2026-12-01']);
  });
  it('filters by --from/--to, warns on early-release days without times and on planned classes on a day off', () => {
    const built = buildSchedule({ dayLog, schoolYear, classLogSchedule: classLog, from: '2026-10-22' });
    expect(built.overrides.map(row => row.date)).toEqual(['2026-11-18', '2026-11-19']);
    expect(built.earlyReleaseWithoutTimes).toEqual(['2026-12-09']);
    expect(built.dayOffConflicts).toEqual(['2026-11-26 C']);
    const text = formatSchedule(built);
    expect(text).toMatch(/2026-11-18\s+D\s+10:00-10:40\s+Early release/);
    expect(text).toMatch(/2026-11-19\s+C\s+cancelled/);
    expect(text).toMatch(/Warning: early-release days with no bell times \(not sent\): 2026-12-09/);
    expect(text).toMatch(/plans a class on: 2026-11-26 C/);
  });
  it('early-release warnings are per section that meets that weekday and has no override', () => {
    const weekly = { C: { 2: ['11:05', '13:14'] }, D: { 3: ['13:29', '14:30'] }, G: { 3: ['10:32', '11:12'] } };
    const built = buildSchedule({ dayLog, classLogSchedule: { ...classLog, weekly }, from: '2026-10-20', to: '2026-12-31' });
    // Wed 2026-10-21: D and G meet; the seed covers both. Wed 2026-11-18: D has a day-log bell, G does not.
    expect(built.earlyReleaseWithoutTimes).toEqual(['2026-11-18 G', '2026-12-09 D', '2026-12-09 G']);
    expect(formatSchedule(built)).toMatch(/\(not sent\): 2026-11-18 G, 2026-12-09 D, 2026-12-09 G/);
  });
  it('chunks at 200 rows per PUT', () => {
    const daysOff = Array.from({ length: 250 }, (_, i) => ({ date: new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10), note: null }));
    const chunks = chunkBody({ overrides: [SEED[0]], daysOff });
    expect(chunks.map(c => c.overrides.length + c.daysOff.length)).toEqual([200, 51]);
    expect(chunks[0].overrides).toHaveLength(1);
  });
  it('parses arguments', () => {
    expect(parseArgs(['--dry-run', '--days-off', '2026-11-03, 2026-11-11', '--from', '2026-10-20']))
      .toEqual({ dryRun: true, daysOff: ['2026-11-03', '2026-11-11'], from: '2026-10-20' });
    expect(parseArgs(['--school-year', 'y.json'])).toEqual({ dryRun: false, schoolYear: 'y.json' });
    expect(() => parseArgs(['--days-off', '2026-02-30'])).toThrow(/real/);
    expect(() => parseArgs(['--to', 'tomorrow'])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(['--nope'])).toThrow(/unknown/);
    expect(todayInNewYork(new Date('2026-10-21T02:00:00Z'))).toBe('2026-10-20');
  });
  it('--dry-run prints the table and sends nothing', () => withFiles((dir, files) => {
    const run = spawnSync(process.execPath, [script, '--dry-run', ...files, '--from', '2026-10-20', '--to', '2026-10-31', '--server', 'http://127.0.0.1:9'], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/2026-10-21\s+D\s+11:20-12:00/);
    expect(run.stdout).toMatch(/5 override\(s\), 0 day\(s\) off from 2026-10-20; dry run, nothing sent\./);
  }));
  it('PUTs the rows with the teacher secret and never prints the secret', async () => {
    const secret = 'SENTINEL-' + 'q'.repeat(8) + '-s3cr3t';
    const seen = [];
    let fail = false;
    const server = createServer((req, res) => {
      let text = '';
      req.on('data', d => { text += d; });
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, secret: req.headers['x-teacher-secret'], body: JSON.parse(text) });
        res.writeHead(fail ? 500 : 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(fail ? { error: 'rejected ' + secret } : { ok: true, written: 6, unchanged: 1 }));
      });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const run = async files => {
      const child = spawn(process.execPath, [script, ...files, '--from', '2026-10-20', '--to', '2026-11-30', '--secret', secret,
        '--server', 'http://127.0.0.1:' + server.address().port], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
      return { code: await new Promise(r => child.on('close', r)), out };
    };
    const dir = mkdtempSync(resolve(tmpdir(), 'schedule-'));
    try {
      writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify(dayLog));
      writeFileSync(resolve(dir, 'year.json'), JSON.stringify(schoolYear));
      writeFileSync(resolve(dir, 'schedule.json'), JSON.stringify(classLog));
      const files = ['--file', resolve(dir, 'day-log.json'), '--school-year', resolve(dir, 'year.json'), '--schedule', resolve(dir, 'schedule.json')];
      const ok = await run(files);
      expect(ok.code).toBe(0);
      expect(ok.out).toMatch(/10 row\(s\) sent: 6 written, 1 unchanged\./);
      expect(seen[0]).toMatchObject({ method: 'PUT', url: '/teacher/schedule-overrides', secret });
      expect(seen[0].body.overrides).toHaveLength(7);
      expect(seen[0].body.daysOff.map(row => row.date)).toEqual(['2026-11-11', '2026-11-26', '2026-11-27']);
      fail = true;
      const bad = await run(files);
      expect(bad.code).toBe(1);
      expect(bad.out).toMatch(/HTTP 500/);
      expect(bad.out).not.toContain(secret);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

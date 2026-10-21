// Push Class Log schedule overrides and days off to roster-server
// (school/class-log/POLISH3_SPEC.md, WP-S S1).
//
//   node scripts/push-schedule.mjs [--dry-run] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//        [--days-off YYYY-MM-DD,...] [--file DAY_LOG] [--school-year PATH] [--schedule PATH]
//        [--server URL] [--secret S]
//
// Sources, later ones winning for the same (date, section):
//   1. SEED below (2026-10-21 SAT day: D 11:20-12:00, B/C/E/G cancelled);
//   2. content/a2/day-log.json (or --file) entries carrying `bell: {start, end}`
//      or `cancelled: true` for their section.
// Days off (union): data/a2-school-year.json `daysOff` (the Desk calendar's
// closures; [y, m0, d] ranges with 0-based months, weekdays only), the Class Log
// schedule's `daysOff` (--schedule, default ../class-log/schedule.lehs-sy2627.json
// when it exists), and --days-off. The Class Log schedule's early-release dates
// that have no override are listed as a warning (their bell times are unknown).
// Only rows dated --from (default: today in New York) through --to are sent.
// PUT /teacher/schedule-overrides in chunks of 200 rows; idempotent (the server
// writes only rows whose content changed). Rows are validated with the server's
// own rules (roster-server/schedule-rules.js).
// Auth: x-teacher-secret, resolved like the other Desk scripts (--secret, else
// roster-server/.env ROSTER_TEACHER_SECRET, else env ROSTER_TEACHER_SECRET, else env TEACHER_KEY).
// Server: --server, else ROSTER_SERVICE_URL, else roster_config.js / prod URL.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTeacherSecret, resolveUrl } from './a2-daily-engagement.mjs';
import { redact } from './push-observer-cards.mjs';
import { SCHEDULE_LIMITS, isIsoDate, validateDayOff, validateOverride } from '../roster-server/schedule-rules.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SCHEDULE = resolve(REPO_ROOT, '../class-log/schedule.lehs-sy2627.json');

// Known one-off days that are not (yet) in the day log.
export const SEED = [
  { date: '2026-10-21', section: 'D', start: '11:20', end: '12:00', note: 'SAT day: 40-minute block' },
  ...['B', 'C', 'E', 'G'].map(section => ({ date: '2026-10-21', section, cancelled: true, note: 'SAT day: no block' })),
];

export function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry-run') { args.dryRun = true; continue; }
    if (!['--from', '--to', '--days-off', '--file', '--school-year', '--schedule', '--server', '--secret'].includes(key)) throw new Error(`unknown argument ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
  }
  for (const key of ['from', 'to']) {
    if (args[key] !== undefined && !isIsoDate(args[key])) throw new Error(`--${key} must be a real YYYY-MM-DD date`);
  }
  if (args.daysOff !== undefined) {
    args.daysOff = args.daysOff.split(',').map(value => value.trim()).filter(Boolean);
    for (const date of args.daysOff) if (!isIsoDate(date)) throw new Error(`--days-off: ${date} is not a real YYYY-MM-DD date`);
  }
  return args;
}

export function todayInNewYork(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Day log -> overrides from entries carrying bell or cancelled. Throws on a bad entry.
export function overridesFromDayLog(dayLog) {
  const rows = [];
  for (const entry of dayLog?.entries || []) {
    if (entry?.bell == null && entry?.cancelled !== true) continue;
    const where = `${entry.date} ${entry.section ?? '?'}`;
    if (typeof entry.section !== 'string' || /^\s*(all)?\s*$/i.test(entry.section)) throw new Error(`${where}: bell/cancelled needs a single section`);
    const row = entry.cancelled === true
      ? { date: entry.date, section: entry.section, cancelled: true, note: entry.bellNote ?? null }
      : { date: entry.date, section: entry.section, start: entry.bell?.start, end: entry.bell?.end, note: entry.bellNote ?? null };
    try { rows.push(validateOverride(row)); } catch (error) { throw new Error(`${where}: ${error.message.replace(/^override 0: /, '')}`); }
  }
  return rows;
}

const iso = (y, m0, d) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);

// data/a2-school-year.json daysOff: [[y, m0, d]] or [[y, m0, d], [y, m0, d]] ranges -> weekday dates.
export function daysOffFromSchoolYear(year) {
  const out = [];
  for (const span of year?.daysOff || []) {
    const [first, last = first] = span;
    let day = Date.UTC(first[0], first[1], first[2]);
    const end = Date.UTC(last[0], last[1], last[2]);
    for (; day <= end; day += 86400000) {
      const weekday = new Date(day).getUTCDay();
      if (weekday !== 0 && weekday !== 6) out.push(new Date(day).toISOString().slice(0, 10));
    }
  }
  return out;
}

// Merge every source into one PUT body for [from, to]. Later overrides win per key.
export function buildSchedule({ seed = SEED, dayLog, schoolYear, classLogSchedule, extraDaysOff = [], from, to } = {}) {
  const inRange = date => (!from || date >= from) && (!to || date <= to);
  const overrides = new Map();
  for (const row of [...seed.map((row, i) => validateOverride(row, i)), ...overridesFromDayLog(dayLog)]) {
    if (inRange(row.date)) overrides.set(`${row.date}|${row.section}`, row);
  }
  const days = new Set([...daysOffFromSchoolYear(schoolYear), ...(classLogSchedule?.daysOff || []), ...extraDaysOff]);
  const daysOff = [...days].filter(inRange).sort().map((date, i) => validateDayOff(date, i));
  // Early-release days: one warning per section that meets that weekday (Class Log
  // weekly table) and has no override; per date when there is no weekly table.
  const weekly = classLogSchedule?.weekly;
  const earlyRelease = [];
  for (const date of classLogSchedule?._earlyReleaseDays?.dates || []) {
    if (!inRange(date) || days.has(date)) continue;
    const weekday = String(new Date(date + 'T12:00:00Z').getUTCDay());
    if (!weekly || typeof weekly !== 'object') {
      if (![...overrides.values()].some(row => row.date === date)) earlyRelease.push(date);
      continue;
    }
    for (const section of Object.keys(weekly).sort()) {
      if (weekly[section]?.[weekday] && !overrides.has(`${date}|${section}`)) earlyRelease.push(`${date} ${section}`);
    }
  }
  // A day off that the day log still plans a class on: one of the two is wrong.
  const offDates = new Set(daysOff.map(row => row.date));
  const planned = (dayLog?.entries || []).filter(entry => offDates.has(entry?.date) && entry.cancelled !== true && !/^\s*no class/i.test(entry.student || ''));
  const dayOffConflicts = [...new Set(planned.map(entry => `${entry.date} ${entry.section ?? 'all'}`))].sort();
  return {
    overrides: [...overrides.values()].sort((a, b) => a.date.localeCompare(b.date) || a.section.localeCompare(b.section)),
    daysOff,
    earlyReleaseWithoutTimes: earlyRelease,
    dayOffConflicts,
  };
}

// One PUT body per 200 rows: overrides first, then days off.
export function chunkBody({ overrides, daysOff }, size = SCHEDULE_LIMITS.rowsPerPut) {
  const rows = [...overrides.map(row => ['o', row]), ...daysOff.map(row => ['d', row])];
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    chunks.push({ overrides: slice.filter(([k]) => k === 'o').map(([, row]) => row), daysOff: slice.filter(([k]) => k === 'd').map(([, row]) => row) });
  }
  return chunks;
}

export function formatSchedule({ overrides, daysOff, earlyReleaseWithoutTimes = [], dayOffConflicts = [] }) {
  const rows = [['date', 'section', 'bell', 'note'],
    ...overrides.map(row => [row.date, row.section, row.cancelled ? 'cancelled' : `${row.start}-${row.end}`, row.note ?? ''])];
  const widths = rows[0].map((_, col) => Math.max(...rows.map(row => row[col].length)));
  const lines = overrides.length
    ? rows.map(row => row.map((cell, col) => (col === row.length - 1 ? cell : cell.padEnd(widths[col]))).join('  ').trimEnd())
    : ['(no overrides)'];
  lines.push('', `Days off: ${daysOff.length ? daysOff.map(row => row.date).join(', ') : '(none)'}`);
  if (earlyReleaseWithoutTimes.length) lines.push(`Warning: early-release days with no bell times (not sent): ${earlyReleaseWithoutTimes.join(', ')}`);
  if (dayOffConflicts.length) lines.push(`Warning: days off that the day log still plans a class on: ${dayOffConflicts.join(', ')}`);
  return lines.join('\n');
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dayLogPath = args.file ? resolve(args.file) : resolve(REPO_ROOT, 'content/a2/day-log.json');
  const yearPath = args.schoolYear ? resolve(args.schoolYear) : resolve(REPO_ROOT, 'data/a2-school-year.json');
  const schedulePath = args.schedule ? resolve(args.schedule) : (existsSync(DEFAULT_SCHEDULE) ? DEFAULT_SCHEDULE : null);
  const schedule = buildSchedule({
    dayLog: readJson(dayLogPath),
    schoolYear: existsSync(yearPath) ? readJson(yearPath) : null,
    classLogSchedule: schedulePath ? readJson(schedulePath) : null,
    extraDaysOff: args.daysOff || [],
    from: args.from || todayInNewYork(),
    to: args.to,
  });
  const total = schedule.overrides.length + schedule.daysOff.length;
  if (args.dryRun) {
    console.log(formatSchedule(schedule));
    console.log(`\n${schedule.overrides.length} override(s), ${schedule.daysOff.length} day(s) off from ${args.from || todayInNewYork()}`
      + `${schedulePath ? '' : ' (no Class Log schedule file found)'}; dry run, nothing sent.`);
    return;
  }
  if (!total) { console.log('No schedule rows to push.'); return; }
  const secret = args.secret || resolveTeacherSecret(REPO_ROOT) || process.env.TEACHER_KEY;
  if (!secret) throw new Error('teacher secret not found (roster-server/.env ROSTER_TEACHER_SECRET, or env ROSTER_TEACHER_SECRET / TEACHER_KEY)');
  const url = resolveUrl(args.server).replace(/\/+$/, '') + '/teacher/schedule-overrides';
  let written = 0, unchanged = 0;
  for (const body of chunkBody(schedule)) {
    const response = await fetch(url, {
      method: 'PUT', headers: { 'content-type': 'application/json', 'x-teacher-secret': secret }, body: JSON.stringify(body),
    });
    const reply = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof reply?.error === 'string' ? redact(reply.error, secret) : '';
      throw new Error(`PUT /teacher/schedule-overrides: HTTP ${response.status}${detail ? ' ' + detail : ''}`);
    }
    written += Number(reply.written) || 0;
    unchanged += Number(reply.unchanged) || 0;
  }
  console.log(`${total} row(s) sent: ${written} written, ${unchanged} unchanged.`);
  if (schedule.earlyReleaseWithoutTimes.length) console.log(`Warning: early-release days with no bell times: ${schedule.earlyReleaseWithoutTimes.join(', ')}`);
  if (schedule.dayOffConflicts.length) console.log(`Warning: days off that the day log still plans a class on: ${schedule.dayOffConflicts.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('push-schedule: ' + error.message); process.exitCode = 1; });
}

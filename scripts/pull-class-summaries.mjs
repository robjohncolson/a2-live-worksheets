// Pull Class Log lesson summaries from roster-server into the repo
// (school/class-log/POLISH4_SPEC.md, WP-F F1).
//
//   node scripts/pull-class-summaries.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--course algebra2|apstats]
//        [--out DIR] [--server URL] [--secret S] [--dry-run]
//
// Reads GET /teacher/summaries (at most 62 days per call; a longer range is paged)
// and writes one file per row of the course, <out>/<date>-<section>.md: YAML front
// matter (date, course, section, model, recordedAt, transcriptPath, summaryPath) and
// then the summary Markdown as the phone wrote it. <out>/index.json lists every
// summary in the folder with its structured lists (landed, studentQuestions,
// promises, nextPrep), sorted by date then section; index entries outside the
// pulled range are kept, so the index covers the whole term. A file is rewritten
// only when its content changes; nothing is ever deleted.
// Defaults: the last 30 days up to today (New York), course algebra2, out
// roster-local/class-summaries/ (gitignored; a relative --out is resolved against the current
// directory, so follow-alongs can run this script from its own checkout).
// Auth and server exactly as push-observer-cards.mjs: --secret, else
// roster-server/.env ROSTER_TEACHER_SECRET, else env ROSTER_TEACHER_SECRET, else
// env TEACHER_KEY; --server, else ROSTER_SERVICE_URL, else roster_config.js / prod
// URL. The secret is never printed; server error text is redacted.
// The folder is generated: never hand-edit it, rerun the pull.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTeacherSecret, resolveUrl } from './a2-daily-engagement.mjs';
import { redact } from './push-observer-cards.mjs';
import { todayInNewYork } from './push-schedule.mjs';
import { writeFileAtomic } from './draft-observer-cards.mjs';
import { CARD_COURSES, isIsoDate } from '../roster-server/observer-card-rules.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DAYS = 30;
export const MAX_RANGE_DAYS = 62;
export const LISTS = ['landed', 'studentQuestions', 'promises', 'nextPrep'];
const DAY = 86400000;

export const addDays = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);

export function parseArgs(argv, today = todayInNewYork()) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry-run') { args.dryRun = true; continue; }
    if (!['--from', '--to', '--course', '--out', '--server', '--secret'].includes(key)) throw new Error(`unknown argument ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2)] = value;
  }
  for (const key of ['from', 'to']) {
    if (args[key] !== undefined && !isIsoDate(args[key])) throw new Error(`--${key} must be a real YYYY-MM-DD date`);
  }
  args.to = args.to || today;
  args.from = args.from || addDays(args.to, -(DEFAULT_DAYS - 1));
  if (args.from > args.to) throw new Error('--from must not be after --to');
  args.course = args.course || 'algebra2';
  if (!CARD_COURSES.includes(args.course)) throw new Error(`--course must be one of ${CARD_COURSES.join(', ')}`);
  return args;
}

// [from, to] inclusive -> inclusive ranges of at most `max` days each.
export function dateRanges(from, to, max = MAX_RANGE_DAYS) {
  const ranges = [];
  for (let start = from; start <= to; start = addDays(start, max)) {
    const end = addDays(start, max - 1);
    ranges.push([start, end < to ? end : to]);
  }
  return ranges;
}

// One row's file name. Section letters pass through; anything unsafe in a file name becomes _.
export function summaryFileName(row) {
  return `${row.date}-${String(row.section).replace(/[^A-Za-z0-9_-]/g, '_')}.md`;
}

// A YAML scalar: null, a bare date or simple word, otherwise a JSON (double-quoted YAML) string.
function yamlValue(value) {
  if (value === null || value === undefined || value === '') return 'null';
  const text = String(value);
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(text) && !/^(null|true|false|yes|no|on|off|~)$/i.test(text) ? text : JSON.stringify(text);
}

export function summaryFileText(row) {
  const front = ['date', 'course', 'section', 'model', 'recordedAt', 'transcriptPath', 'summaryPath']
    .map(key => `${key}: ${yamlValue(row[key])}`);
  const body = String(row.markdown ?? '');
  return `---\n${front.join('\n')}\n---\n\n${body}${body.endsWith('\n') ? '' : '\n'}`;
}

export function indexEntry(row) {
  const entry = {
    date: row.date, section: row.section, course: row.course, model: row.model ?? null,
    recordedAt: row.recordedAt ?? null, file: summaryFileName(row),
  };
  for (const key of LISTS) entry[key] = Array.isArray(row[key]) ? row[key] : [];
  return entry;
}

const byDateSection = (a, b) => a.date.localeCompare(b.date) || String(a.section).localeCompare(String(b.section));

// Rows of one course, checked and sorted. Throws on a row without a real date or a section.
export function courseRows(rows, course) {
  return (rows || []).filter(row => row && row.course === course).map(row => {
    if (!isIsoDate(row.date)) throw new Error(`summary row with bad date ${JSON.stringify(row.date)}`);
    if (typeof row.section !== 'string' || !row.section.trim()) throw new Error(`${row.date}: summary row without a section`);
    return row;
  }).sort(byDateSection);
}

// The new index: earlier entries of this course outside [from, to] kept, the pulled rows for the range.
export function buildIndex(rows, { previous = [], from, to, course } = {}) {
  const kept = (Array.isArray(previous) ? previous : []).filter(entry => entry && isIsoDate(entry.date)
    && entry.course === course && (entry.date < from || entry.date > to));
  return [...kept, ...rows.map(indexEntry)].sort(byDateSection);
}

// Files to write: [{name, text, changed}]. read(name) returns the current text or null.
export function planFiles(rows, index, read) {
  const files = rows.map(row => ({ name: summaryFileName(row), text: summaryFileText(row) }));
  const names = new Set();
  for (const file of files) {
    if (names.has(file.name)) throw new Error(`two summaries map to ${file.name}`);
    names.add(file.name);
  }
  files.push({ name: 'index.json', text: JSON.stringify(index, null, 2) + '\n' });
  return files.map(file => ({ ...file, changed: read(file.name) !== file.text }));
}

export function formatTable(rows) {
  const table = [['date', 'section', 'model', 'landed', 'questions', 'promises', 'next', 'recorded'],
    ...rows.map(row => [row.date, row.section, row.model ?? '', ...LISTS.map(key => String((row[key] || []).length)), row.recordedAt ?? ''])];
  const widths = table[0].map((_, col) => Math.max(...table.map(row => row[col].length)));
  return table.map(row => row.map((cell, col) => col === row.length - 1 ? cell : cell.padEnd(widths[col])).join('  ')).join('\n');
}

// Every summary row in [from, to], paging the server's 62-day limit.
export async function fetchSummaries({ server, secret, from, to, fetchImpl = fetch }) {
  const rows = [];
  for (const [start, end] of dateRanges(from, to)) {
    const response = await fetchImpl(`${server}/teacher/summaries?from=${start}&to=${end}`, { headers: { 'x-teacher-secret': secret } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof body?.error === 'string' ? redact(body.error, secret) : '';
      throw new Error(`GET /teacher/summaries: HTTP ${response.status}${detail ? ' ' + detail : ''}`);
    }
    if (!Array.isArray(body?.summaries)) throw new Error('GET /teacher/summaries: response has no summaries list');
    rows.push(...body.summaries);
  }
  return rows;
}

// The teacher secret, resolved like push-observer-cards.mjs; throws the same error when there is none.
export function resolveSecret(args, root = REPO_ROOT, env = process.env) {
  const secret = args.secret || resolveTeacherSecret(root, env) || env.TEACHER_KEY;
  if (!secret) throw new Error('teacher secret not found (roster-server/.env ROSTER_TEACHER_SECRET, or env ROSTER_TEACHER_SECRET / TEACHER_KEY)');
  return secret;
}

function readOrNull(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = resolveSecret(args);
  const server = resolveUrl(args.server).replace(/\/+$/, '');
  let all;
  try { all = await fetchSummaries({ server, secret, from: args.from, to: args.to }); }
  catch (error) { throw new Error(redact(error.message, secret)); }
  const rows = courseRows(all, args.course);
  if (args.dryRun) {
    console.log(rows.length ? formatTable(rows) : `(no ${args.course} summaries ${args.from}..${args.to})`);
    return;
  }
  const out = args.out ? resolve(args.out) : resolve(REPO_ROOT, 'roster-local/class-summaries');
  let previous = [];
  if (existsSync(resolve(out, 'index.json'))) {
    try { previous = JSON.parse(readFileSync(resolve(out, 'index.json'), 'utf8')); } catch { previous = []; }
  }
  const index = buildIndex(rows, { previous, from: args.from, to: args.to, course: args.course });
  const files = planFiles(rows, index, name => readOrNull(resolve(out, name)));
  for (const file of files) if (file.changed) writeFileAtomic(resolve(out, file.name), file.text);
  const md = files.filter(file => file.name !== 'index.json');
  const written = md.filter(file => file.changed).length;
  console.log(`${md.length} summaries: ${written} written, ${md.length - written} unchanged`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('pull-class-summaries: ' + error.message); process.exitCode = 1; });
}

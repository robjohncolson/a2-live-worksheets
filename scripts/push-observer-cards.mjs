// Push Class Log observer cards from the day log to roster-server.
//
//   node scripts/push-observer-cards.mjs [--from YYYY-MM-DD | --date YYYY-MM-DD] [--dry-run] [--server URL] [--file PATH] [--secret S]
//        [--section C|D|G] [--per-section] [--year PATH] [--summaries INDEX_JSON]
//
// Canonical day-log cards include a dated handoff from the latest usable class
// summary. Custom --file inputs opt in with --summaries. --per-section selects
// each section's next meeting on/after --date (default tomorrow, New York), so
// the nightly job never rewrites completed days or mixes sections' promises.
//
// Reads content/a2/day-log.json (or --file), collects every entry carrying an
// `observerCard` object {title, mode, minutes, frame, body}, and PUTs the rows to
// /teacher/cards. date, section and lesson come from the entry; course is
// algebra2; a section of `all` (or none) means every section that day (null).
// Idempotent: the server only writes (and bumps updated_at) when content changed,
// so it is safe to run after every planning session or from a cron.
// Auth: x-teacher-secret, resolved like the other Desk scripts (--secret, else
// roster-server/.env ROSTER_TEACHER_SECRET, else env ROSTER_TEACHER_SECRET, else env TEACHER_KEY).
// Cards are validated with the server's own rules (roster-server/observer-card-rules.js).
// Server: --server, else ROSTER_SERVICE_URL, else roster_config.js / prod URL.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTeacherSecret, resolveUrl } from './a2-daily-engagement.mjs';
import { isIsoDate, validateCard } from '../roster-server/observer-card-rules.js';
import { teacherCardFor } from './lib/teacher-brief.mjs';
import { continuityFor, loadContinuitySources } from './lib/class-continuity.mjs';
import { addDays, nextClassDay } from './draft-tomorrow.mjs';
import { todayInNewYork } from './push-schedule.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry-run') { args.dryRun = true; continue; }
    if (key === '--per-section') { args.perSection = true; continue; }
    if (!['--from', '--date', '--section', '--server', '--file', '--summaries', '--year', '--secret'].includes(key)) throw new Error(`unknown argument ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2)] = value;
  }
  if (args.from !== undefined && !isIsoDate(args.from)) throw new Error('--from must be a real YYYY-MM-DD date');
  if (args.date !== undefined && !isIsoDate(args.date)) throw new Error('--date must be a real YYYY-MM-DD date');
  if (args.from !== undefined && args.date !== undefined) throw new Error('--from and --date cannot be combined');
  if (args.perSection && args.from) throw new Error('--per-section uses --date, not --from');
  if (args.section !== undefined) {
    args.section = args.section.trim().toUpperCase();
    if (!['C', 'D', 'G'].includes(args.section)) throw new Error('--section must be C, D or G');
  }
  return args;
}

// Day log -> card rows for PUT /teacher/cards. Throws on a malformed card.
export function buildCards(dayLog, { from, date, section: only, summaries = [] } = {}) {
  const cards = [];
  const seen = new Set();
  for (const entry of dayLog?.entries || []) {
    if (entry?.observerCard == null && entry?.teacherBrief == null) continue;
    if (only && String(entry.section || '').trim().toUpperCase() !== only) continue;
    const where = `${entry.date} ${typeof entry.section === 'string' ? entry.section : 'all'}`;
    if (!isIsoDate(entry.date)) throw new Error(`${where}: entry date must be a real YYYY-MM-DD date`);
    if (from && entry.date < from) continue;
    if (date && entry.date !== date) continue;
    const continuity = continuityFor({ summaries, entry, entries: dayLog.entries });
    const card = teacherCardFor(entry, { continuity });
    if (typeof card !== 'object' || Array.isArray(card)) throw new Error(`${where}: observerCard must be an object`);
    // Missing or `all` means every section; anything else goes to the shared rules,
    // so a non-string section (e.g. 123) is an error, not a course-wide card.
    const rawSection = entry.section;
    const section = rawSection == null || (typeof rawSection === 'string' && /^\s*(all)?\s*$/i.test(rawSection)) ? null : rawSection;
    let row;
    try {
      row = validateCard({
        date: entry.date, course: 'algebra2', section, lesson: entry.lesson ?? null,
        title: card.title, mode: card.mode, minutes: card.minutes, frame: card.frame, body: card.body, source: 'desk',
      });
    } catch (error) { throw new Error(`${where}: ${error.message.replace(/^card 0: /, '')}`); }
    const key = `${row.date}|${row.section ?? ''}`;
    if (seen.has(key)) throw new Error(`${where}: more than one observerCard for this date and section`);
    seen.add(key);
    cards.push(row);
  }
  return cards.sort((a, b) => a.date.localeCompare(b.date) || (a.section ?? '').localeCompare(b.section ?? ''));
}

// Match the nightly deck's meeting-day selection and never republish old cards.
export function nextClassCards(dayLog, { year, date, section, summaries = [] }) {
  return (section ? [section] : ['C', 'D', 'G']).flatMap(selected => {
    const classDay = nextClassDay(year, selected, date);
    return classDay ? buildCards(dayLog, { date: classDay, section: selected, summaries }) : [];
  });
}

// Server error text for a thrown message: secret removed, token-like runs removed, 200 chars max.
export function redact(text, secret) {
  let out = String(text ?? '');
  if (secret) out = out.split(secret).join('[redacted]');
  return out.replace(/[A-Za-z0-9_\-+/=]{24,}/g, '[redacted]').replace(/\s+/g, ' ').slice(0, 200);
}

export function formatTable(cards) {
  const rows = [['date', 'section', 'lesson', 'mode', 'min', 'title'],
    ...cards.map(card => [card.date, card.section ?? 'all', card.lesson ?? '', card.mode, String(card.minutes), card.title])];
  const widths = rows[0].map((_, col) => Math.max(...rows.map(row => row[col].length)));
  return rows.map(row => row.map((cell, col) => col === row.length - 1 ? cell : cell.padEnd(widths[col])).join('  ')).join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file ? resolve(args.file) : resolve(REPO_ROOT, 'content/a2/day-log.json');
  // A custom day log is isolated unless its summary source is explicitly supplied.
  const summaries = args.summaries || file === resolve(REPO_ROOT, 'content/a2/day-log.json')
    ? loadContinuitySources(REPO_ROOT, args.summaries ? resolve(args.summaries) : undefined) : [];
  const dayLog = JSON.parse(readFileSync(file, 'utf8'));
  const cards = args.perSection
    ? nextClassCards(dayLog, {
      year: JSON.parse(readFileSync(args.year ? resolve(args.year) : resolve(REPO_ROOT, 'data/a2-school-year.json'), 'utf8')),
      date: args.date || addDays(todayInNewYork(), 1), section: args.section, summaries,
    })
    : buildCards(dayLog, { from: args.from, date: args.date, section: args.section, summaries });
  if (args.dryRun) {
    console.log(cards.length ? formatTable(cards) : '(no observer cards)');
    console.log(`\n${cards.length} card(s); dry run, nothing sent.`);
    return;
  }
  if (!cards.length) { console.log('No observer cards to push.'); return; }
  const secret = args.secret || resolveTeacherSecret(REPO_ROOT) || process.env.TEACHER_KEY;
  if (!secret) throw new Error('teacher secret not found (roster-server/.env ROSTER_TEACHER_SECRET, or env ROSTER_TEACHER_SECRET / TEACHER_KEY)');
  const url = resolveUrl(args.server).replace(/\/+$/, '') + '/teacher/cards';
  const response = await fetch(url, {
    method: 'PUT', headers: { 'content-type': 'application/json', 'x-teacher-secret': secret }, body: JSON.stringify(cards),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.error === 'string' ? redact(body.error, secret) : '';
    throw new Error(`PUT /teacher/cards: HTTP ${response.status}${detail ? ' ' + detail : ''}`);
  }
  console.log(`${cards.length} card(s) sent: ${Number(body.written) || 0} written, ${Number(body.unchanged) || 0} unchanged.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('push-observer-cards: ' + error.message); process.exitCode = 1; });
}

// Draft the next Class Log observer card from the last lesson summary
// (school/class-log/POLISH3_SPEC.md, WP-L).
//
//   node scripts/draft-observer-cards.mjs [--date YYYY-MM-DD] [--section S] [--dry-run] [--apply]
//        [--file DAY_LOG] [--summaries FILE] [--server URL] [--secret S] [--timeout MS]
//        [--out FILE] [--env-file PATH]
//
// For each Algebra 2 section meeting on the target date (default: the next day
// after today, New York time, that has a class entry in the day log):
//   1. the most recent class_summaries row for the section before that date
//      (GET /teacher/summaries, or --summaries FILE holding that response),
//      the day-log entry for the target date (plan, lesson), and the previous
//      card (GET /teacher/cards?date=<summary date>, else the section's latest
//      earlier day-log observerCard);
//   2. one prompt per section, sent to an OpenAI-compatible chat endpoint
//      (DRAFT_API_BASE / DRAFT_API_KEY / DRAFT_MODEL from roster-server/.env, then
//      the environment; defaults https://api.deepseek.com and deepseek-chat) asking
//      for {title, mode, minutes, frame, body, rationale}, validated with
//      roster-server/observer-card-rules.js plus the Preparing / Interacting /
//      Extending headings;
//   3. the drafts are written to content/a2/card-drafts/<date>.json (atomically).
//      --apply drafts only sections whose entry has no card, then (a) re-reads the
//      day log, aborts if it changed since the start of the run, inserts only the
//      missing `observerCard` fields and writes it atomically in the same layout,
//      and (b) always runs push-observer-cards.mjs --date <date>, exiting non-zero
//      until that push succeeds (rerun to retry; no new model calls).
//      --dry-run prints the prompts (and drafts) and writes nothing.
// Without an API key: the prompt bundle is written with "needsModel": true (not
// with --dry-run), its path is printed, and the exit code is 2 so the Desk agent
// can finish the draft by hand. The key is never printed; server and model error
// text is redacted like push-observer-cards. Re-running is safe: the drafts file
// is replaced and --apply never overwrites a card.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTeacherSecret, resolveUrl } from './a2-daily-engagement.mjs';
import { redact } from './push-observer-cards.mjs';
import { todayInNewYork } from './push-schedule.mjs';
import { CARD_MODES, LIMITS, charLength, isIsoDate, validateCard } from '../roster-server/observer-card-rules.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SECTIONS = ['C', 'D', 'G'];
export const DRAFT_DEFAULTS = { base: 'https://api.deepseek.com', model: 'deepseek-chat' };
const HEADINGS = ['Preparing', 'Interacting', 'Extending'];
const SUMMARY_LOOKBACK_DAYS = 28;

export function parseArgs(argv) {
  const args = { dryRun: false, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry-run') { args.dryRun = true; continue; }
    if (key === '--apply') { args.apply = true; continue; }
    if (!['--date', '--section', '--file', '--summaries', '--server', '--secret', '--timeout', '--out', '--env-file'].includes(key)) throw new Error(`unknown argument ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
  }
  if (args.dryRun && args.apply) throw new Error('--dry-run and --apply cannot be combined');
  if (args.date !== undefined && !isIsoDate(args.date)) throw new Error('--date must be a real YYYY-MM-DD date');
  if (args.section !== undefined) args.section = normalizeSection(args.section);
  if (args.section !== undefined && !SECTIONS.includes(args.section)) throw new Error(`--section must be one of ${SECTIONS.join(', ')}`);
  if (args.timeout !== undefined) {
    args.timeout = Number(args.timeout);
    if (!Number.isInteger(args.timeout) || args.timeout < 1) throw new Error('--timeout must be a positive integer (milliseconds)');
  }
  return args;
}

export const normalizeSection = value => String(value ?? '').trim().replace(/^period\s*/i, '').toUpperCase();

// KEY=value from a dotenv text (quotes and trailing comments handled like resolveTeacherSecret).
export function envValue(text, name) {
  const match = String(text || '').match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`, 'm'));
  if (!match) return null;
  const value = match[1].trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const end = value.indexOf(value[0], 1);
    return end > 1 ? value.slice(1, end) : null;
  }
  return value.replace(/\s+#.*$/, '').trim() || null;
}

// roster-server/.env (or --env-file) first, then the environment, then the defaults.
export function resolveDraftConfig(envFile = resolve(REPO_ROOT, 'roster-server/.env'), env = process.env) {
  let text = '';
  try { text = readFileSync(envFile, 'utf8'); } catch { /* optional */ }
  const pick = name => envValue(text, name) || env[name] || null;
  return {
    base: (pick('DRAFT_API_BASE') || DRAFT_DEFAULTS.base).replace(/\/+$/, ''),
    key: pick('DRAFT_API_KEY'),
    model: pick('DRAFT_MODEL') || DRAFT_DEFAULTS.model,
  };
}

const noClass = entry => entry?.cancelled === true || /^\s*no class/i.test(entry?.student || '');

// Day-log entries for a date that are real class meetings, one per section.
export function meetings(dayLog, date, only) {
  const out = new Map();
  for (const entry of dayLog?.entries || []) {
    if (entry?.date !== date || noClass(entry)) continue;
    const sections = /^\s*(all)?\s*$/i.test(entry.section ?? '') ? SECTIONS : [normalizeSection(entry.section)];
    for (const section of sections) if (SECTIONS.includes(section) && !out.has(section)) out.set(section, entry);
  }
  return [...out].filter(([section]) => !only || section === only).sort(([a], [b]) => a.localeCompare(b)).map(([section, entry]) => ({ section, entry }));
}

// First date after `today` with a class meeting in the day log.
export function nextSchoolDay(dayLog, today) {
  const dates = [...new Set((dayLog?.entries || []).map(entry => entry?.date).filter(date => isIsoDate(date) && date > today))].sort();
  return dates.find(date => meetings(dayLog, date).length) || null;
}

// Most recent algebra2 summary for the section dated before `date`.
export function latestSummary(summaries, section, date) {
  return (summaries || [])
    .filter(row => row && row.course === 'algebra2' && normalizeSection(row.section) === section && typeof row.date === 'string' && row.date < date)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.recordedAt || '').localeCompare(String(a.recordedAt || '')))[0] || null;
}

// The section's own card from a day's rows, else that day's course-wide card.
export function cardForSection(cards, section) {
  const rows = (cards || []).filter(card => card && card.course === 'algebra2');
  return rows.find(card => normalizeSection(card.section) === section) || rows.find(card => card.section == null) || null;
}

// Fallback previous card: the section's latest earlier day-log observerCard.
export function previousDayLogCard(dayLog, section, date) {
  const entries = (dayLog?.entries || [])
    .filter(entry => entry?.observerCard && typeof entry.date === 'string' && entry.date < date
      && (normalizeSection(entry.section) === section || /^\s*(all)?\s*$/i.test(entry.section ?? '')))
    .sort((a, b) => b.date.localeCompare(a.date));
  return entries[0] ? { date: entries[0].date, ...entries[0].observerCard } : null;
}

const list = items => (Array.isArray(items) && items.length ? items.map(item => `- ${item}`).join('\n') : '- (none recorded)');

export const SYSTEM_PROMPT = [
  'You draft one observer card for a high school Algebra 2 lesson (LEHS, Lynn MA).',
  'An observer card is a short whole-class routine the teacher runs if an administrator walks in: students work, talk and show thinking.',
  'Reply with one JSON object only, no prose and no code fences, with exactly these keys:',
  `- "title": one line, at most ${LIMITS.title} characters;`,
  `- "mode": one of ${CARD_MODES.map(mode => `"${mode}"`).join(', ')};`,
  `- "minutes": an integer ${LIMITS.minMinutes}-${LIMITS.maxMinutes} (usually 6-12);`,
  `- "frame": one sentence frame with ___ blanks, at most ${LIMITS.frame} characters;`,
  `- "body": markdown, at most ${LIMITS.body} characters, using exactly three sections in this order: "## Preparing (N min)", "## Interacting (N min)", "## Extending (N min)", each with short paragraphs or bullets (what is on the board, what pairs do, what the teacher asks, what to listen for);`,
  '- "rationale": one or two sentences on why this card fits the plan and what the last lesson showed.',
  'Build on what landed and on what students asked last time, keep any promise the teacher made, and use the lesson plan for the target date. Plain language, no emojis.',
].join('\n');

// One chat prompt for a section. Deterministic for the same inputs.
export function buildPrompt({ date, section, entry, summary, previousCard }) {
  const parts = [
    `Target date: ${date}, Algebra 2 section ${section}${entry?.lesson ? `, lesson ${entry.lesson}` : ''}.`,
    '',
    'Lesson plan for the target date:',
    entry?.plan ? String(entry.plan) : '(no plan in the day log)',
  ];
  if (entry?.student) parts.push('', `Student-facing summary: ${entry.student}`);
  parts.push('');
  if (summary) {
    parts.push(`Last lesson summary (${summary.date}, section ${normalizeSection(summary.section)}):`,
      'What landed:', list(summary.landed),
      'Promises the teacher made:', list(summary.promises),
      'Prep for next time:', list(summary.nextPrep),
      'Student questions:', list(summary.studentQuestions));
  } else {
    parts.push('Last lesson summary: none available.');
  }
  parts.push('');
  if (previousCard) {
    parts.push(`Previous observer card${previousCard.date ? ` (${previousCard.date})` : ''}: "${previousCard.title}" (${previousCard.mode ?? 'whiteboards'}, ${previousCard.minutes ?? 10} min).`,
      'Do not repeat it; move the class one step on.');
  } else {
    parts.push('Previous observer card: none.');
  }
  parts.push('', 'Reply with the JSON object only.');
  return [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: parts.join('\n') }];
}

// Model reply -> {card, rationale}. Throws on anything the server would reject,
// or a body without the three headings.
export function parseDraft(text, { date, section, lesson }) {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let draft;
  try { draft = JSON.parse(raw); } catch { throw new Error('draft is not valid JSON'); }
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('draft must be a JSON object');
  const card = validateCard({
    date, course: 'algebra2', section, lesson: lesson ?? null,
    title: draft.title, mode: draft.mode, minutes: draft.minutes, frame: draft.frame, body: draft.body, source: 'desk',
  });
  for (const heading of HEADINGS) {
    if (!new RegExp(`^##\\s*${heading}\\b`, 'mi').test(card.body)) throw new Error(`body must have a "## ${heading}" section`);
  }
  if (typeof draft.rationale !== 'string' || !draft.rationale.trim()) throw new Error('rationale is required');
  if (charLength(draft.rationale.trim()) > 1000) throw new Error('rationale must be at most 1000 characters');
  return { card, rationale: draft.rationale.trim() };
}

// The day-log observerCard object for a validated card.
export const observerCardFor = card => ({ title: card.title, mode: card.mode, minutes: card.minutes, frame: card.frame, body: card.body });

// Set observerCard on matching entries only where none exists. Returns a new log.
export function applyDrafts(dayLog, drafts) {
  const log = JSON.parse(JSON.stringify(dayLog));
  const applied = [], skipped = [];
  for (const draft of drafts) {
    if (!draft.card) continue;
    const entry = (log.entries || []).find(row => row?.date === draft.card.date && normalizeSection(row.section) === draft.section && !noClass(row));
    if (!entry) { skipped.push(`${draft.card.date} ${draft.section}: no day-log entry`); continue; }
    if (entry.observerCard != null) { skipped.push(`${draft.card.date} ${draft.section}: already has a card`); continue; }
    entry.observerCard = observerCardFor(draft.card);
    applied.push(`${draft.card.date} ${draft.section}`);
  }
  return { log, applied, skipped };
}

// POST {base}/chat/completions. Returns the reply text; throws a redacted error.
export async function callModel({ base, key, model, messages, fetchImpl = fetch, timeout = 60000 }) {
  let response;
  try {
    response = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.4, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) { throw new Error(`model request failed: ${redact(error.message, key)}`); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.error?.message === 'string' ? body.error.message : typeof body?.error === 'string' ? body.error : '';
    throw new Error(`model: HTTP ${response.status}${detail ? ' ' + redact(detail, key) : ''}`);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('model reply had no message content');
  return text;
}

async function teacherGet(url, secret, timeout) {
  const response = await fetch(url, { headers: { 'x-teacher-secret': secret }, signal: AbortSignal.timeout(timeout) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.error === 'string' ? redact(body.error, secret) : '';
    throw new Error(`HTTP ${response.status}${detail ? ' ' + detail : ''}`);
  }
  return body;
}


// Write a file through a same-directory temp file and an atomic rename, so an
// interrupted write never leaves a truncated original. hooks.beforeRename is a test seam.
export function writeFileAtomic(path, text, hooks = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = resolve(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temp, text);
    if (hooks.beforeRename) hooks.beforeRename(temp);
    renameSync(temp, path);
  } catch (error) {
    try { rmSync(temp, { force: true }); } catch { /* best effort */ }
    throw error;
  }
}

// The JSON layout of a file: indent (spaces), line ending, trailing newline. Throws
// when re-serializing the parsed value would not reproduce the file byte for byte,
// so an apply can never reformat entries it did not touch.
export function jsonLayout(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const match = /^( +)\S/m.exec(text);
  const indent = match ? match[1].length : 2;
  const trailing = text.endsWith(eol) ? eol : '';
  const layout = { indent, eol, trailing };
  if (serializeJson(JSON.parse(text), layout) !== text) {
    throw new Error('the day log is not in plain JSON.stringify layout; refusing to rewrite it (format it, then rerun)');
  }
  return layout;
}
export const serializeJson = (value, { indent, eol, trailing }) => JSON.stringify(value, null, indent).replace(/\n/g, eol) + trailing;

// Re-read the day log, abort if it changed since `snapshot`, insert the missing
// observerCards into the fresh copy, and write it atomically in the same layout.
export function insertCardsIntoFile(path, snapshot, drafts, hooks = {}) {
  const current = readFileSync(path, 'utf8');
  if (current !== snapshot) throw new Error('the day log changed while drafting; nothing applied (rerun to draft against the new file)');
  const layout = jsonLayout(current);
  const result = applyDrafts(JSON.parse(current), drafts);
  if (result.applied.length) writeFileAtomic(path, serializeJson(result.log, layout), hooks);
  return result;
}

const minusDays = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') - days * 86400000).toISOString().slice(0, 10);
const warn = message => console.error('draft-observer-cards: ' + message);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dayLogPath = args.file ? resolve(args.file) : resolve(REPO_ROOT, 'content/a2/day-log.json');
  const snapshot = readFileSync(dayLogPath, 'utf8');
  const dayLog = JSON.parse(snapshot);
  const date = args.date || nextSchoolDay(dayLog, todayInNewYork());
  if (!date) throw new Error('no upcoming class day in the day log; pass --date');
  const targets = meetings(dayLog, date, args.section);
  if (!targets.length) throw new Error(`no Algebra 2 class on ${date}${args.section ? ` for section ${args.section}` : ''} in the day log`);
  // With --apply only sections without a card are drafted, so a rerun after a failed
  // push makes no model calls and just pushes the saved cards again.
  const toDraft = args.apply ? targets.filter(({ entry }) => entry.observerCard == null) : targets;
  if (args.apply) {
    for (const { section } of targets.filter(target => !toDraft.includes(target))) console.log(`  ${date} ${section}: the day log already has a card; not drafting`);
  }
  const timeout = args.timeout || 10000;
  const secret = args.secret || resolveTeacherSecret(REPO_ROOT) || process.env.TEACHER_KEY || null;
  const server = resolveUrl(args.server).replace(/\/+$/, '');

  let summaries = [];
  if (toDraft.length && args.summaries) {
    summaries = JSON.parse(readFileSync(resolve(args.summaries), 'utf8')).summaries || [];
  } else if (toDraft.length && !secret) {
    warn('no teacher secret; drafting without summaries');
  } else if (toDraft.length) {
    try {
      summaries = (await teacherGet(`${server}/teacher/summaries?from=${minusDays(date, SUMMARY_LOOKBACK_DAYS)}&to=${minusDays(date, 1)}`, secret, timeout)).summaries || [];
    } catch (error) { warn(`GET /teacher/summaries failed (${redact(error.message, secret)}); drafting without summaries`); }
  }

  const cardsByDate = new Map();
  const drafts = [];
  for (const { section, entry } of toDraft) {
    const summary = latestSummary(summaries, section, date);
    let previousCard = null;
    if (summary && secret && !args.summaries) {
      if (!cardsByDate.has(summary.date)) {
        try { cardsByDate.set(summary.date, (await teacherGet(`${server}/teacher/cards?date=${summary.date}`, secret, timeout)).cards || []); }
        catch (error) { warn(`GET /teacher/cards failed (${redact(error.message, secret)})`); cardsByDate.set(summary.date, []); }
      }
      const card = cardForSection(cardsByDate.get(summary.date), section);
      if (card) previousCard = { date: summary.date, ...card };
    }
    previousCard ||= previousDayLogCard(dayLog, section, date);
    drafts.push({
      section, lesson: entry.lesson ?? null, entryHasCard: entry.observerCard != null,
      sources: { summaryDate: summary?.date ?? null, previousCard: previousCard ? `${previousCard.date ?? '?'}: ${previousCard.title}` : null },
      messages: buildPrompt({ date, section, entry, summary, previousCard }),
      draft: null, error: null,
    });
  }

  const config = resolveDraftConfig(args.envFile ? resolve(args.envFile) : undefined);
  const outPath = args.out ? resolve(args.out) : resolve(REPO_ROOT, 'content/a2/card-drafts', `${date}.json`);
  const relativePath = relative(REPO_ROOT, outPath).replace(/\\/g, '/');
  const shownPath = relativePath.startsWith('..') ? outPath : relativePath;
  const printPrompts = () => {
    for (const draft of drafts) {
      console.log(`=== ${date} ${draft.section} (lesson ${draft.lesson ?? '?'}; summary ${draft.sources.summaryDate ?? 'none'}; previous card ${draft.sources.previousCard ?? 'none'}${draft.entryHasCard ? '; the day log already has a card' : ''}) ===`);
      for (const message of draft.messages) console.log(`--- ${message.role} ---\n${message.content}`);
      if (draft.draft) console.log(`--- draft ---\n${JSON.stringify(draft.draft, null, 2)}`);
      if (draft.error) console.log(`--- draft rejected ---\n${draft.error}`);
      console.log('');
    }
  };
  const bundle = needsModel => ({
    date, generatedAt: new Date().toISOString(), model: needsModel ? null : config.model, needsModel,
    drafts: drafts.map(({ entryHasCard, card, ...rest }) => rest),
  });

  if (drafts.length && !config.key) {
    if (args.dryRun) {
      printPrompts();
      console.log(`No DRAFT_API_KEY: the prompt bundle would be written to ${shownPath} with "needsModel": true; dry run, nothing written.`);
    } else {
      writeFileAtomic(outPath, JSON.stringify(bundle(true), null, 2) + '\n');
      console.log(`No DRAFT_API_KEY: wrote the prompt bundle to ${shownPath} ("needsModel": true). Finish the drafts by hand${args.apply ? '; nothing inserted' : ''}.`);
    }
    process.exitCode = 2;
  } else if (drafts.length) {
    for (const draft of drafts) {
      try {
        const text = await callModel({ ...config, messages: draft.messages, timeout: Math.max(timeout, 60000) });
        const { card, rationale } = parseDraft(text, { date, section: draft.section, lesson: draft.lesson });
        draft.card = card;
        draft.draft = { ...observerCardFor(card), rationale };
      } catch (error) { draft.error = redact(error.message, config.key); }
    }
    if (args.dryRun) { printPrompts(); console.log('Dry run, nothing written.'); }
    else {
      writeFileAtomic(outPath, JSON.stringify(bundle(false), null, 2) + '\n');
      console.log(`Wrote ${drafts.filter(d => d.draft).length}/${drafts.length} draft(s) to ${shownPath}.`);
      for (const draft of drafts.filter(d => d.error)) console.log(`  ${draft.section}: rejected (${draft.error})`);
    }
    if (drafts.some(d => d.error)) process.exitCode = 1;
  }

  if (!args.apply) return;
  // 1. Local insertion (only where none exists), guarded against concurrent edits.
  const { applied, skipped } = insertCardsIntoFile(dayLogPath, snapshot, drafts);
  for (const line of skipped) console.log(`  skipped ${line}`);
  console.log(applied.length ? `Inserted ${applied.join(', ')} into the day log.` : 'Nothing new inserted.');
  // 2. Remote sync of the target date only, every run, so a failed push is retried by rerunning.
  console.log(`Pushing the day log's cards for ${date}.`);
  const push = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/push-observer-cards.mjs'), '--date', date,
    ...(args.server ? ['--server', args.server] : []), ...(args.secret ? ['--secret', args.secret] : []),
    '--file', dayLogPath], { stdio: 'inherit', env: process.env });
  if (push.status !== 0) {
    console.log('Push failed; rerun with --apply to retry (sections that already have a card are not drafted again).');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('draft-observer-cards: ' + error.message); process.exitCode = 1; });
}

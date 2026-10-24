// Draft the rehearsal deck for each Class Log observer card of a day
// (school/class-log/REHEARSAL_SPEC.md, WP-1 1.3).
//
//   node scripts/draft-card-decks.mjs [--date YYYY-MM-DD] [--section S] [--dry-run] [--apply]
//        [--from-file PATH] [--file DAY_LOG] [--prep LESSON_PREP] [--server URL] [--secret S]
//        [--timeout MS] [--out FILE] [--env-file PATH] [--roster-dir DIR]
//        [--from-tree] [--trees DIR] [--device D] [--per-section] [--year SCHOOL_YEAR]
//
// --per-section (the nightly): instead of one date for every section, each section
// (or --section) drafts for its own next class day from the school calendar
// (data/a2-school-year.json, or --year), exactly as draft-tomorrow.mjs resolves it:
// the first meeting day on or after --date (default tomorrow, New York). Each
// (date, section) is its own run; runs for the same date share that date's file and
// keep the other sections' decks in it.
//
// Tree mode (school/class-log/KNOWLEDGE_TREE_SPEC.md, WP-1 1.2): a card whose lesson
// has a tree (content/a2/lesson-trees/<lesson>.json, built by build-lesson-tree.mjs;
// --trees, default: lesson-trees/ beside the lesson prep) gets its deck from the tree,
// deterministically and without a model (scripts/lib/tree-deck.mjs): every item
// carries `node` and `lesson` and its id is the node id. That is the default; the
// model path below stays for cards without a tree. --from-tree uses trees only: a
// card without one gets no deck (reported), and no model is called. The vocabulary
// tier skips nodes already known on --device (default s24) per GET /teacher/mastery;
// without the server every vocabulary node is a candidate.
//
// For each observer card on the target date (default: the next class day in the
// day log after today, New York time):
//   1. the card comes from content/a2/day-log.json (the entry's observerCard), else
//      from GET /teacher/cards?date=; the card ids always come from that GET (one
//      deck per card, so a course-wide card gets one deck for all its sections);
//   2. one prompt per card (the card, the lesson-prep entry from
//      content/a2/lesson-prep.json, the deck format and the rules below, verbatim
//      from the spec) is sent to the OpenAI-compatible chat endpoint
//      (DRAFT_API_BASE / DRAFT_API_KEY / DRAFT_MODEL, resolved exactly as
//      draft-observer-cards.mjs) asking for 10 to 12 items;
//   3. items get their ids (first 12 hex of SHA-256 of type + front), `after` is
//      remapped to those ids, and the deck is validated with
//      roster-server/deck-rules.js plus a roster first-name check (roster-local/
//      roster-view-*.csv realName, when present);
//   4. the decks are written atomically to content/a2/card-decks/<date>.json
//      (tracked: decks hold no student data). --apply also PUTs them to
//      /teacher/decks (the server writes only decks whose content changed).
// --from-file PATH skips the model: the file (same shape as the output) is
// validated the same way (ids recomputed, so an edited front is a new item),
// written to the output path, and PUT with --apply. This is how hand-written decks
// go up. --dry-run prints the prompts and decks and writes and sends nothing.
// Without an API key and without --from-file: the prompt bundle is written with
// "needsModel": true (not with --dry-run) and the exit code is 2, as the card
// drafter does. The key and the teacher secret are never printed; server and
// model error text is redacted.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTeacherSecret, resolveUrl } from './a2-daily-engagement.mjs';
import { redact } from './push-observer-cards.mjs';
import { todayInNewYork } from './push-schedule.mjs';
import { SECTIONS, callModel, cardForSection, meetings, nextSchoolDay, normalizeSection, resolveDraftConfig, writeFileAtomic } from './draft-observer-cards.mjs';
import { DECK_LIMITS, DECK_TYPES, charLength, isIsoDate, isUuid, itemId, rosterNameHits, validateDeckPut, validateItems } from '../roster-server/deck-rules.js';
import { isKnown } from '../roster-server/node-mastery.js';
import { treeProblem } from './lib/lesson-tree.mjs';
import { cardLessons, selectDeck } from './lib/tree-deck.mjs';
import { addDays, nextClassDay } from './draft-tomorrow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DRAFT_COUNT = { min: 10, max: 12 };
const PREP_LIMIT = 6000;

export function parseArgs(argv) {
  const args = { dryRun: false, apply: false, fromTree: false, perSection: false };
  const valued = ['--date', '--section', '--from-file', '--file', '--prep', '--server', '--secret', '--timeout', '--out', '--env-file', '--roster-dir', '--trees', '--device', '--year'];
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry-run') { args.dryRun = true; continue; }
    if (key === '--from-tree') { args.fromTree = true; continue; }
    if (key === '--per-section') { args.perSection = true; continue; }
    if (key === '--apply') { args.apply = true; continue; }
    if (!valued.includes(key)) throw new Error(`unknown argument ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
  }
  if (args.dryRun && args.apply) throw new Error('--dry-run and --apply cannot be combined');
  if (args.fromTree && args.fromFile) throw new Error('--from-tree and --from-file cannot be combined');
  if (args.perSection && args.fromFile) throw new Error('--per-section and --from-file cannot be combined');
  if (args.date !== undefined && !isIsoDate(args.date)) throw new Error('--date must be a real YYYY-MM-DD date');
  if (args.section !== undefined) args.section = normalizeSection(args.section);
  if (args.section !== undefined && !SECTIONS.includes(args.section)) throw new Error(`--section must be one of ${SECTIONS.join(', ')}`);
  if (args.timeout !== undefined) {
    args.timeout = Number(args.timeout);
    if (!Number.isInteger(args.timeout) || args.timeout < 1) throw new Error('--timeout must be a positive integer (milliseconds)');
  }
  return args;
}

// The deck rules, verbatim from REHEARSAL_SPEC.md 1.3; they go in the prompt.
export const DECK_RULES = [
  '- one `frame` item per sentence frame: cloze with the blanks (`front`: the frame with blanks, `back`: the filled example from the card);',
  '- `anchor` items for every number or rule the teacher must have ready (slope 3, b = −4, piece B is x + 3, quiz items this lesson targets);',
  '- `trap` items for each misconception named in the card: `front` = what the student says or writes, `back` = the one-sentence response;',
  '- `step` items for the routine: `front` = "Interacting, round 2: ?" style cue, `back` = the step and its minute; `minute` set;',
  '- `cue` items for transitions and the exit line (what to say when boards go up, the exit sentence);',
  '- `after`: steps come after the frame; traps after the anchors they rely on; cues after steps.',
].join('\n');

export const SYSTEM_PROMPT = [
  'You write a rehearsal flashcard deck for a high school Algebra 2 teacher (LEHS, Lynn MA).',
  'The teacher studies the deck on a phone in the hours before class so the observer card below runs from memory. The cards are worthless after the bell.',
  'Reply with one JSON object only, no prose and no code fences: {"items": [...]} with 10 to 12 items. Each item has exactly these keys:',
  '- "key": a short unique label you choose ("frame1", "anchor2", ...), used only by "after";',
  `- "type": one of ${DECK_TYPES.map(t => `"${t}"`).join(', ')};`,
  `- "front": the prompt the teacher sees, at most ${DECK_LIMITS.front} characters;`,
  `- "back": the answer, at most ${DECK_LIMITS.back} characters;`,
  '- "after": the keys of items that must be learned first (may be empty; no cycles);',
  '- "minute": for a step, the minute of the routine it happens in (integer); null for every other type.',
  'Follow these rules:',
  DECK_RULES,
  'Use the numbers exactly as the card and the lesson prep give them. Never name a student. Plain language, no emojis.',
].join('\n');

const cardLine = card => `"${card.title}" (${card.mode ?? 'whiteboards'}, ${card.minutes ?? 10} min)`;

// One chat prompt for a card. Deterministic for the same inputs.
export function buildPrompt({ date, sections, lesson, card, prep }) {
  const parts = [
    `Date: ${date}, Algebra 2 section${sections.length > 1 ? 's' : ''} ${sections.join(', ')}${lesson ? `, lesson ${lesson}` : ''}.`,
    '',
    `Observer card: ${cardLine(card)}`,
    `Sentence frame: ${card.frame || '(none)'}`,
    'Card body:',
    String(card.body ?? ''),
    '',
  ];
  if (prep) {
    let text = JSON.stringify(prep, null, 1);
    if (charLength(text) > PREP_LIMIT) text = [...text].slice(0, PREP_LIMIT).join('') + ' …(truncated)';
    parts.push(`Lesson prep for ${lesson}:`, text);
  } else {
    parts.push('Lesson prep: none.');
  }
  parts.push('', 'Reply with the JSON object only.');
  return [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: parts.join('\n') }];
}

// Raw items (model reply or a hand-written file) -> validated deck items: ids are
// the hash of type + front (a tree item's id is its node id, so an edited front
// stays the same item for the phone's mastery), `after` (keys or old ids) remapped to the new ids,
// order from the item when it is an integer, else its position. Throws on any problem.
export function normalizeItems(rawItems, { count } = {}) {
  if (!Array.isArray(rawItems)) throw new Error('items must be an array');
  if (count && (rawItems.length < count.min || rawItems.length > count.max)) {
    throw new Error(`a draft must have ${count.min} to ${count.max} items (got ${rawItems.length})`);
  }
  const rename = new Map();
  const staged = rawItems.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`item ${i}: must be an object`);
    const front = typeof raw.front === 'string' ? raw.front.trim() : raw.front;
    const id = typeof raw.node === 'string' && raw.node ? raw.node : itemId(raw.type, front);
    for (const label of [raw.key, raw.id]) {
      if (typeof label !== 'string' || !label) continue;
      if (rename.has(label) && rename.get(label) !== id) throw new Error(`item ${i}: key ${label} is used twice`);
      rename.set(label, id);
    }
    return { raw, id, front, i };
  });
  const items = staged.map(({ raw, id, front, i }) => ({
    id, type: raw.type, front, back: raw.back,
    order: Number.isInteger(raw.order) ? raw.order : i + 1,
    after: Array.isArray(raw.after) ? raw.after.map(ref => (rename.has(ref) ? rename.get(ref) : ref)) : raw.after,
    minute: raw.minute ?? null,
    ...(raw.node !== undefined ? { node: raw.node } : {}),
    ...(raw.lesson !== undefined ? { lesson: raw.lesson } : {}),
  }));
  return validateItems(items);
}

// Model reply -> items. Accepts {"items": [...]} or a bare array.
export function parseDeckReply(text) {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let reply;
  try { reply = JSON.parse(raw); } catch { throw new Error('deck is not valid JSON'); }
  const list = Array.isArray(reply) ? reply : reply?.items;
  if (!Array.isArray(list)) throw new Error('deck must be {"items": [...]}');
  return normalizeItems(list, { count: DRAFT_COUNT });
}

// First names from roster-local/roster-view-*.csv (realName "Last, First Middle"
// or "First Last"). Missing folder or files: [].
export function parseCsvLine(line) {
  const out = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cell); cell = ''; } else cell += ch;
  }
  out.push(cell);
  return out;
}
export function firstNameOf(realName) {
  const name = String(realName ?? '').trim();
  if (!name) return null;
  const given = name.includes(',') ? name.slice(name.indexOf(',') + 1).trim() : name;
  return given.split(/\s+/)[0] || null;
}
export function loadRosterFirstNames(dir) {
  let files;
  try { files = readdirSync(dir).filter(name => /^roster-view-.*\.csv$/i.test(name)); } catch { return []; }
  const names = new Set();
  for (const file of files) {
    const lines = readFileSync(resolve(dir, file), 'utf8').split(/\r?\n/).filter(Boolean);
    const header = parseCsvLine(lines[0] || '');
    const col = header.indexOf('realName');
    if (col < 0) continue;
    for (const line of lines.slice(1)) {
      const first = firstNameOf(parseCsvLine(line)[col]);
      if (first) names.add(first);
    }
  }
  return [...names];
}

// Day-log cards for the date, one target per card. Server cards supply the ids:
// a section's own card, else the course-wide card. Then every other algebra2
// server card of the date joins as its own target (per card id, so a section with
// a day-log card and another with only a server card both get decks); with
// --section only the card that section resolves to (its own, else course-wide).
export function buildTargets({ dayLog, date, only, serverCards }) {
  const targets = new Map();
  const add = (key, target) => {
    if (targets.has(key)) { const t = targets.get(key); if (!t.sections.includes(target.sections[0])) t.sections.push(target.sections[0]); return; }
    targets.set(key, target);
  };
  for (const { section, entry } of meetings(dayLog, date, only)) {
    if (!entry.observerCard) continue;
    const server = serverCards ? cardForSection(serverCards, section) : null;
    const courseWide = /^\s*(all)?\s*$/i.test(entry.section ?? '');
    add(server?.id || `${courseWide ? 'all' : section}`, {
      cardId: server?.id ?? null, sections: [courseWide ? 'all' : section], lesson: entry.lesson ?? server?.lesson ?? null,
      card: { title: entry.observerCard.title, mode: entry.observerCard.mode, minutes: entry.observerCard.minutes, frame: entry.observerCard.frame, body: entry.observerCard.body },
      source: 'day-log',
    });
  }
  if (serverCards) {
    const resolved = only ? cardForSection(serverCards, only) : null;
    for (const card of serverCards.filter(c => c && c.course === 'algebra2' && c.id)) {
      if (targets.has(card.id)) continue;
      if (only && card !== resolved) continue;
      const section = card.section == null ? 'all' : normalizeSection(card.section);
      add(card.id, { cardId: card.id, sections: [section], lesson: card.lesson ?? null,
        card: { title: card.title, mode: card.mode, minutes: card.minutes, frame: card.frame, body: card.body }, source: 'server' });
    }
  }
  return [...targets.values()].sort((a, b) => a.sections[0].localeCompare(b.sections[0]));
}

// A deck file -> the PUT body, checked with the server's own envelope rules
// (validateDeckPut: card ids, one deck per card, at most 20 decks, model,
// generatedAt, every item). Throws on any problem; the body is returned as built.
export function putBodyFrom(file) {
  const decks = (file?.decks || []).filter(deck => Array.isArray(deck.items) && deck.items.length);
  for (const deck of decks) if (!isUuid(deck.cardId)) throw new Error(`deck for ${(deck.sections || []).join(', ') || '?'} has no card id (the server has no card for it yet; push the cards first)`);
  const body = { decks: decks.map(deck => ({ cardId: deck.cardId, items: deck.items, model: deck.model ?? null, generatedAt: deck.generatedAt ?? null })) };
  validateDeckPut(body);
  return body;
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

export async function putDecks({ server, secret, body, timeout }) {
  const response = await fetch(`${server}/teacher/decks`, {
    method: 'PUT', headers: { 'content-type': 'application/json', 'x-teacher-secret': secret }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
  });
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof reply?.error === 'string' ? redact(reply.error, secret) : '';
    throw new Error(`PUT /teacher/decks: HTTP ${response.status}${detail ? ' ' + detail : ''}`);
  }
  return { written: Number(reply.written) || 0, unchanged: Number(reply.unchanged) || 0 };
}

export function formatDeck(deck) {
  const lines = [`=== ${deck.date ?? ''} ${(deck.sections || []).join(', ')} · card ${deck.cardId ?? '(no id yet)'} · ${deck.items?.length ?? 0} items${deck.model ? ` · ${deck.model}` : ''} ===`];
  for (const item of deck.items || []) {
    lines.push(`[${item.type}${item.minute != null ? ` @${item.minute}` : ''}] ${item.id}${item.after.length ? ` after ${item.after.join(',')}` : ''}`, `  Q: ${item.front}`, `  A: ${item.back}`);
  }
  if (deck.error) lines.push(`  rejected: ${deck.error}`);
  return lines.join('\n');
}

const warn = message => console.error('draft-card-decks: ' + message);

// The model name a tree deck carries (it is part of the deck hash, like a real model's).
export const TREE_MODEL = 'lesson-tree';

// Every valid tree file in the folder, keyed by lesson. A missing folder is no
// trees; a tree that fails validation is left out (with a warning), so its cards
// take the model path or, with --from-tree, get no deck.
export function loadTrees(dir) {
  let names;
  try { names = readdirSync(dir).filter(name => name.endsWith('.json')).sort(); } catch { return {}; }
  const trees = {};
  for (const name of names) {
    let tree;
    try { tree = JSON.parse(readFileSync(resolve(dir, name), 'utf8')); } catch { console.error(`draft-card-decks: lesson tree ${name} is not valid JSON; ignored`); continue; }
    const problem = treeProblem(tree);
    if (problem || typeof tree.lesson !== 'string') { console.error(`draft-card-decks: lesson tree ${name} ignored (${problem || 'no lesson'})`); continue; }
    trees[tree.lesson] = tree;
  }
  return trees;
}

// Each section's next class day, as the nightly Tomorrow draft resolves it: the first
// meeting day on or after `date` (default the day after `today`), null past the year's end.
export function sectionClassDays({ year, date, today, sections = SECTIONS }) {
  const from = date || addDays(today, 1);
  return sections.map(section => ({ section, date: nextClassDay(year, section, from) }));
}

// The date's deck file after a one-section run: the run's decks replace the same cards
// and that section's old decks; every other section's decks stay.
export function mergeDeckFiles(existing, next, section) {
  if (!existing || existing.date !== next.date || !Array.isArray(existing.decks)) return next;
  const replaced = new Set(next.decks.map(deck => deck.cardId).filter(Boolean));
  const kept = existing.decks.filter(deck => !(deck.cardId && replaced.has(deck.cardId)) && !(deck.sections || []).includes(section));
  const decks = [...kept, ...next.decks].sort((a, b) => String(a.sections?.[0] ?? '').localeCompare(String(b.sections?.[0] ?? '')));
  return { ...next, decks };
}

function readDeckFile(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export const tierLine = tiers => Object.entries(tiers).map(([name, count]) => `${name} ${count}`).join(', ');

// Node ids known on the device for these lessons (GET /teacher/mastery, one call per
// lesson, cached), or null when there is no secret or the server does not answer:
// then the vocabulary tier offers every word.
async function knownNodes({ lessons, cache, server, secret, timeout, device }) {
  if (!secret) return null;
  const known = new Set();
  for (const lesson of lessons) {
    if (!cache.has(lesson)) {
      let rows = null;
      try { rows = (await teacherGet(`${server}/teacher/mastery?course=algebra2&lesson=${encodeURIComponent(lesson)}`, secret, timeout)).rows || []; }
      catch (error) { warn(`GET /teacher/mastery failed for ${lesson} (${redact(error.message, secret)}); every vocabulary node is a candidate`); }
      cache.set(lesson, rows);
    }
    const rows = cache.get(lesson);
    if (rows === null) return null;
    for (const row of rows) if (row && row.device === device && isKnown(Number(row.p))) known.add(row.nodeId);
  }
  return known;
}


async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timeout = args.timeout || 10000;
  const secret = args.secret || resolveTeacherSecret(REPO_ROOT) || process.env.TEACHER_KEY || null;
  const server = resolveUrl(args.server).replace(/\/+$/, '');
  const names = loadRosterFirstNames(args.rosterDir ? resolve(args.rosterDir) : resolve(REPO_ROOT, 'roster-local'));
  const checkNames = items => {
    const hits = rosterNameHits(items, names);
    if (hits.length) throw new Error(`roster first name in item ${hits[0].id} (${hits.length} hit${hits.length > 1 ? 's' : ''}); rewrite without names`);
  };
  const shown = path => { const rel = relative(REPO_ROOT, path).replace(/\\/g, '/'); return rel.startsWith('..') ? path : rel; };
  const ctx = { args, timeout, secret, server, checkNames, shown };
  if (args.fromFile) return fromFileRun(ctx);

  const dayLog = JSON.parse(readFileSync(args.file ? resolve(args.file) : resolve(REPO_ROOT, 'content/a2/day-log.json'), 'utf8'));
  if (!args.perSection) {
    const date = args.date || nextSchoolDay(dayLog, todayInNewYork());
    if (!date) throw new Error('no upcoming class day in the day log; pass --date');
    return draftDate(ctx, { dayLog, date, section: args.section });
  }
  // --per-section: each section's own next class day from the school calendar, as the
  // nightly Tomorrow draft resolves it (draft-tomorrow.mjs), one run per (date, section).
  const year = JSON.parse(readFileSync(args.year ? resolve(args.year) : resolve(REPO_ROOT, 'data/a2-school-year.json'), 'utf8'));
  const plan = sectionClassDays({ year, date: args.date, today: todayInNewYork(), sections: args.section ? [args.section] : SECTIONS });
  for (const { section, date } of plan) {
    if (!date) { console.log(`Section ${section}: no class day left in the school year; no deck.`); continue; }
    console.log(`--- section ${section}: next class day ${date} ---`);
    await draftDate(ctx, { dayLog, date, section, perSection: true });
  }
}

// --from-file: validate a hand-written or edited deck file, write it, and send it with --apply.
async function fromFileRun(ctx) {
  const { args, checkNames, shown } = ctx;
  let date, file, outPath;
  const source = JSON.parse(readFileSync(resolve(args.fromFile), 'utf8'));
  date = args.date || source.date;
  if (!isIsoDate(date)) throw new Error('the deck file has no valid "date" (or pass --date)');
  if (source.date && source.date !== date) throw new Error(`the deck file is for ${source.date}, not ${date}`);
  outPath = args.out ? resolve(args.out) : resolve(REPO_ROOT, 'content/a2/card-decks', `${date}.json`);
  let failed = 0;
  const decks = (source.decks || []).filter(deck => !args.section || (deck.sections || []).includes(args.section) || (deck.sections || []).includes('all'))
    .map(deck => {
      const out = { ...deck };
      delete out.error;
      // A card the tree run skipped (no lesson tree) has no items; it rides along
      // unsent, as putBodyFrom leaves out every deck without items.
      if (deck.skipped && deck.items == null) return out;
      try {
        out.items = normalizeItems(deck.items);
        checkNames(out.items);
      } catch (error) { out.error = error.message; failed++; }
      return out;
    });
  file = { ...source, date, needsModel: false, decks };
  for (const deck of decks) console.log(formatDeck({ date, ...deck }) + '\n');
  if (failed) { console.log(`${failed} deck(s) rejected; nothing written or sent.`); process.exitCode = 1; return; }
  if (!decks.length) throw new Error('the deck file has no decks');
  // The whole envelope as the server will see it, before anything is written or sent.
  try { putBodyFrom(file); }
  catch (error) { console.log(`Deck file rejected: ${error.message}; nothing written or sent.`); process.exitCode = 1; return; }
  if (args.dryRun) { console.log(`${decks.length} deck(s) valid; dry run, nothing written or sent.`); return; }
  writeFileAtomic(outPath, JSON.stringify(file, null, 2) + '\n');
  console.log(`Wrote ${decks.length} deck(s) to ${shown(outPath)}.`);

  await sendIfApply(ctx, file);
}

// One date: tree decks (and model decks for cards without a tree), written to
// content/a2/card-decks/<date>.json and sent with --apply. With perSection the run
// covers one section and keeps the other sections' decks already in the date's file.
async function draftDate(ctx, { dayLog, date, section, perSection = false }) {
  const { args, timeout, secret, server, checkNames, shown } = ctx;
  const outPath = args.out ? resolve(args.out) : resolve(REPO_ROOT, 'content/a2/card-decks', `${date}.json`);
  let file;
  let serverCards = null;
  if (secret) {
    try { serverCards = (await teacherGet(`${server}/teacher/cards?date=${date}`, secret, timeout)).cards || []; }
    catch (error) { warn(`GET /teacher/cards failed (${redact(error.message, secret)}); decks will have no card id`); }
  } else warn('no teacher secret; decks will have no card id');
  const targets = buildTargets({ dayLog, date, only: section, serverCards });
  if (!targets.length && perSection) { console.log(`Section ${section}: no observer card on ${date}; no deck.`); return; }
  if (!targets.length) throw new Error(`no observer card on ${date}${section ? ` for section ${section}` : ''}`);
  const prepPath = args.prep ? resolve(args.prep) : resolve(REPO_ROOT, 'content/a2/lesson-prep.json');
  let prepAll = {};
  try { prepAll = JSON.parse(readFileSync(prepPath, 'utf8')); } catch { /* optional */ }
  if (prepAll && prepAll.lessons && typeof prepAll.lessons === 'object') prepAll = prepAll.lessons;
  const trees = loadTrees(args.trees ? resolve(args.trees) : resolve(dirname(prepPath), 'lesson-trees'));
  const config = resolveDraftConfig(args.envFile ? resolve(args.envFile) : undefined);
  const decks = targets.map(target => {
    const lessons = target.lesson ? cardLessons(target.lesson, target.card, trees) : [];
    const deck = {
      cardId: target.cardId, sections: target.sections, lesson: target.lesson, title: target.card.title, source: target.source,
      items: null, model: null, generatedAt: null, error: null,
    };
    if (lessons.length) return { ...deck, mode: 'tree', lessons, card: target.card };
    if (args.fromTree) return { ...deck, mode: 'none', skipped: `no lesson tree for ${target.lesson ?? 'a card without a lesson'}` };
    return { ...deck, mode: 'model', messages: buildPrompt({ date, sections: target.sections, lesson: target.lesson, card: target.card, prep: target.lesson ? prepAll[target.lesson] ?? null : null }) };
  });

  // Tree decks first: deterministic, no model.
  const knownCache = new Map();
  for (const deck of decks.filter(d => d.mode === 'tree')) {
    try {
      const known = await knownNodes({ lessons: deck.lessons, cache: knownCache, server, secret, timeout, device: args.device || 's24' });
      const chosen = selectDeck({ trees, lessons: deck.lessons, card: deck.card, date, sections: deck.sections, known });
      const items = normalizeItems(chosen.items);
      checkNames(items);
      Object.assign(deck, { items, model: TREE_MODEL, generatedAt: new Date().toISOString(), tiers: chosen.tiers, padded: chosen.padded });
    } catch (error) { deck.error = redact(error.message, secret); }
    delete deck.card;
  }

  const modelDecks = decks.filter(d => d.mode === 'model');
  const printPrompts = () => {
    for (const deck of decks) {
      if (deck.mode === 'model') {
        console.log(`=== prompt ${date} ${deck.sections.join(', ')} (card ${deck.cardId ?? 'no id yet'}; from the ${deck.source}) ===`);
        for (const message of deck.messages) console.log(`--- ${message.role} ---\n${message.content}`);
      }
      if (deck.items || deck.error) console.log(formatDeck({ date, ...deck }));
      if (deck.tiers) console.log(`  tiers: ${tierLine(deck.tiers)}${deck.padded ? ` (padded ${deck.padded})` : ''}`);
      if (deck.skipped) console.log(`=== ${date} ${deck.sections.join(', ')} · card ${deck.cardId ?? '(no id yet)'} · skipped: ${deck.skipped} ===`);
      console.log('');
    }
  };
  if (modelDecks.length && !config.key) {
    file = { date, generatedAt: new Date().toISOString(), model: null, needsModel: true, decks };
    if (args.dryRun) { printPrompts(); console.log(`No DRAFT_API_KEY: the prompt bundle would be written to ${shown(outPath)} with "needsModel": true; dry run, nothing written.`); }
    else {
      writeFileAtomic(outPath, JSON.stringify(perSection ? mergeDeckFiles(readDeckFile(outPath), file, section) : file, null, 2) + '\n');
      console.log(`No DRAFT_API_KEY: wrote the prompt bundle to ${shown(outPath)} ("needsModel": true). Write the items by hand, then rerun with --from-file ${shown(outPath)} --apply.`);
    }
    process.exitCode = 2;
    return;
  }
  for (const deck of modelDecks) {
    try {
      const text = await callModel({ ...config, messages: deck.messages, timeout: Math.max(timeout, 60000) });
      const items = parseDeckReply(text);
      checkNames(items);
      Object.assign(deck, { items, model: config.model, generatedAt: new Date().toISOString() });
    } catch (error) { deck.error = redact(error.message, config.key); }
  }
  file = { date, generatedAt: new Date().toISOString(), model: modelDecks.length ? config.model : TREE_MODEL, needsModel: false, decks };
  const skipped = decks.filter(d => d.skipped);
  if (args.dryRun) {
    printPrompts();
    console.log(`Dry run, nothing written or sent. ${decks.filter(d => d.items).length} deck(s) built, ${skipped.length} skipped, ${decks.filter(d => d.error).length} rejected.`);
    if (decks.some(d => d.error)) process.exitCode = 1;
    return;
  }
  // Every card skipped (no tree, --from-tree): nothing to write, and the Desk's "No deck" is the signal.
  if (!decks.some(d => d.items || d.error)) {
    console.log(`No deck built for ${date} (${skipped.map(d => `${d.sections.join(', ')}: ${d.skipped}`).join('; ')}); nothing written or sent.`);
    process.exitCode = 1;
    return;
  }
  writeFileAtomic(outPath, JSON.stringify(perSection ? mergeDeckFiles(readDeckFile(outPath), file, section) : file, null, 2) + '\n');
  console.log(`Wrote ${decks.filter(d => d.items).length}/${decks.length} deck(s) to ${shown(outPath)}.`);
  for (const deck of skipped) console.log(`  ${deck.sections.join(', ')}: skipped (${deck.skipped})`);
  for (const deck of decks.filter(d => d.error)) console.log(`  ${deck.sections.join(', ')}: rejected (${deck.error})`);
  if (decks.some(d => d.error)) { process.exitCode = 1; if (args.apply) console.log('Not sending: fix or redraft the rejected deck(s), then rerun (or --from-file --apply).'); return; }
  await sendIfApply(ctx, file);
}

async function sendIfApply({ args, secret, server, timeout }, file) {
  if (!args.apply) return;
  if (!secret) throw new Error('teacher secret not found (roster-server/.env ROSTER_TEACHER_SECRET, or env ROSTER_TEACHER_SECRET / TEACHER_KEY)');
  const body = putBodyFrom(file);
  const { written, unchanged } = await putDecks({ server, secret, body, timeout });
  console.log(`${body.decks.length} deck(s) sent: ${written} written, ${unchanged} unchanged.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('draft-card-decks: ' + error.message); process.exitCode = 1; });
}

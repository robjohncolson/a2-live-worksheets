// Run from the project root. Local inputs/outputs are relative to cwd, which
// also lets offline tests use a temporary workspace without touching real data.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namesMatch } from '../roster-server/names-match.js';
import { blooketScore, flashcardScore, paperScore, combineAll, dayPoints } from '../lib/a2-engagement.js';
// Sources for one section-day, all optional, at least one of blooket/paper required:
//   roster-local/blooket/<date>-<section>.json  {"players":[{"name","correct","answered"}]}
//   roster-local/paper/<date>-<section>.json    {"outOf":n,"students":[{"name","score"}]}
//     (a paper Do Now / exit ticket checked in the room; names as on the roster, or an
//      alias from roster-local/blooket-aliases.json; a student left out is absent)
//   /teacher/flashcards/daily                    best Desk flashcard run (also the roster)

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readOptional(path) {
  try { return readFileSync(path, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function resolveTeacherSecret(root, env = process.env) {
  const text = readOptional(resolve(root, 'roster-server/.env')) || '';
  const match = text.match(/^\s*(?:export\s+)?ROSTER_TEACHER_SECRET\s*=\s*(.*)$/m);
  if (match) {
    const value = match[1].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const end = value.indexOf(value[0], 1);
      if (end > 1) return value.slice(1, end);
    } else {
      const secret = value.replace(/\s+#.*$/, '').trim();
      if (secret) return secret;
    }
  }
  return env.ROSTER_TEACHER_SECRET || null;
}

export function resolveUrl(flag) {
  if (flag) return flag;
  if (process.env.ROSTER_SERVICE_URL) return process.env.ROSTER_SERVICE_URL;
  const text = readOptional(resolve(REPO_ROOT, 'roster_config.js')) || '';
  const matches = [...text.matchAll(/['"](https:\/\/[a-z0-9][^'"]*)['"]/gi)];
  return matches.at(-1)?.[1] || 'https://a2-live-worksheets-production.up.railway.app';
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--commit' || key === '--dry-run') { args[key.slice(2)] = true; continue; }
    if (!['--section', '--date', '--url', '--offline'].includes(key)) throw new Error('arguments');
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('arguments');
    args[key.slice(2)] = value;
  }
  if (args.commit && args['dry-run']) throw new Error('arguments');
  if (!['PeriodC', 'PeriodD', 'PeriodG'].includes(args.section)) throw new Error('section');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date || '')) throw new Error('date');
  const date = new Date(args.date + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== args.date) throw new Error('date');
  return args;
}

export async function importScores(body, url) {
  const secret = resolveTeacherSecret(REPO_ROOT);
  if (!secret) throw new Error('secret');
  const response = await fetch(resolveUrl(url).replace(/\/+$/, '') + '/teacher/score-import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-teacher-secret': secret },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  const rejected = result.rejected ?? (response.ok ? 0 : body.scores.length);
  console.log(`rejected: ${rejected}`);
  if (!response.ok || rejected > 0) throw new Error('response');
  if (!result.ok) throw new Error('response');
  return result;
}

function validateCounts(correct, total) {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || correct < 0 || total < correct) {
    throw new Error('counts');
  }
}

function validateConfig(config) {
  for (const key of ['pointsPerDay', 'accuracyWeight', 'participationWeight', 'questionsForFullParticipation', 'cap']) {
    if (!Number.isFinite(config[key]) || config[key] < 0) throw new Error('config');
  }
  if (config.questionsForFullParticipation === 0 || config.cap > 1) throw new Error('config');
}

function normalizedName(name) {
  return name.normalize('NFC').trim().toLowerCase();
}

function matchPlayer(name, students, aliases) {
  if (Object.hasOwn(aliases, name)) {
    return students.filter(student => student.studentId === aliases[name] || student.username === aliases[name]);
  }
  const normalized = normalizedName(name);
  if (!normalized) return [];
  if (!/\s/.test(normalized)) {
    return students.filter(student => {
      // Support both "First Last" and "Last, First" roster formatting.
      const given = student.realName.includes(',') ? student.realName.split(',')[1] : student.realName;
      return normalizedName(given).split(/\s+/)[0] === normalized;
    });
  }
  // Any competing match needs a teacher alias, even if one scores higher.
  return students.filter(student => namesMatch(name, student.realName));
}

function csvRow(values) {
  return values.map(value => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join(',');
}

function percent(score) {
  return score == null ? '' : Math.round(score * 10000) / 100;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/a2-engagement-config.json'), 'utf8'));
  validateConfig(config);
  const local = resolve(process.cwd(), 'roster-local');
  const stem = args.date + '-' + args.section;
  const blooketText = readOptional(resolve(local, 'blooket', stem + '.json'));
  const paperText = readOptional(resolve(local, 'paper', stem + '.json'));
  if (blooketText == null && paperText == null) throw new Error('no source');
  const blooket = blooketText == null ? { players: [] } : JSON.parse(blooketText);
  const paper = paperText == null ? { outOf: 0, students: [] } : JSON.parse(paperText);
  const aliases = JSON.parse(readOptional(resolve(local, 'blooket-aliases.json')) || '{}');
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) throw new Error('aliases');
  if (!Array.isArray(blooket.players)) throw new Error('players');
  if (!Array.isArray(paper.students)) throw new Error('students');
  if (paperText != null && (!Number.isInteger(paper.outOf) || paper.outOf <= 0)) throw new Error('outOf');

  let daily;
  if (args.offline) {
    daily = JSON.parse(readFileSync(resolve(args.offline), 'utf8'));
  } else {
    const secret = resolveTeacherSecret(REPO_ROOT);
    if (!secret) throw new Error('secret');
    const url = new URL(resolveUrl(args.url).replace(/\/+$/, '') + '/teacher/flashcards/daily');
    url.search = new URLSearchParams({ section: args.section, date: args.date }).toString();
    const response = await fetch(url, { headers: { 'x-teacher-secret': secret } });
    if (!response.ok) throw new Error('response');
    daily = await response.json();
  }
  if (!daily?.ok || daily.section !== args.section || daily.date !== args.date || !Array.isArray(daily.students)) {
    throw new Error('response');
  }
  const students = daily.students;
  const ids = new Set();
  for (const student of students) {
    if (typeof student.studentId !== 'string' || !student.studentId || ids.has(student.studentId)
        || typeof student.realName !== 'string' || typeof student.username !== 'string') throw new Error('student');
    ids.add(student.studentId);
    if (student.best != null) validateCounts(student.best.correct, student.best.total);
  }

  const unmatched = [];
  // Match one source's entries to students; a nickname that fits no one or more than one
  // student is reported, never guessed.
  function matchSource(entries, source) {
    const matched = new Map();
    for (const entry of entries) {
      if (typeof entry.name !== 'string') throw new Error('player');
      const candidates = matchPlayer(entry.name, students, aliases);
      if (candidates.length !== 1) {
        unmatched.push({ ...entry, source, reason: candidates.length ? 'ambiguous' : 'unmatched' });
        continue;
      }
      const id = candidates[0].studentId;
      const list = matched.get(id) || [];
      list.push(entry);
      matched.set(id, list);
    }
    return matched;
  }
  for (const player of blooket.players) validateCounts(player.correct, player.answered);
  for (const entry of paper.students) validateCounts(entry.score, paper.outOf);
  const blooketMatched = matchSource(blooket.players, 'blooket');
  const paperMatched = matchSource(paper.students, 'paper');

  const rows = [csvRow(['realName', 'username', 'blooketPct', 'paperPct', 'flashcardPct', 'combinedPct', 'points', 'note'])];
  const scores = [];
  let scored = 0;
  for (const student of students) {
    const notes = [];
    const one = (matched, source, label) => {
      const list = matched.get(student.studentId) || [];
      if (list.length > 1) {
        unmatched.push(...list.map(entry => ({ ...entry, source, reason: 'multiple entries for student' })));
        notes.push(label + ' duplicate; resolve source entries');
        return null;
      }
      return list[0] || null;
    };
    const player = one(blooketMatched, 'blooket', 'Blooket');
    const sheet = one(paperMatched, 'paper', 'Paper');
    const a = player ? blooketScore(player, config) : null;
    const p = sheet ? paperScore({ score: sheet.score, outOf: paper.outOf }) : null;
    const b = student.best == null ? null : flashcardScore(student.best);
    const score = combineAll([a, p, b], config.cap);
    if (score != null) scored++;
    scores.push({ studentId: student.studentId, score: dayPoints(score, config) });
    const note = notes.length ? notes.join('; ') : score == null ? 'absent' : '';
    rows.push(csvRow([student.realName, student.username, percent(a), percent(p), percent(b), percent(score), dayPoints(score, config), note]));
  }
  const output = resolve(local, 'engagement');
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, stem + '.csv'), rows.join('\r\n') + '\r\n', { mode: 0o600 });
  // Keep unresolved nicknames private, and preserve one CSV row per student.
  writeFileSync(resolve(output, stem + '.unmatched.json'), JSON.stringify({ unmatched }, null, 2) + '\n', { mode: 0o600 });
  if (args.commit) {
    if (unmatched.length) throw new Error('unresolved players');
    await importScores({ source: 'daily-engagement', section: args.section, date: args.date, scores }, args.url);
  }
  console.log(`scored: ${scored}, absent: ${students.length - scored}, unmatched: ${unmatched.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Never echo input, paths, server messages, or exception details containing PII/secrets.
    console.error('Engagement calculation failed. Check arguments, local input/config files, and teacher service access.');
    process.exitCode = 1;
  });
}

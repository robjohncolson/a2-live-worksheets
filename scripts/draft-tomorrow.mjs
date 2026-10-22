#!/usr/bin/env node
// Nightly "Tomorrow" draft for Algebra 2 (FABLE_SPRINT_2026_10_22D_SPEC D0): one note per
// section (C, D, G) for that section's next class day, in the existing class format
// (IXL skills, then the packet, then the quiz). Deterministic, no LLM: the day log and
// the lesson prep are the truth; the Do Now is never a new task (a Group Jam on an
// assigned IXL skill, or a kept packet example / practice item not yet done).
//
//   node scripts/draft-tomorrow.mjs                       # tomorrow (New York); each section's next class day on or after it
//   node scripts/draft-tomorrow.mjs --date 2026-10-26     # the class day to draft for (a section that does not meet skips forward)
//   node scripts/draft-tomorrow.mjs --section G           # one section
//   node scripts/draft-tomorrow.mjs --out DIR             # default roster-local/tomorrow (gitignored)
//
// Sources: data/a2-lesson-targets.json + data/a2-school-year.json (meeting days, the
// year-plan lesson window, the topic assessment date), content/a2/day-log.json (what
// landed and what is planned; its `lesson` for the day wins over the year plan),
// content/a2/lesson-prep.json, content/a2/lesson-skills.json, data/ixl-algebra2-skills.json,
// and the latest Class Log summary of the section in roster-local/class-summaries/index.json
// (run `npm run pull-summaries` first; tools/nightly_tomorrow.ps1 does both).
// Writes <out>/<date>-<section>.md and prints each note. The logic lives in lib/a2-tomorrow.js
// (shared with the Desk's "Tomorrow" fold).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../lib/a2-year-plan.js';
import '../lib/a2-tomorrow.js';
import { dayItems } from './build-a2-week-objectives.mjs';
import { todayInNewYork } from './push-schedule.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SECTIONS = ['C', 'D', 'G'];
const { meetingDays, rangeEnd } = globalThis.A2YearPlan;
const A2Tomorrow = globalThis.A2Tomorrow;

const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
export const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

export function parseArgs(argv, today = todayInNewYork()) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--date', '--section', '--out', '--root'].includes(key)) throw new Error(`unknown argument ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    args[key.slice(2)] = value;
  }
  if (args.date !== undefined && !isIso(args.date)) throw new Error('--date must be YYYY-MM-DD');
  if (args.section !== undefined && !SECTIONS.includes(args.section)) throw new Error('--section must be C, D or G');
  args.date = args.date || addDays(today, 1);
  args.sections = args.section ? [args.section] : SECTIONS;
  return args;
}

const readJson = (root, path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

// Every input file, read from one root (the repo, or a fixture tree in tests).
export function loadInputs(root = REPO_ROOT) {
  const indexPath = resolve(root, 'roster-local/class-summaries/index.json');
  let summaries = [];
  if (existsSync(indexPath)) {
    try { summaries = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { summaries = []; }
  }
  const skillMap = readJson(root, 'data/ixl-algebra2-skills.json');
  const byCode = Object.fromEntries((skillMap.skills || []).map(s => [s.code, s]));
  return {
    year: readJson(root, 'data/a2-school-year.json'),
    plan: readJson(root, 'data/a2-lesson-targets.json'),
    dayLog: readJson(root, 'content/a2/day-log.json'),
    prep: readJson(root, 'content/a2/lesson-prep.json'),
    lessonSkills: readJson(root, 'content/a2/lesson-skills.json'),
    skillLookup: code => byCode[code] || null,
    summaries: Array.isArray(summaries) ? summaries : [],
  };
}

// The section's first meeting day on or after `date`, or null when the year is over.
export function nextClassDay(year, section, date) {
  return meetingDays(year, section, date, rangeEnd(year))[0] || null;
}

// The lesson the section is on that day: the day log's entry for the day, else the year
// plan's window, else the section's latest logged lesson before the day.
export function lessonFor({ dayLog, year, plan }, section, date) {
  const entries = (dayLog.entries || []).filter(e => e && e.section === section && e.lesson);
  const today = entries.find(e => e.date === date);
  if (today) return { key: today.lesson, source: 'day log' };
  const item = dayItems(year, plan, section)[date];
  if (item && !item.assessment) return { key: item.key, source: 'year plan' };
  const before = entries.filter(e => e.date < date).sort((a, b) => a.date.localeCompare(b.date));
  if (before.length) return { key: before[before.length - 1].lesson, source: 'last logged' };
  if (item) return { key: item.key, source: 'year plan' };
  return null;
}

// The latest recording summary of the section before the class day.
export function latestSummary(summaries, section, date) {
  return summaries.filter(s => s && s.section === section && s.date < date).sort((a, b) => a.date.localeCompare(b.date)).pop() || null;
}

export function draftSection(inputs, section, date) {
  const classDay = nextClassDay(inputs.year, section, date);
  if (!classDay) return null;
  const lesson = lessonFor(inputs, section, classDay);
  if (!lesson) return null;
  const title = (inputs.plan.lessons || []).find(l => l.key === lesson.key)?.title || '';
  const note = A2Tomorrow.draft({
    date: classDay, section, lesson: lesson.key, title,
    dayLog: inputs.dayLog, prep: inputs.prep.lessons?.[lesson.key] || null,
    lessonSkills: inputs.lessonSkills.lessons?.[lesson.key] || [],
    skillLookup: inputs.skillLookup, plan: inputs.plan,
    summary: latestSummary(inputs.summaries, section, classDay),
  });
  note.lessonSource = lesson.source;
  return note;
}

export function noteText(note) {
  const text = A2Tomorrow.renderMarkdown(note);
  if (note.lessonSource === 'day log') return text;
  return text.replace('\n\n', `\n\n*Lesson taken from the ${note.lessonSource}; the day log has no entry for this day.*\n\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root ? resolve(args.root) : REPO_ROOT;
  const inputs = loadInputs(root);
  const outDir = resolve(args.out || resolve(root, 'roster-local/tomorrow'));
  mkdirSync(outDir, { recursive: true });
  for (const section of args.sections) {
    const note = draftSection(inputs, section, args.date);
    if (!note) { console.log(`Section ${section}: no class day on or after ${args.date}`); continue; }
    const text = noteText(note);
    const file = resolve(outDir, `${note.date}-${section}.md`);
    writeFileSync(file, text);
    process.stdout.write(text + '\n');
    console.log(`wrote ${file}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('draft-tomorrow: ' + error.message); process.exitCode = 1; }
}

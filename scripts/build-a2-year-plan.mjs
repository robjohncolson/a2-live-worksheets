#!/usr/bin/env node
// Generates the SY26-27 Algebra 2 year plan: a due date per section (C, D, G) for
// every scheduled lesson in data/a2-lesson-targets.json, plus one topic-assessment
// day per topic. Published lessons keep the dates in content/a2/lessons.json; the
// unpublished keep and bridge lessons are packed, in plan order, into the meeting
// days that remain after the last published due date, using the closures and
// meeting days in desk.html's SCHEDULE_DEFS (the calendar's own source).
//
//   node scripts/build-a2-year-plan.mjs            # rewrites the JSON and the docs table
//   node scripts/build-a2-year-plan.mjs --print    # prints the JSON without writing
//   node scripts/build-a2-year-plan.mjs --check    # exits 1 when the committed files are stale
//   node scripts/build-a2-year-plan.mjs --weeks 2              # calendar weeks per lesson (default, teacher 2026-09-17)
//   node scripts/build-a2-year-plan.mjs --cadence C=4,D=4,G=5   # fixed meeting days per lesson
//   node scripts/build-a2-year-plan.mjs --mode fit             # spread the remaining days evenly
//   node scripts/build-a2-year-plan.mjs --brief-days 1         # also schedule brief lessons
//
// Options are recorded in the JSON's `pacing` block; without flags the script reuses
// the committed options, so a plain run is idempotent and tests/a2-year-plan.test.js
// can pin the output.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SECTIONS = ['C', 'D', 'G'];
const PACING_START = '<!-- pacing-table:start -->';
const PACING_END = '<!-- pacing-table:end -->';

// Reads the calendar definition the Desk itself uses (closures, range, meeting days).
export function readScheduleDef(deskHtml) {
  const start = deskHtml.indexOf('const SCHEDULE_DEFS = {');
  const end = deskHtml.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('SCHEDULE_DEFS not found in desk.html');
  const source = deskHtml.slice(start, end + 3).replace('const SCHEDULE_DEFS', 'var SCHEDULE_DEFS');
  return new Function('LESSONS', source + '\nreturn SCHEDULE_DEFS;')([])['SY26-27'];
}

const iso = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const fromArr = a => new Date(a[0], a[1], a[2], 12);

export function closureSet(daysOff) {
  const set = new Set();
  for (const entry of daysOff) {
    const [first, last] = [fromArr(entry[0]), fromArr(entry[entry.length - 1])];
    for (let dt = new Date(first); dt <= last; dt.setDate(dt.getDate() + 1)) set.add(iso(dt));
  }
  return set;
}

// Every meeting day of a section between two ISO dates inclusive.
export function meetingDays(def, section, fromDate, toDate) {
  const off = closureSet(def.daysOff || []);
  const meets = def.periods[section].meetsDays;
  const days = [];
  for (let dt = fromIso(fromDate); dt <= fromIso(toDate); dt.setDate(dt.getDate() + 1)) {
    if (meets.includes(dt.getDay()) && !off.has(iso(dt))) days.push(iso(dt));
  }
  return days;
}

function nextDay(isoDate) { const dt = fromIso(isoDate); dt.setDate(dt.getDate() + 1); return iso(dt); }
// The Friday that closes the `weeks`-th calendar week of a window opening on `isoDate`.
// A window that would open on a Thursday or Friday starts the following Monday instead
// (a two-day first week is not a week); a weekend start rolls to the coming week.
export function fridayOf(isoDate, weeks = 1) {
  const dt = fromIso(isoDate);
  const dow = dt.getDay();
  const toFriday = (5 - dow + 7) % 7 + (dow === 4 || dow === 5 ? 7 : 0);
  dt.setDate(dt.getDate() + toFriday + 7 * (weeks - 1));
  return iso(dt);
}

export function parseCadence(text) {
  if (!text) return null;
  return Object.fromEntries(text.split(',').map(part => { const [section, n] = part.split('='); return [section.trim(), Number(n)]; }));
}

// Splits `total` days over `count` lessons as evenly as possible (Bresenham spread).
function spread(total, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(Math.floor(((i + 1) * total) / count) - Math.floor((i * total) / count));
  return out;
}

export function buildYearPlan({ targets, published, def, options = {} }) {
  const pacing = {
    mode: options.mode || targets.pacing?.mode || 'weeks',
    weeks: options.weeks ?? targets.pacing?.weeks ?? 2,
    cadence: options.cadence || targets.pacing?.cadence || null,
    briefDays: options.briefDays ?? targets.pacing?.briefDays ?? 0,
    assessmentDays: options.assessmentDays ?? targets.pacing?.assessmentDays ?? 1,
  };
  if (pacing.mode === 'cadence' && !pacing.cadence) throw new Error('--mode cadence needs --cadence C=n,D=n,G=n');
  if (!['weeks', 'fit', 'cadence'].includes(pacing.mode)) throw new Error('mode must be weeks, fit or cadence');
  const live = Object.fromEntries(published.map(lesson => [lesson.key, lesson]));
  const rangeEnd = iso(fromArr(def.range.end));
  const rangeStart = iso(fromArr(def.range.start));
  const scheduled = targets.lessons.filter(lesson => lesson.plan === 'keep' || lesson.plan === 'bridge'
    || (lesson.plan === 'brief' && pacing.briefDays > 0) || live[lesson.key]);
  const sectionsByKey = Object.fromEntries(scheduled.map(lesson => [lesson.key, {}]));
  const days = Object.fromEntries(scheduled.map(lesson => [lesson.key, {}]));
  const assessments = {};
  const unscheduled = {};
  const meetingCounts = {};

  for (const section of SECTIONS) {
    const publishedHere = scheduled.filter(lesson => live[lesson.key]?.sections?.[section]);
    let cursor = rangeStart;
    let previousKey = null;
    for (const lesson of publishedHere) {
      const due = live[lesson.key].sections[section];
      sectionsByKey[lesson.key][section] = due;
      days[lesson.key][section] = meetingDays(def, section, cursor, due).length;
      cursor = nextDay(due);
      previousKey = lesson.key;
    }
    const remaining = scheduled.filter(lesson => !live[lesson.key]?.sections?.[section]);
    const lastPublished = scheduled.findIndex(lesson => lesson.key === previousKey);
    const early = remaining.find(lesson => scheduled.indexOf(lesson) < lastPublished);
    if (early) throw new Error(`${early.key} is unpublished but precedes published ${previousKey} in plan order`);
    const pool = meetingDays(def, section, cursor, rangeEnd);
    meetingCounts[section] = { total: meetingDays(def, section, rangeStart, rangeEnd).length, remaining: pool.length };
    // Topics that still need an assessment day: every topic with a scheduled lesson,
    // whose last lesson is not yet followed by an assessment (published topics included).
    const topicsToAssess = [...new Set(scheduled.map(lesson => lesson.topic))];
    const lastLessonOfTopic = Object.fromEntries(topicsToAssess.map(topic => [topic, scheduled.filter(l => l.topic === topic).at(-1).key]));
    const assessmentBudget = pacing.assessmentDays * topicsToAssess.length;
    // Days per unpublished lesson. `weeks` (the teacher's cadence, 2026-09-17): a lesson
    // runs from its start through the Friday of its `weeks`-th calendar week, like the
    // published 1-2 through 1-6 windows, so a closure shortens the window. `cadence`:
    // a fixed number of meeting days. `fit`: the remaining days spread evenly.
    let perLesson = null;
    if (pacing.mode === 'cadence') {
      const n = pacing.cadence[section];
      if (!Number.isInteger(n) || n < 1) throw new Error(`cadence for ${section} must be a positive integer`);
      perLesson = remaining.map(lesson => lesson.plan === 'brief' ? pacing.briefDays : n);
    } else if (pacing.mode === 'fit') {
      const briefCount = remaining.filter(lesson => lesson.plan === 'brief').length;
      const fullCount = remaining.length - briefCount;
      const budget = Math.max(0, pool.length - assessmentBudget - briefCount * pacing.briefDays);
      const full = spread(budget, fullCount);
      let i = 0;
      perLesson = remaining.map(lesson => lesson.plan === 'brief' ? pacing.briefDays : full[i++]);
    }
    // Window for lesson i starting at `from`: the meeting days it occupies, or null when
    // the year cannot hold it. Once one lesson falls off, so does everything after it.
    const windowFrom = (from, i) => {
      const lesson = remaining[i];
      if (perLesson) {
        const n = perLesson[i];
        const window = meetingDays(def, section, from, rangeEnd).slice(0, n);
        return n >= 1 && window.length === n ? window : null;
      }
      const weeks = lesson.plan === 'brief' ? Math.max(1, Math.ceil(pacing.briefDays / 5)) : pacing.weeks;
      let start = from;
      for (;;) {   // a window with no meeting day (a vacation week) is skipped, not counted
        const end = fridayOf(start, weeks);
        if (end > rangeEnd) return null;
        const window = meetingDays(def, section, start, end);
        if (window.length) return window;
        start = nextDay(end);
      }
    };
    let cursor2 = cursor;
    let overflow = false;
    // The Topic 1 assessment (or any published topic's) lands on the first meeting day
    // after its last lesson, before the next lesson starts.
    const placeAssessment = topic => {
      if (pacing.assessmentDays < 1) return;
      const window = meetingDays(def, section, cursor2, rangeEnd).slice(0, pacing.assessmentDays);
      if (window.length < pacing.assessmentDays) return;
      (assessments[topic] ||= {})[section] = window.at(-1);
      cursor2 = nextDay(window.at(-1));
    };
    if (previousKey && lastLessonOfTopic[live[previousKey].topic] === previousKey) placeAssessment(live[previousKey].topic);
    remaining.forEach((lesson, i) => {
      const window = overflow ? null : windowFrom(cursor2, i);
      if (!window) { overflow = true; (unscheduled[section] ||= []).push(lesson.key); return; }
      const due = window.at(-1);
      sectionsByKey[lesson.key][section] = due;
      days[lesson.key][section] = window.length;
      cursor2 = nextDay(due);
      if (lastLessonOfTopic[lesson.topic] === lesson.key) placeAssessment(lesson.topic);
    });
  }

  const lessons = targets.lessons.map(lesson => {
    const copy = { ...lesson };
    delete copy.sections; delete copy.days;
    if (sectionsByKey[lesson.key] && Object.keys(sectionsByKey[lesson.key]).length) {
      copy.sections = sectionsByKey[lesson.key];
      copy.days = days[lesson.key];
    }
    return copy;
  });
  const { lessons: _lessons, pacing: _pacing, assessments: _assessments, ...rest } = targets;
  return {
    ...rest,
    pacing: { ...pacing, meetingDays: meetingCounts, unscheduled },
    assessments,
    lessons,
  };
}

export function pacingTable(plan, published) {
  const live = new Set(published.map(lesson => lesson.key));
  const rows = plan.lessons.filter(lesson => lesson.sections).map(lesson => {
    const cells = SECTIONS.map(section => lesson.sections[section] ? `${lesson.sections[section]} (${lesson.days[section]}d)` : '—');
    const state = live.has(lesson.key) ? 'published' : 'planned';
    return `| ${lesson.key} | ${lesson.title} | ${state} | ${cells.join(' | ')} |`;
  });
  const assessmentRows = Object.entries(plan.assessments).map(([topic, dates]) =>
    `| Topic ${topic} assessment | | | ${SECTIONS.map(section => dates[section] || '—').join(' | ')} |`);
  const counts = SECTIONS.map(section => `${section}: ${plan.pacing.meetingDays[section].total} meeting days (${plan.pacing.meetingDays[section].remaining} after the published lessons)`).join('; ');
  const unscheduled = Object.entries(plan.pacing.unscheduled).map(([section, keys]) => `${section}: ${keys.join(', ')}`).join('; ');
  return [
    PACING_START,
    `Generated by \`node scripts/build-a2-year-plan.mjs\` (mode: ${plan.pacing.mode}${plan.pacing.mode === 'weeks' ? ', ' + plan.pacing.weeks + ' calendar weeks per lesson' : ''}${plan.pacing.mode === 'cadence' ? ', cadence ' + SECTIONS.map(s => s + '=' + plan.pacing.cadence[s]).join(',') : ''}; ${plan.pacing.assessmentDays} assessment day per topic; brief lessons ${plan.pacing.briefDays ? plan.pacing.briefDays + ' day(s)' : 'unscheduled'}). ${counts}.${unscheduled ? ' Does not fit: ' + unscheduled + '.' : ''}`,
    '',
    '| Lesson | Title | State | C due | D due | G due |',
    '|---|---|---|---|---|---|',
    ...rows,
    ...assessmentRows,
    PACING_END,
  ].join('\n');
}

export function replacePacingTable(doc, table) {
  const start = doc.indexOf(PACING_START), end = doc.indexOf(PACING_END);
  if (start < 0 || end < 0) throw new Error('docs/a2-lesson-targets.md is missing the pacing-table markers');
  return doc.slice(0, start) + table + doc.slice(end + PACING_END.length);
}

export function loadInputs() {
  return {
    targets: JSON.parse(readFileSync(resolve(ROOT, 'data/a2-lesson-targets.json'), 'utf8')),
    published: JSON.parse(readFileSync(resolve(ROOT, 'content/a2/lessons.json'), 'utf8')),
    def: readScheduleDef(readFileSync(resolve(ROOT, 'desk.html'), 'utf8')),
    doc: readFileSync(resolve(ROOT, 'docs/a2-lesson-targets.md'), 'utf8'),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const options = {};
  if (flag('--mode')) options.mode = flag('--mode');
  if (flag('--weeks')) { options.weeks = Number(flag('--weeks')); options.mode = 'weeks'; }
  if (flag('--cadence')) { options.cadence = parseCadence(flag('--cadence')); options.mode = 'cadence'; }
  if (flag('--brief-days')) options.briefDays = Number(flag('--brief-days'));
  if (flag('--assessment-days')) options.assessmentDays = Number(flag('--assessment-days'));
  const { targets, published, def, doc } = loadInputs();
  const plan = buildYearPlan({ targets, published, def, options });
  const json = JSON.stringify(plan, null, 2).replace(/\{\n\s+("C": "[^"]*"),\n\s+("D": "[^"]*"),\n\s+("G": "[^"]*")\n\s+\}/g, '{ $1, $2, $3 }')
    .replace(/\{\n\s+("C": \d+),\n\s+("D": \d+),\n\s+("G": \d+)\n\s+\}/g, '{ $1, $2, $3 }') + '\n';
  const nextDoc = replacePacingTable(doc, pacingTable(plan, published));
  if (args.includes('--print')) {
    process.stdout.write(json);
  } else if (args.includes('--check')) {
    const current = readFileSync(resolve(ROOT, 'data/a2-lesson-targets.json'), 'utf8');
    if (current !== json || doc !== nextDoc) { console.error('a2 year plan is stale; run node scripts/build-a2-year-plan.mjs'); process.exit(1); }
    console.log('a2 year plan is current');
  } else {
    writeFileSync(resolve(ROOT, 'data/a2-lesson-targets.json'), json);
    writeFileSync(resolve(ROOT, 'docs/a2-lesson-targets.md'), nextDoc);
    const scheduled = plan.lessons.filter(lesson => lesson.sections).length;
    console.log(`data/a2-lesson-targets.json: ${scheduled} scheduled lessons, ${Object.keys(plan.assessments).length} topic assessments`);
    for (const section of SECTIONS) {
      const counts = plan.lessons.filter(lesson => lesson.days?.[section]).map(lesson => lesson.key + '=' + lesson.days[section]);
      console.log(`${section}: ${plan.pacing.meetingDays[section].remaining} days after published; ${counts.join(' ')}${plan.pacing.unscheduled[section] ? '; unscheduled ' + plan.pacing.unscheduled[section].join(',') : ''}`);
    }
  }
}

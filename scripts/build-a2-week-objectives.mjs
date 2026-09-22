#!/usr/bin/env node
// Weekly objectives sheet for the whiteboard (district walkthroughs): for one school week
// it lists, per section, the lesson(s) on each meeting day with the learning objective,
// standards, language objective and essential question, copied VERBATIM from
// content/a2/lesson-objectives.json (which is copied verbatim from the class packets).
// A lesson with no authored entry prints a "not yet authored" placeholder, never an
// invented objective. Pacing comes from data/a2-lesson-targets.json + data/a2-school-year.json
// (the same window rule the Desk calendar uses: a lesson occupies every meeting day after
// the previous lesson's due date through its own due date; an assessment takes its day).
//
//   node scripts/build-a2-week-objectives.mjs                 # this week (next week on Sat/Sun)
//   node scripts/build-a2-week-objectives.mjs --week 2026-09-28
//   node scripts/build-a2-week-objectives.mjs --week 2026-09-28 --out roster-local/week-objectives
//
// Prints a plain-text board copy to stdout and writes a printable one-page HTML
// (landscape Letter) to <out>/week-<monday>.html (default out: roster-local/week-objectives,
// gitignored). Print it from a browser or paste the text onto the board.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../lib/a2-year-plan.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const { meetingDays, closureSet, rangeStart, iso } = globalThis.A2YearPlan;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SECTIONS = ['C', 'D', 'G'];

function flag(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; }

// Monday of the week holding `date`; from Saturday on, the following week.
export function mondayFor(date) {
  const dt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const dow = dt.getDay();
  const shift = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  dt.setDate(dt.getDate() + shift);
  return iso(dt);
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return iso(dt);
}

// Which lesson/assessment each meeting day of a section carries, keyed by ISO date.
export function dayItems(year, plan, section) {
  const items = [];
  for (const lesson of plan.lessons) {
    if (lesson.plan === 'later' || !lesson.sections?.[section]) continue;
    items.push({ date: lesson.sections[section], key: lesson.key, title: lesson.title, topic: lesson.topic });
  }
  for (const [topic, sections] of Object.entries(plan.assessments || {})) {
    if (sections?.[section]) items.push({ date: sections[section], key: 'TA-' + topic, title: 'Topic ' + topic + ' Assessment', topic: Number(topic), assessment: true });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  const byDate = {};
  let cursor = rangeStart(year);
  for (const item of items) {
    if (item.date < cursor) continue;
    for (const day of meetingDays(year, section, cursor, item.date)) byDate[day] = item;
    cursor = addDays(item.date, 1);
  }
  return byDate;
}

export function weekSheet({ monday, year, plan, objectives }) {
  const off = closureSet(year.daysOff);
  const sections = SECTIONS.map(section => {
    const items = dayItems(year, plan, section);
    const days = [];
    const lessons = [];
    for (let i = 0; i < 5; i++) {
      const date = addDays(monday, i);
      const meets = year.periods[section].meetsDays.includes((i + 1) % 7);
      const item = items[date] || null;
      days.push({ date, weekday: DAYS[i + 1], meets, closed: off.has(date), item });
      if (item && !lessons.some(l => l.key === item.key)) lessons.push(item);
    }
    return { section, days, lessons: lessons.map(item => ({ ...item, objectives: item.assessment ? null : objectives.lessons[item.key] || null })) };
  });
  return { monday, friday: addDays(monday, 4), sections };
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortDate = isoDate => new Date(isoDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function lessonBlock(lesson) {
  const head = `<h3>${esc(lesson.key)} · ${esc(lesson.title)}</h3>`;
  if (lesson.assessment) return head + '<p class="muted">Assessment day.</p>';
  const o = lesson.objectives;
  if (!o) return head + '<p class="muted">Objectives not yet authored for this lesson (add the packet\'s page 1 to content/a2/lesson-objectives.json).</p>';
  const standards = o.standards?.length ? ` <span class="std">(${o.standards.map(esc).join(', ')})</span>` : '';
  return head
    + `<p><b>Learning objective:</b> ${o.mathObjectives.map(esc).join(' ')}${standards}</p>`
    + `<p><b>Language objective:</b> ${esc(o.languageObjective)}</p>`
    + (o.essentialQuestion ? `<p><b>Essential question:</b> ${esc(o.essentialQuestion)}</p>` : '');
}

export function renderHtml(sheet) {
  const columns = sheet.sections.map(({ section, days, lessons }) => {
    const dayLine = days.map(day => {
      if (!day.meets) return `<span class="no">${day.weekday.slice(0, 3)}</span>`;
      if (day.closed) return `<span class="no">${day.weekday.slice(0, 3)} (no school)</span>`;
      return `<span>${day.weekday.slice(0, 3)}: ${day.item ? esc(day.item.key) : '—'}</span>`;
    }).join(' · ');
    return `<section><h2>Section ${section}</h2><p class="days">${dayLine}</p>${lessons.map(lessonBlock).join('') || '<p class="muted">No class this week.</p>'}</section>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Algebra 2 objectives — week of ${shortDate(sheet.monday)}</title>
<style>
  @page { size: Letter landscape; margin: 0.5in; }
  body { margin: 0; font: 11pt/1.35 Arial, sans-serif; color: #111; background: #fff; }
  main { padding: 16px; }
  h1 { font-size: 18pt; margin: 0 0 10px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  section { border: 1px solid #777; padding: 8px 10px; break-inside: avoid; }
  h2 { font-size: 13pt; margin: 0 0 4px; border-bottom: 1px solid #777; padding-bottom: 2px; }
  h3 { font-size: 11.5pt; margin: 8px 0 2px; }
  p { margin: 3px 0; }
  .days { font-size: 9.5pt; color: #333; }
  .no { color: #999; }
  .std { color: #444; font-size: 9.5pt; }
  .muted { color: #666; font-style: italic; }
  @media print { main { padding: 0; } }
</style></head><body><main>
<h1>Algebra 2 · Objectives for the week of ${shortDate(sheet.monday)} – ${shortDate(sheet.friday)}</h1>
<div class="grid">
${columns}
</div>
</main></body></html>
`;
}

export function renderText(sheet) {
  const lines = [`ALGEBRA 2 — WEEK OF ${shortDate(sheet.monday)} to ${shortDate(sheet.friday)}`];
  for (const { section, lessons } of sheet.sections) {
    lines.push('', `SECTION ${section}`);
    if (!lessons.length) { lines.push('  No class this week.'); continue; }
    for (const lesson of lessons) {
      lines.push(`  ${lesson.key} ${lesson.title}`);
      if (lesson.assessment) continue;
      const o = lesson.objectives;
      if (!o) { lines.push('    Objectives not yet authored.'); continue; }
      lines.push(`    Learning objective: ${o.mathObjectives.join(' ')}${o.standards?.length ? ' (' + o.standards.join(', ') + ')' : ''}`);
      lines.push(`    Language objective: ${o.languageObjective}`);
      if (o.essentialQuestion) lines.push(`    Essential question: ${o.essentialQuestion}`);
    }
  }
  return lines.join('\n') + '\n';
}

function main() {
  const week = flag('--week');
  if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error('--week expects YYYY-MM-DD');
  const monday = mondayFor(week ? new Date(week + 'T12:00:00') : new Date());
  const sheet = weekSheet({
    monday,
    year: readJson('data/a2-school-year.json'),
    plan: readJson('data/a2-lesson-targets.json'),
    objectives: readJson('content/a2/lesson-objectives.json'),
  });
  const outDir = resolve(process.cwd(), flag('--out') || 'roster-local/week-objectives');
  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, `week-${monday}.html`);
  writeFileSync(file, renderHtml(sheet));
  process.stdout.write(renderText(sheet));
  console.log(`wrote ${file}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

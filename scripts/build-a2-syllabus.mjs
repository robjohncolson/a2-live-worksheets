#!/usr/bin/env node
// Per-section syllabus pages (syllabus-c.html, syllabus-d.html, syllabus-g.html).
// Policy copy is lifted from start-here.html; the pacing table comes from the year plan in
// data/a2-lesson-targets.json and the meeting days from data/a2-school-year.json.
// Regenerate whenever Start Here or the year plan changes:
//   node scripts/build-a2-syllabus.mjs [--check]
// The public pages carry no teacher name (same rule as the Open House handout). For the
// Schoology PDFs pass --teacher "Mr. X" --out <dir> and print those pages instead.
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = new JSDOM(read('../start-here.html'));
const doc = source.window.document;
const plan = JSON.parse(read('../data/a2-lesson-targets.json'));
const year = JSON.parse(read('../data/a2-school-year.json'));

const section = title => [...doc.querySelectorAll('section')].find(node => node.querySelector('h2')?.textContent === title);
// Lifted verbatim from Start Here: the district formula, the topic-assessment rule, Bonus, quarter dates.
const formula = doc.querySelector('#how-your-grade p').textContent.split('. ')[0] + '.';
const minimums = doc.querySelectorAll('#how-your-grade p')[1].textContent.split('. ')[0] + '.';
const topicRule = [...doc.querySelectorAll('tbody tr')].find(row => row.cells[0].textContent === 'Topic assessment').cells[3].textContent;
const bonus = doc.querySelector('#bonus p').outerHTML;
const quarters = section('Dates').querySelector('p').textContent.split('Quarters close ')[1];

const flag = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const teacher = flag('--teacher');
const outDir = flag('--out');

const TOPICS = {
  1: 'Linear Functions and Systems', 2: 'Quadratic Functions and Equations', 3: 'Polynomial Functions',
  4: 'Rational Functions', 5: 'Rational Exponents and Radical Functions',
  6: 'Exponential and Logarithmic Functions', 7: 'Trigonometric Functions',
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shortDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function pacingRows(period) {
  const rows = [];
  for (const [topic, title] of Object.entries(TOPICS)) {
    const lessons = plan.lessons.filter(lesson => String(lesson.topic) === topic && lesson.sections?.[period]);
    if (!lessons.length) continue;
    const list = lessons.map(lesson => `${lesson.key} ${lesson.title} <span class="date">(${shortDate(lesson.sections[period])})</span>`).join('<br>');
    const test = plan.assessments[topic]?.[period];
    rows.push(`<tr><td>Topic ${topic}<br>${title}</td><td>${list}</td><td>${test ? shortDate(test) : ''}</td></tr>`);
  }
  return rows.join('\n');
}

function page(period) {
  const meets = year.periods[period].meetsDays.map(day => DAYS[day]).join(', ');
  return `<!DOCTYPE html>
<!-- Generated from start-here.html and data/a2-lesson-targets.json. Regenerate:
     node scripts/build-a2-syllabus.mjs -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Algebra 2 syllabus — Period ${period}</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; background: #fff; font: 10pt/1.32 Arial, sans-serif; }
  main { max-width: 7.3in; margin: 24px auto; padding: 0 12px; }
  h1 { font-size: 19pt; line-height: 1.15; margin: 0 0 4px; }
  .sub { margin: 0 0 12px; font-size: 10.5pt; }
  h2 { font-size: 11.5pt; margin: 14px 0 4px; border-bottom: 1px solid #777; padding-bottom: 2px; }
  p { margin: 6px 0; }
  ol { margin: 6px 0; padding-left: 20px; } li { margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9.5pt; }
  th, td { border: 1px solid #777; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  .graded th:first-child { width: 16%; } .graded th:nth-child(2) { width: 14%; }
  .date { color: #444; white-space: nowrap; }
  .pacing th:first-child { width: 24%; } .pacing th:last-child { width: 13%; } .pacing td:last-child { white-space: nowrap; }
  nav { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .btn, button { color: #111; background: #eee; border: 1px solid #777; border-radius: 4px; padding: 8px 12px; font: inherit; text-decoration: none; cursor: pointer; }
  @media print {
    main { max-width: none; margin: 0; padding: 0; }
    nav, button { display: none !important; }
    tr { break-inside: avoid; } h2 { break-after: avoid; }
  }
</style>
</head>
<body><main>
<h1>Algebra 2 — Period ${period}</h1>
<p class="sub">Lynn English High School · 2026–27${teacher ? ` · ${teacher}` : ''} · Meets ${meets}. Early-release Wednesdays are still class days.</p>
<h2>The course</h2>
<p>We use enVision Algebra 2. The year covers functions and their graphs, quadratics, polynomials, and rational functions, then bridges into radicals, exponentials, and trigonometry. Bring a charged Chromebook, a notebook, and a pencil every day.</p>
<h2>An average day</h2>
<ol>
<li>Take out your Chromebook. It needs to be charged. No phones.</li>
<li>We open with a Blooket. Starting Monday, Sep 21, it is scored on your accuracy and on how many questions you answer. Your rank is for fun and candy; it is not part of your grade.</li>
<li>Then we do one of two things. On packet days I work the lesson's Examples in OneNote on the board while you copy them into your packet, and you do the Try-Its at the end of the lesson. On IXL days we run a Web Jam on one skill.</li>
<li>If we finish the Web Jam with time left, that time is yours.</li>
</ol>
<p>The OneNote notebook and the class packet are on Schoology. If you are absent, use them to catch up.</p>
<h2>What gets graded</h2>
<table class="graded"><thead><tr><th>Piece</th><th>Category</th><th>How I score it</th></tr></thead><tbody>
<tr><td>Daily Blooket</td><td>Engagement</td><td>Accuracy and number of questions answered, every day. A flashcard check on the same material can redeem a bad Blooket: I take your higher score and add half of your lower score, up to full credit. I will tell you when the flashcard check opens.</td></tr>
<tr><td>Try-Its</td><td>Assignments</td><td>Effort and accuracy, at the end of the lesson. Right answer with your work shown earns full credit. Real effort with a wrong answer earns 80%. A right answer with no work earns 80%.</td></tr>
<tr><td>IXL Web Jam</td><td>Bonus</td><td>Your accuracy at the end of the jam goes toward Bonus. Web Jams are for taking part and thinking out loud, so they can only help you.</td></tr>
<tr><td>Quiz</td><td>Assessments</td><td>About two per topic, at the end of some lessons, taken in class. You may use your notes and the class packet on Schoology. Same rule as Try-Its: lots of work with a wrong answer earns 80%, and a right answer with no work earns 80%.</td></tr>
<tr><td>Topic assessment</td><td>Assessments</td><td>${topicRule}</td></tr>
</tbody></table>
<p>I grade for evidence of your own thinking. That is why work counts as much as the answer.</p>
<p>${formula} ${minimums}</p>
<h2>Bonus</h2>
${bonus}
<h2>The first two weeks</h2>
<p>Work through Friday, Sep 18 could only help you. It became your starting Bonus points and nothing from those weeks counts against you. Graded work starts Monday, Sep 21.</p>
<h2>Plan for the year</h2>
<p>Each date is the day that lesson is due for Period ${period}. These are targets; I move them when the class needs more or less time.</p>
<table class="pacing"><thead><tr><th>Topic</th><th>Lessons (due)</th><th>Topic test</th></tr></thead><tbody>
${pacingRows(period)}
</tbody></table>
<p>Quarters close ${quarters}</p>
<h2>Where to look</h2>
<p>Schoology: the OneNote notebook link, the class packet, the week's IXL focus folder, this syllabus, and your grades.</p>
<p>The Algebra 2 Desk is the class website. We are not using it yet; I will walk you through signing in when we start.</p>
<p>Families: message me through ParentSquare.</p>
<nav aria-label="Syllabus actions"><button type="button" onclick="window.print()">Print syllabus</button></nav>
</main></body>
</html>
`;
}

const check = process.argv.includes('--check');
let stale = false;
for (const period of Object.keys(year.periods)) {
  const url = outDir ? `${outDir}/syllabus-${period.toLowerCase()}.html` : new URL(`../syllabus-${period.toLowerCase()}.html`, import.meta.url);
  const html = page(period);
  if (check) {
    let current = '';
    try { current = readFileSync(url, 'utf8'); } catch {}
    if (current !== html) { stale = true; console.error(`syllabus-${period.toLowerCase()}.html is stale`); }
  } else writeFileSync(url, html);
}
source.window.close();
if (stale) process.exit(1);

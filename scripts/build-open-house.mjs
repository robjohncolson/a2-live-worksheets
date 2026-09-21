import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// Keep policy copy in Start Here. This script only chooses and lays out that copy.
const source = new JSDOM(readFileSync(new URL('../start-here.html', import.meta.url), 'utf8'));
const doc = source.window.document;
const sections = [...doc.querySelectorAll('section')];
const averageDay = sections.find(section => section.querySelector('h2')?.textContent === 'An average day').innerHTML.split('</h2>')[1].trim();
const table = sections.find(section => section.querySelector('h2')?.textContent === 'What gets graded').innerHTML.split('</h2>')[1].trim();
const gradeParagraphs = doc.querySelectorAll('#how-your-grade p');
const formula = gradeParagraphs[0].textContent.split('. ')[0] + '.';
const gradeSentences = gradeParagraphs[1].textContent.match(/[^.]+\.(?:\s|$)/g).map(sentence => sentence.trim());
const minimums = gradeSentences[0];
const liveGrade = [gradeSentences[1], gradeSentences[3], gradeSentences[4]].join(' ');
const firstWeeks = sections.find(section => section.querySelector('h2')?.textContent === 'The first two weeks').querySelector('p').outerHTML;
const bonus = doc.querySelector('#bonus p').outerHTML;
const dates = sections.find(section => section.querySelector('h2')?.textContent === 'Dates').querySelector('p').textContent.split('Quarters close ')[1];
const deskButton = doc.querySelector('nav a[href="desk.html"]').outerHTML;

const html = `<!DOCTYPE html>
<!-- Generated from start-here.html. Regenerate whenever Start Here changes:
     node scripts/build-open-house.mjs -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Algebra 2 — how the class and the grade work</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; background: #fff; font: 10pt/1.3 Arial, sans-serif; }
  main { max-width: 7.3in; margin: 24px auto; padding: 0 12px; }
  h1 { font-size: 19pt; line-height: 1.15; margin: 0 0 12px; }
  h2 { font-size: 11pt; margin: 0 0 5px; }
  p { margin: 9px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9.5pt; }
  th, td { border: 1px solid #777; padding: 6px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  th:first-child { width: 19%; }
  th:nth-child(2) { width: 17%; }
  th:nth-child(3) { width: 14%; }
  aside { border: 1px solid #777; padding: 9px 11px; margin-top: 12px; }
  aside p { margin: 5px 0; }
  nav { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .btn, button { color: #111; background: #eee; border: 1px solid #777; border-radius: 4px; padding: 8px 12px; font: inherit; text-decoration: none; cursor: pointer; }
  @media print {
    main { max-width: none; margin: 0; padding: 0; }
    nav, button { display: none !important; }
    table, tr, aside { break-inside: avoid; }
    a::after { content: none !important; }
  }
</style>
</head>
<body><main>
<h1>Algebra 2 — how the class and the grade work</h1>
${averageDay}
${table}
<p>${formula} ${minimums}</p>
<p>${liveGrade}</p>
${firstWeeks}
${bonus}
<p>Quarters close ${dates}</p>
<aside aria-labelledby="where-to-look">
<h2 id="where-to-look">Where to look</h2>
<p>The Desk: students sign in with a username and PIN on their Chromebook.</p>
<p>Schoology: the OneNote notebook link and grades.</p>
<p>Questions: ask me at Open House or message through ParentSquare</p>
</aside>
<nav aria-label="Handout actions">${deskButton}<button type="button" onclick="window.print()">Print handout</button></nav>
</main></body>
</html>
`;

writeFileSync(new URL('../open-house.html', import.meta.url), html);
source.window.close();

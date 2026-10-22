// @vitest-environment node
// The nightly "Tomorrow" draft (FABLE_SPRINT_2026_10_22D_SPEC D0) on a synthetic fixture tree:
// tests/fixtures/a2/tomorrow/ (no student names; the real roster-local/ is gitignored and
// never read here). Pins: deterministic output; the "never invented" rule (every Do Now
// resolves to an assigned IXL code in the skill map or a numbered packet item in the lesson
// prep); the Do Now rule order; negated clauses in the day log; the CLI.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { draftSection, latestSummary, lessonFor, loadInputs, nextClassDay, noteText, parseArgs } from '../scripts/draft-tomorrow.mjs';

const A2Tomorrow = globalThis.A2Tomorrow;
const ROOT = resolve('tests/fixtures/a2/tomorrow');
const inputs = loadInputs(ROOT);
const skillMap = JSON.parse(readFileSync(join(ROOT, 'data/ixl-algebra2-skills.json'), 'utf8'));
const prep = JSON.parse(readFileSync(join(ROOT, 'content/a2/lesson-prep.json'), 'utf8'));

// The "never invented" rule, as the spec states it.
function expectResolvable(doNow, lesson) {
  const jam = doNow.text.match(/^Group Jam: ([0-9A-Z]{3}) .+ \((https?:\/\/\S+)\)$/);
  const packet = doNow.text.match(/^Packet: (?:Example (\d+)|practice item (\d+))/);
  expect(jam || packet, doNow.text).toBeTruthy();
  if (jam) {
    expect(skillMap.skills.map(s => s.code)).toContain(jam[1]);
    expect(inputs.lessonSkills.lessons[lesson].map(s => s.code)).toContain(jam[1]);
    return;
  }
  const entry = prep.lessons[lesson];
  if (packet[1]) expect(entry.examples.filter(e => e.keep).map(e => e.n)).toContain(Number(packet[1]));
  if (packet[2]) expect(entry.dok3.item).toBe(Number(packet[2]));
}

describe('draft-tomorrow: dates and the lesson of the day', () => {
  it('parses --date / --section and defaults to tomorrow', () => {
    expect(parseArgs([], '2026-10-22')).toMatchObject({ date: '2026-10-23', sections: ['C', 'D', 'G'] });
    expect(parseArgs(['--date', '2026-10-26', '--section', 'G'])).toMatchObject({ date: '2026-10-26', sections: ['G'] });
    expect(() => parseArgs(['--date', 'tomorrow'])).toThrow('--date');
    expect(() => parseArgs(['--section', 'B'])).toThrow('--section');
    expect(() => parseArgs(['--bogus', 'x'])).toThrow('unknown argument');
  });

  it('skips to the section\'s next meeting day (C does not meet Friday, nobody meets on a closure)', () => {
    expect(nextClassDay(inputs.year, 'C', '2026-10-23')).toBe('2026-10-26');
    expect(nextClassDay(inputs.year, 'D', '2026-10-23')).toBe('2026-10-23');
    expect(nextClassDay(inputs.year, 'G', '2026-10-23')).toBe('2026-10-23');
    expect(nextClassDay(inputs.year, 'C', '2026-10-12')).toBe('2026-10-13'); // Indigenous Peoples' Day
    expect(nextClassDay(inputs.year, 'C', '2027-07-01')).toBeNull();
  });

  it('takes the lesson from the day log, else the year plan window, else the last logged lesson', () => {
    expect(lessonFor(inputs, 'C', '2026-10-26')).toEqual({ key: '9-1', source: 'day log' });
    expect(lessonFor(inputs, 'G', '2026-10-27')).toEqual({ key: '9-2', source: 'year plan' });
    const noPlan = { ...inputs, plan: { lessons: [], assessments: {} } };
    expect(lessonFor(noPlan, 'G', '2026-10-27')).toEqual({ key: '9-1', source: 'last logged' });
    expect(lessonFor(noPlan, 'D', '2026-09-10')).toBeNull();
  });

  it('uses the latest recording summary before the class day', () => {
    expect(latestSummary(inputs.summaries, 'C', '2026-10-26').date).toBe('2026-10-22');
    expect(latestSummary(inputs.summaries, 'C', '2026-10-20').date).toBe('2026-10-19');
    expect(latestSummary(inputs.summaries, 'G', '2026-10-23')).toBeNull();
  });
});

describe('draft-tomorrow: reading the day log', () => {
  it('reads example numbers, ranges and practice items from a clause', () => {
    expect(A2Tomorrow.exampleNumbers('Examples 4 and 5 both shown')).toEqual([4, 5]);
    expect(A2Tomorrow.exampleNumbers('Examples 1-3 shown; Ex 5 later')).toEqual([1, 2, 3, 5]);
    expect(A2Tomorrow.itemNumbers('practice item 9 started; items 3 and 4 done')).toEqual([9, 3, 4]);
  });

  it('counts a Jam, an example or an item only in a clause that is not negated', () => {
    const entries = [{ date: '2026-10-22', text: 'Example 2 shown. Web Jam BB2 only; CC3 not reached. Example 3 moves to Monday.' }];
    const d = A2Tomorrow.done(entries, ['BB2', 'CC3']);
    expect(d.skills).toEqual({ BB2: '2026-10-22' });
    expect(d.examples).toEqual({ 2: '2026-10-22' });
  });

  it('reads a past day that has only a plan as unconfirmed evidence', () => {
    const past = A2Tomorrow.landed(inputs.dayLog, 'C', '9-1', '2026-10-26');
    expect(past.map(e => [e.date, e.unconfirmed])).toEqual([['2026-10-19', false], ['2026-10-20', true], ['2026-10-22', false]]);
  });

  it('orders the assigned skills core-by-example then prerequisites, and ignores codes the prep only proposes', () => {
    const skills = A2Tomorrow.assignedSkills(inputs.lessonSkills.lessons['9-1']);
    expect(skills.map(s => s.code)).toEqual(['AA1', 'BB2', 'CC3', 'PP0']);
    expect(skills.map(s => s.code)).not.toContain('ZZ9');
  });
});

describe('draft-tomorrow: the Do Now rule', () => {
  const skills = A2Tomorrow.assignedSkills(inputs.lessonSkills.lessons['9-1']);
  const lookup = inputs.skillLookup;
  const nothingDone = { skills: {}, examples: {}, items: {} };

  it('is the Jam the day log plan names for that day, when it names an assigned skill', () => {
    const pick = A2Tomorrow.chooseDoNow({ skills, done: nothingDone, prep: prep.lessons['9-1'], skillLookup: lookup, planLine: 'Example 3, then Web Jam CC3.' });
    expect(pick).toMatchObject({ kind: 'jam', code: 'CC3' });
    expect(pick.text).toBe('Group Jam: CC3 Fixture skill three (https://www.ixl.com/math/algebra-2/fixture-skill-three)');
  });

  it('else is the skill tied to the next kept example not yet done', () => {
    const pick = A2Tomorrow.chooseDoNow({ skills, done: { skills: {}, examples: { 1: 'x' }, items: {} }, prep: prep.lessons['9-1'], skillLookup: lookup, planLine: '' });
    expect(pick).toMatchObject({ kind: 'jam', code: 'BB2' });
    expect(pick.text).toBe('Group Jam: BB2 Fixture skill two (https://www.ixl.com/search?q=BB2)'); // no verified page: the search link
  });

  it('else is the first assigned skill not yet jammed, then a kept example, then the DOK 3 item, then nothing', () => {
    const prepEntry = prep.lessons['9-1'];
    const allExamples = { 1: 'x', 2: 'x', 3: 'x' };
    expect(A2Tomorrow.chooseDoNow({ skills, done: { skills: { AA1: 'x', BB2: 'x' }, examples: allExamples, items: {} }, prep: prepEntry, skillLookup: lookup }))
      .toMatchObject({ kind: 'jam', code: 'CC3' });
    const allSkills = { AA1: 'x', BB2: 'x', CC3: 'x', PP0: 'x' };
    expect(A2Tomorrow.chooseDoNow({ skills, done: { skills: allSkills, examples: { 1: 'x' }, items: {} }, prep: prepEntry, skillLookup: lookup }))
      .toMatchObject({ kind: 'packet', example: 2, text: 'Packet: Example 2 (Second kept example)' });
    expect(A2Tomorrow.chooseDoNow({ skills, done: { skills: allSkills, examples: allExamples, items: {} }, prep: prepEntry, skillLookup: lookup }))
      .toMatchObject({ kind: 'packet', item: 9, text: 'Packet: practice item 9 (DOK 3)' });
    expect(A2Tomorrow.chooseDoNow({ skills, done: { skills: allSkills, examples: allExamples, items: { 9: 'x' } }, prep: prepEntry, skillLookup: lookup })).toBeNull();
    expect(A2Tomorrow.chooseDoNow({ skills: [], done: nothingDone, prep: null, skillLookup: lookup })).toBeNull();
  });
});

describe('draft-tomorrow: the notes', () => {
  it('is deterministic and every Do Now resolves to a skill or a packet item (never invented)', () => {
    for (const section of ['C', 'D', 'G']) {
      const a = draftSection(inputs, section, '2026-10-23');
      const b = draftSection(inputs, section, '2026-10-23');
      expect(noteText(a)).toBe(noteText(b));
      expectResolvable(a.doNow, a.lesson);
    }
  });

  it('C on Mon Oct 26: the plan names CC3, Example 3 is left, promises and questions come from the latest recording', () => {
    const note = draftSection(inputs, 'C', '2026-10-23');
    expect(note).toMatchObject({ date: '2026-10-26', lesson: '9-1', dayNumber: 4, lessonSource: 'day log', unconfirmed: ['2026-10-20'] });
    expect(note.doNow).toMatchObject({ kind: 'jam', code: 'CC3', why: 'the Jam named in the day log plan for this day' });
    expect(note.then.map(e => e.n)).toEqual([3]);
    expect(note.jamsLeft).toEqual(['CC3 Fixture skill three', 'PP0 Fixture prerequisite']);
    expect(note).toMatchObject({ quizDate: '2026-10-27', assessmentDate: '2026-11-09', assessmentSource: 'day log', summaryDate: '2026-10-22' });
    expect(note.promises).toEqual(['Quiz on Tuesday', '70 on the IXL skills earns the quiz grade']);
    expect(note.questions).toEqual(['Why is the circle open?']);
    expect(note.left).toEqual(['Example 3 (practice 5, 9)', 'Practice item 9 (DOK 3: Practice 9, Performance Task)']);
    const text = noteText(note);
    expect(text).toContain('# Section C · Monday, Oct 26 · 9-1 Fixture Lesson One · day 4');
    expect(text).toContain('## Do Now\n- Group Jam: CC3 Fixture skill three (https://www.ixl.com/math/algebra-2/fixture-skill-three) — the Jam named in the day log plan for this day');
    expect(text).toContain('- Lesson quiz item 2: Fixture quiz item: match the graph to its rule.');
    expect(text).toContain('- Quiz day: Tuesday, Oct 27');
    expect(text).toContain('- Topic assessment: Monday, Nov 9 (day log)');
    expect(text).toContain('- Promise: Quiz on Tuesday');
    expect(text).toContain('- Asked: Why is the circle open?');
    expect(text).toContain('Read as landed but not confirmed (a plan with no landed note yet): 2026-10-20.');
    expect(text).not.toMatch(/undefined|null|\[object/);
  });

  it('D on Fri Oct 23 (quiz day, every example and Jam done): the Do Now is the first skill not yet jammed; nothing is added', () => {
    const note = draftSection(inputs, 'D', '2026-10-23');
    expect(note).toMatchObject({ date: '2026-10-23', lesson: '9-1', dayNumber: 2, quizDate: '2026-10-23' });
    expect(note.doNow).toMatchObject({ kind: 'jam', code: 'CC3', why: 'first assigned IXL skill not yet jammed' });
    expect(note.then).toEqual([]);
    expect(note.left).toEqual([]);
    expect(note.summaryDate).toBe('2026-10-21');
    const text = noteText(note);
    expect(text).toContain('- Every kept example is in the day log.');
    expect(text).toContain('- Nothing: every kept item is in the day log.');
    expect(text).toContain('- The summary lists no promises or student questions.');
    expect(text).toContain('- Topic assessment: Monday, Nov 9 (year plan)');
  });

  it('G with no recording and no day-log entry for the day: says so and takes the lesson from the year plan', () => {
    const note = draftSection(inputs, 'G', '2026-10-23');
    expect(note).toMatchObject({ date: '2026-10-23', lesson: '9-1', lessonSource: 'year plan', summaryDate: null, planLine: '' });
    expect(note.doNow).toMatchObject({ kind: 'jam', code: 'AA1', why: 'IXL skill for Example 1, the next kept example' });
    const text = noteText(note);
    expect(text).toContain('*Lesson taken from the year plan; the day log has no entry for this day.*');
    expect(text).toContain('- No recording summary for this section.');
    expect(text).toContain('- Quiz day: not in the day log');
  });

  it('a lesson without a lesson-prep entry never invents examples or a quiz focus', () => {
    const note = draftSection(inputs, 'G', '2026-10-27');
    expect(note).toMatchObject({ lesson: '9-2', hasPrep: false, quizTarget: null, then: [], left: [] });
    expect(note.doNow).toMatchObject({ kind: 'jam', code: 'CC3', why: 'first assigned IXL skill not yet jammed' });
    const text = noteText(note);
    expect(text).toContain('- No lesson-prep entry for 9-2 (content/a2/lesson-prep.json); kept examples unknown.');
    expect(text).toContain('- No quiz focus in the lesson prep for 9-2.');
    expect(text).toContain('- Unknown until 9-2 has a lesson-prep entry.');
  });

  it('renders the note into a Desk fold as labelled lines', () => {
    const note = draftSection(inputs, 'C', '2026-10-23');
    const doc = { createElement: tag => ({ tag, children: [], set textContent(t) { this.text = t; }, get textContent() { return this.text; } }) };
    const fold = { firstChild: { summary: true }, lastChild: null, children: [], appendChild(node) { this.children.push(node); this.lastChild = node; }, removeChild() {} };
    fold.lastChild = fold.firstChild;
    A2Tomorrow.render(doc, fold, note);
    const lines = fold.children.map(c => c.text);
    expect(lines[0]).toContain('Day log plan: Example 3');
    expect(lines).toContain('Do Now');
    expect(lines).toContain('Group Jam: CC3 Fixture skill three (https://www.ixl.com/math/algebra-2/fixture-skill-three) — the Jam named in the day log plan for this day');
    expect(lines.some(l => l.startsWith('#'))).toBe(false);
  });
});

describe('draft-tomorrow: the CLI', () => {
  it('writes <out>/<date>-<section>.md for each section and prints the notes', () => {
    const out = mkdtempSync(join(tmpdir(), 'a2-tomorrow-'));
    try {
      const stdout = execFileSync(process.execPath, ['scripts/draft-tomorrow.mjs', '--root', ROOT, '--date', '2026-10-23', '--out', out], { encoding: 'utf8' });
      expect(stdout).toContain('# Section C · Monday, Oct 26');
      expect(stdout).toContain('# Section D · Friday, Oct 23');
      expect(stdout).toContain('# Section G · Friday, Oct 23');
      for (const name of ['2026-10-26-C.md', '2026-10-23-D.md', '2026-10-23-G.md']) expect(existsSync(join(out, name)), name).toBe(true);
      expect(readFileSync(join(out, '2026-10-26-C.md'), 'utf8')).toBe(noteText(draftSection(inputs, 'C', '2026-10-23')));
      const one = execFileSync(process.execPath, ['scripts/draft-tomorrow.mjs', '--root', ROOT, '--date', '2026-10-23', '--section', 'G', '--out', out], { encoding: 'utf8' });
      expect(one).not.toContain('Section C');
      expect(one).toContain('Section G');
    } finally { rmSync(out, { recursive: true, force: true }); }
  });

  it('the Desk loads the library, precaches it, and fills a "Tomorrow (draft)" fold in the teacher day panel', () => {
    const desk = readFileSync('desk.html', 'utf8');
    expect(desk).toContain('<script src="lib/class-log-deck.js"></script><script src="lib/a2-tomorrow.js"></script>');
    expect(desk).toContain("fold('Tomorrow (draft)')");
    expect(desk).toMatch(/window\.A2Tomorrow\.fill\(window, tmr, \{ date: isoDate, section: section, lesson: key/);
    expect(readFileSync('sw.js', 'utf8')).toContain("'lib/a2-tomorrow.js',");
    const batch = readFileSync('tools/nightly_tomorrow.ps1', 'utf8');
    expect(batch).toMatch(/npm\.cmd run pull-summaries[\s\S]*scripts\\draft-tomorrow\.mjs/);
    expect(batch).toContain("Join-Path $repo 'roster-local\\tomorrow'");
    expect(batch).toContain("Join-Path $outDir 'log.txt'");
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts['pull-summaries']).toBe('node scripts/pull-class-summaries.mjs');
  });

  it('the fixture tree carries no roster names and the real roster-local/ is gitignored', () => {
    const fixtureText = ['content/a2/day-log.json', 'roster-local/class-summaries/index.json'].map(p => readFileSync(join(ROOT, p), 'utf8')).join('\n');
    expect(fixtureText).not.toMatch(/\b(Carelys|Jamaal|Cristofer|Fatima|Ronaldo|Shirley)\b/);
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^roster-local\/$/m);
  });
});

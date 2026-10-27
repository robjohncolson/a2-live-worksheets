// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { teacherCardFor } from '../scripts/lib/teacher-brief.mjs';
import { buildCards } from '../scripts/push-observer-cards.mjs';

const routine = Object.freeze({ title: 'Explain the step function', mode: 'pairs', minutes: 10,
  frame: 'On the interval ___, the output is ___.', body: '## Interacting\nExample 5: shipping in pairs.' });
const brief = Object.freeze({ title: 'Finish piecewise rules', ixl: Object.freeze(['RVD: Evaluate a piecewise function']),
  lastClass: 'Planned recap: the shipping example was completed.',
  today: Object.freeze(['Finish the packet.', 'Evaluate the shipping rule.']), next: 'Quiz at the next meeting.' });
const entry = Object.freeze({ date: '2035-10-23', section: 'C', lesson: '1-3', observerCard: routine, teacherBrief: brief });
const continuity = Object.freeze({ sourceDate: '2035-10-22', recordedAt: '2035-10-22T15:00:00Z',
  landed: Object.freeze(['Packet parts A and B were completed.', 'Part C was unfinished.']),
  promises: Object.freeze(['Revisit the remaining interval.']),
  nextPrep: Object.freeze(['Planned shipping example was not heard; the class worked on the earlier graph.']),
  questions: Object.freeze(['Does the open point count? (No; it belongs to the other piece.)']),
});
const summary = Object.freeze({ date: continuity.sourceDate, course: 'algebra2', section: 'C',
  recordedAt: continuity.recordedAt, landed: continuity.landed, promises: continuity.promises,
  nextPrep: continuity.nextPrep, studentQuestions: continuity.questions });
const script = fileURLToPath(new URL('../scripts/push-observer-cards.mjs', import.meta.url));
const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function temporaryDirectory() {
  const directory = mkdtempSync(resolve(tmpdir(), 'summary-card-'));
  directories.push(directory);
  return directory;
}

async function runCli(arguments_) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...arguments_], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolveRun({ code, stdout, stderr }));
  });
}

describe('summary evidence in teacher cards', () => {
  it('does not preserve an earlier completion claim when a recording contains only follow-ups', () => {
    const { body } = teacherCardFor(entry, { continuity: { ...continuity, landed: [] } });
    expect(body).not.toContain('shipping example was completed');
    expect(body).toContain('Planned shipping example was not heard');
    expect(body).toContain('## Today');
  });

  it('replaces the planned recap with dated recording evidence and keeps the authored plan unchanged', () => {
    const before = JSON.stringify({ entry, continuity });
    const card = teacherCardFor(entry, { continuity });
    expect(card.body).toMatch(/^## IXL drills\nRVD: Evaluate a piecewise function/);
    expect(card.body).toContain(`## Last recording (${continuity.sourceDate})`);
    for (const line of continuity.landed) expect(card.body).toContain(line);
    expect(card.body).not.toContain('Planned recap:');
    expect(card.body).toContain('## Today\n1. Finish the packet.\n\n2. Evaluate the shipping rule.');
    expect(card.body).toContain('## Next\nQuiz at the next meeting.');
    expect(card).toMatchObject({ title: brief.title, mode: routine.mode, minutes: routine.minutes, frame: null });
    expect(JSON.stringify({ entry, continuity })).toBe(before);
    expect(entry.observerCard).toBe(routine);
    expect(entry.teacherBrief.lastClass).toContain('shipping example was completed');
  });

  it('keeps not-heard qualifications and distinguishes promises to check from previously answered questions', () => {
    const { body } = teacherCardFor(entry, { continuity });
    expect(body).toContain(`Promise to check: ${continuity.promises[0]}`);
    expect(body).toContain(`Follow-up: ${continuity.nextPrep[0]}`);
    expect(body).toContain(`Previously asked: ${continuity.questions[0]}`);
    expect(body).not.toMatch(/unresolved|still outstanding|unanswered/i);
    expect(body).not.toContain('Follow-up: Planned shipping example was not heard\n');
  });

  it('adds a recording handoff to a detailed routine without changing its activity or frame', () => {
    const detailed = { ...entry, teacherBrief: undefined };
    const card = teacherCardFor(detailed, { continuity });
    expect(card.body).toContain(routine.body);
    expect(card.body).toContain(`## Last recording (${continuity.sourceDate})`);
    expect(card.frame).toBe(routine.frame);
    expect(card.title).toBe(routine.title);
    expect(routine.body).toBe('## Interacting\nExample 5: shipping in pairs.');
    expect(teacherCardFor(detailed)).toBe(routine);
  });

  it('fits the Android limit by keeping complete source lines and links back when evidence does not fit', () => {
    const tooLarge = 'FULL-LINE-START ' + 'complete mathematical explanation '.repeat(100) + ' FULL-LINE-END';
    const qualified = 'The next activity was not heard; its completion remains unconfirmed.';
    const many = { ...continuity, landed: ['A short recap.'], nextPrep: [tooLarge, qualified],
      promises: ['Check the promised explanation.'], questions: ['Endpoint reasoning \u{1F4AD} '.repeat(40).trim()] };
    const { body } = teacherCardFor(entry, { continuity: many });
    expect(body.length).toBeLessThanOrEqual(2000);
    expect(body).toContain(qualified);
    expect(body).not.toContain('FULL-LINE-START');
    expect(body).not.toContain('FULL-LINE-END');
    expect(body).toContain(`More context in the ${continuity.sourceDate} class summary.`);
    const observed = body.split('\n\n').filter(block => /^(?:Promise to check|Follow-up|Previously asked): /.test(block));
    const complete = new Set([
      ...many.promises.map(line => `Promise to check: ${line}`),
      ...many.nextPrep.map(line => `Follow-up: ${line}`),
      ...many.questions.map(line => `Previously asked: ${line}`),
    ]);
    for (const paragraph of observed) expect(complete.has(paragraph)).toBe(true);
  });

  it('fails clearly when no complete evidence line can fit rather than silently truncating a handoff', () => {
    const tooLarge = 'One indivisible source line '.repeat(100);
    expect(() => teacherCardFor(entry, { continuity: { ...continuity,
      landed: [tooLarge], promises: [], nextPrep: [], questions: [],
    } })).toThrow(/room for the recording handoff/);
  });
});

describe('summary selection in card publication', () => {
  it('keeps C and D evidence, source dates, and target-date filtering separate', () => {
    const entries = [entry, { ...entry, section: 'D' }, { ...entry, date: '2035-10-24' }];
    const summaries = [summary, { ...summary, section: 'D', landed: ['D finished its quiz.'], promises: [], nextPrep: [], studentQuestions: [] },
      { ...summary, course: 'apstats', landed: ['Other course evidence'] },
      { ...summary, date: entry.date, landed: ['Same-day evidence must wait'] }];
    const before = JSON.stringify({ entries, summaries });
    const cards = buildCards({ entries }, { date: entry.date, summaries });
    expect(cards.map(card => `${card.date}/${card.section}`)).toEqual([`${entry.date}/C`, `${entry.date}/D`]);
    expect(cards[0].body).toContain('Part C was unfinished.');
    expect(cards[0].body).not.toContain('D finished its quiz.');
    expect(cards[1].body).toContain('D finished its quiz.');
    expect(cards[1].body).not.toContain('Part C was unfinished.');
    for (const card of cards) {
      expect(card.body).not.toContain('Other course evidence');
      expect(card.body).not.toContain('Same-day evidence must wait');
    }
    expect(buildCards({ entries }, { date: entry.date, section: 'D', summaries })).toEqual([cards[1]]);
    expect(JSON.stringify({ entries, summaries })).toBe(before);
  });

  it('ignores malformed cards in other sections during a targeted push', () => {
    const entries = [
      { ...entry, section: 'D', date: 'not-a-date', teacherBrief: {} },
      { ...entry, section: 'G', observerCard: 'malformed', teacherBrief: {} },
      entry,
    ];
    const cards = buildCards({ entries }, { date: entry.date, section: 'C', summaries: [summary] });
    expect(cards).toHaveLength(1);
    expect(cards[0].section).toBe('C');
    expect(cards[0].body).toContain('Part C was unfinished.');
    expect(() => buildCards({ entries }, { section: 'D', summaries: [summary] })).toThrow(/date/);
  });

  it('keeps custom CLI day logs isolated until their summary index is explicitly supplied', async () => {
    const directory = temporaryDirectory();
    const dayLog = resolve(directory, 'day-log.json');
    const index = resolve(directory, 'index.json');
    writeFileSync(dayLog, JSON.stringify({ entries: [entry] }));
    writeFileSync(index, JSON.stringify([summary]));
    const received = [];
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        received.push({ method: request.method, path: request.url, cards: JSON.parse(body) });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ written: 1, unchanged: 0 }));
      });
    });
    await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveReady); });
    try {
      const args = ['--file', dayLog, '--date', entry.date, '--section', 'C', '--secret', 'fixture-only-secret',
        '--server', `http://127.0.0.1:${server.address().port}`];
      const without = await runCli(args);
      const withSummary = await runCli([...args, '--summaries', index]);
      expect(without, without.stderr).toMatchObject({ code: 0 });
      expect(withSummary, withSummary.stderr).toMatchObject({ code: 0 });
      expect(received).toHaveLength(2);
      expect(received.every(row => row.method === 'PUT' && row.path === '/teacher/cards')).toBe(true);
      expect(received[0].cards[0].body).toContain(brief.lastClass);
      expect(received[0].cards[0].body).not.toContain('## Last recording');
      expect(received[1].cards[0].body).toContain(`## Last recording (${summary.date})`);
      expect(received[1].cards[0].body).toContain('Part C was unfinished.');
      expect(received[1].cards[0].body).not.toContain(brief.lastClass);
      expect(without.stdout + without.stderr + withSummary.stdout + withSummary.stderr).not.toContain('fixture-only-secret');
    } finally {
      server.closeAllConnections();
      await new Promise(resolveClosed => server.close(resolveClosed));
    }
  }, 15_000);
});

// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { appendContinuityCues, continuityCueId, continuityCues, continuityForTarget } from '../scripts/lib/continuity-deck.mjs';
import { selectDeck } from '../scripts/lib/tree-deck.mjs';
import { normalizeItems } from '../scripts/draft-card-decks.mjs';
import { deckContentHash, itemId, validateItems } from '../roster-server/deck-rules.js';

const date = '2026-10-27';
const summary = { date: '2026-10-26', course: 'algebra2', section: 'C', recordedAt: '2026-10-26T18:00:00Z',
  landed: ['Example 3: first two pieces completed; final piece not reached.'],
  promises: ['Return to the endpoint question before the quiz.'],
  nextPrep: ['Bring the parking-cost table.'], studentQuestions: ['Why is the left endpoint open?'] };
const continuity = { sourceDate: summary.date, recordedAt: summary.recordedAt,
  landed: summary.landed, promises: summary.promises, nextPrep: summary.nextPrep, questions: summary.studentQuestions };
const CARD_C = '11111111-1111-4111-8111-111111111111';
const card = { title: 'Examples 3 and 5', mode: 'whiteboards', minutes: 12, frame: null, body: 'Example 3 and Example 5, then compare the intervals.' };
const entry = { date, section: 'C', lesson: '1-3', observerCard: card };
const target = { sections: ['C'], cardId: CARD_C, lesson: '1-3' };
const id = number => String(number).padStart(12, '0');

function teachingTree() {
  const node = (number, type, source, after = [], teaching) => ({
    id: id(number), type, source, front: `Question ${number}?`, back: `Complete answer ${number}.`,
    order: number, after, minute: type === 'step' ? 4 : null, ...(teaching ? { teaching } : {}),
  });
  return { lesson: '1-3', title: 'Piecewise functions', nodes: [
    node(1, 'frame', 'objectives.essentialQuestion'),
    node(2, 'anchor', 'quizFocus.what', [id(1)]),
    node(3, 'anchor', 'quizFocus.answer', [id(1)]),
    node(4, 'anchor', 'quizFocus.needs[0]', [id(2)]),
    node(5, 'anchor', 'quizFocus.needs[1]', [id(2)]),
    node(6, 'anchor', 'objectives.language.words.interval', [id(1)]),
    node(7, 'anchor', 'objectives.language.words.piece', [id(1)]),
    node(8, 'anchor', 'dok3.task', [id(1)]),
    node(9, 'anchor', 'ixl.RVD', [id(1)]),
    node(10, 'step', 'examples[n=3]', [id(1)]),
    node(11, 'step', 'examples[n=5]', [id(10)]),
    node(12, 'cue', 'examples[n=3].teacherPrompts.q0.part0', [id(10)], { promptKey: 'ex3-q0' }),
    node(13, 'cue', 'examples[n=3].teacherPrompts.q0.part1', [id(12)], { promptKey: 'ex3-q0' }),
    node(14, 'cue', 'examples[n=3].teacherPrompts.q1', [id(10)], { promptKey: 'ex3-q1' }),
    node(15, 'cue', 'examples[n=5].teacherPrompts.q0.part0', [id(11)], { promptKey: 'ex5-q0' }),
    node(16, 'cue', 'examples[n=5].teacherPrompts.q0.part1', [id(15)], { promptKey: 'ex5-q0' }),
    node(17, 'cue', 'examples[n=5].teacherPrompts.q0.part2', [id(16)], { promptKey: 'ex5-q0' }),
  ] };
}

describe('daily continuity cues', () => {
  it('makes three dated section cues with complete evidence and no mastery metadata', () => {
    const cues = continuityCues({ continuity, section: 'C', date });
    expect(cues).toHaveLength(3);
    expect(cues.every(cue => cue.front.includes('C 2026-10-27 | recording 2026-10-26'))).toBe(true);
    expect(cues.every(cue => !Object.hasOwn(cue, 'node') && !Object.hasOwn(cue, 'lesson'))).toBe(true);
    expect(cues[0].back).toContain('final piece not reached.');
    expect(cues[1].back).toBe(summary.promises[0]);
    expect(cues[2].back).toBe('Prep: Bring the parking-cost table.\nQuestion: Why is the left endpoint open?');
    expect(cues.every(cue => cue.id === continuityCueId(cue.front, cue.back))).toBe(true);
    expect(continuityCues({ continuity, section: 'C', date })).toEqual(cues);
    expect(continuityCues({ continuity, section: 'C', date: '2026-10-28' })[0].id).not.toBe(cues[0].id);
  });

  it('changes the daily streak id when a source answer is corrected and preserves saved replay ids', () => {
    const cues = continuityCues({ continuity, section: 'C', date });
    const corrected = continuityCues({ continuity: { ...continuity, promises: ['Return to the endpoint question after the quiz.'] }, section: 'C', date });
    expect(corrected[1].front).toBe(cues[1].front);
    expect(corrected[1].id).not.toBe(cues[1].id);
    expect(corrected[0].id).toBe(cues[0].id);
    const model = Array.from({ length: 8 }, (_, i) => ({ type: 'anchor', front: `Fact ${i}?`, back: `Answer ${i}`, after: [] }));
    const items = normalizeItems([...cues, ...model]);
    expect(items.slice(0, 3)).toEqual(cues);
    expect(normalizeItems(JSON.parse(JSON.stringify(items)))).toEqual(items);
    const edited = items.map(item => item.id === cues[1].id ? { ...item, back: corrected[1].back } : item);
    expect(normalizeItems(edited)[1].id).toBe(corrected[1].id);
    const ordinary = { ...cues[1], id: 'ordinary_cue' };
    const ordinaryItems = normalizeItems([ordinary, ...model]);
    expect(ordinaryItems[0].id).toBe(itemId('cue', ordinary.front));
    expect(ordinaryItems[0].id).not.toMatch(/^daily_/);
  });

  it('keeps supplementary Unicode within Android UTF-16 limits without cutting source lines', () => {
    const overPhoneLimit = '\u{1F4D0}'.repeat(161);
    const exactPhoneLimit = '\u{1F4D0}'.repeat(160);
    const cues = continuityCues({ continuity: { ...continuity, landed: [overPhoneLimit, 'Final piece not reached.'],
      promises: [exactPhoneLimit], nextPrep: [], questions: [] }, section: 'C', date });
    expect(cues).toHaveLength(2);
    expect(cues[0].back).toContain('Final piece not reached.');
    expect(cues[0].back).not.toContain('\u{1F4D0}');
    expect(cues[1].back).toBe(exactPhoneLimit);
    expect(cues.every(cue => cue.back.length <= 320 && cue.front.length <= 240)).toBe(true);
    expect(continuityCues({ continuity: { ...continuity, landed: [overPhoneLimit], promises: [], nextPrep: [], questions: [] }, section: 'C', date })).toEqual([]);
    const model = Array.from({ length: 8 }, (_, i) => ({ type: 'anchor', front: `Fact ${i}?`, back: `Answer ${i}`, after: [] }));
    expect(() => normalizeItems([{ ...cues[0], back: overPhoneLimit }, ...model])).toThrow(/320 UTF-16 units/);
    expect(() => normalizeItems([{ ...cues[0], front: '\u{1F4D0}'.repeat(121) }, ...model])).toThrow(/240 UTF-16 units/);
  });

  it('never cuts a long line or a negating qualifier, and deduplicates across fields', () => {
    const long = 'Example 5 was discussed '.repeat(20) + 'but not completed.';
    const cues = continuityCues({ continuity: { ...continuity, landed: [long, 'Example 3 not finished.'],
      promises: ['Bring the table.', 'bring the table.'], nextPrep: ['Bring the table.'], questions: [] }, section: 'C', date });
    expect(cues).toHaveLength(2);
    expect(cues[0].back).toContain('Example 3 not finished.');
    expect(cues[0].back).not.toContain('Example 5 was discussed');
    expect(cues[1].back).toBe('Bring the table.');
    expect(cues.every(cue => [...cue.back].length <= 320)).toBe(true);
    expect(continuityCues({ continuity: { ...continuity, landed: [long], promises: [], nextPrep: [], questions: [] }, section: 'C', date })).toEqual([]);
  });

  it('isolates summaries by source section/date and refuses course-wide or merged targets', () => {
    const summaries = [summary, { ...summary, section: 'D', landed: ['D only'] }, { ...summary, date, landed: ['Same day'] }];
    const args = { target, entries: [entry], serverCards: [{ id: CARD_C, section: 'C', course: 'algebra2' }], summaries, date };
    expect(continuityForTarget(args)).toMatchObject({ sourceDate: summary.date, landed: summary.landed });
    expect(continuityForTarget({ ...args, target: { ...target, sections: ['C', 'G'] } })).toBeNull();
    expect(continuityForTarget({ ...args, target: { ...target, sections: ['all'] } })).toBeNull();
    expect(continuityForTarget({ ...args, serverCards: [{ id: CARD_C, section: null, course: 'algebra2' }] })).toBeNull();
    expect(continuityCues({ continuity, section: 'all', date })).toEqual([]);
    expect(continuityCues({ continuity, section: 'C', date: summary.date })).toEqual([]);
  });

  it('reserves three slots without losing six TE items or splitting multipart prompts', () => {
    const tree = teachingTree();
    const cues = continuityCues({ continuity, section: 'C', date });
    const args = { trees: { '1-3': tree }, lessons: ['1-3'], card, date, sections: ['C'] };
    expect(selectDeck(args)).toEqual(selectDeck({ ...args, maxItems: 14 }));
    const chosen = selectDeck({ ...args, maxItems: 14 - cues.length });
    expect(chosen.items).toHaveLength(11);
    expect(chosen.tiers.te).toBe(6);
    expect(chosen.items.filter(item => [12, 13, 14, 15, 16, 17].map(id).includes(item.node))).toHaveLength(6);
    const items = normalizeItems(appendContinuityCues(chosen.items, cues));
    expect(items).toHaveLength(14);
    expect(items.slice(0, 3).every(item => !item.node)).toBe(true);
    expect(items.slice(3).every(item => item.node && item.id === item.node)).toBe(true);
    expect(validateItems(items)).toEqual(items);
    expect(normalizeItems(items)).toEqual(items);
    expect(appendContinuityCues(items, cues)).toEqual(items);
    expect(deckContentHash(items, 'lesson-tree')).toBe(deckContentHash(normalizeItems(items), 'lesson-tree'));
    expect(() => selectDeck({ ...args, maxItems: 7 })).toThrow(/maxItems/);
  });

  it('caps model decks while lifting edges past removed items, and rejects tree trimming after selection', () => {
    const cues = continuityCues({ continuity, section: 'C', date });
    const model = normalizeItems(Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, type: 'anchor',
      front: `Model fact ${i}?`, back: `Value ${i}`, after: i === 0 ? ['k11'] : i === 11 ? ['k1'] : [], minute: null })));
    const items = normalizeItems(appendContinuityCues(model, cues));
    expect(items).toHaveLength(14);
    expect(items.find(item => item.id === model[0].id).after).toEqual([model[1].id]);
    expect(items.some(item => item.id === model[11].id)).toBe(false);
    expect(appendContinuityCues(model, [])).toBe(model);
    expect(() => appendContinuityCues(model.map(item => ({ ...item, node: item.id })), cues)).toThrow(/reserve daily cue space/);
  });
});

const folders = [];
const servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise(resolve => server.close(resolve));
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const script = fileURLToPath(new URL('../scripts/draft-card-decks.mjs', import.meta.url));

function run(args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('DRAFT_')
    && !['ROSTER_TEACHER_SECRET', 'TEACHER_KEY', 'ROSTER_SERVICE_URL'].includes(key)));
  const child = spawn(process.execPath, [script, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  return new Promise(resolve => child.on('close', code => resolve({ code, output })));
}

async function setup({ shared = false } = {}) {
  const puts = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', data => { body += data; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url.startsWith('/teacher/cards')) return res.end(JSON.stringify({ cards: [{ ...card, id: CARD_C, course: 'algebra2', section: shared ? null : 'C', lesson: '1-3' }] }));
      if (req.url.startsWith('/teacher/mastery')) return res.end(JSON.stringify({ rows: [] }));
      if (req.url.endsWith('/chat/completions')) {
        const items = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, type: 'anchor', front: `Model fact ${i}?`, back: `Value ${i}`, after: [], minute: null }));
        return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items }) } }] }));
      }
      if (req.method === 'PUT') { puts.push(JSON.parse(body)); return res.end(JSON.stringify({ written: 1, unchanged: 0 })); }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const root = mkdtempSync(resolve(tmpdir(), 'continuity-deck-'));
  folders.push(root);
  const url = `http://127.0.0.1:${server.address().port}`;
  mkdirSync(resolve(root, 'lesson-trees'));
  mkdirSync(resolve(root, 'no-trees'));
  writeFileSync(resolve(root, 'lesson-trees/1-3.json'), JSON.stringify(teachingTree()));
  writeFileSync(resolve(root, 'day-log.json'), JSON.stringify({ entries: [entry] }));
  writeFileSync(resolve(root, 'prep.json'), JSON.stringify({ lessons: { '1-3': {} } }));
  writeFileSync(resolve(root, 'summaries.json'), JSON.stringify([summary, { ...summary, section: 'D', promises: ['D-only promise.'] }]));
  writeFileSync(resolve(root, 'draft.env'), `DRAFT_API_BASE=${url}\nDRAFT_API_KEY=fixture-only-key\nDRAFT_MODEL=fixture-model\n`);
  const args = ['--date', date, '--section', 'C', '--file', resolve(root, 'day-log.json'), '--prep', resolve(root, 'prep.json'),
    '--env-file', resolve(root, 'draft.env'), '--roster-dir', resolve(root, 'none'), '--server', url, '--secret', 'fixture-secret', '--out', resolve(root, 'decks.json')];
  return { root, args, puts };
}

describe('continuity in deck CLI', () => {
  it('runs the roster-name guard after adding source cues and sends nothing on a hit', async () => {
    const { root, args, puts } = await setup();
    const roster = resolve(root, 'roster');
    mkdirSync(roster);
    writeFileSync(resolve(roster, 'roster-view-PeriodC.csv'), 'realName,section,username\n"Doe, Quinton",PeriodC,q\n');
    writeFileSync(resolve(root, 'summaries.json'), JSON.stringify([{ ...summary, promises: ['Ask Quinton to explain the open endpoint.'] }]));
    const result = await run([...args, '--summaries', resolve(root, 'summaries.json'), '--roster-dir', roster, '--from-tree', '--apply']);
    expect(result.code).toBe(1);
    expect(result.output).toContain('roster first name in item');
    expect(result.output).not.toContain('Quinton');
    expect(puts).toEqual([]);
  }, 20000);

  it('opts custom files in, publishes the capped mixed deck, and round-trips without appending cues again', async () => {
    const { root, args, puts } = await setup();
    const before = await run([...args, '--from-tree']);
    expect(before.code, before.output).toBe(0);
    expect(JSON.parse(readFileSync(resolve(root, 'decks.json'), 'utf8')).decks[0].items.every(item => item.node)).toBe(true);
    const result = await run([...args, '--summaries', resolve(root, 'summaries.json'), '--from-tree', '--apply']);
    expect(result.code, result.output).toBe(0);
    expect(puts).toHaveLength(1);
    const items = puts[0].decks[0].items;
    expect(items).toHaveLength(14);
    expect(items.filter(item => !item.node)).toHaveLength(3);
    expect(JSON.stringify(items)).toContain('final piece not reached');
    expect(JSON.stringify(items)).not.toContain('D-only promise');
    const roundTrip = await run(['--from-file', resolve(root, 'decks.json'), '--out', resolve(root, 'roundtrip.json'),
      '--summaries', resolve(root, 'summaries.json'), '--roster-dir', resolve(root, 'none')]);
    expect(roundTrip.code, roundTrip.output).toBe(0);
    expect(JSON.parse(readFileSync(resolve(root, 'roundtrip.json'), 'utf8')).decks[0].items).toEqual(items);
  }, 20000);

  it('adds the same daily cues to a model deck and skips them on course-wide fallback cards', async () => {
    const own = await setup();
    const result = await run([...own.args, '--summaries', resolve(own.root, 'summaries.json'), '--trees', resolve(own.root, 'no-trees')]);
    expect(result.code, result.output).toBe(0);
    const modelItems = JSON.parse(readFileSync(resolve(own.root, 'decks.json'), 'utf8')).decks[0].items;
    expect(modelItems).toHaveLength(14);
    expect(modelItems.filter(item => item.front.includes('| recording '))).toHaveLength(3);
    const shared = await setup({ shared: true });
    const fallback = await run([...shared.args, '--summaries', resolve(shared.root, 'summaries.json'), '--from-tree']);
    expect(fallback.code, fallback.output).toBe(0);
    expect(JSON.parse(readFileSync(resolve(shared.root, 'decks.json'), 'utf8')).decks[0].items.every(item => item.node)).toBe(true);
  }, 20000);
});

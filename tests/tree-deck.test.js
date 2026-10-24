// @vitest-environment node
// Tree decks (KNOWLEDGE_TREE_SPEC.md WP-1 1.2): tier order, cap and pad, edge
// lifting, hash stability, and draft-card-decks --from-tree end to end.
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildTree } from '../scripts/lib/lesson-tree.mjs';
import { cardLessons, cardPhase, liftEdges, namedExamples, selectDeck, tiersFor } from '../scripts/lib/tree-deck.mjs';
import { normalizeItems } from '../scripts/draft-card-decks.mjs';
import { deckContentHash, validateItems } from '../roster-server/deck-rules.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/lesson-tree/prep-1-3.json', import.meta.url), 'utf8'));
const tree13 = buildTree('1-3', fixture.prep, fixture.dayLog);
const trees = { '1-3': tree13 };
const card = fixture.dayLog.entries[0].observerCard; // "Example 5 only", 12 minutes, two traps
const base = { trees, lessons: ['1-3'], card, date: '2026-10-26', sections: ['C'] };
const src = source => tree13.nodes.find(node => node.source === source);

describe('card reading', () => {
  it('phase, named examples and lessons (own lesson plus named ones, newest first)', () => {
    expect(cardPhase({ title: 'Exit: graph a step function' })).toBe('After');
    expect(cardPhase({ title: 'Opener: guitar strings' })).toBe('Before');
    expect(cardPhase({ title: 'Three Reads', body: 'whiteboards' })).toBe('During');
    expect([...namedExamples('Example 3 page, then Example 5 and example 3 again')]).toEqual([3, 5]);
    const both = { '1-2': tree13, '1-3': tree13, '1-10': tree13 };
    expect(cardLessons('1-2', { body: '## Objectives (poster, Lesson 1-3)' }, both)).toEqual(['1-3', '1-2']);
    expect(cardLessons('1-2', { body: 'Lesson 1-10 and lesson 9-9' }, both)).toEqual(['1-10', '1-2']);
    expect(cardLessons('1-6', {}, both)).toEqual([]);
  });
});

describe('selectDeck', () => {
  it('takes the tiers in order: frame, own traps, quiz, phase TE questions, named steps, vocabulary', () => {
    const { items, tiers, padded } = selectDeck(base);
    const sources = items.map(item => tree13.nodes.find(node => node.id === item.node).source);
    expect(sources).toEqual([
      'objectives.essentialQuestion',
      'day-log.2026-10-26.C.traps[0]', 'day-log.2026-10-26.C.traps[1]',
      'quizFocus.what', 'quizFocus.answer', 'quizFocus.needs[0]', 'quizFocus.needs[1]',
      'modelDiscuss.teQuestions[1]', // "During, small group" only
      'examples[n=5]', // the body names Example 5 only
      'objectives.language.words.piece', 'objectives.language.words.interval', 'objectives.language.words.open circle', 'objectives.language.words.closed circle',
    ]);
    expect(tiers).toEqual({ frame: 1, traps: 2, quiz: 4, te: 1, steps: 1, vocab: 4, pad: 0 });
    expect(padded).toBe(0);
    expect(items.map(item => item.order)).toEqual(items.map((_, i) => i + 1));
    expect(items.every(item => item.id === item.node && item.lesson === '1-3')).toBe(true);
    // The step's minute is this card's: 12 minutes over two steps, Example 5 is the second.
    expect(items.find(item => item.type === 'step').minute).toBe(12);
  });
  it('another section or date gets no traps; an exit card takes the After questions; no named example takes all kept', () => {
    const g = selectDeck({ ...base, sections: ['G'] });
    expect(g.tiers.traps).toBe(0);
    const all = selectDeck({ ...base, sections: ['all'] });
    expect(all.tiers.traps).toBe(2);
    const exit = tiersFor({ ...base, card: { title: 'Exit: steps', body: '', minutes: 8 } });
    expect(exit[3]).toEqual([]); // the fixture has no "After" question
    expect(exit[4].map(node => node.source)).toEqual(['examples[n=3]', 'examples[n=5]']);
    const before = tiersFor({ ...base, card: { title: 'Opener', body: '' } });
    expect(before[3].map(node => node.source)).toEqual(['modelDiscuss.teQuestions[0]', 'modelDiscuss.teQuestions[2]']);
  });
  it('caps at 14 and pads from tier 7 (DOK 3, IXL, then the rest) up to 8', () => {
    const many = selectDeck({ ...base, card: { ...card, title: 'Opener', body: 'Example 3 Example 5' } });
    expect(many.items).toHaveLength(14);
    expect(many.tiers.pad).toBe(0);
    // Every vocabulary node known: the core tiers give 1 + 4 + 1 + 1 = 7 for section G, so one pad.
    const known = new Set(tree13.nodes.filter(node => node.source.startsWith('objectives.language.words.')).map(node => node.id));
    const short = selectDeck({ ...base, sections: ['G'], known });
    expect(short.items).toHaveLength(8);
    expect(short.padded).toBe(1);
    expect(short.items[7].node).toBe(src('dok3.task').id);
    expect(() => validateItems(short.items)).not.toThrow();
  });
  it('lifts an edge past an unchosen parent to the nearest chosen ancestor', () => {
    // Example 5 sits after Example 3 (not chosen), which sits after the two quiz anchors (chosen).
    const { items } = selectDeck(base);
    const step = items.find(item => item.type === 'step');
    expect(step.after).toEqual([src('quizFocus.what').id, src('quizFocus.answer').id]);
    // The quiz anchors keep their chosen vocabulary parents.
    expect(items.find(item => item.node === src('quizFocus.what').id).after).toHaveLength(4);
    // Nothing chosen above: the edge disappears.
    const lonely = liftEdges([src('examples[n=5]')], trees);
    expect(lonely).toEqual([[]]);
    // A chosen node's own parent kept as is.
    expect(liftEdges([src('examples[n=3]'), src('examples[n=5]')], trees)[1]).toEqual([src('examples[n=3]').id]);
  });
  it('same trees and card give the same items and the same hash; ids survive the deck normalizer', () => {
    const one = normalizeItems(selectDeck(base).items);
    const two = normalizeItems(selectDeck(base).items);
    expect(deckContentHash(one, 'lesson-tree')).toBe(deckContentHash(two, 'lesson-tree'));
    expect(one.map(item => item.id)).toEqual(selectDeck(base).items.map(item => item.node));
    const reworded = JSON.parse(JSON.stringify(fixture.prep));
    reworded.quizFocus.what = 'A reworded quiz question.';
    const changed = normalizeItems(selectDeck({ ...base, trees: { '1-3': buildTree('1-3', reworded, fixture.dayLog) } }).items);
    expect(changed.map(item => item.id)).toEqual(one.map(item => item.id));
    expect(deckContentHash(changed, 'lesson-tree')).not.toBe(deckContentHash(one, 'lesson-tree'));
  });
});

// --- draft-card-decks --from-tree end to end against a fake roster server ---
const script = fileURLToPath(new URL('../scripts/draft-card-decks.mjs', import.meta.url));
const CARD_C = '11111111-1111-4111-8111-111111111111';
const CARD_G = '22222222-2222-4222-8222-222222222222';
function run(args) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DRAFT_') && k !== 'ROSTER_TEACHER_SECRET' && k !== 'TEACHER_KEY' && k !== 'ROSTER_SERVICE_URL'));
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: clean });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  return new Promise(r => child.on('close', code => r({ code, out })));
}
async function fakeServer(knownIds) {
  const seen = { puts: [], mastery: [] };
  const server = createServer((req, res) => {
    let text = '';
    req.on('data', d => { text += d; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url.startsWith('/teacher/cards')) {
        return res.end(JSON.stringify({ cards: [
          { id: CARD_C, course: 'algebra2', section: 'C', lesson: '1-3', ...card },
          { id: CARD_G, course: 'algebra2', section: 'G', lesson: '1-6', title: 'No tree', body: 'x' },
        ] }));
      }
      if (req.url.startsWith('/teacher/mastery')) {
        seen.mastery.push(req.url);
        return res.end(JSON.stringify({ rows: knownIds.map(nodeId => ({ device: 's24', nodeId, p: 0.95 })) }));
      }
      seen.puts.push(JSON.parse(text));
      res.end(JSON.stringify({ ok: true, written: 1, unchanged: 0 }));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, seen, base: 'http://127.0.0.1:' + server.address().port };
}

describe('draft-card-decks --from-tree', () => {
  it('builds the tree deck with node on every item, skips a card without a tree, never calls a model, --apply PUTs', async () => {
    const piece = src('objectives.language.words.piece').id;
    const { server, seen, base: url } = await fakeServer([piece]);
    const dir = mkdtempSync(resolve(tmpdir(), 'tree-decks-'));
    try {
      mkdirSync(resolve(dir, 'lesson-trees'));
      writeFileSync(resolve(dir, 'lesson-trees', '1-3.json'), JSON.stringify(tree13));
      writeFileSync(resolve(dir, 'prep.json'), JSON.stringify({ lessons: { '1-3': fixture.prep } }));
      const dayLog = { entries: [{ ...fixture.dayLog.entries[0] }, { date: '2026-10-26', section: 'G', lesson: '1-6', plan: 'x' }] };
      writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify(dayLog));
      writeFileSync(resolve(dir, 'empty.env'), '');
      const common = ['--date', '2026-10-26', '--file', resolve(dir, 'day-log.json'), '--prep', resolve(dir, 'prep.json'), '--env-file', resolve(dir, 'empty.env'),
        '--out', resolve(dir, 'decks.json'), '--roster-dir', resolve(dir, 'none'), '--server', url, '--secret', 'tree-secret-SENTINEL'];
      const dry = await run([...common, '--from-tree', '--dry-run']);
      expect(dry.code).toBe(0);
      expect(dry.out).toContain('tiers: frame 1, traps 2, quiz 4, te 1, steps 1, vocab 3, pad 0');
      expect(dry.out).toContain('skipped: no lesson tree for 1-6');
      expect(dry.out).not.toContain('tree-secret-SENTINEL');
      expect(seen.puts).toHaveLength(0);
      const applied = await run([...common, '--from-tree', '--apply']);
      expect(applied.code).toBe(0);
      expect(applied.out).toContain('G: skipped (no lesson tree for 1-6)');
      expect(seen.puts).toHaveLength(1);
      const [deck] = seen.puts[0].decks;
      expect(seen.puts[0].decks).toHaveLength(1);
      expect(deck).toMatchObject({ cardId: CARD_C, model: 'lesson-tree' });
      expect(deck.items).toHaveLength(12);
      expect(deck.items.every(item => /^[0-9a-f]{12}$/.test(item.node) && item.id === item.node && item.lesson === '1-3')).toBe(true);
      expect(deck.items.some(item => item.node === piece)).toBe(false); // known on s24, so not offered
      expect(seen.mastery[0]).toBe('/teacher/mastery?course=algebra2&lesson=1-3');
      // The written file goes back up unchanged with --from-file (node ids kept).
      const file = JSON.parse(readFileSync(resolve(dir, 'decks.json'), 'utf8'));
      expect(file.decks[0].items).toEqual(deck.items);
      const again = await run(['--from-file', resolve(dir, 'decks.json'), '--dry-run', '--roster-dir', resolve(dir, 'none')]);
      expect(again.code).toBe(0);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('nightly steps 3 and 4', () => {
  it('push the cards, rebuild and check the trees, draft the tree decks; the exit code stays step 2', () => {
    const batch = readFileSync(new URL('../tools/nightly_tomorrow.ps1', import.meta.url), 'utf8');
    expect(batch).toMatch(/STEP 2[\s\S]*STEP 3: node scripts\/push-observer-cards\.mjs[\s\S]*STEP 4: node scripts\/build-lesson-tree\.mjs --all --check[\s\S]*'--from-tree', '--per-section', '--apply'/);
    expect(batch).toMatch(/if \(\$Date\) \{ \$deckArgs \+= @\('--date', \$Date\) \}\s*\r?\n\s*if \(\$Section\) \{ \$deckArgs \+= @\('--section', \$Section\) \}/);
    expect(batch).toContain("'scripts\\push-observer-cards.mjs'");
    expect(batch).toContain("'scripts\\build-lesson-tree.mjs'), '--all', '--check'");
    expect(batch).toMatch(/if \(\$draftCode -ne 0\) \{ exit \$draftCode \}\s*\r?\nWrite-Log "=== nightly_tomorrow done/);
  });
});

describe('draft-card-decks --per-section: each section its own next class day', () => {
  const year = JSON.parse(readFileSync(new URL('../data/a2-school-year.json', import.meta.url), 'utf8'));
  it('on a Sunday C and D draft for Monday and G for Tuesday; --date skips forward per section like draft-tomorrow', async () => {
    const { sectionClassDays } = await import('../scripts/draft-card-decks.mjs');
    const { nextClassDay } = await import('../scripts/draft-tomorrow.mjs');
    expect(sectionClassDays({ year, today: '2026-10-25' })).toEqual([
      { section: 'C', date: '2026-10-26' }, { section: 'D', date: '2026-10-26' }, { section: 'G', date: '2026-10-27' }]);
    expect(sectionClassDays({ year, today: 'ignored', date: '2026-10-27', sections: ['D'] })).toEqual([{ section: 'D', date: '2026-10-28' }]);
    for (const section of ['C', 'D', 'G']) expect(sectionClassDays({ year, today: '2026-10-25', sections: [section] })[0].date).toBe(nextClassDay(year, section, '2026-10-26'));
  });
  it('mergeDeckFiles keeps the other sections and replaces this section and the same cards', async () => {
    const { mergeDeckFiles } = await import('../scripts/draft-card-decks.mjs');
    const old = { date: '2026-10-26', decks: [{ cardId: 'a', sections: ['C'], items: [1] }, { cardId: 'b', sections: ['D'], items: [1] }, { cardId: 'all', sections: ['all'], items: [1] }] };
    const next = { date: '2026-10-26', decks: [{ cardId: 'a2', sections: ['C'], items: [2] }, { cardId: 'all', sections: ['all'], items: [2] }] };
    expect(mergeDeckFiles(old, next, 'C').decks.map(d => [d.cardId, d.items[0]])).toEqual([['all', 2], ['a2', 2], ['b', 1]]);
    expect(mergeDeckFiles({ ...old, date: '2026-10-23' }, next, 'C')).toBe(next);
    expect(mergeDeckFiles(null, next, 'C')).toBe(next);
  });
  it('CLI: one run per (date, section), a section without a card is a message, each PUT carries only its run', async () => {
    const CARD_G2 = '44444444-4444-4444-8444-444444444444';
    const puts = [];
    const server = createServer((req, res) => {
      let text = '';
      req.on('data', d => { text += d; });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        if (req.url.startsWith('/teacher/cards?date=2026-10-26')) return res.end(JSON.stringify({ cards: [{ id: CARD_C, course: 'algebra2', section: 'C', lesson: '1-3', ...card }] }));
        if (req.url.startsWith('/teacher/cards?date=2026-10-27')) return res.end(JSON.stringify({ cards: [{ id: CARD_G2, course: 'algebra2', section: 'G', lesson: '1-3', ...card }] }));
        if (req.url.startsWith('/teacher/cards')) return res.end(JSON.stringify({ cards: [] }));
        if (req.url.startsWith('/teacher/mastery')) return res.end(JSON.stringify({ rows: [] }));
        puts.push(JSON.parse(text));
        res.end(JSON.stringify({ ok: true, written: 1, unchanged: 0 }));
      });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const dir = mkdtempSync(resolve(tmpdir(), 'per-section-'));
    try {
      mkdirSync(resolve(dir, 'lesson-trees'));
      writeFileSync(resolve(dir, 'lesson-trees', '1-3.json'), JSON.stringify(tree13));
      writeFileSync(resolve(dir, 'prep.json'), JSON.stringify({ lessons: { '1-3': fixture.prep } }));
      writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify({ entries: [
        { date: '2026-10-26', section: 'C', lesson: '1-3', plan: 'x', observerCard: card },
        { date: '2026-10-27', section: 'G', lesson: '1-3', plan: 'x', observerCard: card },
      ] }));
      const args = ['--from-tree', '--per-section', '--apply', '--date', '2026-10-26', '--file', resolve(dir, 'day-log.json'), '--prep', resolve(dir, 'prep.json'),
        '--out', resolve(dir, 'decks.json'), '--roster-dir', resolve(dir, 'none'), '--server', 'http://127.0.0.1:' + server.address().port, '--secret', 's-SENTINEL'];
      const result = await run(args);
      expect(result.code).toBe(0);
      expect(result.out).toContain('--- section C: next class day 2026-10-26 ---');
      expect(result.out).toContain('Section D: no observer card on 2026-10-26; no deck.');
      expect(result.out).toContain('--- section G: next class day 2026-10-27 ---');
      expect(puts.map(body => body.decks.map(deck => deck.cardId))).toEqual([[CARD_C], [CARD_G2]]);
      const one = await run([...args.filter(a => a !== '--apply'), '--section', 'G', '--dry-run']);
      expect(one.out).toContain('--- section G: next class day 2026-10-27 ---');
      expect(one.out).not.toContain('section C');
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

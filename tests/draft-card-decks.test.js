// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  DECK_RULES, buildPrompt, buildTargets, firstNameOf, normalizeItems, parseArgs, parseCsvLine, parseDeckReply, putBodyFrom,
} from '../scripts/draft-card-decks.mjs';
import { itemId } from '../roster-server/deck-rules.js';

const script = fileURLToPath(new URL('../scripts/draft-card-decks.mjs', import.meta.url));
const card = {
  title: 'Write the rule for a three-piece graph', mode: 'whiteboards', minutes: 12,
  frame: 'Piece ___ is the line with slope ___ on the interval ___, so its rule is ___.',
  body: '## Preparing (3 min)\nPacket.\n\n## Interacting (7 min)\nRound 2: slope (3).\n\n## Extending (2 min)\nCase notation.',
};
const dayLog = { entries: [
  { date: '2026-10-22', section: 'C', lesson: '1-3', plan: 'x', observerCard: card },
  { date: '2026-10-22', section: 'G', lesson: '1-3', plan: 'x', observerCard: card },
  { date: '2026-10-23', section: 'all', lesson: '1-4', plan: 'x', observerCard: { ...card, title: 'Everyone' } },
] };
const prep = { '1-3': { title: 'Piecewise-Defined Functions', quizFocus: { item: 1 } } };
const CARD_C = '11111111-1111-4111-8111-111111111111';
const CARD_G = '22222222-2222-4222-8222-222222222222';
const serverCards = [
  { id: CARD_C, course: 'algebra2', section: 'C', lesson: '1-3', ...card },
  { id: CARD_G, course: 'algebra2', section: 'G', lesson: '1-3', ...card },
  { id: '33333333-3333-4333-8333-333333333333', course: 'apstats', section: 'C', ...card },
];
const raw = (n = 10) => [
  { key: 'frame1', type: 'frame', front: 'Piece ___ has slope ___', back: 'Piece A has slope 3', after: [] },
  { key: 'a1', type: 'anchor', front: 'Slope of piece A?', back: '3', after: [] },
  { key: 't1', type: 'trap', front: 'x <= 1 for piece A', back: 'Open point at (1, -1), so x < 1.', after: ['a1'] },
  { key: 's1', type: 'step', front: 'Interacting, round 1: ?', back: 'Interval for A (minute 3)', after: ['frame1'], minute: 3 },
  { key: 'c1', type: 'cue', front: 'Boards up: ?', back: 'Hold it still, one board explains.', after: ['s1'] },
  ...Array.from({ length: n - 5 }, (_, i) => ({ key: `x${i}`, type: 'anchor', front: `Anchor ${i}`, back: `Value ${i}`, after: [] })),
];

describe('draft-card-decks: prompt and targets', () => {
  it('assembles the prompt from the card, the lesson prep and the verbatim rules', () => {
    const [system, user] = buildPrompt({ date: '2026-10-22', sections: ['C'], lesson: '1-3', card, prep: prep['1-3'] });
    expect(system.content).toContain(DECK_RULES);
    expect(system.content).toContain('- `anchor` items for every number or rule the teacher must have ready (slope 3, b = −4, piece B is x + 3, quiz items this lesson targets);');
    expect(system.content).toContain('10 to 12 items');
    expect(user.content).toContain('Date: 2026-10-22, Algebra 2 section C, lesson 1-3.');
    expect(user.content).toContain('Observer card: "Write the rule for a three-piece graph" (whiteboards, 12 min)');
    expect(user.content).toContain('Sentence frame: Piece ___ is the line');
    expect(user.content).toContain('Round 2: slope (3).');
    expect(user.content).toContain('"title": "Piecewise-Defined Functions"');
    expect(buildPrompt({ date: '2026-10-22', sections: ['C', 'G'], lesson: null, card, prep: null })[1].content).toContain('sections C, G.');
    expect(buildPrompt({ date: '2026-10-22', sections: ['C'], lesson: '1-3', card, prep: { big: 'y'.repeat(7000) } })[1].content).toContain('…(truncated)');
  });
  it('one target per card: ids from the server cards; a course-wide card is one deck; server fallback', () => {
    expect(buildTargets({ dayLog, date: '2026-10-22', serverCards }).map(t => [t.sections, t.cardId, t.source]))
      .toEqual([[['C'], CARD_C, 'day-log'], [['G'], CARD_G, 'day-log']]);
    expect(buildTargets({ dayLog, date: '2026-10-22', serverCards: null, only: 'G' }).map(t => [t.sections, t.cardId])).toEqual([[['G'], null]]);
    const all = buildTargets({ dayLog, date: '2026-10-23', serverCards: [{ id: CARD_C, course: 'algebra2', section: null, ...card }] });
    expect(all.map(t => [t.sections, t.cardId, t.card.title])).toEqual([[['all'], CARD_C, 'Everyone']]);
    const fallback = buildTargets({ dayLog: { entries: [] }, date: '2026-10-22', serverCards });
    expect(fallback.map(t => [t.sections, t.cardId, t.source])).toEqual([[['C'], CARD_C, 'server'], [['G'], CARD_G, 'server']]);
  });
  it('merges server cards per card id: a local card for C and only a server card for G both get decks', () => {
    const onlyC = { entries: [dayLog.entries[0], { date: '2026-10-22', section: 'G', lesson: '1-3', plan: 'no card yet' }] };
    const serverG = { ...serverCards[1], title: 'Server G card' };
    expect(buildTargets({ dayLog: onlyC, date: '2026-10-22', serverCards: [serverCards[0], serverG, serverCards[2]] }).map(t => [t.sections, t.cardId, t.source, t.card.title]))
      .toEqual([[['C'], CARD_C, 'day-log', card.title], [['G'], CARD_G, 'server', 'Server G card']]);
    expect(buildTargets({ dayLog: onlyC, date: '2026-10-22', serverCards, only: 'G' }).map(t => [t.sections, t.cardId, t.source])).toEqual([[['G'], CARD_G, 'server']]);
    expect(buildTargets({ dayLog: onlyC, date: '2026-10-22', serverCards, only: 'C' }).map(t => [t.sections, t.cardId])).toEqual([[['C'], CARD_C]]);
    // Course-wide resolution under --section: a section with its own card skips the course-wide card.
    const ALL = '44444444-4444-4444-8444-444444444444';
    const withAll = [serverCards[0], { id: ALL, course: 'algebra2', section: null, ...card, title: 'All' }];
    const empty = { entries: [] };
    expect(buildTargets({ dayLog: empty, date: '2026-10-22', serverCards: withAll, only: 'C' }).map(t => t.cardId)).toEqual([CARD_C]);
    expect(buildTargets({ dayLog: empty, date: '2026-10-22', serverCards: withAll, only: 'D' }).map(t => [t.sections, t.cardId])).toEqual([[['all'], ALL]]);
    expect(buildTargets({ dayLog: empty, date: '2026-10-22', serverCards: withAll }).map(t => t.cardId)).toEqual([ALL, CARD_C]);
  });
  it('parses arguments', () => {
    expect(parseArgs(['--date', '2026-10-22', '--section', 'period g', '--from-file', 'x.json', '--apply'])).toMatchObject({ date: '2026-10-22', section: 'G', fromFile: 'x.json', apply: true });
    expect(() => parseArgs(['--dry-run', '--apply'])).toThrow(/cannot be combined/);
    expect(() => parseArgs(['--date', '2026-02-30'])).toThrow(/real/);
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown/);
  });
  it('reads first names from roster CSV lines (Last, First and First Last)', () => {
    expect(parseCsvLine('"Doe, Jane Q",PeriodC,"a ""b""",x')).toEqual(['Doe, Jane Q', 'PeriodC', 'a "b"', 'x']);
    expect(firstNameOf('Doe Smith, Jane Q')).toBe('Jane');
    expect(firstNameOf('Jane Doe')).toBe('Jane');
    expect(firstNameOf('  ')).toBeNull();
  });
});

describe('draft-card-decks: validation and ids', () => {
  it('assigns hash ids, remaps after from keys, keeps the order of the reply', () => {
    const items = normalizeItems(raw());
    expect(items[1].id).toBe(itemId('anchor', 'Slope of piece A?'));
    expect(items[2].after).toEqual([items[1].id]);
    expect(items[3]).toMatchObject({ type: 'step', minute: 3, after: [items[0].id], order: 4 });
    expect(items.every(item => /^[0-9a-f]{12}$/.test(item.id))).toBe(true);
    // Stable: same input, same ids; an edited front is a new item.
    expect(normalizeItems(raw()).map(i => i.id)).toEqual(items.map(i => i.id));
    const edited = raw(); edited[1].front = 'Slope of piece A (from two points)?';
    expect(normalizeItems(edited)[1].id).not.toBe(items[1].id);
    // A file already holding hash ids round-trips unchanged.
    expect(normalizeItems(items)).toEqual(items);
  });
  it('rejects a bad count, sizes, a cycle, an unknown id and a duplicate id', () => {
    expect(() => parseDeckReply(JSON.stringify({ items: raw(9) }))).toThrow(/10 to 12 items \(got 9\)/);
    expect(() => parseDeckReply(JSON.stringify({ items: raw(13) }))).toThrow(/10 to 12/);
    expect(parseDeckReply('```json\n' + JSON.stringify(raw(12)) + '\n```')).toHaveLength(12);
    expect(() => parseDeckReply('nope')).toThrow(/not valid JSON/);
    const long = raw(); long[0].back = 'x'.repeat(321);
    expect(() => normalizeItems(long)).toThrow(/back must be at most 320/);
    const cycle = raw(); cycle[1].after = ['t1'];
    expect(() => normalizeItems(cycle)).toThrow(/after has a cycle/);
    const unknown = raw(); unknown[4].after = ['nope'];
    expect(() => normalizeItems(unknown)).toThrow(/after names unknown id nope/);
    const dup = raw(); dup[6].front = dup[5].front;
    expect(() => normalizeItems(dup)).toThrow(/duplicate item id/);
    const minute = raw(); minute[1].minute = 4;
    expect(() => normalizeItems(minute)).toThrow(/minute is for steps only/);
    const noMinute = raw(); delete noMinute[3].minute;
    expect(() => normalizeItems(noMinute)).toThrow(/a step needs minute/);
  });
  it('the PUT body needs a card id for every deck with items', () => {
    const items = normalizeItems(raw());
    expect(putBodyFrom({ decks: [{ cardId: CARD_C, sections: ['C'], items, model: null, generatedAt: '2026-10-21T22:00:00.000Z', title: 'x' }, { cardId: null, items: null }] }))
      .toEqual({ decks: [{ cardId: CARD_C, items, model: null, generatedAt: '2026-10-21T22:00:00.000Z' }] });
    expect(() => putBodyFrom({ decks: [{ cardId: null, sections: ['G'], items }] })).toThrow(/G has no card id/);
    // The full envelope goes through the server's validateDeckPut.
    expect(() => putBodyFrom({ decks: [{ cardId: CARD_C, items }, { cardId: CARD_C.toUpperCase(), items }] })).toThrow(/more than one deck for card/);
    expect(() => putBodyFrom({ decks: Array.from({ length: 21 }, () => ({ cardId: CARD_C, items })) })).toThrow(/at most 20 decks/);
    expect(() => putBodyFrom({ decks: [{ cardId: CARD_C, items, generatedAt: 'last night' }] })).toThrow(/generatedAt/);
    expect(() => putBodyFrom({ decks: [{ cardId: CARD_C, items, model: 'm'.repeat(65) }] })).toThrow(/model must be at most 64/);
  });
});

function run(args, env = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DRAFT_') && k !== 'ROSTER_TEACHER_SECRET' && k !== 'TEACHER_KEY' && k !== 'ROSTER_SERVICE_URL'));
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...clean, ...env } });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  return new Promise(r => child.on('close', code => r({ code, out })));
}
function fixtureDir() {
  const dir = mkdtempSync(resolve(tmpdir(), 'decks-'));
  writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify(dayLog, null, 2) + '\n');
  writeFileSync(resolve(dir, 'prep.json'), JSON.stringify(prep));
  writeFileSync(resolve(dir, 'empty.env'), '');
  mkdirSync(resolve(dir, 'roster'));
  writeFileSync(resolve(dir, 'roster', 'roster-view-PeriodC.csv'), 'realName,section,username\n"Doe, Quinton",PeriodC,q\n');
  const common = ['--date', '2026-10-22', '--file', resolve(dir, 'day-log.json'), '--prep', resolve(dir, 'prep.json'),
    '--env-file', resolve(dir, 'empty.env'), '--out', resolve(dir, 'decks.json'), '--roster-dir', resolve(dir, 'roster')];
  return { dir, common };
}
// A fake model + roster server: GET /teacher/cards, PUT /teacher/decks, POST /chat/completions.
async function fakeServer({ reply = () => ({ items: raw() }), putStatus = () => 200 } = {}) {
  const seen = { chats: [], auth: [], puts: [], gets: [] };
  const hashes = new Map();
  const server = createServer((req, res) => {
    let text = '';
    req.on('data', d => { text += d; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/chat/completions') {
        const body = JSON.parse(text);
        seen.chats.push(/section (\w)/.exec(body.messages[1].content)[1]); seen.auth.push(req.headers.authorization);
        return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply()) } }] }));
      }
      if (req.method === 'GET' && req.url.startsWith('/teacher/cards')) {
        seen.gets.push(req.headers['x-teacher-secret']);
        return res.end(JSON.stringify({ date: '2026-10-22', cards: serverCards }));
      }
      const body = JSON.parse(text);
      seen.puts.push({ url: req.url, secret: req.headers['x-teacher-secret'], body });
      const status = putStatus(seen.puts.length);
      res.statusCode = status;
      if (status !== 200) return res.end(JSON.stringify({ error: 'Card deck service unavailable' }));
      let written = 0, unchanged = 0;
      for (const deck of body.decks) {
        const hash = JSON.stringify(deck.items);
        if (hashes.get(deck.cardId) === hash) unchanged++; else { hashes.set(deck.cardId, hash); written++; }
      }
      res.end(JSON.stringify({ ok: true, written, unchanged }));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, seen, base: 'http://127.0.0.1:' + server.address().port };
}
const key = 'sk-SENTINEL-' + 'k'.repeat(10);
const secret = 'teacher-SENTINEL-' + 's'.repeat(10);
const keyEnv = base => ({ DRAFT_API_BASE: base, DRAFT_API_KEY: key, DRAFT_MODEL: 'test-model' });

describe('draft-card-decks: CLI', () => {
  it('no key: writes the prompt bundle with needsModel and exits 2; --dry-run writes nothing', async () => {
    // Always a fake server: the real roster-server/.env holds a teacher secret, and
    // without --server the script would ask production for the card ids.
    const { server, seen, base } = await fakeServer();
    const { dir, common } = fixtureDir();
    try {
      const result = await run([...common, '--server', base, '--secret', secret]);
      expect(result.code).toBe(2);
      expect(result.out).toContain('wrote the prompt bundle to');
      expect(result.out).not.toContain(secret);
      expect(seen.gets).toEqual([secret]);
      expect(seen.chats).toHaveLength(0);
      const bundle = JSON.parse(readFileSync(resolve(dir, 'decks.json'), 'utf8'));
      expect(bundle).toMatchObject({ date: '2026-10-22', needsModel: true, model: null });
      expect(bundle.decks.map(d => [d.sections, d.cardId, d.items])).toEqual([[['C'], CARD_C, null], [['G'], CARD_G, null]]);
      expect(bundle.decks[0].messages[1].content).toContain('Piecewise-Defined Functions');
      rmSync(resolve(dir, 'decks.json'));
      const dry = await run([...common, '--dry-run', '--section', 'C', '--server', 'http://127.0.0.1:9', '--timeout', '2000', '--secret', secret]);
      expect(dry.code).toBe(2);
      expect(dry.out).toContain('GET /teacher/cards failed (');
      expect(dry.out).toContain('=== prompt 2026-10-22 C');
      expect(dry.out).toMatch(/would be written to .*decks\.json with "needsModel": true; dry run, nothing written\./);
      expect(existsSync(resolve(dir, 'decks.json'))).toBe(false);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('model: drafts each card with its id, writes the file, --apply PUTs; never prints the key or secret', async () => {
    const { server, seen, base } = await fakeServer();
    const { dir, common } = fixtureDir();
    try {
      const result = await run([...common, '--apply', '--server', base, '--secret', secret], keyEnv(base));
      expect(result.code).toBe(0);
      expect(result.out).not.toContain(key);
      expect(result.out).not.toContain(secret);
      expect(seen.chats).toEqual(['C', 'G']);
      expect(seen.auth).toEqual([`Bearer ${key}`, `Bearer ${key}`]);
      const file = JSON.parse(readFileSync(resolve(dir, 'decks.json'), 'utf8'));
      expect(file).toMatchObject({ needsModel: false, model: 'test-model' });
      expect(file.decks.map(d => [d.cardId, d.items.length, d.model])).toEqual([[CARD_C, 10, 'test-model'], [CARD_G, 10, 'test-model']]);
      expect(seen.puts).toHaveLength(1);
      expect(seen.puts[0]).toMatchObject({ url: '/teacher/decks', secret });
      expect(seen.puts[0].body.decks.map(d => d.cardId)).toEqual([CARD_C, CARD_G]);
      expect(result.out).toContain('2 deck(s) sent: 2 written, 0 unchanged.');
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('model: a bad reply or a roster first name is rejected (exit 1) and nothing is sent', async () => {
    let n = 0;
    const named = raw(); named[4].back = 'Ask Quinton to explain.';
    const { server, seen, base } = await fakeServer({ reply: () => (n++ === 0 ? { items: raw().slice(0, 4) } : { items: named }) });
    const { dir, common } = fixtureDir();
    try {
      const result = await run([...common, '--apply', '--server', base, '--secret', secret], keyEnv(base));
      expect(result.code).toBe(1);
      expect(result.out).toContain('C: rejected (a draft must have 10 to 12 items (got 4))');
      expect(result.out).toMatch(/G: rejected \(roster first name in item [0-9a-f]{12}/);
      expect(result.out).not.toContain('Quinton');
      expect(seen.puts).toHaveLength(0);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('--from-file: validates, recomputes ids, writes the output, --apply PUTs; a second push is unchanged (same body)', async () => {
    const { server, seen, base } = await fakeServer();
    const { dir, common } = fixtureDir();
    const hand = resolve(dir, 'hand.json');
    writeFileSync(hand, JSON.stringify({ date: '2026-10-22', decks: [
      { cardId: CARD_C, sections: ['C'], title: card.title, items: raw(11), model: null, generatedAt: '2026-10-21T22:00:00.000Z' },
      { cardId: CARD_G, sections: ['G'], title: card.title, items: raw(11), model: null, generatedAt: '2026-10-21T22:00:00.000Z' },
    ] }));
    try {
      const dry = await run([...common, '--from-file', hand, '--dry-run']);
      expect(dry.code).toBe(0);
      expect(dry.out).toContain('2 deck(s) valid; dry run, nothing written or sent.');
      expect(existsSync(resolve(dir, 'decks.json'))).toBe(false);
      const args = [...common, '--from-file', hand, '--apply', '--server', base, '--secret', secret];
      const first = await run(args);
      expect(first.code).toBe(0);
      expect(first.out).toContain('2 deck(s) sent: 2 written, 0 unchanged.');
      const written = JSON.parse(readFileSync(resolve(dir, 'decks.json'), 'utf8'));
      expect(written.decks[0].items[1].id).toBe(itemId('anchor', 'Slope of piece A?'));
      expect(written.decks[0].items[2].after).toEqual([written.decks[0].items[1].id]);
      // Re-pushing the written file (ids already hashed) sends the same body and changes nothing.
      const second = await run([...common, '--from-file', resolve(dir, 'decks.json'), '--apply', '--server', base, '--secret', secret]);
      expect(second.out).toContain('2 deck(s) sent: 0 written, 2 unchanged.');
      expect(seen.puts[1].body).toEqual(seen.puts[0].body);
      expect(seen.chats).toHaveLength(0);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('--from-file: an invalid deck writes and sends nothing; a 503 is reported redacted with exit 1', async () => {
    const { server, seen, base } = await fakeServer({ putStatus: () => 503 });
    const { dir, common } = fixtureDir();
    const hand = resolve(dir, 'hand.json');
    const cycle = raw(); cycle[1].after = ['t1'];
    try {
      writeFileSync(hand, JSON.stringify({ date: '2026-10-22', decks: [{ cardId: CARD_C, sections: ['C'], items: cycle }] }));
      const bad = await run([...common, '--from-file', hand, '--apply', '--server', base, '--secret', secret]);
      expect(bad.code).toBe(1);
      expect(bad.out).toContain('rejected: after has a cycle');
      expect(seen.puts).toHaveLength(0);
      expect(existsSync(resolve(dir, 'decks.json'))).toBe(false);
      writeFileSync(hand, JSON.stringify({ date: '2026-10-22', decks: [{ cardId: CARD_C, sections: ['C'], items: raw() }] }));
      const down = await run([...common, '--from-file', hand, '--apply', '--server', base, '--secret', secret]);
      expect(down.code).toBe(1);
      expect(down.out).toContain('PUT /teacher/decks: HTTP 503 Card deck service unavailable');
      expect(down.out).not.toContain(secret);
      writeFileSync(hand, JSON.stringify({ date: '2026-10-22', decks: [{ cardId: CARD_C, sections: ['C'], items: raw() }, { cardId: CARD_C, sections: ['G'], items: raw() }] }));
      rmSync(resolve(dir, 'decks.json')); // written by the 503 run above (the file is written before the PUT)
      const dup = await run([...common, '--from-file', hand, '--apply', '--server', base, '--secret', secret]);
      expect(dup.code).toBe(1);
      expect(dup.out).toContain(`Deck file rejected: more than one deck for card ${CARD_C}; nothing written or sent.`);
      expect(existsSync(resolve(dir, 'decks.json'))).toBe(false);
      writeFileSync(hand, JSON.stringify({ date: '2026-10-22', decks: [{ cardId: CARD_C, sections: ['C'], items: raw(), generatedAt: 'tonight' }] }));
      const badStamp = await run([...common, '--from-file', hand, '--dry-run']);
      expect(badStamp.code).toBe(1);
      expect(badStamp.out).toContain('Deck file rejected: deck 0: generatedAt must be null or an ISO 8601 timestamp');
      expect(seen.puts).toHaveLength(1); // only the 503 attempt above
      const wrongDate = await run([...common.slice(2), '--date', '2026-10-23', '--from-file', hand, '--dry-run']);
      expect(wrongDate.out).toContain('the deck file is for 2026-10-22, not 2026-10-23');
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  applyDrafts, buildPrompt, callModel, cardForSection, envValue, insertCardsIntoFile, jsonLayout, latestSummary, meetings, nextSchoolDay,
  observerCardFor, parseArgs, parseDraft, previousDayLogCard, resolveDraftConfig, writeFileAtomic,
} from '../scripts/draft-observer-cards.mjs';

const script = fileURLToPath(new URL('../scripts/draft-observer-cards.mjs', import.meta.url));
const oldCard = { title: 'Three Reads: which tank?', mode: 'whiteboards', minutes: 10, frame: 'g(x) = ___', body: '## Setup\nTanks.' };
const dayLog = { entries: [
  { date: '2026-10-20', section: 'G', lesson: '1-2', plan: 'Quiz', observerCard: oldCard },
  { date: '2026-10-21', section: 'D', lesson: '1-2', plan: 'SAT block' },
  { date: '2026-10-21', section: 'G', lesson: '1-2', plan: 'No G block', student: 'No class (SAT day)' },
  { date: '2026-10-22', section: 'C', lesson: '1-3', plan: 'Lesson 1-3 (piecewise): Example 3 and Example 5.', student: '1-3 Examples 3, 5',
    observerCard: { title: 'Existing', body: '## Preparing\nx' } },
  { date: '2026-10-22', section: 'G', lesson: '1-3', plan: 'Lesson 1-3 (piecewise), fast: Example 3 then Example 5.' },
] };
const summaries = [
  { date: '2026-10-20', course: 'algebra2', section: 'G', landed: ['Translation rule g(x)=f(x-h)+k'], promises: ['Quiz moved to Thursday'],
    nextPrep: ['Reinforce inside-vs-outside language'], studentQuestions: ['Is there school Monday?'], recordedAt: '2026-10-20T19:00:00Z' },
  { date: '2026-10-19', course: 'algebra2', section: 'G', landed: ['older'], promises: [], nextPrep: [], studentQuestions: [] },
  { date: '2026-10-20', course: 'apstats', section: 'G', landed: ['wrong course'] },
  { date: '2026-10-22', course: 'algebra2', section: 'G', landed: ['same day, not before'] },
];
const goodDraft = {
  title: 'Write the rule for a two-piece graph', mode: 'whiteboards', minutes: 9,
  frame: 'Piece ___ has slope ___ on ___, so its rule is ___.',
  body: '## Preparing (2 min)\nGraph on the board.\n\n## Interacting (5 min)\nPairs write each rule.\n\n## Extending (2 min)\nWhere does the open point go?',
  rationale: 'G translated graphs well on Tuesday; this moves to reading pieces off a graph, as planned.',
};

describe('draft-observer-cards: inputs', () => {
  it('finds the sections meeting on a date and the next school day', () => {
    expect(meetings(dayLog, '2026-10-21').map(m => m.section)).toEqual(['D']);
    expect(meetings(dayLog, '2026-10-22').map(m => m.section)).toEqual(['C', 'G']);
    expect(meetings(dayLog, '2026-10-22', 'G').map(m => m.section)).toEqual(['G']);
    expect(meetings({ entries: [{ date: '2026-10-23', section: 'all', plan: 'x' }] }, '2026-10-23').map(m => m.section)).toEqual(['C', 'D', 'G']);
    expect(nextSchoolDay(dayLog, '2026-10-20')).toBe('2026-10-21');
    expect(nextSchoolDay(dayLog, '2026-10-21')).toBe('2026-10-22');
    expect(nextSchoolDay(dayLog, '2026-10-22')).toBeNull();
  });
  it('picks the latest algebra2 summary before the date, and the previous card', () => {
    expect(latestSummary(summaries, 'G', '2026-10-22').landed).toEqual(['Translation rule g(x)=f(x-h)+k']);
    expect(latestSummary(summaries, 'G', '2026-10-20').landed).toEqual(['older']);
    expect(latestSummary([{ ...summaries[0], section: 'PeriodG' }], 'G', '2026-10-22')).not.toBeNull();
    expect(latestSummary(summaries, 'C', '2026-10-22')).toBeNull();
    const cards = [{ course: 'algebra2', section: null, title: 'All' }, { course: 'algebra2', section: 'G', title: 'Mine' }, { course: 'apstats', section: 'C', title: 'AP' }];
    expect(cardForSection(cards, 'G').title).toBe('Mine');
    expect(cardForSection(cards, 'C').title).toBe('All');
    expect(previousDayLogCard(dayLog, 'G', '2026-10-22')).toMatchObject({ date: '2026-10-20', title: 'Three Reads: which tank?' });
    expect(previousDayLogCard(dayLog, 'D', '2026-10-22')).toBeNull();
  });
  it('assembles the prompt from the summary and the day-log entry', () => {
    const entry = dayLog.entries[4];
    const messages = buildPrompt({ date: '2026-10-22', section: 'G', entry, summary: summaries[0], previousCard: { date: '2026-10-20', ...oldCard } });
    expect(messages.map(m => m.role)).toEqual(['system', 'user']);
    expect(messages[0].content).toMatch(/## Preparing \(N min\)", "## Interacting \(N min\)", "## Extending \(N min\)"/);
    expect(messages[0].content).toMatch(/"whiteboards", "ipad", "poster", "pairs", "jam", "other"/);
    const user = messages[1].content;
    expect(user).toMatch(/^Target date: 2026-10-22, Algebra 2 section G, lesson 1-3\./);
    expect(user).toContain('Lesson 1-3 (piecewise), fast: Example 3 then Example 5.');
    expect(user).toContain('Last lesson summary (2026-10-20, section G):');
    expect(user).toContain('What landed:\n- Translation rule g(x)=f(x-h)+k');
    expect(user).toContain('Promises the teacher made:\n- Quiz moved to Thursday');
    expect(user).toContain('Prep for next time:\n- Reinforce inside-vs-outside language');
    expect(user).toContain('Student questions:\n- Is there school Monday?');
    expect(user).toContain('Previous observer card (2026-10-20): "Three Reads: which tank?" (whiteboards, 10 min).');
    expect(buildPrompt({ date: '2026-10-22', section: 'G', entry, summary: summaries[0], previousCard: null })).toEqual(
      buildPrompt({ date: '2026-10-22', section: 'G', entry, summary: summaries[0], previousCard: null }));
    const bare = buildPrompt({ date: '2026-10-22', section: 'C', entry: {}, summary: null, previousCard: null })[1].content;
    expect(bare).toContain('(no plan in the day log)');
    expect(bare).toContain('Last lesson summary: none available.');
    expect(bare).toContain('Previous observer card: none.');
  });
  it('reads env values and resolves the draft config from the env file, then the environment', () => {
    expect(envValue('A=1\nDRAFT_MODEL = "m-1" # c\n', 'DRAFT_MODEL')).toBe('m-1');
    expect(envValue('export DRAFT_API_KEY=abc # note', 'DRAFT_API_KEY')).toBe('abc');
    expect(envValue('X=1', 'DRAFT_API_KEY')).toBeNull();
    const dir = mkdtempSync(resolve(tmpdir(), 'draft-env-'));
    try {
      writeFileSync(resolve(dir, '.env'), 'DRAFT_MODEL=file-model\n');
      expect(resolveDraftConfig(resolve(dir, '.env'), { DRAFT_MODEL: 'env-model', DRAFT_API_KEY: 'k', DRAFT_API_BASE: 'http://x/' }))
        .toEqual({ base: 'http://x', key: 'k', model: 'file-model' });
      expect(resolveDraftConfig(resolve(dir, 'missing'), {})).toEqual({ base: 'https://api.deepseek.com', key: null, model: 'deepseek-chat' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('parses arguments', () => {
    expect(parseArgs(['--date', '2026-10-22', '--section', 'periodg', '--dry-run'])).toEqual({ dryRun: true, apply: false, date: '2026-10-22', section: 'G' });
    expect(parseArgs(['--env-file', 'x', '--out', 'y'])).toMatchObject({ envFile: 'x', out: 'y' });
    expect(() => parseArgs(['--dry-run', '--apply'])).toThrow(/combined/);
    expect(() => parseArgs(['--section', 'B'])).toThrow(/section/);
    expect(() => parseArgs(['--date', '2026-02-30'])).toThrow(/real/);
  });
});

describe('draft-observer-cards: validation and apply', () => {
  const where = { date: '2026-10-22', section: 'G', lesson: '1-3' };
  it('accepts a good draft (also inside a code fence)', () => {
    const { card, rationale } = parseDraft(JSON.stringify(goodDraft), where);
    expect(card).toEqual({ date: '2026-10-22', course: 'algebra2', section: 'G', lesson: '1-3', title: goodDraft.title, mode: 'whiteboards',
      minutes: 9, frame: goodDraft.frame, body: goodDraft.body, source: 'desk' });
    expect(rationale).toBe(goodDraft.rationale);
    expect(parseDraft('```json\n' + JSON.stringify(goodDraft) + '\n```', where).card.title).toBe(goodDraft.title);
  });
  it.each([
    ['not json', /valid JSON/],
    ['[1]', /object/],
    [JSON.stringify({ ...goodDraft, mode: 'dance' }), /mode/],
    [JSON.stringify({ ...goodDraft, minutes: 0 }), /minutes/],
    [JSON.stringify({ ...goodDraft, minutes: '9' }), /minutes/],
    [JSON.stringify({ ...goodDraft, title: '' }), /title/],
    [JSON.stringify({ ...goodDraft, body: 'x'.repeat(4001) }), /4000/],
    [JSON.stringify({ ...goodDraft, body: '## Preparing\na\n## Interacting\nb' }), /Extending/],
    [JSON.stringify({ ...goodDraft, rationale: undefined }), /rationale/],
  ])('rejects a bad draft: %s', (text, message) => {
    expect(() => parseDraft(text, where)).toThrow(message);
  });
  it('applies only where no observerCard exists, never touching no-class entries', () => {
    const card = parseDraft(JSON.stringify(goodDraft), where).card;
    const cardC = { ...card, section: 'C' };
    const { log, applied, skipped } = applyDrafts(dayLog, [
      { section: 'G', card }, { section: 'C', card: cardC }, { section: 'D', card: { ...card, section: 'D' } }, { section: 'G', card: null },
    ]);
    expect(applied).toEqual(['2026-10-22 G']);
    expect(skipped).toEqual(['2026-10-22 C: already has a card', '2026-10-22 D: no day-log entry']);
    expect(log.entries[4].observerCard).toEqual({ title: goodDraft.title, mode: 'whiteboards', minutes: 9, frame: goodDraft.frame, body: goodDraft.body });
    expect(log.entries[3].observerCard.title).toBe('Existing');
    expect(dayLog.entries[4].observerCard).toBeUndefined(); // input untouched
    expect(applyDrafts(log, [{ section: 'G', card }]).applied).toEqual([]); // idempotent
  });
  it('callModel redacts the key from error text', async () => {
    const key = 'sk-SENTINEL-' + 'z'.repeat(6);
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: `bad key ${key}` } }) });
    await expect(callModel({ base: 'http://x', key, model: 'm', messages: [], fetchImpl })).rejects.toThrow(/^model: HTTP 401 bad key \[redacted\]$/);
  });
});

function run(args, env = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DRAFT_') && k !== 'ROSTER_TEACHER_SECRET' && k !== 'TEACHER_KEY'));
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...clean, ...env } });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  return new Promise(r => child.on('close', code => r({ code, out })));
}
function fixtureDir({ extra = [] } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'draft-'));
  writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify({ ...dayLog, entries: [...dayLog.entries, ...extra] }, null, 2) + '\n');
  writeFileSync(resolve(dir, 'summaries.json'), JSON.stringify({ summaries }));
  writeFileSync(resolve(dir, 'empty.env'), '');
  const common = ['--date', '2026-10-22', '--file', resolve(dir, 'day-log.json'), '--summaries', resolve(dir, 'summaries.json'),
    '--env-file', resolve(dir, 'empty.env'), '--out', resolve(dir, 'drafts.json')];
  return { dir, common };
}

describe('draft-observer-cards: CLI', () => {
  it('no key: writes the prompt bundle with needsModel and exits 2', async () => {
    const { dir, common } = fixtureDir();
    try {
      const result = await run(common);
      expect(result.code).toBe(2);
      expect(result.out).toContain(`wrote the prompt bundle to ${resolve(dir, 'drafts.json')}`);
      const bundle = JSON.parse(readFileSync(resolve(dir, 'drafts.json'), 'utf8'));
      expect(bundle).toMatchObject({ date: '2026-10-22', needsModel: true, model: null });
      expect(bundle.drafts.map(d => [d.section, d.draft, d.sources.summaryDate])).toEqual([['C', null, null], ['G', null, '2026-10-20']]);
      expect(bundle.drafts[1].messages[1].content).toContain('Quiz moved to Thursday');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('no key with --dry-run: prints the prompt and the would-be path, writes nothing, exits 2', async () => {
    const { dir, common } = fixtureDir();
    try {
      const result = await run([...common, '--dry-run', '--section', 'G']);
      expect(result.code).toBe(2);
      expect(result.out).toContain('=== 2026-10-22 G (lesson 1-3; summary 2026-10-20; previous card 2026-10-20: Three Reads: which tank?) ===');
      expect(result.out).toContain('What landed:\n- Translation rule');
      expect(result.out).toMatch(/would be written to .*drafts\.json with "needsModel": true; dry run, nothing written\./);
      expect(existsSync(resolve(dir, 'drafts.json'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  // A fake model + roster server. onChat runs before each chat reply (to simulate a
  // concurrent edit); pushStatus decides the PUT /teacher/cards answer.
  async function fakeServer({ draftFor = () => goodDraft, onChat = () => {}, pushStatus = () => 200 } = {}) {
    const seen = { chats: [], auth: [], puts: [] };
    const server = createServer((req, res) => {
      let text = '';
      req.on('data', d => { text += d; });
      req.on('end', () => {
        if (req.url === '/chat/completions') {
          const body = JSON.parse(text);
          const section = /section (\w)/.exec(body.messages[1].content)[1];
          seen.chats.push(section); seen.auth.push(req.headers.authorization);
          onChat(section);
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draftFor(section)) } }] }));
        }
        seen.puts.push({ url: req.url, secret: req.headers['x-teacher-secret'], body: JSON.parse(text) });
        const status = pushStatus(seen.puts.length);
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(status === 200 ? { ok: true, written: 1, unchanged: 0 } : { error: 'service down' }));
      });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return { server, seen, base: 'http://127.0.0.1:' + server.address().port };
  }
  const key = 'sk-SENTINEL-' + 'k'.repeat(10);
  const secret = 'teacher-SENTINEL-' + 's'.repeat(10);
  const keyEnv = base => ({ DRAFT_API_BASE: base, DRAFT_API_KEY: key, DRAFT_MODEL: 'test-model' });

  it('without --apply: drafts every section, rejects a bad reply (exit 1), never prints the key', async () => {
    const { server, seen, base } = await fakeServer({ draftFor: section => (section === 'C' ? { ...goodDraft, mode: 'dance' } : goodDraft) });
    const { dir, common } = fixtureDir();
    try {
      const result = await run(common, keyEnv(base));
      expect(result.code).toBe(1);
      expect(result.out).not.toContain(key);
      expect(seen.auth).toEqual([`Bearer ${key}`, `Bearer ${key}`]);
      expect(result.out).toMatch(/Wrote 1\/2 draft\(s\)/);
      expect(result.out).toMatch(/C: rejected \(card 0: mode must be one of/);
      const bundle = JSON.parse(readFileSync(resolve(dir, 'drafts.json'), 'utf8'));
      expect(bundle).toMatchObject({ needsModel: false, model: 'test-model' });
      expect(bundle.drafts[1].draft).toEqual(goodDraft);
      expect(readFileSync(resolve(dir, 'day-log.json'), 'utf8')).toBe(JSON.stringify(dayLog, null, 2) + '\n');
      expect(seen.puts).toHaveLength(0);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('--apply: drafts only sections without a card, inserts them, pushes only the target date', async () => {
    const { server, seen, base } = await fakeServer();
    const { dir, common } = fixtureDir({ extra: [{ date: '2026-10-23', section: 'G', lesson: '1-3', plan: 'Quiz', observerCard: { title: 'Later', body: '## Preparing\nx' } }] });
    try {
      const result = await run([...common, '--apply', '--server', base, '--secret', secret], keyEnv(base));
      expect(result.out).not.toContain(key);
      expect(result.out).not.toContain(secret);
      expect(result.code).toBe(0);
      expect(seen.chats).toEqual(['G']); // C already has a card
      expect(result.out).toContain('2026-10-22 C: the day log already has a card; not drafting');
      expect(result.out).toContain('Inserted 2026-10-22 G into the day log.');
      const log = JSON.parse(readFileSync(resolve(dir, 'day-log.json'), 'utf8'));
      expect(log.entries[4].observerCard).toEqual({ title: goodDraft.title, mode: 'whiteboards', minutes: 9, frame: goodDraft.frame, body: goodDraft.body });
      expect(seen.puts).toHaveLength(1);
      expect(seen.puts[0]).toMatchObject({ url: '/teacher/cards', secret });
      expect(seen.puts[0].body.map(card => `${card.date} ${card.section}`)).toEqual(['2026-10-22 C', '2026-10-22 G']); // not 2026-10-23
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('--apply: a failed push exits 1; the rerun pushes the same saved cards without a model call', async () => {
    const { server, seen, base } = await fakeServer({ pushStatus: n => (n === 1 ? 500 : 200) });
    const { dir, common } = fixtureDir();
    try {
      const args = [...common, '--apply', '--server', base, '--secret', secret];
      const first = await run(args, keyEnv(base));
      expect(first.code).toBe(1);
      expect(first.out).toMatch(/HTTP 500/);
      expect(first.out).toContain('Push failed; rerun with --apply to retry');
      expect(seen.chats).toEqual(['G']);
      const afterFirst = readFileSync(resolve(dir, 'day-log.json'), 'utf8');
      const again = await run(args, keyEnv(base));
      expect(again.code).toBe(0);
      expect(seen.chats).toEqual(['G']); // no new model call
      expect(again.out).toContain('Nothing new inserted.');
      expect(readFileSync(resolve(dir, 'day-log.json'), 'utf8')).toBe(afterFirst);
      expect(seen.puts).toHaveLength(2);
      expect(seen.puts[1].body).toEqual(seen.puts[0].body);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('--apply: aborts (exit 1, nothing inserted, nothing pushed) when the day log changes while drafting', async () => {
    const { dir, common } = fixtureDir();
    const path = resolve(dir, 'day-log.json');
    const edited = JSON.stringify({ ...dayLog, entries: [...dayLog.entries, { date: '2026-10-26', section: 'C', plan: 'edited meanwhile' }] }, null, 2) + '\n';
    const { server, seen, base } = await fakeServer({ onChat: () => writeFileSync(path, edited) });
    try {
      const result = await run([...common, '--apply', '--server', base, '--secret', secret], keyEnv(base));
      expect(result.code).toBe(1);
      expect(result.out).toContain('the day log changed while drafting; nothing applied');
      expect(readFileSync(path, 'utf8')).toBe(edited);
      expect(seen.puts).toHaveLength(0);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('draft-observer-cards: safe writes', () => {
  const card = () => parseDraft(JSON.stringify(goodDraft), { date: '2026-10-22', section: 'G', lesson: '1-3' }).card;
  it('keeps untouched entries byte for byte, in 2- or 4-space layout, CRLF included', () => {
    for (const [indent, eol] of [[2, '\n'], [4, '\n'], [4, '\r\n']]) {
      const dir = mkdtempSync(resolve(tmpdir(), 'draft-write-'));
      try {
        const path = resolve(dir, 'day-log.json');
        const original = JSON.stringify(dayLog, null, indent).replace(/\n/g, eol) + eol;
        writeFileSync(path, original);
        const { applied } = insertCardsIntoFile(path, original, [{ section: 'G', card: card() }]);
        expect(applied).toEqual(['2026-10-22 G']);
        const written = readFileSync(path, 'utf8');
        const expected = JSON.parse(original);
        expected.entries[4].observerCard = observerCardFor(card());
        expect(written).toBe(JSON.stringify(expected, null, indent).replace(/\n/g, eol) + eol);
        // Everything before the changed entry is the original's exact prefix.
        const cut = original.indexOf('"Lesson 1-3 (piecewise), fast: Example 3 then Example 5."');
        expect(written.slice(0, cut)).toBe(original.slice(0, cut));
        expect(jsonLayout(written)).toEqual({ indent, eol, trailing: eol });
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
  it('refuses a day log that is not in plain JSON.stringify layout', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'draft-write-'));
    try {
      const path = resolve(dir, 'day-log.json');
      const odd = JSON.stringify(dayLog, null, 2).replace('"entries": [', '"entries":   [') + '\n';
      writeFileSync(path, odd);
      expect(() => insertCardsIntoFile(path, odd, [{ section: 'G', card: card() }])).toThrow(/layout/);
      expect(readFileSync(path, 'utf8')).toBe(odd);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('an interrupted write (failure before the rename) leaves the original intact and no temp file', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'draft-write-'));
    try {
      const path = resolve(dir, 'day-log.json');
      const original = JSON.stringify(dayLog, null, 2) + '\n';
      writeFileSync(path, original);
      let tempSeen = null;
      expect(() => insertCardsIntoFile(path, original, [{ section: 'G', card: card() }], {
        beforeRename(temp) { tempSeen = temp; expect(readFileSync(temp, 'utf8')).toContain(goodDraft.title); throw new Error('disk full'); },
      })).toThrow('disk full');
      expect(readFileSync(path, 'utf8')).toBe(original);
      expect(existsSync(tempSeen)).toBe(false);
      expect(readdirSync(dir)).toEqual(['day-log.json']);
      writeFileAtomic(resolve(dir, 'drafts.json'), '{}\n');
      expect(readdirSync(dir).sort()).toEqual(['day-log.json', 'drafts.json']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

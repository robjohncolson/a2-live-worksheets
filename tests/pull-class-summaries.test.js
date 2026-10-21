// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  buildIndex, courseRows, dateRanges, fetchSummaries, formatTable, parseArgs, planFiles, resolveSecret,
  summaryFileName, summaryFileText,
} from '../scripts/pull-class-summaries.mjs';

const script = fileURLToPath(new URL('../scripts/pull-class-summaries.mjs', import.meta.url));
const row = (over = {}) => ({
  date: '2026-10-20', course: 'algebra2', section: 'G', model: 'deepseek-chat',
  markdown: '## Landed\n- Translations\n\n## Promises made\n- Quiz Thursday',
  landed: ['Translations'], studentQuestions: ['Is the SAT long?'], promises: ['Quiz Thursday'], nextPrep: [],
  transcriptPath: 'transcripts/algebra2/2026-10-20/G.md', summaryPath: 'summaries/algebra2/2026-10-20/G.md',
  recordedAt: '2026-10-21T00:50:20.124+00:00', ...over,
});
const rows = [
  row({ date: '2026-10-20', section: 'G' }),
  row({ date: '2026-10-19', section: 'D', model: null, transcriptPath: null }),
  row({ date: '2026-10-20', section: 'C' }),
  row({ date: '2026-10-20', course: 'apstats', section: 'B' }),
];

describe('pull-class-summaries: files', () => {
  it('row -> front matter and the Markdown body verbatim', () => {
    expect(summaryFileName(row())).toBe('2026-10-20-G.md');
    expect(summaryFileName(row({ section: 'a/b c' }))).toBe('2026-10-20-a_b_c.md');
    expect(summaryFileText(row())).toBe([
      '---', 'date: 2026-10-20', 'course: algebra2', 'section: G', 'model: deepseek-chat',
      'recordedAt: "2026-10-21T00:50:20.124+00:00"', 'transcriptPath: transcripts/algebra2/2026-10-20/G.md',
      'summaryPath: summaries/algebra2/2026-10-20/G.md', '---', '',
      '## Landed', '- Translations', '', '## Promises made', '- Quiz Thursday', '',
    ].join('\n'));
    const text = summaryFileText(row({ model: null, transcriptPath: '', section: 'no', markdown: 'x\n' }));
    expect(text).toContain('model: null\n');
    expect(text).toContain('transcriptPath: null\n');
    expect(text).toContain('section: "no"\n');
    expect(text.endsWith('---\n\nx\n')).toBe(true);
  });
  it('filters the course and sorts by date then section', () => {
    expect(courseRows(rows, 'algebra2').map(r => `${r.date} ${r.section}`)).toEqual(['2026-10-19 D', '2026-10-20 C', '2026-10-20 G']);
    expect(courseRows(rows, 'apstats').map(r => r.section)).toEqual(['B']);
    expect(() => courseRows([row({ date: '2026-02-30' })], 'algebra2')).toThrow(/bad date/);
    expect(() => courseRows([row({ section: ' ' })], 'algebra2')).toThrow(/section/);
  });
  it('index: the structured lists per summary, earlier entries outside the range kept', () => {
    const pulled = courseRows(rows, 'algebra2');
    const previous = [
      { date: '2026-09-01', section: 'C', course: 'algebra2', file: '2026-09-01-C.md', landed: ['old'], studentQuestions: [], promises: ['p'], nextPrep: [] },
      { date: '2026-10-19', section: 'C', course: 'algebra2', file: '2026-10-19-C.md', landed: [], studentQuestions: [], promises: [], nextPrep: [] },
      { date: '2026-09-01', section: 'B', course: 'apstats', file: '2026-09-01-B.md' },
    ];
    const index = buildIndex(pulled, { previous, from: '2026-10-01', to: '2026-10-21', course: 'algebra2' });
    expect(index.map(e => e.file)).toEqual(['2026-09-01-C.md', '2026-10-19-D.md', '2026-10-20-C.md', '2026-10-20-G.md']);
    expect(index[3]).toEqual({
      date: '2026-10-20', section: 'G', course: 'algebra2', model: 'deepseek-chat', recordedAt: '2026-10-21T00:50:20.124+00:00',
      file: '2026-10-20-G.md', landed: ['Translations'], studentQuestions: ['Is the SAT long?'], promises: ['Quiz Thursday'], nextPrep: [],
    });
    expect(buildIndex([row({ landed: undefined })], { course: 'algebra2', from: '2026-10-20', to: '2026-10-20' })[0].landed).toEqual([]);
  });
  it('marks unchanged files so they are not rewritten', () => {
    const pulled = courseRows(rows, 'algebra2');
    const index = buildIndex(pulled, { course: 'algebra2', from: '2026-10-19', to: '2026-10-20' });
    const first = planFiles(pulled, index, () => null);
    expect(first.map(f => [f.name, f.changed])).toEqual([
      ['2026-10-19-D.md', true], ['2026-10-20-C.md', true], ['2026-10-20-G.md', true], ['index.json', true],
    ]);
    const disk = Object.fromEntries(first.map(f => [f.name, f.text]));
    disk['2026-10-20-C.md'] = 'edited by hand';
    expect(planFiles(pulled, index, name => disk[name] ?? null).filter(f => f.changed).map(f => f.name)).toEqual(['2026-10-20-C.md']);
    expect(() => planFiles([row({ section: 'a b' }), row({ section: 'a_b' })], [], () => null)).toThrow(/two summaries/);
  });
  it('dry-run table has one line per row', () => {
    const table = formatTable(courseRows(rows, 'algebra2')).split('\n');
    expect(table[0]).toMatch(/^date\s+section\s+model\s+landed\s+questions\s+promises\s+next\s+recorded$/);
    expect(table[3]).toMatch(/^2026-10-20\s+G\s+deepseek-chat\s+1\s+1\s+1\s+0\s+2026-10-21T00:50/);
  });
});

describe('pull-class-summaries: range and arguments', () => {
  it('defaults to the last 30 days, algebra2; validates', () => {
    expect(parseArgs([], '2026-10-21')).toEqual({ dryRun: false, from: '2026-09-22', to: '2026-10-21', course: 'algebra2' });
    expect(parseArgs(['--to', '2026-10-20', '--course', 'apstats', '--out', 'x', '--dry-run'], '2026-10-21'))
      .toEqual({ dryRun: true, from: '2026-09-21', to: '2026-10-20', course: 'apstats', out: 'x' });
    expect(() => parseArgs(['--course', 'geometry'])).toThrow(/course/);
    expect(() => parseArgs(['--from', '2026-02-30'])).toThrow(/real/);
    expect(() => parseArgs(['--from', '2026-10-21', '--to', '2026-10-20'])).toThrow(/after/);
    expect(() => parseArgs(['--from'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--date', '2026-10-21'])).toThrow(/unknown/);
  });
  it('pages ranges longer than 62 days', () => {
    expect(dateRanges('2026-10-01', '2026-10-01')).toEqual([['2026-10-01', '2026-10-01']]);
    expect(dateRanges('2026-09-01', '2026-11-01')).toEqual([['2026-09-01', '2026-11-01']]); // 62 days inclusive
    expect(dateRanges('2026-09-01', '2026-11-02')).toEqual([['2026-09-01', '2026-11-01'], ['2026-11-02', '2026-11-02']]);
    expect(dateRanges('2026-08-25', '2027-06-20').length).toBe(5);
  });
  it('fetches every page with the secret header and joins the rows', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push([url, init.headers['x-teacher-secret']]);
      const from = new URL(url).searchParams.get('from');
      return { ok: true, json: async () => ({ summaries: [row({ date: from })] }) };
    };
    const got = await fetchSummaries({ server: 'http://s', secret: 'k', from: '2026-09-01', to: '2026-11-02', fetchImpl });
    expect(calls).toEqual([
      ['http://s/teacher/summaries?from=2026-09-01&to=2026-11-01', 'k'],
      ['http://s/teacher/summaries?from=2026-11-02&to=2026-11-02', 'k'],
    ]);
    expect(got.map(r => r.date)).toEqual(['2026-09-01', '2026-11-02']);
    const failing = async () => ({ ok: false, status: 401, json: async () => ({ error: 'bad k-' + 'z'.repeat(30) }) });
    await expect(fetchSummaries({ server: 'http://s', secret: 'k', from: '2026-10-01', to: '2026-10-01', fetchImpl: failing }))
      .rejects.toThrow('GET /teacher/summaries: HTTP 401 bad [redacted]');
  });
  it('refuses to run without a teacher secret', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'pull-'));
    try {
      expect(() => resolveSecret({}, dir, {})).toThrow(/teacher secret not found/);
      expect(resolveSecret({}, dir, { TEACHER_KEY: 't' })).toBe('t');
      expect(resolveSecret({}, dir, { ROSTER_TEACHER_SECRET: 'r', TEACHER_KEY: 't' })).toBe('r');
      mkdirSync(resolve(dir, 'roster-server'));
      writeFileSync(resolve(dir, 'roster-server/.env'), 'ROSTER_TEACHER_SECRET="f"\n');
      expect(resolveSecret({}, dir, { ROSTER_TEACHER_SECRET: 'r' })).toBe('f');
      expect(resolveSecret({ secret: 's' }, dir, {})).toBe('s');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('pull-class-summaries: end to end', () => {
  const run = (args) => new Promise(done => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    child.on('close', code => done({ code, out }));
  });
  it('writes the course files once, then reports them unchanged; dry run writes nothing', async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ summaries: rows }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const dir = mkdtempSync(resolve(tmpdir(), 'pull-'));
    const base = ['--server', 'http://127.0.0.1:' + server.address().port, '--secret', 'k', '--from', '2026-10-19', '--to', '2026-10-20', '--out', dir];
    try {
      const dry = await run([...base, '--dry-run']);
      expect(dry.code).toBe(0);
      expect(dry.out.trim().split('\n')).toHaveLength(4);
      expect(() => readFileSync(resolve(dir, 'index.json'))).toThrow();
      expect(await run(base)).toEqual({ code: 0, out: '3 summaries: 3 written, 0 unchanged\n' });
      expect(JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')).map(e => e.file)).toEqual(['2026-10-19-D.md', '2026-10-20-C.md', '2026-10-20-G.md']);
      expect(await run(base)).toEqual({ code: 0, out: '3 summaries: 0 written, 3 unchanged\n' });
      const apstats = await run([...base, '--course', 'apstats', '--out', resolve(dir, 'ap')]);
      expect(apstats.out).toBe('1 summaries: 1 written, 0 unchanged\n');
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('never prints the secret, even when the server echoes it back', async () => {
    const secret = 'SENTINEL-' + 'q'.repeat(8) + '-s3cr3t';
    const server = createServer((req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'rejected ' + req.headers['x-teacher-secret'] + ' ' + secret }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const { code, out } = await run(['--secret', secret, '--server', 'http://127.0.0.1:' + server.address().port, '--dry-run']);
      expect(code).toBe(1);
      expect(out).toMatch(/HTTP 500/);
      expect(out).not.toContain(secret);
      expect(out.toLowerCase()).not.toContain('sentinel-qqqqqqqq');
    } finally { server.close(); }
  });
});

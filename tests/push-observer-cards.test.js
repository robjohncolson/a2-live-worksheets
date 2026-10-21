// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { buildCards, formatTable, parseArgs, redact } from '../scripts/push-observer-cards.mjs';

const script = fileURLToPath(new URL('../scripts/push-observer-cards.mjs', import.meta.url));
const observerCard = { title: 'Which graph?', mode: 'pairs', minutes: 6, frame: 'It is ___ because ___.', body: '## Prompt\n\nPick one.' };
const log = { entries: [
  { date: '2026-10-21', section: 'G', lesson: '1-3', plan: 'x', observerCard },
  { date: '2026-10-21', section: 'C', lesson: '1-3', plan: 'no card' },
  { date: '2026-10-20', section: 'all', lesson: '1-2', observerCard: { title: 'Warm-up', body: 'Go.' } },
  { date: '2026-10-22', lesson: '1-3', observerCard: { title: 'No section', body: 'Go.' } },
] };

describe('push-observer-cards', () => {
  it('builds sorted rows from entries with an observerCard; all/missing section => null', () => {
    expect(buildCards(log)).toEqual([
      { date: '2026-10-20', course: 'algebra2', section: null, lesson: '1-2', title: 'Warm-up', mode: 'whiteboards', minutes: 10, frame: null, body: 'Go.', source: 'desk' },
      { date: '2026-10-21', course: 'algebra2', section: 'G', lesson: '1-3', ...observerCard, source: 'desk' },
      { date: '2026-10-22', course: 'algebra2', section: null, lesson: '1-3', title: 'No section', mode: 'whiteboards', minutes: 10, frame: null, body: 'Go.', source: 'desk' },
    ]);
  });
  it('honours --from and rejects malformed or duplicate cards', () => {
    expect(buildCards(log, { from: '2026-10-21' }).map(card => card.date)).toEqual(['2026-10-21', '2026-10-22']);
    expect(() => buildCards({ entries: [{ date: '2026-10-21', section: 'C', observerCard: { body: 'x' } }] })).toThrow(/title/);
    expect(() => buildCards({ entries: [{ date: '2026-10-21', section: 'C', observerCard: { title: 't', body: 'x', mode: 'dance' } }] })).toThrow(/mode/);
    expect(() => buildCards({ entries: [
      { date: '2026-10-21', section: 'all', observerCard: { title: 't', body: 'x' } },
      { date: '2026-10-21', observerCard: { title: 'u', body: 'y' } },
    ] })).toThrow(/more than one/);
    expect(buildCards(log, { date: '2026-10-21' }).map(card => card.date)).toEqual(['2026-10-21']);
    expect(parseArgs(['--date', '2026-10-21'])).toEqual({ dryRun: false, date: '2026-10-21' });
    expect(() => parseArgs(['--date', '2026-02-30'])).toThrow(/real/);
    expect(() => parseArgs(['--date', '2026-10-21', '--from', '2026-10-20'])).toThrow(/combined/);
    expect(() => parseArgs(['--from', '10/21'])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(['--from', '2026-02-30'])).toThrow(/real/);
    expect(parseArgs(['--dry-run', '--server', 'http://x'])).toEqual({ dryRun: true, server: 'http://x' });
  });
  it('prints a table and sends nothing with --dry-run', () => {
    expect(formatTable(buildCards(log)).split('\n')[0]).toMatch(/^date\s+section\s+lesson\s+mode\s+min\s+title$/);
    const dir = mkdtempSync(resolve(tmpdir(), 'cards-'));
    try {
      writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify(log));
      const run = spawnSync(process.execPath, [script, '--dry-run', '--file', resolve(dir, 'day-log.json'), '--server', 'http://127.0.0.1:9'], { encoding: 'utf8' });
      expect(run.status).toBe(0);
      expect(run.stdout).toMatch(/2026-10-21\s+G\s+1-3\s+pairs\s+6\s+Which graph\?/);
      expect(run.stdout).toMatch(/3 card\(s\); dry run, nothing sent\./);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('applies the server rules: non-string section, bad date, minutes, lengths, types', () => {
    const one = (entry, over = {}) => () => buildCards({ entries: [{ date: '2026-10-21', section: 'C', lesson: '1-3', ...entry,
      observerCard: { title: 't', body: 'b', ...over } }] });
    expect(one({ section: 123 })).toThrow(/section/);
    expect(one({ section: ['C'] })).toThrow(/section/);
    expect(one({ date: '2026-02-30' })).toThrow(/date/);
    expect(one({}, { minutes: 0 })).toThrow(/minutes/);
    expect(one({}, { minutes: 181 })).toThrow(/minutes/);
    expect(one({}, { minutes: '8' })).toThrow(/minutes/);
    expect(one({}, { title: 7 })).toThrow(/title/);
    expect(one({}, { title: '😀'.repeat(201) })).toThrow(/200/);
    expect(one({}, { body: '漢'.repeat(4001) })).toThrow(/4000/);
    expect(one({}, { frame: 3 })).toThrow(/frame/);
    expect(one({ lesson: 13 })).toThrow(/lesson/);
    expect(one({ lesson: 'x'.repeat(33) })).toThrow(/32/);
    expect(one({ section: 'x'.repeat(17) })).toThrow(/16/);
    expect(one({}, { title: '😀'.repeat(200), body: '漢'.repeat(4000) })).not.toThrow();
    expect(buildCards({ entries: [{ date: '2026-10-21', section: ' ALL ', observerCard: { title: 't', body: 'b' } }] })[0].section).toBeNull();
  });
  it('redacts the secret and token-like runs, and truncates', () => {
    const secret = 'sentinel-secret-value';
    expect(redact(`bad secret ${secret}!`, secret)).toBe('bad secret [redacted]!');
    expect(redact('key ' + 'a'.repeat(40), 'zz')).toBe('key [redacted]');
    expect(redact('x '.repeat(300), 's')).toHaveLength(200);
  });
  it('never prints the secret, even when the server echoes it back', async () => {
    const secret = 'SENTINEL-' + 'q'.repeat(8) + '-s3cr3t';
    const server = createServer((req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'rejected ' + req.headers['x-teacher-secret'] + ' ' + secret.toLowerCase() + ' ' + secret }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const dir = mkdtempSync(resolve(tmpdir(), 'cards-'));
    try {
      writeFileSync(resolve(dir, 'day-log.json'), JSON.stringify(log));
      const child = spawn(process.execPath, [script, '--file', resolve(dir, 'day-log.json'), '--secret', secret,
        '--server', 'http://127.0.0.1:' + server.address().port], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
      const code = await new Promise(r => child.on('close', r));
      expect(code).toBe(1);
      expect(out).toMatch(/HTTP 500/);
      expect(out).not.toContain(secret);
      expect(out.toLowerCase()).not.toContain('sentinel-qqqqqqqq');
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

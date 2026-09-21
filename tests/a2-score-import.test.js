// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolveTeacherSecret } from '../scripts/a2-daily-engagement.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const roots = [];
const servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace() {
  const root = mkdtempSync(resolve(tmpdir(), 'a2-import-'));
  roots.push(root);
  mkdirSync(resolve(root, 'roster-local/blooket'), { recursive: true });
  writeFileSync(resolve(root, 'roster-local/blooket/2026-09-21-PeriodC.json'), JSON.stringify({ players: [] }));
  writeFileSync(resolve(root, 'flashcards.json'), JSON.stringify({ ok: true, section: 'PeriodC', date: '2026-09-21', students: [
    { studentId: 'a', realName: 'Private Fixture', username: 'fixture', best: { correct: 9, total: 10 } },
    { studentId: 'b', realName: 'Absent Fixture', username: 'absent', best: null },
  ] }));
  writeFileSync(resolve(root, 'roster-local/a2-bonus-ledger.json'), JSON.stringify({ entries: [
    { student: 'Private Fixture', section: 'C', quarter: 1, points: 6 },
    { student: 'Private Fixture', section: 'PeriodC', quarter: 1, points: 7 },
  ] }));
  return root;
}

function run(root, script, args) {
  return new Promise(resolveResult => {
    const child = spawn(process.execPath, [resolve(repo, 'scripts', script), ...args], {
      cwd: root, env: { ...process.env, ROSTER_TEACHER_SECRET: 'fixture-ambient-key' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolveResult({ code, stdout, stderr }));
  });
}

async function service() {
  const requests = [];
  const expectedSecret = resolveTeacherSecret(repo, { ROSTER_TEACHER_SECRET: 'fixture-ambient-key' });
  let authorized = true;
  const server = createServer(async (req, res) => {
    authorized &&= req.headers['x-teacher-secret'] === expectedSecret;
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, body: JSON.parse(body) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { requests, authorized: () => authorized, url: `http://127.0.0.1:${server.address().port}` };
}

it('engagement defaults to dry-run; repeated commits send identical point snapshots with local teacher authentication', async () => {
  const root = workspace();
  const server = await service();
  const args = ['--section', 'PeriodC', '--date', '2026-09-21', '--offline', 'flashcards.json', '--url', server.url];
  for (const flags of [[], ['--dry-run'], ['--commit'], ['--commit']]) {
    const result = await run(root, 'a2-daily-engagement.mjs', [...args, ...flags]);
    expect(result).toEqual({ code: 0, stderr: '', stdout: 'scored: 1, absent: 1, unmatched: 0\n' });
  }
  expect(server.requests).toHaveLength(2);
  expect(server.requests[0]).toEqual(server.requests[1]);
  expect(server.requests[0]).toMatchObject({ path: '/teacher/score-import', body: {
    source: 'daily-engagement', date: '2026-09-21', section: 'PeriodC',
    scores: [{ studentId: 'a', score: 9 }, { studentId: 'b', score: null }],
  } });
  expect(server.authorized()).toBe(true);
});

it('bonus dry-runs print counts only and commits overwrite capped quarter snapshots for all sections', async () => {
  const root = workspace();
  const server = await service();
  for (const flags of [[], ['--dry-run'], ['--commit'], ['--commit']]) {
    const result = await run(root, 'a2-bonus-totals.mjs', ['--url', server.url, ...flags]);
    expect(result).toEqual({ code: 0, stderr: '', stdout: 'awards: 2, scored: 1\n' });
  }
  expect(server.requests).toHaveLength(6);
  expect(server.requests.slice(0, 3)).toEqual(server.requests.slice(3));
  expect(server.requests[0].body).toEqual({ source: 'bonus', quarter: 'Q1', section: 'C', scores: [{ student: 'Private Fixture', score: 10 }] });
  expect(server.requests[1].body.scores).toEqual([]);
  expect(server.authorized()).toBe(true);
});

it('rejects conflicting flags and malformed bonus input without leaking private data', async () => {
  const root = workspace();
  expect((await run(root, 'a2-bonus-totals.mjs', ['--dry-run', '--commit'])).code).toBe(1);
  writeFileSync(resolve(root, 'roster-local/a2-bonus-ledger.json'), '{Private Fixture');
  const result = await run(root, 'a2-bonus-totals.mjs', []);
  expect(result.code).toBe(1);
  expect(result.stdout + result.stderr).not.toMatch(/Private Fixture|fixture-ambient-key/);
});

import { afterEach, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.js';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('has no default-schema qualification in server source or SQL', () => {
  const hits = [];
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) { scan(path); continue; }
      if (!/\.(?:js|mjs|sql)$/.test(entry.name)) continue;
      const source = readFileSync(path, 'utf8');
      if (/\bpublic\s*\./i.test(source) || /\.schema\s*\(\s*['"]public['"]/i.test(source)) hits.push(path.pathname);
    }
  }
  scan(new URL('../', import.meta.url));
  expect(hits).toEqual([]);
});

it('refuses unsafe schema before constructing live clients or listening', () => {
  const result = spawnSync(process.execPath, ['server.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'production', ROSTER_DB_SCHEMA: 'public' },
    encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Refusing to start');
});

it('reports a2 and permits only configured CORS origins, including preflight', async () => {
  vi.stubEnv('CORS_ORIGINS', 'https://a2.example, http://localhost:8080');
  vi.stubEnv('ROSTER_DB_SCHEMA', 'a2');
  const server = createServer(createApp({}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/health`;
  try {
    const response = await fetch(url, { headers: { Origin: 'https://a2.example' } });
    expect(await response.json()).toMatchObject({ ok: true, schema: 'a2' });
    expect(response.headers.get('access-control-allow-origin')).toBe('https://a2.example');
    const denied = await fetch(url, { headers: { Origin: 'https://other.example' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8080', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-teacher-secret' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:8080');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

it('warns about wildcard only when CORS_ORIGINS is unset', () => {
  vi.stubEnv('CORS_ORIGINS', '');
  delete process.env.CORS_ORIGINS;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  createApp({});
  expect(warn.mock.calls.flat().join(' ')).toContain('CORS_ORIGINS is unset');
  warn.mockClear();
  vi.stubEnv('CORS_ORIGINS', '');
  createApp({});
  expect(warn.mock.calls.flat().join(' ')).not.toContain('CORS_ORIGINS is unset');
});

it('bundles byte-identical copies of the browser-shared files it imports', () => {
  // Railway deploys roster-server as its root; regenerate with node scripts/sync-server-shared.mjs.
  const root = new URL('../../', import.meta.url);
  for (const [source, bundled] of [
    ['lib/a2-answers.js', 'roster-server/lib/a2-answers.js'],
    ['content/a2/lessons.json', 'roster-server/data/a2-lessons.json'],
    ['data/a2-lesson-targets.json', 'roster-server/data/a2-lesson-targets.json'],
  ]) {
    expect(readFileSync(new URL(bundled, root), 'utf8'), bundled).toBe(readFileSync(new URL(source, root), 'utf8'));
  }
});

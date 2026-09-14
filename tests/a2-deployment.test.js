import { it, expect } from 'vitest';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

it('contains no inherited production hosts in repository source, configs or tests', () => {
  const skip = new Set(['.pytest_cache', 'state', 'coverage', 'node_modules', '.gitnexus', '.git']);
  const inheritedPatterns = [
    'roster-production-' + '12c1',
    'curriculumrender-' + 'production',
    'apstats-' + 'live-worksheet',
    'robjohncolson.github.io/' + 'apstats',
  ];
  const hits = [];
  const visited = new Set();
  function scan(dir, relative = '') {
    let entries;
    try {
      const actual = realpathSync(dir);
      if (visited.has(actual)) return;
      visited.add(actual);
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') return;
      throw error;
    }
    for (const entry of entries) {
      const path = relative + entry.name;
      if (skip.has(entry.name) || path === 'docs/apstats-history' || path === 'tests/a2-deployment.test.js') continue;
      const file = resolve(dir, entry.name);
      let info;
      try {
        info = entry.isSymbolicLink() ? statSync(file) : entry;
      } catch (error) {
        if (error.code === 'EPERM' || error.code === 'EACCES') continue;
        throw error;
      }
      if (info.isDirectory()) { scan(file, path + '/'); continue; }
      const source = readFileSync(resolve(dir, entry.name), 'utf8');
      if (inheritedPatterns.some(pattern => source.includes(pattern))) hits.push(path);
    }
  }
  scan(process.cwd());
  expect(hits).toEqual([]);
});

it('resolves mobile worksheet links with a configurable base and an A2 fallback', () => {
  const html = readFileSync('mobile-home.html', 'utf8');
  const base = html.slice(html.indexOf('  var _WS_BASE ='), html.indexOf('  // Web-vs-APK signal:'));
  const helper = html.match(/  function _relWs\(u\) \{[^\n]+/)[0];
  for (const window of [
    {},
    { WORKSHEET_BASE_URL: 'https://legacy.a2.example.test/course' },
    { A2_CONFIG: { WORKSHEET_BASE_URL: 'https://a2.example.test/course' }, WORKSHEET_BASE_URL: 'https://unused.example.test/' },
  ]) {
    const expected = window.A2_CONFIG?.WORKSHEET_BASE_URL || window.WORKSHEET_BASE_URL
      || 'https://robjohncolson.github.io/a2-live-worksheets/';
    const sandbox = { window };
    vm.runInNewContext(base + helper, sandbox);
    expect(sandbox._WS_BASE).toBe(expected.replace(/\/?$/, '/'));
    expect(sandbox._relWs(sandbox._WS_BASE + 'check.html?lesson=1-1')).toBe('check.html?lesson=1-1');
    expect(sandbox._relWs('https://external.example.test/check.html')).toBe('https://external.example.test/check.html');
  }
});

it('uses A2 configuration and retains client fallback if the config script is missing', async () => {
  const calls = [];
  const window = { A2_CONFIG: { ROSTER_SERVICE_URL: 'https://configured.example' } };
  const sandbox = { window, localStorage: { getItem: () => null }, fetch: async url => { calls.push(url); return { ok: true, json: async () => ({ sections: [] }) }; }, console };
  vm.runInNewContext(readFileSync('roster-client.js', 'utf8'), sandbox);
  await window.rosterClient.openSections();
  expect(calls[0]).toContain('https://configured.example/');
  delete window.A2_CONFIG;
  await window.rosterClient.openSections();
  expect(calls[1]).toContain('https://a2-live-worksheets-production.up.railway.app/');
});

it('publishes the same asset tree on both static hosts and serves index at root', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(config.routes[0]).toEqual({ src: '^/$', dest: '/index.html' });
  expect(config.routes).toContainEqual({ handle: 'filesystem' });
  const ignores = readFileSync('.vercelignore', 'utf8').split(/\r?\n/);
  for (const path of ['content', 'lib', 'data']) expect(ignores).not.toContain(path);
  for (const path of ['roster-server', 'state', 'tests', 'scripts', 'docs', 'dok', 'node_modules', '.gitnexus', '.pytest_cache']) expect(ignores).toContain(path);
  expect(readFileSync('.github/workflows/pages.yml', 'utf8')).toContain('--exclude-from=.vercelignore');
});

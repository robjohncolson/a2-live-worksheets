import { it, expect } from 'vitest';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

it('contains no bundled JWTs, database project hosts, or inherited project reference anywhere including history', () => {
  const excluded = new Set(['node_modules', '.git', '.gitnexus', 'state', '.pytest_cache']);
  const patterns = [
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
    /[A-Za-z0-9_-]+\.supabase\.co\b/i,
    new RegExp('hgvnytaq' + 'muybzbotosyj'),
  ];
  const hits = [];
  const visited = new Set();
  function scan(directory, relative = '') {
    const actual = realpathSync(directory);
    if (visited.has(actual)) return;
    visited.add(actual);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      const info = entry.isSymbolicLink() ? statSync(file) : entry;
      const path = relative + entry.name;
      if (info.isDirectory()) {
        if (!excluded.has(entry.name)) scan(file, path + '/');
        continue;
      }
      const source = readFileSync(file, 'utf8');
      if (patterns.some(pattern => pattern.test(source))) hits.push(path);
    }
  }
  scan(process.cwd());
  expect(hits).toEqual([]);
});

it('disables study-guide sync without A2 configuration, even with a stale legacy config', () => {
  const source = readFileSync('data/study-guide-sync-config.js', 'utf8');
  const window = { AP_STATS_STUDY_GUIDE_SUPABASE: { url: 'https://stale.example.test', anonKey: 'stale' } };
  vm.runInNewContext(source, { window });
  expect(window.AP_STATS_STUDY_GUIDE_SUPABASE).toBeNull();
  const config = { url: 'https://configured.example.test', anonKey: 'runtime-only' };
  window.A2_CONFIG = { STUDY_GUIDE_SYNC: config };
  vm.runInNewContext(source, { window });
  expect(window.AP_STATS_STUDY_GUIDE_SUPABASE).toBe(config);
});

it('removes the direct database client and overlay from Desk', () => {
  const html = readFileSync('desk.html', 'utf8');
  expect(html).not.toMatch(/SUPABASE_URL|SUPABASE_ANON_KEY|supabase-js|loadSupabaseOverlay|mergeSupabase/);
  expect(html).not.toMatch(/\/rest\/v1\/(?:students|student_progress|lesson_urls|topic_schedule)/);
});

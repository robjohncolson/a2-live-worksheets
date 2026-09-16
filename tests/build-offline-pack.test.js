/**
 * Tests for scripts/build-offline-pack.mjs (OFFLINE_MODE_SPEC §4.E).
 * Pure-helper units + one real build into a temp dir (then cleaned up).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { injectOfflineConfig, genOfflineConfig } from '../scripts/build-offline-pack.mjs';

const repo = resolve(import.meta.dirname, '..');

describe('injectOfflineConfig', () => {
  it('inserts offline-config.js as the first script after <head>', () => {
    const out = injectOfflineConfig('<html><head>\n<script src="a.js"></script></head><body></body></html>', '');
    expect(out).toMatch(/<head>\s*<script src="offline-config\.js"><\/script>/);
    expect(out.indexOf('offline-config.js')).toBeLessThan(out.indexOf('a.js'));
  });
  it('honors a nesting relPrefix (e.g. a subdir page)', () => {
    const out = injectOfflineConfig('<head></head>', '../');
    expect(out).toContain('src="../offline-config.js"');
  });
  it('is idempotent (no double-inject)', () => {
    const once = injectOfflineConfig('<head></head>', '');
    const twice = injectOfflineConfig(once, '');
    expect((twice.match(/offline-config\.js/g) || []).length).toBe(1);
  });
});

describe('genOfflineConfig', () => {
  it('generic pack sets OFFLINE_MODE and bakes no session', () => {
    const cfg = genOfflineConfig(null);
    expect(cfg).toContain('window.OFFLINE_MODE = true');
    expect(cfg).not.toContain('a2_roster.v1');
  });
  it('personalized pack bakes a signed-in a2_roster.v1 with an offline token', () => {
    const cfg = genOfflineConfig({ studentId: 'abc', username: 'mango_tiger', realName: 'Mango T.', section: 'C' }, { now: Date.parse('2026-09-16') });
    expect(cfg).toContain('window.OFFLINE_MODE = true');
    expect(cfg).toContain('a2_roster.v1');
    expect(cfg).toContain('offline-abc');     // synthesized token
    expect(cfg).toContain('mango_tiger');
    expect(cfg).toContain('!localStorage.getItem'); // only sets a session if none cached
  });
});

describe('build (real, into a temp dir)', () => {
  const out = resolve(repo, 'state', '_pack_test');
  afterAll(() => { try { rmSync(out, { recursive: true, force: true }); } catch (_) {} });

  it('assembles a personalized pack with injected config and the launcher', () => {
    // Reuse the minimal A2 worksheet fixture, without production worksheets.
    const r = spawnSync('node', ['scripts/build-offline-pack.mjs', '--source', 'tests/fixtures/a2', '--out', 'state/_pack_test',
      '--identity', '{"studentId":"abc","username":"mango_tiger","realName":"Mango T.","section":"C"}'],
      { cwd: repo, encoding: 'utf8' });
    expect(r.status).toBe(0);

    // core artifacts
    expect(existsSync(resolve(out, 'offline-config.js'))).toBe(true);
    expect(existsSync(resolve(out, 'Start-Offline.cmd'))).toBe(true);
    expect(existsSync(resolve(out, 'serve.mjs'))).toBe(true);
    expect(existsSync(resolve(out, 'index.html'))).toBe(true);
    expect(existsSync(resolve(out, 'offline.html'))).toBe(true);
    expect(existsSync(resolve(out, 'offline-queue.js'))).toBe(true);

    // identity baked
    expect(readFileSync(resolve(out, 'offline-config.js'), 'utf8')).toContain('offline-abc');

    // Retained academic submission and receipt helpers ship with file recovery.
    for (const f of ['student-key.js', 'submission-store.js', 'submission-capture.js', 'submission-grader.js', 'receipt-sign.js', 'secure-key.js']) {
      expect(existsSync(resolve(out, f)), `${f} must be in the pack`).toBe(true);
    }
    // SECURITY: the FULL answer key must NEVER ship to a student device.
    // The redacted key comes from the server at runtime; the teacher fetches the full
    // key from the teacher-gated endpoint — neither belongs in the bundled data/.
    expect(existsSync(resolve(out, 'data', 'answer-key.json')), 'answer-key.json must NOT be in the student pack').toBe(false);
    expect(existsSync(resolve(out, 'data', 'worksheet-key.json')), 'worksheet-key.json must NOT be in the student pack').toBe(false);
    // Sweep the whole pack: a private key file at any depth is a leak.
    const KEY_NAMES = new Set(['answer-key.json', 'worksheet-key.json']);
    const leaked = [];
    (function sweep(dir) {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) sweep(p);
        else if (KEY_NAMES.has(ent.name)) leaked.push(p);
      }
    })(out);
    expect(leaked, `answer-key file(s) found in the built pack: ${leaked.join(', ')}`).toEqual([]);
    // but the non-secret data files still ship
    expect(existsSync(resolve(out, 'data', 'lesson-schedule.json')) || existsSync(resolve(out, 'data'))).toBe(true);

    // a worksheet was copied AND had offline-config.js injected
    const ws = readFileSync(resolve(out, 'u1_lesson1_live.html'), 'utf8');
    expect(ws).toContain('src="offline-config.js"');
    expect(ws).toContain('src="offline-queue.js"'); // the Phase 0 wiring is present in the copy

    // The A2 lesson-check entry point and its client ship with offline config.
    const check = readFileSync(resolve(out, 'check.html'), 'utf8');
    expect(check).toContain('src="offline-config.js"');
    expect(existsSync(resolve(out, 'check.js'))).toBe(true);
    expect(existsSync(resolve(out, 'a2-client.js'))).toBe(true);
    expect(existsSync(resolve(out, 'content', 'a2', 'lessons.json'))).toBe(true);
  }, 90000);
});

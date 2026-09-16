// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildWorkManifest } from '../scripts/build-work-manifest.mjs';

describe('disabled Algebra 2 manifest CLI', () => {
  it('retains the importable legacy builder', () => {
    expect(typeof buildWorkManifest).toBe('function');
  });

  it('refuses generation with a nonzero exit and leaves all files unchanged', () => {
    const root = mkdtempSync(join(tmpdir(), 'a2-manifest-cli-'));
    try {
      const script = join(root, 'scripts/build-work-manifest.mjs');
      mkdirSync(dirname(script), { recursive: true });
      copyFileSync(new URL('../scripts/build-work-manifest.mjs', import.meta.url), script);
      const targets = [
        'data/work-manifest.json',
        'roster-server/data/work-manifest.json',
      ];
      for (const path of targets) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), 'preserve existing manifest\n');
      }
      const before = readdirSync(root, { recursive: true }).sort();
      const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('A2 manifest generator not yet available');
      expect(result.stdout).toBe('');
      expect(readdirSync(root, { recursive: true }).sort()).toEqual(before);
      for (const path of targets) {
        expect(readFileSync(join(root, path), 'utf8')).toBe('preserve existing manifest\n');
      }
      expect(readFileSync(script, 'utf8')).toBe(readFileSync(new URL('../scripts/build-work-manifest.mjs', import.meta.url), 'utf8'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

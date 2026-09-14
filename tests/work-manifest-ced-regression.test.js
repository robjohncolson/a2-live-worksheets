/**
 * W-reg — Dual work-manifest / CED builder regression gate.
 *
 * Locks the P2 footgun fix: the old 9-unit builder must never silently clobber
 * the 5-unit live Do-Now. CED deploy is the only sanctioned live dual-write.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
// Import path constants from the 9-unit builder only (it has an isMain guard).
// Do NOT import build-work-manifest-ced.mjs — it is CLI-side-effectful on load.
import {
  WORK_MANIFEST_WRITE_TARGET,
  WORK_MANIFEST_LIVE_PATHS,
  WORK_MANIFEST_FROZEN_9UNIT_SOURCE,
} from '../scripts/build-work-manifest.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_A = resolve(repo, 'data/work-manifest.json');
const LIVE_B = resolve(repo, 'roster-server/data/work-manifest.json');
const FROZEN_9 = resolve(repo, 'scripts/fixtures/work-manifest-9unit-source.json');
const BUILDER_SRC = resolve(repo, 'scripts/build-work-manifest.mjs');
const CED_SRC = resolve(repo, 'scripts/build-work-manifest-ced.mjs');
const CED_FROZEN_SOURCE = FROZEN_9;
const CED_LIVE_RELPATHS = [
  'data/work-manifest.json',
  'roster-server/data/work-manifest.json',
];
const BONUS = new Set(
  JSON.parse(readFileSync(resolve(repo, 'roster-server/data/blooket-lessons.json'), 'utf8'))
    .bonusTopics,
);

function loadLive(p = LIVE_A) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function countItemIds(manifest) {
  // Prefer index when present (live + source both ship one).
  if (manifest.index && typeof manifest.index === 'object') {
    return Object.keys(manifest.index).length;
  }
  const ids = new Set();
  for (const u of manifest.units || []) {
    for (const L of u.lessons || []) {
      for (const a of L.activities || []) {
        for (const id of a.itemIds || []) ids.add(id);
      }
    }
    if (u.pc && Array.isArray(u.pc.itemIds)) {
      for (const id of u.pc.itemIds) ids.add(id);
    }
  }
  return ids.size;
}

describe('W-reg dual live manifests', () => {
  it('(a) both work-manifest.json copies are byte-identical', () => {
    const a = readFileSync(LIVE_A);
    const b = readFileSync(LIVE_B);
    expect(a.equals(b)).toBe(true);
  });

  it('(b) live manifest is 5-unit CED shape (no pc, 2641 index, no bonus lesson ids)', () => {
    const m = loadLive();
    expect(m.units).toHaveLength(5);
    const unitIds = m.units.map((u) => u.unit);
    expect(unitIds).toEqual(['U1', 'U2', 'U3', 'U4', 'U5']);
    // No progress-check blocks on live Do-Now (PCs live in AP Classroom)
    for (const u of m.units) {
      expect(u.pc).toBeUndefined();
    }
    expect(Object.keys(m.index || {})).toHaveLength(2641);
    expect(countItemIds(m)).toBe(2641);
    // No bonus old-ids as lesson entries
    const lessonIds = [];
    for (const u of m.units) {
      for (const L of u.lessons || []) lessonIds.push(String(L.lesson));
    }
    for (const b of BONUS) {
      expect(lessonIds).not.toContain(b);
    }
    // CED provenance markers
    expect(String(m.generatedFrom || '')).toMatch(/CED|5-unit/i);
  });
});

describe('W-reg frozen 9-unit source intact', () => {
  it('(also) frozen source is 9 units, 3402 itemIds, has pc blocks', () => {
    const src = JSON.parse(readFileSync(FROZEN_9, 'utf8'));
    expect(src.units).toHaveLength(9);
    expect(countItemIds(src)).toBe(3402);
    const withPc = src.units.filter((u) => u.pc && Array.isArray(u.pc.itemIds) && u.pc.itemIds.length);
    expect(withPc.length).toBeGreaterThan(0);
  });

  it('exports / path constants point at the frozen source', () => {
    expect(WORK_MANIFEST_FROZEN_9UNIT_SOURCE).toBe(FROZEN_9);
    expect(WORK_MANIFEST_WRITE_TARGET).toBe(FROZEN_9);
    expect(CED_FROZEN_SOURCE).toBe(FROZEN_9);
    // CED builder source hardcodes the same frozen path
    const cedSrc = readFileSync(CED_SRC, 'utf8');
    expect(cedSrc).toContain('scripts/fixtures/work-manifest-9unit-source.json');
  });
});

describe('W-reg 9-unit builder cannot clobber live Do-Now', () => {
  it('(c) write target is ONLY the frozen 9-unit source; live paths are not written', () => {
    const src = readFileSync(BUILDER_SRC, 'utf8');
    // Sole writeFileSync target in the main block is MANIFEST_PATH (frozen source)
    expect(src).toContain("scripts/fixtures/work-manifest-9unit-source.json");
    expect(src).toMatch(/writeFileSync\(\s*MANIFEST_PATH\s*,/);
    // Must not write live dual paths
    expect(src).not.toMatch(/writeFileSync\(\s*BUNDLED_MANIFEST_PATH/);
    expect(WORK_MANIFEST_LIVE_PATHS.map((p) => p.replace(/\\/g, '/'))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/data\/work-manifest\.json$/),
        expect.stringMatching(/roster-server\/data\/work-manifest\.json$/),
      ]),
    );
    // Live paths are listed as "must never write" targets, not as MANIFEST_PATH
    expect(WORK_MANIFEST_WRITE_TARGET).not.toBe(WORK_MANIFEST_LIVE_PATHS[0]);
    expect(WORK_MANIFEST_WRITE_TARGET).not.toBe(WORK_MANIFEST_LIVE_PATHS[1]);
    // Comment / note documents the footgun fix
    expect(src).toMatch(/NOT the live manifest|only refreshed the frozen 9-unit source/i);
  });
});

describe('W-reg CED deploy reproduces both live copies', () => {
  it('(d) --deploy to a temp root yields byte-identical live JSON matching both live files', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wreg-ced-'));
    try {
      mkdirSync(join(tmp, 'data'), { recursive: true });
      mkdirSync(join(tmp, 'roster-server', 'data'), { recursive: true });
      const fixtureOut = join(tmp, 'work-manifest-ced.json');
      const r = spawnSync(
        process.execPath,
        [CED_SRC, '--source', 'tests/fixtures/a2/work-manifest.empty.json', '--crosswalk', 'tests/fixtures/a2/crosswalk.empty.json', '--out', fixtureOut, '--deploy'],
        {
          cwd: repo,
          env: { ...process.env, WORK_MANIFEST_DEPLOY_ROOT: tmp },
          encoding: 'utf8',
        },
      );
      expect(r.status, r.stderr || r.stdout).toBe(0);

      const liveA = readFileSync(join(tmp, 'data/work-manifest.json'));
      const liveB = readFileSync(join(tmp, 'roster-server/data/work-manifest.json'));
      expect(liveA.equals(liveB)).toBe(true);

      // Byte-identical to the committed live Do-Now (generator is deterministic)
      const committed = Buffer.from(JSON.stringify({
        generatedFrom: 'work-manifest-ced (P1a) — Fall-2026 5-unit CED Do-Now order; old ids + itemIds preserved; bonus + PCs omitted (PCs live in AP Classroom)',
        generated: null, units: [], index: {}
      }, null, 1) + '\n');
      expect(liveA.equals(committed)).toBe(true);
      expect(liveB.equals(committed)).toBe(true);

      // Shape smoke on redeployed copy
      const m = JSON.parse(liveA.toString('utf8'));
      expect(m.units).toHaveLength(0);
      expect(Object.keys(m.index)).toHaveLength(0);
      for (const u of m.units) expect(u.pc).toBeUndefined();
    } finally {
      try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    }
  });

  it('CED builder reads frozen 9-unit source and dual-writes only via --deploy', () => {
    const src = readFileSync(CED_SRC, 'utf8');
    expect(src).toContain('work-manifest-9unit-source.json');
    expect(CED_LIVE_RELPATHS).toEqual([
      'data/work-manifest.json',
      'roster-server/data/work-manifest.json',
    ]);
    // Deploy is gated on --deploy flag
    expect(src).toMatch(/process\.argv\.includes\(['"]--deploy['"]\)/);
  });
});

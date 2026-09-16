// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateBundle } from '../scripts/build-grade-engine.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'data/lineage.json'), 'utf8'));
const SPECIAL_PINS = new Set(['golden-master', 'manual']);
const KINDS = new Set(['source', 'derived', 'external']);

function wildcardRegex(pattern) {
  let source = '^';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(source + '$');
}

function pathOrGlobExists(relativePath) {
  if (!relativePath.includes('*')) return existsSync(resolve(ROOT, relativePath));

  const parent = resolve(ROOT, dirname(relativePath));
  if (!existsSync(parent)) return false;
  const namePattern = wildcardRegex(basename(relativePath));
  return readdirSync(parent).some((name) => namePattern.test(name));
}

function commandDirectory(command) {
  const match = command.match(/^cd\s+([^\s&]+)\s+&&\s+/);
  return match ? resolve(ROOT, match[1]) : ROOT;
}

function assertCommandExists(command) {
  const cwd = commandDirectory(command);
  let checked = false;

  for (const match of command.matchAll(/\bnode\s+([^\s]+)/g)) {
    checked = true;
    expect(existsSync(resolve(cwd, match[1])), `${command}: missing ${match[1]}`).toBe(true);
  }

  const npmMatch = command.match(/\bnpm\s+run\s+([\w:-]+)/);
  if (npmMatch) {
    checked = true;
    const packageJson = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
    expect(packageJson.scripts?.[npmMatch[1]], `${command}: npm script does not exist`).toBeTruthy();
  }

  const vitestMatch = command.match(/\bnpx\s+vitest\s+run\s+([^\s]+)/);
  if (vitestMatch) {
    checked = true;
    expect(existsSync(resolve(cwd, vitestMatch[1])), `${command}: missing Vitest target`).toBe(true);
  }

  expect(checked, `${command}: unsupported regeneration command shape`).toBe(true);
}

function findCycle(artifacts) {
  const inputsById = new Map(artifacts.map((artifact) => [artifact.id, artifact.inputs]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id, trail) {
    if (visiting.has(id)) return [...trail, id];
    if (visited.has(id)) return null;

    visiting.add(id);
    for (const inputId of inputsById.get(id) || []) {
      const cycle = visit(inputId, [...trail, id]);
      if (cycle) return cycle;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const artifact of artifacts) {
    const cycle = visit(artifact.id, []);
    if (cycle) return cycle;
  }
  return null;
}

describe('Algebra 2 data lineage manifest', () => {
  it('has the version-1 schema, unique ids, valid references, and no cycles', () => {
    expect(MANIFEST.version).toBe(1);
    expect(Array.isArray(MANIFEST.artifacts)).toBe(true);
    expect(MANIFEST.artifacts.length).toBeGreaterThan(0);

    const ids = new Set();
    for (const artifact of MANIFEST.artifacts) {
      expect(Object.keys(artifact).sort()).toEqual([
        'description', 'id', 'inputs', 'kind', 'notes', 'path', 'pinnedBy', 'regenerate',
      ]);
      expect(typeof artifact.id).toBe('string');
      expect(artifact.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(ids.has(artifact.id), `duplicate artifact id ${artifact.id}`).toBe(false);
      ids.add(artifact.id);
      expect(typeof artifact.path).toBe('string');
      expect(KINDS.has(artifact.kind), `${artifact.id}: invalid kind`).toBe(true);
      expect(typeof artifact.description).toBe('string');
      expect(artifact.description.length).toBeGreaterThan(0);
      expect(Array.isArray(artifact.inputs)).toBe(true);
      expect(artifact.regenerate === null || typeof artifact.regenerate === 'string').toBe(true);
      expect(Array.isArray(artifact.pinnedBy)).toBe(true);
      expect(typeof artifact.notes).toBe('string');
      expect(artifact.notes.length).toBeGreaterThan(0);
    }

    for (const artifact of MANIFEST.artifacts) {
      for (const inputId of artifact.inputs) {
        expect(ids.has(inputId), `${artifact.id}: unknown input ${inputId}`).toBe(true);
      }
    }
    expect(findCycle(MANIFEST.artifacts)).toBe(null);
  });

  it('points repository-local regeneration commands at an existing script or test', () => {
    for (const artifact of MANIFEST.artifacts) {
      if (!artifact.regenerate) continue;
      // External Agent builders belong to another repository. Inspect their
      // metadata separately; collecting this suite must not require that checkout.
      if (/\bnode\s+\.\.\//.test(artifact.regenerate)) continue;
      assertCommandExists(artifact.regenerate);
    }
  });

  it('points every repository artifact path or supported glob at an existing file', () => {
    for (const artifact of MANIFEST.artifacts) {
      if (artifact.kind === 'external') continue;
      if (/LOCAL-ONLY/i.test(artifact.notes)) continue;
      expect(pathOrGlobExists(artifact.path), `${artifact.id}: missing ${artifact.path}`).toBe(true);
    }
  });

  it('points every file pin at an existing test', () => {
    for (const artifact of MANIFEST.artifacts) {
      for (const pin of artifact.pinnedBy) {
        if (SPECIAL_PINS.has(pin)) continue;
        expect(existsSync(resolve(ROOT, pin)), `${artifact.id}: missing pin ${pin}`).toBe(true);
      }
    }
  });
});

describe('cheap deterministic lineage freshness', () => {
  it('grade-engine.bundle.js equals generateBundle() output', () => {
    const committed = readFileSync(resolve(ROOT, 'grade-engine.bundle.js'), 'utf8');
    expect(committed).toBe(generateBundle());
  });

  it('every local sw.js CORE entry exists', () => {
    const source = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
    const body = source.match(/const CORE = \[([\s\S]*?)\];/)?.[1];
    expect(body, 'sw.js CORE array not found').toBeTruthy();
    const entries = [...body.matchAll(/['\"]([^'\"]+)['\"]/g)].map((match) => match[1]);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(existsSync(resolve(ROOT, entry)), `sw.js CORE missing ${entry}`).toBe(true);
    }
  });

});

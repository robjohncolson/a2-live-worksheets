import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { isDeepStrictEqual } from 'node:util';

export const ROOT = process.env.MISCONCEPTION_ROOT
  ? resolve(process.env.MISCONCEPTION_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROVENANCE = 'codex-draft-2026-09-11';
export function readJson(path, root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

export function loadRubrics(root = ROOT) {
  // PHASE 4: A2 rubric input list. An unauthored course has no rubric sources.
  try { return readJson('data/lesson-rubrics.json', root); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export function loadQuestions(root = ROOT) {
  // PHASE 4: A2 question input list.
  try { return readJson('data/lesson-questions.json', root); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

// Preserve teacher edits to tag arrays; generation only enumerates source keys.
export function buildMap(filename, skeleton, metadata = {}) {
  let previous = null;
  try { previous = readJson(filename); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const vocabulary = readJson('data/misconceptions.json');
  for (const [itemId, entries] of Object.entries(skeleton)) {
    for (const key of Object.keys(entries)) {
      const tags = previous?.items?.[itemId]?.[key] || [];
      if (!Array.isArray(tags) || tags.some(tag => !Object.hasOwn(vocabulary.tags, tag))) {
        throw new Error(`Unknown tag at ${itemId}/${key}`);
      }
      entries[key] = tags;
    }
  }
  const doc = { schema: 'apstats-misconception-map/v1', reviewed: previous?.reviewed ?? false,
    provenance: previous?.provenance || PROVENANCE, ...metadata, items: skeleton };
  if (process.argv.includes('--check')) {
    if (!isDeepStrictEqual(doc, previous)) throw new Error(`${filename} is stale; regenerate and review source changes`);
    console.log(`${filename}: checked`);
    return doc;
  }
  writeFileSync(resolve(ROOT, filename), JSON.stringify(doc, null, 2) + '\n');
  return doc;
}

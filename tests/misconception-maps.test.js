import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson, loadRubrics, loadQuestions, ROOT } from '../scripts/misconception-map-sources.mjs';

const FIXTURE_ROOT = resolve(ROOT, 'tests/fixtures/a2');

describe('draft misconception maps', () => {
  // Historical tag IDs are inert protocol fixtures, not the published A2 vocabulary.
  const vocabulary = readJson('data/misconceptions.json', FIXTURE_ROOT);
  const rubricMap = readJson('data/misconception-rubric-map.json', FIXTURE_ROOT);
  const distractorMap = readJson('data/misconception-distractor-map.json', FIXTURE_ROOT);
  it('keeps fixture vocabulary well formed without imposing an AP inventory', () => {
    expect(Object.keys(vocabulary.tags).length).toBeGreaterThan(0);
    for (const [id, tag] of Object.entries(vocabulary.tags)) {
      expect(id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(typeof tag.label).toBe('string');
      expect(tag.label.trim().length).toBeGreaterThan(0);
      expect(tag.reviewed).toBe(false);
      expect(Array.isArray(tag.skills)).toBe(true);
      expect(Array.isArray(tag.units)).toBe(true);
    }
  });
  it('enumerates every rubric element with no extra source keys', () => {
    const rubrics = loadRubrics(FIXTURE_ROOT);
    expect(Object.keys(rubricMap.items)).toEqual(Object.keys(rubrics));
    for (const [id, rubric] of Object.entries(rubrics)) {
      expect(Object.keys(rubricMap.items[id])).toEqual(rubric.elements.map(element => element.id));
    }
  });
  it('enumerates all synthetic MCQs and only their wrong letters', () => {
    const questions = loadQuestions(FIXTURE_ROOT);
    expect(questions).toHaveLength(1);
    expect(Object.keys(distractorMap.items)).toEqual(questions.map(question => question.id));
    for (const question of questions) expect(Object.keys(distractorMap.items[question.id])).toEqual(
      question.choices.filter(choice => choice.key !== question.correct).map(choice => choice.key));
  });
  it('retains draft metadata and only uses known tags', () => {
    for (const doc of [vocabulary, rubricMap, distractorMap]) {
      expect(doc.reviewed).toBe(false);
      expect(doc.provenance).toBe('codex-draft-2026-09-11');
    }
    for (const doc of [rubricMap, distractorMap]) for (const entries of Object.values(doc.items)) {
      for (const tags of Object.values(entries)) {
        expect(Array.isArray(tags)).toBe(true);
        tags.forEach(tag => expect(Object.hasOwn(vocabulary.tags, tag)).toBe(true));
      }
    }
  });
  it.each(['rubric', 'distractor'])('checks the %s builder without changing the map', kind => {
    const path = `data/misconception-${kind}-map.json`;
    const before = readJson(path, FIXTURE_ROOT);
    for (let attempt = 0; attempt < 2; attempt++) execFileSync(process.execPath,
      [`scripts/build-misconception-${kind}-map.mjs`, '--check'], { cwd: ROOT, env: { ...process.env, MISCONCEPTION_ROOT: FIXTURE_ROOT } });
    expect(readJson(path, FIXTURE_ROOT)).toEqual(before);
  });
});

import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const targets = JSON.parse(readFileSync('data/a2-lesson-targets.json', 'utf8'));
const published = JSON.parse(readFileSync('content/a2/lessons.json', 'utf8'));
const doc = readFileSync('docs/a2-lesson-targets.md', 'utf8');

it('rates every Savvas lesson once with known ratings and plans', () => {
  const keys = targets.lessons.map(lesson => lesson.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toHaveLength(68);
  const ratings = Object.keys(targets.ratings), plans = Object.keys(targets.plans);
  for (const lesson of targets.lessons) {
    expect(lesson.key).toMatch(/^\d{1,2}-\d$/);
    expect(Number(lesson.key.split('-')[0])).toBe(lesson.topic);
    expect(ratings).toContain(lesson.precalc); expect(ratings).toContain(lesson.sat); expect(plans).toContain(lesson.plan);
  }
});

it('keeps the bare-minimum, ultra-compressed, and bridge lists consistent with per-lesson plans', () => {
  const byKey = Object.fromEntries(targets.lessons.map(lesson => [lesson.key, lesson]));
  expect(targets.bareMinimum).toHaveLength(17);
  expect(targets.lessons.filter(lesson => lesson.plan === 'keep').map(lesson => lesson.key)).toEqual(targets.bareMinimum);
  expect(targets.ultraCompressed).toHaveLength(9);
  expect(targets.lessons.filter(lesson => lesson.core).map(lesson => lesson.key)).toEqual(targets.ultraCompressed);
  for (const key of targets.ultraCompressed) expect(byKey[key].plan).toBe('keep');
  expect(targets.lessons.filter(lesson => lesson.plan === 'bridge').map(lesson => lesson.key)).toEqual(targets.bridge);
  for (const key of [...targets.bareMinimum, ...targets.bridge]) expect(doc).toContain(key);
});

it('every published lesson is a keep lesson, so authoring follows the plan', () => {
  const byKey = Object.fromEntries(targets.lessons.map(lesson => [lesson.key, lesson]));
  for (const lesson of published) {
    expect(byKey[lesson.key], lesson.key).toBeDefined();
    expect(byKey[lesson.key].plan).toBe('keep');
    expect(byKey[lesson.key].title).toBe(lesson.title);
  }
});

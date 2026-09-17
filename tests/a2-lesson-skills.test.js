import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyToPublished, loadInputs, resolveLessonSkills } from '../scripts/build-a2-lesson-skills.mjs';

const { authored, map, published } = loadInputs();
const resolved = JSON.parse(readFileSync('content/a2/lesson-skills.json', 'utf8'));
const targets = JSON.parse(readFileSync('data/a2-lesson-targets.json', 'utf8'));
const byKey = Object.fromEntries(targets.lessons.map(lesson => [lesson.key, lesson]));

it('content/a2/lesson-skills.json and lessons.json supportingSkills are the generator output', () => {
  const lessons = resolveLessonSkills({ authored, map });
  expect(resolved.lessons).toEqual(lessons);
  expect(published).toEqual(applyToPublished(published, lessons));
});

it('maps every lesson of Topics 1 and 2 by IXL code, prerequisites first, with at least one core skill', () => {
  const expected = targets.lessons.filter(lesson => lesson.topic <= 2).map(lesson => lesson.key);
  expect(Object.keys(resolved.lessons)).toEqual(expected);
  const codes = new Set(map.skills.map(skill => skill.code));
  for (const [key, skills] of Object.entries(resolved.lessons)) {
    expect(byKey[key], key).toBeDefined();
    expect(skills.some(skill => skill.level === 'core'), key).toBe(true);
    const firstCore = skills.findIndex(skill => skill.level === 'core');
    expect(skills.slice(firstCore).every(skill => skill.level === 'core'), key).toBe(true);
    for (const skill of skills) {
      expect(skill.url, key).toMatch(/^https:\/\/www\.ixl\.com\/math\//);
      expect(skill.name, key).toBeTruthy();
      if (skill.code) { expect(codes.has(skill.code), key + ' ' + skill.code).toBe(true); expect(skill.directoryId).toMatch(/^[A-Z]+\.\d+$/); }
    }
    expect(new Set(skills.map(skill => skill.url)).size, key + ' duplicates').toBe(skills.length);
  }
  // The Group Jam skills the teacher named on 2026-09-17 warm up 1-1.
  expect(resolved.lessons['1-1'].filter(skill => skill.level === 'prereq').map(skill => skill.code)).toEqual([undefined, 'LBJ', 'PS2', 'FS8', 'W5Z']);
  expect(resolved.lessons['2-1'].map(skill => skill.directoryId)).toEqual(['A.4', 'W.5', 'N.4', 'N.1', 'N.5', 'N.6', 'N.11']);
});

it('rejects an unknown code, a wrong level, and prerequisites after core skills', () => {
  expect(() => resolveLessonSkills({ authored: { lessons: { '1-1': [{ code: 'ZZZ', level: 'core' }] } }, map })).toThrow('unknown IXL code ZZZ');
  expect(() => resolveLessonSkills({ authored: { lessons: { '1-1': [{ code: 'PS2', level: 'extension' }] } }, map })).toThrow('level');
  expect(() => resolveLessonSkills({ authored: { lessons: { '1-1': [{ code: 'PS2', level: 'core' }, { code: 'FS8', level: 'prereq' }] } }, map })).toThrow('prereq skills must come first');
});

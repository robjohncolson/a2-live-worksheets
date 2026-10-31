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

it('maps every lesson of Topics 1 and 2, and each later lesson as its fast packet is authored, by IXL code, prerequisites first, with at least one core skill', () => {
  const keys = Object.keys(resolved.lessons);
  const topics12 = targets.lessons.filter(lesson => lesson.topic <= 2).map(lesson => lesson.key);
  expect(keys.filter(key => byKey[key] && byKey[key].topic <= 2)).toEqual(topics12);
  // Topics 3+ are mapped lesson by lesson with their fast packets (docs/a2-fast-lesson-spec.md, section 9), in book order.
  const order = Object.fromEntries(targets.lessons.map((lesson, i) => [lesson.key, i]));
  expect(keys).toEqual([...keys].sort((a, b) => order[a] - order[b]));
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
  // Every lesson with a teacher-prep entry (a fast packet) has its IXL skills mapped.
  const prep = JSON.parse(readFileSync('content/a2/lesson-prep.json', 'utf8')).lessons;
  for (const key of Object.keys(prep)) expect(resolved.lessons[key], key + ' has a prep entry but no skills').toBeDefined();
  // The Group Jam skills the teacher named on 2026-09-17 warm up 1-1.
  expect(resolved.lessons['1-1'].filter(skill => skill.level === 'prereq').map(skill => skill.code)).toEqual([undefined, 'LBJ', 'PS2', 'FS8', 'W5Z']);
  // L8C (N.2, characteristics of a quadratic function from its equation) was added last for the 2-1 fast packet's graded quiz item 2 (2026-10-30).
  expect(resolved.lessons['2-1'].map(skill => skill.directoryId)).toEqual(['A.4', 'W.5', 'N.4', 'N.1', 'N.5', 'N.6', 'N.11', 'N.2']);
  // U5D (shade a system of linear inequalities) was added last for the 2-7 fast packet's quiz item 4 (2026-10-30).
  expect(resolved.lessons['2-7'].map(skill => skill.code)).toEqual(['M69', 'BW5', 'VQU', 'HVZ', 'DKB', 'U5D']);
});

it('rejects an unknown code, a wrong level, and prerequisites after core skills', () => {
  expect(() => resolveLessonSkills({ authored: { lessons: { '1-1': [{ code: 'ZZZ', level: 'core' }] } }, map })).toThrow('unknown IXL code ZZZ');
  expect(() => resolveLessonSkills({ authored: { lessons: { '1-1': [{ code: 'PS2', level: 'extension' }] } }, map })).toThrow('level');
  expect(() => resolveLessonSkills({ authored: { lessons: { '1-1': [{ code: 'PS2', level: 'core' }, { code: 'FS8', level: 'prereq' }] } }, map })).toThrow('prereq skills must come first');
});

it('ties core skills to Savvas example numbers so a struggling example can become a Web Jam', () => {
  const byCode = key => Object.fromEntries(resolved.lessons[key].filter(sk => sk.code).map(sk => [sk.code, sk]));
  const l11 = byCode('1-1'), l12 = byCode('1-2');
  expect(l11['78A'].example).toEqual([1]);
  expect(l11.WMS.example).toEqual([2, 4]);
  expect(l11.PHD.example).toEqual([5]);
  expect(l12.F6J.example).toEqual([1]);
  expect(l12.PHV.example).toEqual([2]);
  expect(l12.NNY.example).toEqual([3]);
  expect(l12.RSN.example).toEqual([4]);
  expect(l12.KT8.example).toEqual([5]);
  for (const key of ['1-1', '1-2']) {
    expect(resolved.lessons[key].filter(sk => sk.level === 'core').every(sk => Array.isArray(sk.example)), key).toBe(true);
    expect(resolved.lessons[key].filter(sk => sk.level === 'prereq').every(sk => sk.example === undefined), key).toBe(true);
  }
  // supportingSkills on the published lesson carry the same example numbers.
  const pub = Object.fromEntries(published.map(l => [l.key, l]));
  expect(pub['1-2'].supportingSkills.find(sk => sk.code === 'KT8').example).toEqual([5]);
  // A single number is normalised to a sorted, de-duplicated list; bad values are rejected.
  expect(resolveLessonSkills({ authored: { lessons: { x: [{ code: 'PS2', level: 'core', example: [3, 1, 3] }] } }, map }).x[0].example).toEqual([1, 3]);
  expect(() => resolveLessonSkills({ authored: { lessons: { x: [{ code: 'PS2', level: 'core', example: 0 }] } }, map })).toThrow('example');
});

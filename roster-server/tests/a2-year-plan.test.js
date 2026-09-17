import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadA2Lessons, loadA2Targets, overlayLessons, pacingKeys, validatePacing } from '../a2-lessons.js';
import { PHASE3_CONFIG, quarterOfDate, quarterOfUnit } from '../grade-config.js';

const lessons = loadA2Lessons();
const targets = loadA2Targets();

describe('year-plan pacing', () => {
  it('bundles the year plan next to the lesson model', () => {
    expect(targets.lessons.length).toBe(68);
    expect(readFileSync(new URL('../data/a2-lesson-targets.json', import.meta.url), 'utf8'))
      .toBe(readFileSync(new URL('../../data/a2-lesson-targets.json', import.meta.url), 'utf8'));
  });

  it('accepts pacing for published and planned lessons but not for later lessons', () => {
    const keys = pacingKeys(lessons, targets);
    expect(keys.has('1-1')).toBe(true);
    expect(keys.has('2-1')).toBe(true);     // keep, unpublished
    expect(keys.has('7-3')).toBe(true);     // bridge
    expect(keys.has('1-3')).toBe(true);     // brief: datable once published
    expect(keys.has('5-2')).toBe(false);    // later
    const overlay = validatePacing(lessons, [{ key: '2-1', sections: { C: '2026-11-17', D: null, G: '' } }], targets);
    expect(overlay).toEqual({ '2-1': { sections: { C: '2026-11-17' }, onenoteUrl: null } });
    expect(() => validatePacing(lessons, [{ key: '5-2', sections: { C: '2027-01-05' } }], targets)).toThrow('Unknown lesson');
    expect(() => validatePacing(lessons, [{ key: '2-1', sections: { C: '2026-11-17' } }])).toThrow('Unknown lesson');
    expect(() => validatePacing(lessons, [null], targets)).toThrow('Unknown lesson');
  });

  it('an overlay for an unpublished lesson changes nothing until that lesson is published', () => {
    const overlay = { '2-1': { sections: { C: '2026-11-17' }, onenoteUrl: null }, '1-1': { sections: { C: '2026-09-22' }, onenoteUrl: null } };
    const current = overlayLessons(lessons, overlay);
    expect(current.map(lesson => lesson.key)).toEqual(lessons.map(lesson => lesson.key));
    expect(current[0].sections.C).toBe('2026-09-22');
    const published = overlayLessons([...lessons, { key: '2-1', topic: 2, title: 'Vertex Form', sections: { C: '2026-11-16', D: '2026-11-18', G: '2026-11-18' }, tryIts: [] }], overlay);
    expect(published.at(-1).sections).toEqual({ C: '2026-11-17' });
  });

  it('quarter unit fallback follows the year plan while lesson dates still decide the quarter', () => {
    expect(Object.fromEntries(Object.entries(PHASE3_CONFIG.quarters).map(([q, band]) => [q, band.units])))
      .toEqual({ Q1: [1], Q2: [2], Q3: [3, 4], Q4: [5, 6, 7] });
    const order = ['Q1', 'Q2', 'Q3', 'Q4'];
    for (const lesson of targets.lessons.filter(lesson => lesson.sections)) {
      for (const section of ['C', 'D', 'G']) {
        const quarter = quarterOfDate(lesson.sections[section]);
        expect(quarter, lesson.key).toBeTruthy();
        // A topic straddles at most the neighbouring quarter (3-1 and 4-4/4-5 do).
        expect(Math.abs(order.indexOf(quarter) - order.indexOf(quarterOfUnit(lesson.topic))), `${lesson.key} ${section}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

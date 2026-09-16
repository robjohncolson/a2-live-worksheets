// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildA2WorkManifest } from '../scripts/build-a2-work-manifest.mjs';
import { lessonScheduleFromModel, loadA2Lessons } from '../roster-server/a2-lessons.js';

const rootCopy = readFileSync(new URL('../data/work-manifest.json', import.meta.url), 'utf8');
const serverCopy = readFileSync(new URL('../roster-server/data/work-manifest.json', import.meta.url), 'utf8');
const manifest = JSON.parse(rootCopy);

describe('published A2 work manifest', () => {
  it('matches the generator apart from its timestamp and has byte-identical deployment copies', () => {
    expect(serverCopy).toBe(rootCopy);
    expect(manifest).toEqual({ ...buildA2WorkManifest(), generated: manifest.generated });
  });

  it('contains exactly the lesson schedule IDs, once each, with a matching index', () => {
    const schedule = lessonScheduleFromModel(loadA2Lessons());
    const expected = Object.values(schedule).flatMap(lesson => lesson.items.map(item => item.itemId));
    const actual = [];
    for (const unit of manifest.units) {
      for (const lesson of unit.lessons) {
        expect(lesson.activities.map(activity => activity.source)).toEqual(['try-it', 'lesson-check', 'flashcard']);
        for (const activity of lesson.activities) {
          for (const id of activity.itemIds) {
            actual.push(id);
            expect(manifest.index[id]).toEqual({ unit: unit.unit, lesson: lesson.lesson, activity: activity.activity });
            expect(schedule[lesson.lesson.replace('.', '-')].items).toContainEqual({ itemId: id, source: activity.source });
          }
        }
      }
    }
    expect(actual.sort()).toEqual(expected.sort());
    expect(new Set(actual).size).toBe(actual.length);
    expect(Object.keys(manifest.index).sort()).toEqual(actual);
  });

  it('orders the published U1 lessons as 1.1, 1.2, 1.5, 1.6', () => {
    expect(manifest.units.find(unit => unit.unit === 'U1').lessons.map(lesson => lesson.lesson))
      .toEqual(['1.1', '1.2', '1.5', '1.6']);
  });
});

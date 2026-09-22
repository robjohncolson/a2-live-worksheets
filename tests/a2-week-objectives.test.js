// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mondayFor, dayItems, weekSheet, renderHtml, renderText } from '../scripts/build-a2-week-objectives.mjs';

const year = JSON.parse(readFileSync('data/a2-school-year.json', 'utf8'));
const plan = JSON.parse(readFileSync('data/a2-lesson-targets.json', 'utf8'));
const objectives = JSON.parse(readFileSync('content/a2/lesson-objectives.json', 'utf8'));

describe('weekly objectives sheet', () => {
  it('picks the Monday of the week, rolling to next week from Saturday', () => {
    expect(mondayFor(new Date('2026-09-22T12:00:00'))).toBe('2026-09-21');
    expect(mondayFor(new Date('2026-09-21T12:00:00'))).toBe('2026-09-21');
    expect(mondayFor(new Date('2026-09-25T12:00:00'))).toBe('2026-09-21');
    expect(mondayFor(new Date('2026-09-26T12:00:00'))).toBe('2026-09-28');
    expect(mondayFor(new Date('2026-09-27T12:00:00'))).toBe('2026-09-28');
  });

  it('assigns each meeting day the lesson whose window covers it, like the Desk calendar', () => {
    const c = dayItems(year, plan, 'C');
    expect(c['2026-09-21'].key).toBe('1-1');
    expect(c['2026-09-24'].key).toBe('1-1');
    expect(c['2026-09-28'].key).toBe('1-2');
    expect(c['2026-09-23']).toBeUndefined(); // C does not meet Wednesday
    expect(c['2026-11-09'].key).toBe('TA-1');
    expect(c['2026-10-12']).toBeUndefined(); // Indigenous Peoples' Day
  });

  it('prints authored objectives verbatim and a placeholder for lessons without them', () => {
    const sheet = weekSheet({ monday: '2026-09-21', year, plan, objectives });
    expect(sheet.friday).toBe('2026-09-25');
    for (const section of sheet.sections) {
      expect(section.lessons.map(l => l.key)).toEqual(['1-1']);
      expect(section.lessons[0].objectives).toEqual(objectives.lessons['1-1']);
    }
    const text = renderText(sheet);
    expect(text).toContain(objectives.lessons['1-1'].mathObjectives[0]);
    expect(text).toContain(objectives.lessons['1-1'].languageObjective);
    const html = renderHtml(sheet);
    expect(html).toContain('(HSF.IF.B.4, HSF.IF.B.6)');
    expect(html).toContain('Section G');
    expect(html).not.toContain('Colson');

    const later = weekSheet({ monday: '2026-11-16', year, plan, objectives: { lessons: {} } });
    expect(renderText(later)).toContain('Objectives not yet authored.');
    expect(renderHtml(later)).toContain('not yet authored');
  });

  it('marks closures and non-meeting days', () => {
    const sheet = weekSheet({ monday: '2026-10-12', year, plan, objectives });
    const c = sheet.sections.find(s => s.section === 'C');
    expect(c.days[0]).toMatchObject({ weekday: 'Monday', meets: true, closed: true, item: null });
    expect(c.days[2]).toMatchObject({ weekday: 'Wednesday', meets: false });
    expect(renderHtml(sheet)).toContain('Mon (no school)');
  });
});

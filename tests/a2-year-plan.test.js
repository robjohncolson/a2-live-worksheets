import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildYearPlan, closureSet, fridayOf, loadInputs, meetingDays, pacingTable, replacePacingTable, SECTIONS } from '../scripts/build-a2-year-plan.mjs';

const { targets, published, def, doc } = loadInputs();
const roadmap = JSON.parse(readFileSync('roadmap-data.json', 'utf8'));
const byKey = Object.fromEntries(targets.lessons.map(lesson => [lesson.key, lesson]));
const live = Object.fromEntries(published.map(lesson => [lesson.key, lesson]));
const off = closureSet(def.daysOff);
const isMeetingDay = (section, date) => {
  const [y, m, d] = date.split('-').map(Number);
  return def.periods[section].meetsDays.includes(new Date(y, m - 1, d).getDay()) && !off.has(date);
};
const nextDay = date => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

it('data/a2-lesson-targets.json and the docs pacing table are the generator output for the committed options', () => {
  const fresh = buildYearPlan({ targets, published, def });
  expect(targets).toEqual(fresh);
  expect(doc).toContain(pacingTable(fresh, published));
  expect(replacePacingTable(doc, pacingTable(fresh, published))).toBe(doc);
});

it('reads the calendar the Desk uses: SY26-27 range, C/D/G meeting days and district closures', () => {
  expect(def.range).toEqual({ start: [2026, 8, 2], end: [2027, 5, 17] });
  expect(Object.keys(def.periods)).toEqual(['C', 'D', 'G']);
  expect(off.has('2026-09-07')).toBe(true);   // Labor Day
  expect(off.has('2027-04-21')).toBe(true);   // April vacation (a range entry)
  expect(meetingDays(def, 'C', '2026-09-02', '2026-09-10')).toEqual(['2026-09-03', '2026-09-08', '2026-09-10']);
  expect(targets.pacing.meetingDays).toEqual({ C: { total: 108, remaining: 83 }, D: { total: 106, remaining: 80 }, G: { total: 146, remaining: 109 } });
});

it('schedules keep and bridge lessons in plan order in every section until the year runs out, published dates first', () => {
  const scheduled = targets.lessons.filter(lesson => lesson.sections);
  const order = [...targets.bareMinimum, ...targets.bridge];
  expect(scheduled.map(lesson => lesson.key)).toEqual(order.slice(0, scheduled.length));
  // Two calendar weeks per lesson (teacher, 2026-09-17) reaches 5-6; Topics 6-7 do not fit.
  expect(targets.pacing).toMatchObject({ mode: 'weeks', weeks: 2, briefDays: 0, assessmentDays: 1 });
  const overflow = ['6-1', '6-2', '6-3', '6-6', '7-1', '7-2', '7-3'];
  expect(targets.pacing.unscheduled).toEqual({ C: overflow, D: overflow, G: overflow });
  expect(scheduled.at(-1).key).toBe('5-6');
  for (const lesson of scheduled) {
    expect(Object.keys(lesson.sections), lesson.key).toEqual(SECTIONS);
    for (const section of SECTIONS) {
      expect(isMeetingDay(section, lesson.sections[section]), `${lesson.key} ${section} ${lesson.sections[section]}`).toBe(true);
      expect(lesson.days[section]).toBeGreaterThan(0);
    }
    if (live[lesson.key]) expect(lesson.sections).toEqual(live[lesson.key].sections);
  }
  for (const lesson of targets.lessons.filter(lesson => !lesson.sections)) expect(['brief', 'skip', 'later', 'bridge']).toContain(lesson.plan);
});

it('packs lessons back to back, one assessment day after each finished topic, each window closing on the Friday of its second week', () => {
  for (const section of SECTIONS) {
    const scheduled = targets.lessons.filter(lesson => lesson.sections);
    let cursor = '2026-09-01';
    let topic = null;
    for (const lesson of scheduled) {
      if (topic !== null && lesson.topic !== topic) {
        const assessment = targets.assessments[String(topic)][section];
        expect(assessment > cursor, `Topic ${topic} assessment ${section}`).toBe(true);
        expect(isMeetingDay(section, assessment)).toBe(true);
        expect(meetingDays(def, section, nextDay(cursor), assessment)).toHaveLength(1);   // the very next meeting day
        cursor = assessment;
      }
      const due = lesson.sections[section];
      expect(due > cursor, `${lesson.key} ${section}`).toBe(true);
      expect(meetingDays(def, section, nextDay(cursor), due)).toHaveLength(lesson.days[section]);
      if (!live[lesson.key]) {
        // Unpublished: the due date is the last meeting day on or before the closing Friday
        // of a two-week window (vacation weeks with no meeting day are skipped first).
        let opens = nextDay(cursor);
        while (meetingDays(def, section, opens, fridayOf(opens, 2)).length === 0) opens = nextDay(fridayOf(opens, 2));
        const closing = fridayOf(opens, 2);
        expect(due <= closing, `${lesson.key} ${section}`).toBe(true);
        expect(meetingDays(def, section, nextDay(due), closing)).toHaveLength(0);
      }
      cursor = due;
      topic = lesson.topic;
    }
    expect(targets.assessments['1'][section] >= '2026-11-09').toBe(true);   // Topic 1 assessment opens Q2
    expect(targets.assessments['5'][section] <= '2027-06-17').toBe(true);
    expect(targets.assessments['6']).toBeUndefined();
  }
});

it('a window that opens on a Thursday or Friday starts the following Monday, and vacation weeks are skipped', () => {
  expect(fridayOf('2026-11-10', 2)).toBe('2026-11-20');   // Tue -> Fri of next week
  expect(fridayOf('2026-11-20', 2)).toBe('2026-12-04');   // Fri -> two full weeks
  expect(fridayOf('2026-11-21', 2)).toBe('2026-12-04');   // Sat -> same
  expect(byKey['2-6'].sections.C).toBe('2026-12-22');     // winter break shortens 2-6 to two days
  expect(byKey['2-7'].sections.C).toBe('2027-01-14');     // C: TA-2 cannot fall in the break; 2-7 opens Jan 4
});

it('fit and cadence modes remain available for comparison and report what falls off the year', () => {
  const fit = buildYearPlan({ targets, published, def, options: { mode: 'fit' } });
  expect(fit.pacing.unscheduled).toEqual({});
  expect(fit.lessons.find(lesson => lesson.key === '7-3').sections.C).toBe('2027-06-15');
  const plan = buildYearPlan({ targets, published, def, options: { mode: 'cadence', cadence: { C: 4, D: 4, G: 5 } } });
  expect(plan.pacing.unscheduled.C).toEqual(['6-6', '7-1', '7-2', '7-3']);
  expect(plan.lessons.find(lesson => lesson.key === '7-3').sections).toBeUndefined();
  expect(pacingTable(plan, published)).toContain('Does not fit: C: 6-6, 7-1, 7-2, 7-3');
});

it('roadmap-data.json carries planned windows and assessment days for the Desk', () => {
  expect(roadmap.assessments).toEqual(targets.assessments);
  for (const lesson of targets.lessons) {
    const entry = roadmap.lessons[lesson.key.replace('-', '.')];
    expect(entry.planned, lesson.key).toBe(!live[lesson.key] && !!lesson.sections);
    if (lesson.sections && !live[lesson.key]) {
      expect(entry.periods).toEqual(Object.fromEntries(SECTIONS.map(section => [section, { date: lesson.sections[section] }])));
      expect(entry.urls).toEqual({});
    }
  }
  expect(byKey['5-2'].sections).toBeUndefined();
  expect(roadmap.lessons['5.2'].periods).toEqual({});
});

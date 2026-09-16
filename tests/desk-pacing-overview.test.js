// Teacher pacing: completion versus due lessons, progress, and last activity.
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(resolve(repo, 'teacher-dashboard.html'), 'utf8');
const CLASS = readFileSync(resolve(repo, 'roster-server/class.js'), 'utf8');

describe('Teacher pacing overview — dashboard', () => {
  it('has a Pacing Overview section without a wallet dependency', () => {
    expect(DASH).not.toContain('src="js/wallet_logic.js"');
    expect(DASH).toMatch(/Pacing Overview/);
    expect(DASH).toContain('pacing-tbody');
  });

  it('computes readiness from completed versus due lessons', () => {
    expect(DASH).toContain('_pacingDoneCount(student, sch)');
    expect(DASH).toContain("actual >= due ? 'caughtup' : 'behind'");
  });

  it("doneCount uses the same completion gate (Cws>=60 && blooket>=80)", () => {
    expect(DASH).toMatch(/cws\s*>=\s*60/i);
    expect(DASH).toMatch(/bl\s*>=\s*80/i);
  });

  it('fetches the same summer schedule the Desk uses', () => {
    expect(DASH).toContain("fetch('data/summer-schedule.json')");
  });

  it('renders in the load flow and sorts most-behind first', () => {
    expect(DASH).toContain('renderPacingOverview(pPayload)');
    expect(DASH).toMatch(/_PACING_ORDER/);
  });
});

describe('Teacher pacing overview — staff/test accounts visible (so the teacher can test the view)', () => {
  it('fetches /class/grades with includeStaff=1 for pacing ONLY', () => {
    expect(DASH).toContain("includeStaff=1");
    // the staff-inclusive payload feeds pacing; the student-only payload still
    // feeds the grades table + gradebook (those must stay teacher-free).
    expect(DASH).toContain('renderGradesTable(gPayload)');
    expect(DASH).toContain('renderGradebook(gPayload)');
  });

  it('tags teacher/test rows distinctly and sinks them to the bottom', () => {
    expect(DASH).toMatch(/role === 'teacher'/);
    expect(DASH).toContain('🧪 teacher · test');
  });

  it('explains in the legend that guests are not shown', () => {
    expect(DASH).toMatch(/Guests aren.t shown/);
  });
});

describe('Teacher pacing overview — server data', () => {
  it('/class/grades exposes an additive per-student lastActivityAt', () => {
    expect(CLASS).toMatch(/lastActivityAt/);
    expect(CLASS).toMatch(/recorded_at/);
  });

  it('studentMeta carries role (default student) for the pacing badge', () => {
    expect(CLASS).toMatch(/role:\s*r\.role\s*\|\|\s*'student'/);
  });

  it('listRoster filters teachers by default but honors includeStaff', () => {
    expect(CLASS).toMatch(/includeStaff\s*\?\s*all\s*:\s*all\.filter/);
    expect(CLASS).toMatch(/req\.query\.includeStaff/);
  });
});

// Exercise the retained pacing functions with local schedules. These completion
// gates describe pacing only; they do not set district category grades.
describe('A2 pacing completion versus due lessons', () => {
  it.each(['C', 'D', 'G'])('distinguishes behind and caught-up students in section %s', section => {
    const context = createContext({});
    const source = DASH.slice(DASH.indexOf('function _pacingTodayISO'), DASH.indexOf('var _PACING_LABEL'));
    runInContext(source + "\n_pacingTodayISO = function () { return '2026-09-16'; };", context,
      { filename: pathToFileURL(resolve(repo, 'teacher-dashboard.html')).href });
    const schedule = { lessons: [
      { topic: '1-1', due: '2026-09-15' },
      { topic: '1-2', due: section === 'C' ? '2026-09-17' : '2026-09-16' },
    ] };
    const student = { section: 'Period' + section, lessons: [
      { lessonKey: '1-1', Cws: 60, blooket: 80 },
      { lessonKey: '1-2', Cws: 100, blooket: 79 },
      { lessonKey: 'unlisted', Cws: 100, blooket: 100 },
    ] };
    expect(context._pacingDoneCount(student, schedule)).toBe(1);
    expect(context._pacingReadiness(student, schedule)).toMatchObject({
      state: section === 'C' ? 'caughtup' : 'behind', actual: 1, total: 2,
    });
    student.lessons[1].blooket = 80;
    expect(context._pacingReadiness(student, schedule)).toMatchObject({ state: 'caughtup', actual: 2 });
    expect(context._pacingReadiness({ lessons: [] }, { lessons: [{ topic: '1-1', due: '2026-09-17' }] }))
      .toMatchObject({ state: 'notdue', actual: 0 });
    expect(context._pacingReadiness(student, null)).toBeNull();
  });
});

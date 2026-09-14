// desk-pacing-overview.test.js — the teacher pacing overview: teacher-dashboard
// shows each student's readiness COLOR (the same wallet_logic the student sees in
// My Ledger) + progress + last activity, fed by /class/grades' additive
// lastActivityAt. Structural pins so the shared-logic wiring stays intact.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(resolve(repo, 'teacher-dashboard.html'), 'utf8');
const CLASS = readFileSync(resolve(repo, 'roster-server/class.js'), 'utf8');

describe('Teacher pacing overview — dashboard', () => {
  it('loads the shared wallet_logic.js and has a Pacing Overview section', () => {
    expect(DASH).not.toContain('src="js/wallet_logic.js"');
    expect(DASH).toMatch(/Pacing Overview/);
    expect(DASH).toContain('pacing-tbody');
  });

  it('computes readiness via the SAME WalletLogic the students see', () => {
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

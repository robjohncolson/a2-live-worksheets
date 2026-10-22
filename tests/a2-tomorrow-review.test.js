// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { draftSection, loadInputs, noteText } from '../scripts/draft-tomorrow.mjs';

const inputs = loadInputs(resolve('tests/fixtures/a2/tomorrow'));

describe('Tomorrow quiz dates distinguish a scheduled quiz from a mention', () => {
  it.each([
    'Try Its 4 and 5 finished in class · quiz moved to Tue',
    'Ex 5 and Ex 4 covered · Try Its 4 and 5 assigned (due at the quiz)',
    'Quiz Tuesday',
    'Quiz Q4 practice',
    'No quiz today',
  ])('does not schedule a quiz from "%s"', headline => {
    const dayLog = structuredClone(inputs.dayLog);
    dayLog.entries.find(e => e.section === 'C' && e.date === '2026-10-26').student = headline;
    const note = draftSection({ ...inputs, dayLog }, 'C', '2026-10-26');
    expect(note.quizDate).toBe('2026-10-27');
    expect(noteText(note)).toContain('- Quiz day: Tuesday, Oct 27');
  });

  it('uses the real logged quiz date after a postponement', () => {
    // Only the tracked day log is read; no live summaries or roster-local files.
    const dayLog = JSON.parse(readFileSync('content/a2/day-log.json', 'utf8'));
    const note = globalThis.A2Tomorrow.draft({ date: '2026-09-28', section: 'C', lesson: '1-1', dayLog });
    expect(note.quizDate).toBe('2026-09-29');
  });

  it.each(['9-1 quiz', 'Web Jams AA1, BB2 · 9-1 quiz'])('keeps the scheduled headline "%s"', student => {
    const dayLog = { entries: [{ date: '2026-10-26', section: 'C', lesson: '9-1', student }] };
    expect(draftSection({ ...inputs, dayLog }, 'C', '2026-10-26').quizDate).toBe('2026-10-26');
  });

  it('recognizes a lesson quiz plan when the short student headline is absent', () => {
    const dayLog = { entries: [{ date: '2026-10-26', section: 'C', lesson: '9-1', plan: '9-1 Lesson Quiz (4 items). Then review.' }] };
    expect(draftSection({ ...inputs, dayLog }, 'C', '2026-10-26').quizDate).toBe('2026-10-26');
  });
});

it('never promotes an unassigned plan/prep skill or a day-log-only packet number into a Do Now', () => {
  const prep = structuredClone(inputs.prep.lessons['9-1']);
  prep.examples.forEach(example => { example.ixl = ['ZZ9']; }); // Proposed only, never assigned.
  const plans = ['Group Jam ZZ9.', 'Packet: Example 999 and practice item 777.', 'Group Jam AA1, then ZZ9.'];
  const past = ['', 'Group Jams AA1, BB2, CC3 and PP0 done.', 'Group Jams AA1, BB2, CC3 and PP0 done. Examples 1-3 done.'];
  for (const plan of plans) {
    for (const note of past) {
      for (const lessonSkills of [inputs.lessonSkills.lessons['9-1'], []]) {
        const draft = globalThis.A2Tomorrow.draft({
          date: '2026-10-26', section: 'C', lesson: '9-1', prep, lessonSkills,
          skillLookup: inputs.skillLookup,
          dayLog: { entries: [
            { date: '2026-10-22', section: 'C', lesson: '9-1', note },
            { date: '2026-10-26', section: 'C', lesson: '9-1', plan },
          ] },
        });
        const pick = draft.doNow;
        expect(pick).not.toBeNull();
        expect(pick.text).not.toMatch(/ZZ9|999|777/);
        if (pick.kind === 'jam') {
          expect(lessonSkills.map(skill => skill.code)).toContain(pick.code);
          expect(inputs.skillLookup(pick.code)).not.toBeNull();
        } else if (pick.example) {
          expect(prep.examples.filter(example => example.keep).map(example => example.n)).toContain(pick.example);
        } else {
          expect(pick.item).toBe(prep.dok3.item);
        }
      }
    }
  }
});

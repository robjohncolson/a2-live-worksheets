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

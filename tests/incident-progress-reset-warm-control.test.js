// tests/incident-progress-reset-warm-control.test.js — INCIDENT I5 repro
// (Lane I5b) CONTROL: proves the ledger data itself was always sufficient.
// With the SAME real oracles (composeOracles) and the SAME fixture, warming
// _gradeLessonsCache from the /grade payload (exactly what
// renderDoNowGrades does at L8453 on a successful fetch) completes every
// lesson through the next legit one — with ZERO local marks. This isolates
// the defect to the two relock paths covered by the other three test files
// (a cold cache that a swallowed HTTP error never warms; donow hydration
// alone being insufficient) rather than to the underlying signed ledger,
// which is confirmed intact per the incident brief.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { composeOracles } from './fixtures/incident-progress-reset/oracles.js';
import { studentA, studentB } from './fixtures/incident-progress-reset/index.js';

describe('INCIDENT I5 — CONTROL: a warm /grade cache alone completes every lesson (no local marks needed)', () => {
  it('Student A: 1.2 and 1.3 read complete from the synced Cws/blooket scores alone', () => {
    const o = composeOracles({ username: studentA.username });
    o.setGradeCache(studentA.grade.lessons); // warm, as renderDoNowGrades does at L8453
    expect(o.isLessonComplete('1.2', {})).toBe(true);
    expect(o.isLessonComplete('1.3', {})).toBe(true);
  });

  it('Student A: the next legit lesson (1.4) is unlocked purely from the synced ledger', () => {
    const o = composeOracles({ username: studentA.username });
    o.setGradeCache(studentA.grade.lessons);
    const TODAY = new Date(2026, 6, 20);
    const PAST = new Date(2026, 6, 10);
    expect(o.isLessonUnlocked(studentA.nextLegitLesson, PAST, '1.3', TODAY, {}, true)).toBe(true);
  });

  it('Student B: the next legit lesson (1.5) is unlocked purely from the synced ledger', () => {
    const o = composeOracles({ username: studentB.username });
    o.setGradeCache(studentB.grade.lessons);
    const TODAY = new Date(2026, 6, 20);
    const PAST = new Date(2026, 6, 10);
    expect(o.isLessonUnlocked(studentB.nextLegitLesson, PAST, '1.4', TODAY, {}, true)).toBe(true);
  });

  it('Student A: the ledger alone fully greys every recorded lesson (3 of 5) with zero local marks', () => {
    const o = composeOracles({ username: studentA.username });
    o.setGradeCache(studentA.grade.lessons);
    const doneCount = studentA.orderedTopics.filter((t) => o.localLessonState(t, {}) === 'done').length;
    expect(doneCount).toBe(studentA.grade.lessons.length); // 3
  });

  it('Student B: the ledger alone fully greys every recorded lesson (4 of 5) with zero local marks', () => {
    const o = composeOracles({ username: studentB.username });
    o.setGradeCache(studentB.grade.lessons);
    const doneCount = studentB.orderedTopics.filter((t) => o.localLessonState(t, {}) === 'done').length;
    expect(doneCount).toBe(studentB.grade.lessons.length); // 4
  });

  it('CANARY: cold vs warm disagree on the identical call — flips the moment the cold-cache bug is fixed', () => {
    const cold = composeOracles({ username: studentA.username }); // _gradeLessonsCache stays null
    const warm = composeOracles({ username: studentA.username });
    warm.setGradeCache(studentA.grade.lessons);

    const coldResult = cold.isLessonComplete('1.2', {});
    const warmResult = warm.isLessonComplete('1.2', {});

    expect(coldResult).toBe(false);
    expect(warmResult).toBe(true);
    expect(coldResult).not.toBe(warmResult); // the canary: this suite's whole point
  });
});

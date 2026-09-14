/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { bootDesk } from './harness.js';

const NOW = '2026-07-20T12:00:00.000Z';
const MARKS_KEY = 'a2_desk_marks_alpha_otter';
const NEXT_TOPIC = '1.4';
const EXPECTED_GRADE_STRIP = 'Q1:86.5↑94.0PC 82.0%Work 86.5%Schoology today —'; // the fixture has no gradebook → the "Schoology today" chip shows —
const EXPECTED_PROGRESS = '3 ahead — 3 of 66 lessons done'; // 66 core topics: old 3.7 is bonus (crosswalk retag 2026-08-07), off the calendar
const EXPECTED_DONOW = 'Do Now: Topic 1.4 — keep going.';

const FAILURE_CASES = [
  { label: 'network', value: 'network', status: 'Grades are temporarily unavailable' },
  { label: '401', value: 401, status: 'Your sign-in needs a refresh' },
  { label: '403', value: 403, status: 'Your sign-in needs a refresh' },
  { label: '500', value: 500, status: 'Grades are temporarily unavailable' },
];

function gradeFixture() {
  return {
    ok: true,
    asOf: NOW,
    units: [],
    quarters: {
      Q1: {
        quarterGrade: 86.5,
        ceiling: 94,
        pcAvg: 82,
        workAvg: 86.5,
        lessonsDue: 4,
        lessonsGraded: 3,
        lessonsTotal: 10,
      },
    },
    completion: {},
    lessons: [
      { lessonKey: '1.1', Cws: 88, blooket: 100, quizTotal: 0, items: { quiz: [] } },
      { lessonKey: '1.2', Cws: 79, blooket: 85, quizTotal: 0, items: { quiz: [] } },
      { lessonKey: '1.3', Cws: 82, blooket: 90, quizTotal: 0, items: { quiz: [] } },
    ],
    gradebook: {},
  };
}

function doNowFixture() {
  return {
    ok: true,
    nextTask: {
      unit: 'U1',
      lesson: NEXT_TOPIC,
      activity: 'worksheet',
      source: 'worksheet',
      progress: { done: 0, total: 1 },
      reason: 'earliest-incomplete',
    },
    lessons: [
      {
        unit: 'U1',
        lesson: '1.1',
        lessonState: 'complete',
        activities: [],
        selfDone: true,
        selfDoneArtifacts: ['worksheet', 'blooket'],
      },
      {
        unit: 'U1',
        lesson: '1.2',
        lessonState: 'complete',
        activities: [],
        selfDone: true,
        selfDoneArtifacts: ['blooket'],
      },
      {
        unit: 'U1',
        lesson: '1.3',
        lessonState: 'complete',
        activities: [],
        selfDone: true,
        selfDoneArtifacts: ['blooket'],
      },
    ],
    units: [],
    earlierGapFlag: false,
  };
}

async function settleSignIn(harness) {
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => (
    harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter')
  ), { message: 'Alpha identity chip did not render' });

  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog?.style.display !== 'none') {
    harness.document.getElementById('dialog-btn').click();
  }
}

function gradeRequestCount(harness) {
  return harness.roster.state.requests.filter((request) => (
    request.method === 'GET' && request.path === '/grade'
  )).length;
}

function marks(harness) {
  return JSON.parse(harness.window.localStorage.getItem(MARKS_KEY) || '{}');
}

function dispatchVisible(harness) {
  Object.defineProperty(harness.document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  Object.defineProperty(harness.document, 'hidden', {
    configurable: true,
    value: false,
  });
  harness.document.dispatchEvent(new harness.window.Event('visibilitychange'));
}

async function expectIncidentCalendar(harness) {
  harness.window.calToday();
  await harness.flush(2);

  const nextTile = await harness.waitFor(() => (
    harness.document.querySelector(`#cg .dc[data-topic="${NEXT_TOPIC}"]`)
  ), { message: `${NEXT_TOPIC} did not render in the summer focus window` });
  expect(nextTile.classList.contains('cell-locked'), `${NEXT_TOPIC} relocked`).toBe(false);

  harness.window.calStep(-1);
  await harness.flush(2);
  for (const topic of ['1.2', '1.3']) {
    const tile = harness.document.querySelector(`#cg .dc[data-topic="${topic}"]`);
    expect(tile, `${topic} did not render on the preceding summer page`).toBeTruthy();
    expect(tile.classList.contains('dc-localdone'), `${topic} lost completed paint`).toBe(true);
    expect(tile.classList.contains('cell-locked'), `${topic} rendered locked`).toBe(false);
  }

  harness.window.calToday();
  await harness.flush(2);
}

async function expectIncidentInvariants(harness, marksBefore) {
  expect(harness.document.getElementById('donow-grades').textContent)
    .toBe(EXPECTED_GRADE_STRIP);
  expect(harness.document.getElementById('pl').textContent).toBe(EXPECTED_PROGRESS);
  expect(harness.document.getElementById('donow-msg').textContent).toBe(EXPECTED_DONOW);
  expect(harness.window.localStorage.getItem(MARKS_KEY)).toBe(marksBefore);
  expect(harness.window.localLessonState('1.1', marks(harness))).toBe('done');
  expect(harness.window.localLessonState('1.2', marks(harness))).toBe('done');
  expect(harness.window.localLessonState('1.3', marks(harness))).toBe('done');
  await expectIncidentCalendar(harness);
}

describe('Desk journey J7', () => {
  it.each(FAILURE_CASES)(
    'J7 cold reboot preserves the incident invariants after a real visible-tab $label /grade failure (supersedes incident-progress-reset-cache-relock, incident-progress-reset-donow-hydration, and incident-progress-reset-warm-control)',
    async ({ value, status }) => {
      let harness = await bootDesk({
        now: NOW,
        roster: {
          grades: { 'stu-alpha': gradeFixture() },
          donow: { 'stu-alpha': doNowFixture() },
        },
      });

      try {
        await settleSignIn(harness);
        await harness.waitFor(() => (
          harness.document.getElementById('donow-grades').textContent === EXPECTED_GRADE_STRIP
        ), { message: 'live /grade did not seed the durable cache and grade strip' });
        await harness.waitFor(() => (
          harness.document.getElementById('pl').textContent === EXPECTED_PROGRESS
        ), { message: 'live /grade did not render the exact incident progress label' });

        const marksBefore = harness.window.localStorage.getItem(MARKS_KEY);
        expect(marksBefore).toBeTruthy();
        expect(Object.keys(marks(harness)).sort()).toEqual([
          '1.1|blooket',
          '1.1|worksheet',
          '1.2|blooket',
          '1.3|blooket',
        ]);
        expect(marks(harness)['1.2|worksheet']).toBeUndefined();
        expect(marks(harness)['1.3|worksheet']).toBeUndefined();
        // The Do Now sentence is recomputed by renderDoNow (visibility/tick), not by
        // the grade render itself; a real visible event lets the Desk pick up the
        // freshly latched 1.2/1.3 completion before we pin the warm invariants.
        dispatchVisible(harness);
        await harness.waitFor(() => (
          harness.document.getElementById('donow-msg').textContent === EXPECTED_DONOW
        ), { message: 'warm Desk did not advance the Do Now sentence to 1.4 after the live /grade latch' });
        await harness.waitFor(() => harness.roster.state.inflight === 0);
        await expectIncidentInvariants(harness, marksBefore);

        harness.roster.state.failures['GET /grade'] = value;
        harness = await harness.reboot();

        await harness.waitFor(() => (
          harness.document.getElementById('donow-grade-status').textContent.includes(status)
        ), { message: 'cold reboot did not classify the failed /grade request' });
        await expectIncidentInvariants(harness, marksBefore);

        const requestsBeforeVisible = gradeRequestCount(harness);
        dispatchVisible(harness);
        await harness.waitFor(() => gradeRequestCount(harness) > requestsBeforeVisible, {
          message: 'the real visibilitychange listener did not refresh /grade',
        });
        await harness.waitFor(() => harness.roster.state.inflight === 0, {
          message: 'the visible-tab /grade failure did not settle',
        });
        expect(harness.document.getElementById('donow-grade-status').textContent)
          .toContain(status);
        await expectIncidentInvariants(harness, marksBefore);
      } finally {
        harness.teardown();
      }
    },
    30_000,
  );
});

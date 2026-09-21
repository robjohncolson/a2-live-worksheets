/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { bootDesk, DESK_URL } from './harness.js';

const NOW = '2026-09-22T12:00:00.000Z';
const TOPIC = '1.1';
const VIEWED_STUDENT_ID = 'stu-alpha';
const VIEWED_LOG_KEY = 'a2_srs_log_alpha_otter';
const VIEWED_LOG = [{
  roundId: 'viewed-existing-round',
  seq: 0,
  csv: 'u1_l1_blooket.csv',
  qnum: 1,
  correct: true,
  ts: Date.parse(NOW) - 60_000,
  mode: 'quick',
  missIndex: 0,
  wasTimeout: false,
  latencyMs: 900,
  review: null,
  topic: TOPIC,
  surface: 'desk',
  nChoices: 4,
  stemHash: 'viewed001',
  chosenIdx: 0,
}];

function gradeFixture() {
  return {
    ok: true,
    asOf: NOW,
    units: [],
    quarters: {
      Q1: {
        quarterGrade: 83,
        ceiling: 91,
        pcAvg: 78,
        workAvg: 83,
        lessonsDue: 1,
        lessonsGraded: 1,
        lessonsTotal: 10,
      },
    },
    completion: {},
    lessons: [{
      lessonKey: TOPIC,
      Cws: 60,
      blooket: null,
      quizTotal: 0,
      items: { quiz: [] },
    }],
    gradebook: {},
  };
}

function doNowFixture() {
  return {
    ok: true,
    nextTask: {
      unit: 'U1',
      lesson: TOPIC,
      activity: 'worksheet',
      source: 'worksheet',
      progress: { done: 0, total: 1 },
      reason: 'earliest-incomplete',
    },
    lessons: [],
    units: [],
    earlierGapFlag: false,
  };
}

async function settleTeacherSignIn(harness) {
  await harness.signIn('teacher_one');
  await harness.waitFor(() => (
    harness.document.getElementById('menu-identity').textContent.includes('Teacher One')
  ), { message: 'teacher identity chip did not render' });

  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog?.style.display !== 'none') {
    harness.document.getElementById('dialog-btn').click();
  }
}

function snapshotApstatsStorage(storage) {
  const entries = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith('a2_')) entries.push([key, storage.getItem(key)]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function snapshotTrainerRows(rows) {
  return JSON.parse(JSON.stringify([...rows.entries()].sort(([left], [right]) => (
    left.localeCompare(right)
  ))));
}

function storedViewAsContext(harness) {
  try {
    return JSON.parse(
      harness.window.sessionStorage.getItem('a2_view_as_context') || 'null',
    );
  } catch (_) {
    return null;
  }
}

async function enterViewAsThroughProduction(harness) {
  const url = new URL(DESK_URL);
  url.searchParams.set('viewAsUserId', VIEWED_STUDENT_ID);

  let entered = await harness.reboot({ url: url.href });
  await entered.waitFor(() => (
    entered.roster.state.requests.some((request) => (
      request.method === 'GET'
        && request.path === `/teacher/student/${VIEWED_STUDENT_ID}/profile`
        && request.headers.authorization === 'Bearer token:teacher_one'
    ))
  ), { message: 'production view-as bootstrap did not fetch the student profile' });
  await entered.waitFor(() => (
    storedViewAsContext(entered)?.studentId === VIEWED_STUDENT_ID
  ), { message: 'production view-as bootstrap did not persist its context' });

  // JSDOM cannot execute location.reload(). The harness models the exact reload
  // after the production bootstrap has written the per-tab context.
  entered = await entered.reboot();
  await entered.waitFor(() => (
    entered.window._viewAsContext()?.studentId === VIEWED_STUDENT_ID
  ), { message: 'view-as context was not active after the production reload' });
  return entered;
}

async function openViewedStudentTopic(harness) {
  const tile = await harness.waitFor(() => (
    harness.document.querySelector(`#cg .dc[data-topic="${TOPIC}"]`)
  ), { message: `${TOPIC} tile did not render for view-as` });
  tile.click();
  await harness.waitFor(() => (
    harness.document.getElementById('resource-overlay').style.display === 'block'
  ), { message: `${TOPIC} resource panel did not open in view-as` });
}

function viewAsToast(document, message) {
  return [...document.body.children].find((element) => (
    element.textContent.trim() === message
  ));
}

function dispatchVisibility(harness, visibilityState) {
  Object.defineProperty(harness.document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
  Object.defineProperty(harness.document, 'hidden', {
    configurable: true,
    value: visibilityState === 'hidden',
  });
  harness.document.dispatchEvent(new harness.window.Event('visibilitychange'));
}

describe('Desk journey J8', () => {
  it('J8 production teacher view-as is read-only for entry, lifecycle sync, worksheet Done, flashcards/review, passport, and every a2_* local key', async () => {
    const viewedGrade = gradeFixture();
    const viewedDoNow = doNowFixture();
    let harness = await bootDesk({
      now: NOW,
      roster: {
        grades: {
          'teacher-one': viewedGrade,
          'stu-alpha': viewedGrade,
        },
        donow: {
          'teacher-one': viewedDoNow,
          'stu-alpha': viewedDoNow,
        },
      },
    });

    try {
      await settleTeacherSignIn(harness);
      expect(harness.window.rosterClient.current()).toMatchObject({
        username: 'teacher_one',
        role: 'teacher',
      });

      // Existing viewed-student practice must not tempt entry/focus/pagehide
      // listeners into syncing while the teacher is impersonating read-only.
      harness.window.localStorage.setItem(VIEWED_LOG_KEY, JSON.stringify(VIEWED_LOG));

      // These baselines intentionally precede entry so bootstrap-time effects
      // are part of the read-only contract, not hidden by a late snapshot.
      const storageBeforeEntry = snapshotApstatsStorage(harness.window.localStorage);
      const requestStart = harness.requests.length;
      const trainerBeforeEntry = snapshotTrainerRows(harness.roster.state.trainerStates);

      harness = await enterViewAsThroughProduction(harness);
      await harness.waitFor(() => harness.roster.state.requests.some((request) => (
        request.method === 'GET'
          && request.path === `/teacher/student/${VIEWED_STUDENT_ID}/grade`
          && request.headers.authorization === 'Bearer token:teacher_one'
      )), { message: 'view-as did not fetch the student grade with the teacher token' });
      await harness.waitFor(() => (
        harness.document.querySelector('#donow-grades .qgrade')?.textContent === '83.0'
      ), { message: 'viewed student grade did not paint' });
      await harness.waitFor(() => harness.roster.state.inflight === 0, {
        message: 'view-as reads did not settle',
      });

      expect(harness.window.__WS_READ_ONLY__).toBeUndefined();
      expect(harness.window._viewAsContext()).toMatchObject({
        studentId: VIEWED_STUDENT_ID,
        username: 'alpha_otter',
        readOnly: true,
      });
      const banner = harness.document.getElementById('view-as-banner');
      expect(banner.style.display).toBe('flex');
      expect(banner.textContent).toContain('Alpha Otter');
      expect(banner.textContent).toContain('READ-ONLY');

      dispatchVisibility(harness, 'visible');
      dispatchVisibility(harness, 'hidden');
      harness.window.dispatchEvent(new harness.window.Event('pagehide'));

      const passportUrl = new URL(harness.window.location.href);
      passportUrl.searchParams.set('fcPassport', '1');
      harness.window.history.replaceState({}, '', passportUrl.href);
      harness.window.renderDoNow();

      await openViewedStudentTopic(harness);
      const worksheetDone = harness.document.querySelector(
        `#resource-body .worksheet-done-slot[data-topic="${TOPIC}"] button`,
      );
      expect(worksheetDone, 'focused view has no worksheet scoring control').toBeNull();

      const flashcards = harness.document.querySelector(
        `#resource-body .desk-quiz-done-slot[data-topic="${TOPIC}"][data-artifact="blooket"] button`,
      );
      expect(flashcards, 'view-as lesson row has no flashcards control').toBeTruthy();
      flashcards.click();
      expect(harness.document.getElementById('bf-overlay').style.display).not.toBe('block');
      expect(harness.document.getElementById('fc-due-chip')).toBeNull();
      expect([...harness.document.querySelectorAll('#bf-modepick button')]
        .some((button) => button.textContent.includes('Review due cards'))).toBe(false);

      const exportButton = [...harness.document.querySelectorAll('#resource-body button')]
        .find((button) => button.textContent.trim() === 'Export');
      const importInput = harness.document.querySelector(
        '#resource-body input[type="file"][accept*="application/json"]',
      );
      expect(exportButton, 'focused view has no passport controls').toBeUndefined();
      expect(importInput).toBeNull();

      await harness.flush(6);
      await harness.waitFor(() => harness.roster.state.inflight === 0, {
        message: 'view-as attempts did not settle',
      });

      const attemptedRequests = harness.requests.slice(requestStart).map((request) => ({
        method: request.method,
        path: new URL(request.url).pathname,
      }));
      expect(attemptedRequests.filter((request) => (
        ['GET', 'PUT', 'PATCH'].includes(request.method)
          && request.path.startsWith('/trainer/state/')
      ))).toEqual([]);
      expect(attemptedRequests.filter((request) => (
        request.method === 'POST' && request.path === '/ledger/record'
      ))).toEqual([]);
      expect(attemptedRequests.filter((request) => (
        request.method === 'POST' && request.path === '/rest/v1/student_progress'
      ))).toEqual([]);
      expect(harness.roster.state.ledgerRecords).toEqual([]);
      expect(snapshotTrainerRows(harness.roster.state.trainerStates))
        .toEqual(trainerBeforeEntry);
      expect(snapshotApstatsStorage(harness.window.localStorage))
        .toEqual(storageBeforeEntry);
    } finally {
      harness.teardown();
    }
  }, 30_000);
});

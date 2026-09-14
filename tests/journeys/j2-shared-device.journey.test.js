/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { bootDesk } from './harness.js';

const NOW = '2026-08-18T12:00:00.000Z';
const TOPIC = '1.1';
const ALPHA_MARKS_KEY = 'a2_desk_marks_alpha_otter';
const BETA_MARKS_KEY = 'a2_desk_marks_beta_fox';
const ALPHA_SRS_KEY = 'a2_fc_state_v1_alpha_otter';
const BETA_SRS_KEY = 'a2_fc_state_v1_beta_fox';

const ALPHA_SRS_STATE = {
  version: 1,
  cards: {
    'u1_l1_blooket.csv#1': {
      ease: 2500,
      intervalDays: 0,
      dueDay: 0,
      reps: 0,
      lapses: 1,
      lastGrade: 'again',
      lastTs: Date.parse('2026-08-17T12:00:00.000Z'),
      stemHash: 'journey-alpha-card',
    },
  },
  seen: [],
  tombstones: {},
  updatedAt: Date.parse('2026-08-17T12:00:00.000Z'),
};

function gradeFixture(cws) {
  return {
    ok: true,
    asOf: NOW,
    units: [],
    quarters: {
      Q1: {
        quarterGrade: cws == null ? 71 : 84,
        ceiling: 92,
        pcAvg: 78,
        workAvg: cws == null ? 71 : 84,
        lessonsDue: 1,
        lessonsGraded: cws == null ? 0 : 1,
        lessonsTotal: 10,
      },
    },
    completion: {},
    lessons: [{
      lessonKey: TOPIC,
      Cws: cws,
      blooket: null,
      quizTotal: 0,
      items: { quiz: [] },
    }],
    gradebook: {},
  };
}

function syncedDoNowFixture() {
  return {
    ok: true,
    nextTask: null,
    lessons: [{
      unit: 'U1',
      lesson: TOPIC,
      lessonState: 'complete',
      activities: [{ activity: 'worksheet', done: 1, total: 1, state: 'complete' }],
      selfDone: true,
      selfDoneArtifacts: ['worksheet'],
    }],
    units: [],
    earlierGapFlag: false,
  };
}

async function settleSignIn(harness, username) {
  await harness.signIn(username);
  const user = harness.roster.state.userByUsername(username);
  await harness.waitFor(() => (
    harness.document.getElementById('menu-identity').textContent.includes(user.realName)
  ), { message: `${user.realName} identity chip did not render` });

  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog?.style.display !== 'none') {
    harness.document.getElementById('dialog-btn').click();
  }
}

function topicTiles(document) {
  return [...document.querySelectorAll(`#cg .dc[data-topic="${TOPIC}"]`)];
}

async function openTopic(harness) {
  const tile = topicTiles(harness.document)[0];
  expect(tile, `calendar has no ${TOPIC} tile`).toBeTruthy();
  tile.click();
  await harness.waitFor(() => (
    harness.document.getElementById('resource-overlay').style.display === 'block'
  ), { message: `${TOPIC} resource panel did not open` });
}

function worksheetButton(document) {
  return document.querySelector(
    `#resource-body .worksheet-done-slot[data-topic="${TOPIC}"] button`,
  );
}

function closeTopic(document) {
  const close = [...document.querySelectorAll('#resource-overlay button')]
    .find((button) => button.textContent.trim() === 'OK');
  expect(close, 'resource panel has no OK button').toBeTruthy();
  close.click();
}

function clickSignOut(document) {
  const signOut = [...document.querySelectorAll('#menu-student .menu-dd-item')]
    .find((item) => item.textContent.includes('Sign Out'));
  expect(signOut, 'the real User menu has no Sign Out action').toBeTruthy();
  signOut.click();
}

async function waitForLedgerCount(harness, count) {
  return harness.waitFor(() => {
    const records = harness.roster.state.requests.filter((request) => (
      request.method === 'POST' && request.path === '/ledger/record'
    ));
    return records.length >= count ? records : false;
  }, { message: `Expected ${count} fake-roster ledger request(s)` });
}

describe('Desk journey J2', () => {
  it('J2 reloads a shared device across A → B → A without leaking marks, due chip, or SRS state, then hydrates a fresh marks bucket from /donow (supersedes desk-calendar-sync per-student visibility and selfDone hydration behavior)', async () => {
    let harness = await bootDesk({
      now: NOW,
      localStorage: { [ALPHA_SRS_KEY]: ALPHA_SRS_STATE },
      roster: {
        grades: {
          'stu-alpha': gradeFixture(67),
          'stu-beta': gradeFixture(null),
        },
      },
    });

    try {
      await settleSignIn(harness, 'alpha_otter');
      expect(harness.document.getElementById('menu-identity').textContent).toContain('Alpha Otter');
      expect(harness.document.getElementById('fc-due-chip')?.textContent).toBe('Review due (1)');

      await openTopic(harness);
      const alphaDone = worksheetButton(harness.document);
      expect(alphaDone).toBeTruthy();
      expect(alphaDone.disabled).toBe(false);
      alphaDone.click();
      const alphaLedgerRequests = await waitForLedgerCount(harness, 1);
      await harness.waitFor(() => worksheetButton(harness.document)?.textContent.includes('Completed'), {
        message: 'Alpha worksheet completion did not render',
      });

      expect(alphaLedgerRequests[0].body.token).toBe('token:alpha_otter');
      expect(worksheetButton(harness.document).textContent).toContain('Completed');
      expect(topicTiles(harness.document).some((tile) => tile.classList.contains('dc-localpartial'))).toBe(true);
      const alphaMarks = harness.window.localStorage.getItem(ALPHA_MARKS_KEY);
      expect(JSON.parse(alphaMarks)[`${TOPIC}|worksheet`]).toMatchObject({ score: null });

      closeTopic(harness.document);
      clickSignOut(harness.document);
      harness = await harness.reboot();
      await settleSignIn(harness, 'beta_fox');

      expect(harness.document.getElementById('menu-identity').textContent).toContain('Beta Fox');
      expect(harness.document.getElementById('fc-due-chip')).toBeNull();
      expect(harness.window.localStorage.getItem(BETA_MARKS_KEY)).toBeNull();
      expect(harness.window.localStorage.getItem(BETA_SRS_KEY)).toBeNull();
      expect(harness.window.localStorage.getItem(ALPHA_MARKS_KEY)).toBe(alphaMarks);
      expect(harness.window.localStorage.getItem(ALPHA_SRS_KEY)).toBe(JSON.stringify(ALPHA_SRS_STATE));
      expect(topicTiles(harness.document).every((tile) => (
        !tile.classList.contains('dc-localpartial') && !tile.classList.contains('dc-localdone')
      ))).toBe(true);

      await openTopic(harness);
      const betaDone = worksheetButton(harness.document);
      expect(betaDone.textContent).toBe('Done (0%)');
      expect(betaDone.disabled).toBe(true);
      expect(betaDone.textContent).not.toContain('Completed');

      closeTopic(harness.document);
      clickSignOut(harness.document);
      harness = await harness.reboot();
      await settleSignIn(harness, 'alpha_otter');

      expect(harness.document.getElementById('menu-identity').textContent).toContain('Alpha Otter');
      expect(harness.document.getElementById('fc-due-chip')?.textContent).toBe('Review due (1)');
      expect(harness.window.localStorage.getItem(ALPHA_MARKS_KEY)).toBe(alphaMarks);
      expect(topicTiles(harness.document).some((tile) => tile.classList.contains('dc-localpartial'))).toBe(true);

      await openTopic(harness);
      expect(worksheetButton(harness.document).textContent).toContain('Completed');
      expect(harness.roster.state.ledgerRecords).toHaveLength(1);

      closeTopic(harness.document);
      harness.roster.state.donow = { 'stu-alpha': syncedDoNowFixture() };
      clickSignOut(harness.document);
      harness.window.localStorage.removeItem(ALPHA_MARKS_KEY);
      harness = await harness.reboot();
      expect(harness.window.localStorage.getItem(ALPHA_MARKS_KEY)).toBeNull();

      await settleSignIn(harness, 'alpha_otter');
      const hydratedMarks = await harness.waitFor(() => {
        const raw = harness.window.localStorage.getItem(ALPHA_MARKS_KEY);
        if (!raw) return false;
        const marks = JSON.parse(raw);
        return marks[`${TOPIC}|worksheet`]?.src === 'donow-sync' ? marks : false;
      }, { message: 'fresh Alpha marks did not hydrate from /donow selfDoneArtifacts' });
      expect(hydratedMarks[`${TOPIC}|worksheet`]).toMatchObject({ src: 'donow-sync' });
      expect(harness.roster.state.ledgerRecords).toHaveLength(1);
    } finally {
      harness.teardown();
    }
  });
});

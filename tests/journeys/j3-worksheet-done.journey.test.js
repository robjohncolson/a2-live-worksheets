/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { bootDesk } from './harness.js';

const NOW = '2026-08-18T12:00:00.000Z';
const TOPIC = '1.1';
const EXACT_LEDGER_PAYLOAD = {
  source: 'worksheet',
  itemId: 'WS-U1-L1-DESK_DONE',
  unit: 'U1',
  topic: TOPIC,
  response: { selfAttest: 'worksheet' },
  score: null,
  attempt: 1,
};

function gradeFixture(cws) {
  return {
    ok: true,
    asOf: NOW,
    units: [],
    quarters: {
      Q1: {
        quarterGrade: 80,
        ceiling: 90,
        pcAvg: 75,
        workAvg: 80,
        lessonsDue: 1,
        lessonsGraded: 1,
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

function topicTiles(document) {
  return [...document.querySelectorAll(`#cg .dc[data-topic="${TOPIC}"]`)];
}

async function openWorksheet(harness) {
  const tile = topicTiles(harness.document)[0];
  expect(tile, `calendar has no ${TOPIC} tile`).toBeTruthy();
  tile.click();
  await harness.waitFor(() => (
    harness.document.getElementById('resource-overlay').style.display === 'block'
  ), { message: `${TOPIC} resource panel did not open` });
  return harness.document.querySelector(
    `#resource-body .worksheet-done-slot[data-topic="${TOPIC}"] button`,
  );
}

async function settleRoster(harness) {
  await harness.flush(6);
  await harness.waitFor(() => harness.roster.state.inflight === 0, {
    message: 'fake-roster requests did not settle',
  });
}

describe('Desk journey J3', () => {
  it('J3 keeps worksheet Done disabled at the 59% lower boundary', async () => {
    const harness = await bootDesk({
      now: NOW,
      roster: { grades: gradeFixture(59) },
    });

    try {
      await settleSignIn(harness);
      const done = await openWorksheet(harness);

      expect(done).toBeTruthy();
      expect(done.disabled, 'Cws=59 must stay below the real worksheet gate').toBe(true);
      expect(done.textContent).toBe('Done (59%)');
      await settleRoster(harness);
      expect(harness.roster.state.ledgerRecords).toEqual([]);
    } finally {
      harness.teardown();
    }
  });

  it('J3 worksheet Done is disabled at 59% but at 60% posts one exact WS-…-DESK_DONE payload and updates the tile (supersedes desk-calendar-sync 60% gate pin)', async () => {
    const harness = await bootDesk({
      now: NOW,
      roster: { grades: gradeFixture(60) },
    });

    try {
      await settleSignIn(harness);

      const tile = topicTiles(harness.document)[0];
      expect(tile.classList.contains('dc-localpartial')).toBe(false);
      const done = await openWorksheet(harness);
      expect(done).toBeTruthy();
      expect(done.disabled, 'Cws=60 must clear the real worksheet gate').toBe(false);
      expect(done.textContent).toContain('Done');

      done.click();
      const ledgerRequest = await harness.waitFor(() => (
        harness.roster.state.requests.find((candidate) => (
          candidate.method === 'POST' && candidate.path === '/ledger/record'
        ))
      ), { message: 'Worksheet click did not reach fake-roster /ledger/record' });
      await harness.waitFor(() => (
        harness.document.querySelector(
          `#resource-body .worksheet-done-slot[data-topic="${TOPIC}"] button`,
        )?.textContent.includes('Completed')
      ), { message: 'worksheet completion did not render' });
      await settleRoster(harness);

      expect(ledgerRequest.headers['content-type']).toBe('application/json');
      expect(ledgerRequest.body.token).toBe('token:alpha_otter');
      const { token, ...recordedPayload } = ledgerRequest.body;
      expect(token).toBe('token:alpha_otter');
      expect(recordedPayload).toEqual(EXACT_LEDGER_PAYLOAD);
      expect(harness.roster.state.ledgerRecords).toEqual([ledgerRequest.body]);

      const mark = JSON.parse(
        harness.window.localStorage.getItem('a2_desk_marks_alpha_otter'),
      )['1.1|worksheet'];
      expect(mark).toEqual({ visitedAt: NOW, ts: NOW, score: null });

      const completed = harness.document.querySelector(
        `#resource-body .worksheet-done-slot[data-topic="${TOPIC}"] button`,
      );
      expect(completed.disabled).toBe(true);
      expect(completed.textContent).toContain('Completed');

      const updatedTiles = topicTiles(harness.document);
      expect(updatedTiles.length).toBeGreaterThan(0);
      expect(updatedTiles.every((updated) => updated.classList.contains('dc-localpartial'))).toBe(true);
      expect(harness.roster.state.requests.filter((request) => (
        request.method === 'POST' && request.path === '/ledger/record'
      ))).toHaveLength(1);
    } finally {
      harness.teardown();
    }
  });
});

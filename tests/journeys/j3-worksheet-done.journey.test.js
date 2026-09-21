/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { bootDesk } from './harness.js';

const NOW = '2026-09-22T12:00:00.000Z';
const TOPIC = '1.1';
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
  it.each([59, 60])('J3 focused panel opens flashcards without worksheet scoring at Cws=%s', async cws => {
    const harness = await bootDesk({ now: NOW, roster: { grades: gradeFixture(cws) } });
    try {
      await settleSignIn(harness);
      expect(await openWorksheet(harness)).toBeNull();
      const body = harness.document.getElementById('resource-body');
      expect(body.textContent).not.toMatch(/Try-?Its?|scored|Lesson check|Done/);
      const flashcards = [...body.querySelectorAll('button')].find(button => button.textContent === 'Open Flashcards');
      expect(flashcards).toBeTruthy();
      flashcards.click();
      await harness.waitFor(() => harness.document.getElementById('bf-overlay').style.display === 'block');
      await settleRoster(harness);
      expect(harness.roster.state.ledgerRecords).toEqual([]);
    } finally { harness.teardown(); }
  });
});

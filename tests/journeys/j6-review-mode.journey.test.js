/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../lib/flashcard-srs.js';
import { bootDesk } from './harness.js';

const NOW = '2026-09-22T12:00:00.000Z';
const TOPIC = '1.1';
const CSV_FILE = 'u1_l1_blooket.csv';
const LOG_KEY = 'a2_srs_log_alpha_otter';
const STATE_KEY = 'a2_fc_state_v1_alpha_otter';
const FLAGS = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../data/flashcard-flags.json'), 'utf8'),
);

function j6ParseDeck(text) {
  const rows = [];
  let cell = '';
  let row = [];
  let inQuote = false;
  const normalized = String(text).replace(/\r\n/g, '\n');

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '"') {
      if (inQuote && normalized[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (character === ',' && !inQuote) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((character === '\n' || character === '\r') && !inQuote) {
      row.push(cell);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      cell = '';
      row = [];
      continue;
    }
    cell += character;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.flatMap((columns) => {
    const qnum = Number.parseInt(String(columns[0] || '').trim(), 10);
    const question = String(columns[1] || '').trim();
    const choices = columns.slice(2, 6)
      .map((choice) => String(choice || '').trim())
      .filter(Boolean);
    let correctIdx = Number.parseInt(String(columns[7] || '1').trim(), 10) - 1;
    if (!Number.isFinite(qnum) || !question || choices.length < 2) return [];
    if (correctIdx < 0 || correctIdx >= choices.length) correctIdx = 0;
    return [{ qnum, q: question, choices, correctIdx }];
  });
}

const J6_DECK = j6ParseDeck(
  readFileSync(resolve(import.meta.dirname, `../fixtures/a2/${CSV_FILE}`), 'utf8'),
);
const J6_BY_QUESTION = new Map(J6_DECK.map((card) => [card.q, card]));

function j6GradeFixture() {
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
      Cws: 60,
      blooket: null,
      quizTotal: 0,
      items: { quiz: [] },
    }],
    gradebook: {},
  };
}

function j6DueSeed(qnum) {
  const srs = globalThis.FlashcardSrs;
  const ts = Date.parse(NOW) - 86_400_000;
  const card = J6_DECK.find((candidate) => candidate.qnum === qnum);
  if (!card) throw new Error(`Missing J6 CSV card ${qnum}`);
  return {
    topic: TOPIC,
    qnum,
    correct: false,
    latencyMs: 20_000,
    wasTimeout: false,
    missIndex: 0,
    ts,
    mode: 'full',
    csv: CSV_FILE,
    surface: 'desk',
    roundId: `journey-j6-seed-${qnum}`,
    seq: 0,
    nChoices: 4,
    chosenIdx: 0,
    stemHash: srs.stemHash(card.q),
  };
}

function j6DueSeeds() {
  return [j6DueSeed(1), j6DueSeed(2)];
}

async function j6SettleSignIn(harness) {
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => (
    harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter')
  ), { message: 'Alpha identity chip did not render' });

  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog?.style.display !== 'none') {
    harness.document.getElementById('dialog-btn').click();
  }
}

async function j6OpenDeck(harness) {
  const tile = harness.document.querySelector(`#cg .dc[data-topic="${TOPIC}"]`);
  expect(tile, `calendar has no ${TOPIC} tile`).toBeTruthy();
  tile.click();
  await harness.waitFor(() => (
    harness.document.getElementById('resource-overlay').style.display === 'block'
  ), { message: `${TOPIC} resource panel did not open` });

  const launcher = await harness.waitFor(() => (
    harness.document.querySelector(
      `#resource-body .desk-quiz-done-slot[data-topic="${TOPIC}"][data-artifact="blooket"] button`,
    )
  ), { message: 'real lesson panel has no flashcards launcher' });
  launcher.click();
  // No mode picker: the launcher opens the timed deck directly (2026-09-13).
  await harness.waitFor(() => (
    harness.document.getElementById('bf-overlay').style.display === 'block'
      && harness.document.querySelector('#bf-choices .bf-choice')
  ), { timeoutMs: 3_000, message: 'timed deck did not open directly' });
  expect(harness.document.getElementById('bf-modepick').style.display).toBe('none');
  return harness.document.getElementById('bf-overlay');
}

function j6LedgerPosts(harness) {
  return harness.roster.state.requests.filter((request) => (
    request.method === 'POST' && request.path === '/ledger/record'
  ));
}

async function j6SettleRoster(harness) {
  await harness.flush(6);
  await harness.waitFor(() => harness.roster.state.inflight === 0, {
    message: 'fake-roster requests did not settle',
  });
}

describe('Desk journey J6', () => {
  it('J6 all-ON flags show the due chip and Review; Good updates the folded store, advances, and Again stays practice-only (supersedes desk-due-today “renders the chip only behind dueTodayDeck in renderDoNowGrades” and desk-review-mode “adds the Review button only inside the reviewMode flag gate” / “logs one good review entry, applies it, saves, and advances”)', async () => {
    const seeds = j6DueSeeds();
    const srs = globalThis.FlashcardSrs;
    const todayDay = srs.dayIndex(Date.parse(NOW));
    const folded = srs.foldLog(seeds);
    expect(srs.dueCards(folded, todayDay)).toEqual([
      srs.cardId(CSV_FILE, 1),
      srs.cardId(CSV_FILE, 2),
    ]);
    expect(Object.values(FLAGS.flags).every((flag) => flag.enabled === true)).toBe(true);

    const harness = await bootDesk({
      now: NOW,
      localStorage: { [LOG_KEY]: seeds },
      roster: { grades: j6GradeFixture() },
    });

    try {
      await j6SettleSignIn(harness);
      const chip = await harness.waitFor(() => {
        const candidate = harness.document.getElementById('fc-due-chip');
        return candidate?.textContent === 'Review due (2)' ? candidate : false;
      }, { message: 'Do Now did not render the two-card due chip' });
      expect(chip.parentElement.id).toBe('donow-grades');
      expect(harness.requests.some(({ method, url }) => (
        method === 'GET' && new URL(url).pathname.endsWith('/data/flashcard-flags.json')
      )), 'data/flashcard-flags.json was not served through the disk router').toBe(true);

      // The lesson launcher no longer offers Review; the Do Now chip is Review's only entry.
      const overlay = await j6OpenDeck(harness);
      const reviewMode = [...overlay.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Review due cards'));
      expect(reviewMode).toBeUndefined();

      const cancel = [...harness.document.querySelectorAll('#bf-actions button')]
        .find((button) => button.textContent.trim() === 'Cancel');
      expect(cancel, 'timed deck has no Cancel button').toBeTruthy();
      cancel.click();
      await harness.waitFor(() => (
        harness.document.getElementById('bf-overlay').style.display === 'none'
      ), { message: 'timed deck did not close' });
      const closeResource = [...harness.document.querySelectorAll('#resource-overlay button')]
        .find((button) => button.textContent.trim() === 'OK');
      expect(closeResource, 'resource panel has no OK button').toBeTruthy();
      closeResource.click();

      harness.document.getElementById('fc-due-chip').click();
      await harness.waitFor(() => (
        harness.document.getElementById('bf-overlay').style.display === 'block'
          && harness.document.getElementById('bf-header').textContent
            .includes('Review due — practice, not graded')
      ), { message: 'Do Now due chip did not start mixed Review mode' });
      expect(harness.document.getElementById('bf-progress').textContent).toContain('Review 1 of up to 20');

      const firstQuestion = harness.document.querySelector('#bf-question > div:last-child')
        ?.textContent.trim();
      const firstCard = J6_BY_QUESTION.get(firstQuestion);
      expect(firstCard, `mixed Review rendered an unknown CSV question: ${firstQuestion}`).toBeTruthy();
      const stateBefore = JSON.parse(harness.window.localStorage.getItem(STATE_KEY) || 'null');
      expect(stateBefore).toBeTruthy();
      const correctAnswer = firstCard.choices[firstCard.correctIdx];
      const correctChoice = [...harness.document.querySelectorAll('#bf-choices .bf-choice')]
        .find((button) => button.textContent.trim().replace(/^[A-D]\.\s*/, '') === correctAnswer);
      expect(correctChoice, `Review card omitted its CSV answer: ${correctAnswer}`).toBeTruthy();
      correctChoice.click();
      const good = await harness.waitFor(() => (
        [...harness.document.querySelectorAll('#bf-actions button')]
          .find((button) => button.textContent.trim() === 'Good')
      ), { message: 'Review answer did not expose rating buttons' });
      good.click();
      await j6SettleRoster(harness);

      const logAfterGood = await harness.waitFor(() => {
        const entries = JSON.parse(harness.window.localStorage.getItem(LOG_KEY) || '[]');
        return entries.length === seeds.length + 1 ? entries : false;
      }, { message: 'Review rating did not append one SRS log entry' });
      expect(logAfterGood.slice(0, seeds.length)).toEqual(seeds);
      expect(logAfterGood.at(-1)).toMatchObject({
        topic: TOPIC,
        qnum: firstCard.qnum,
        correct: true,
        wasTimeout: false,
        missIndex: 0,
        mode: 'review',
        csv: CSV_FILE,
        surface: 'desk',
        seq: 0,
        nChoices: 4,
        chosenIdx: firstCard.correctIdx,
        review: 'good',
      });
      expect(logAfterGood.at(-1)).not.toHaveProperty('itemId');

      const firstCardId = srs.cardId(CSV_FILE, firstCard.qnum);
      const stateAfterGood = JSON.parse(harness.window.localStorage.getItem(STATE_KEY) || 'null');
      expect(stateAfterGood.cards[firstCardId]).not.toEqual(stateBefore.cards[firstCardId]);
      expect(stateAfterGood.cards[firstCardId]).toMatchObject({
        lastGrade: 'good',
        reps: stateBefore.cards[firstCardId].reps + 1,
      });

      const secondQuestion = await harness.waitFor(() => {
        const candidate = harness.document.querySelector('#bf-question > div:last-child')
          ?.textContent.trim();
        return candidate && candidate !== firstQuestion ? candidate : false;
      }, { message: 'Good rating did not advance Review to the next card' });
      expect(harness.document.getElementById('bf-progress').textContent).toContain('Review 2 of up to 20');
      expect(J6_BY_QUESTION.has(secondQuestion)).toBe(true);

      const unsure = [...harness.document.querySelectorAll('#bf-choices .bf-choice')]
        .find((button) => button.textContent.trim() === "I'm not sure");
      expect(unsure, 'next Review card has no uncertainty choice').toBeTruthy();
      unsure.click();
      const again = await harness.waitFor(() => (
        [...harness.document.querySelectorAll('#bf-actions button')]
          .find((button) => button.textContent.trim() === 'Again')
      ), { message: 'uncertain Review answer did not expose Again' });
      again.click();
      await harness.flush(6);
      await harness.waitFor(() => harness.roster.state.inflight === 0, {
        message: 'fake-roster requests did not settle after rating',
      });

      const logAfterAgain = await harness.waitFor(() => {
        const entries = JSON.parse(harness.window.localStorage.getItem(LOG_KEY) || '[]');
        return entries.length === seeds.length + 2 ? entries : false;
      }, { message: 'Again rating did not append one SRS log entry' });
      expect(logAfterAgain.at(-1)).toMatchObject({
        correct: false,
        chosenIdx: -1,
        mode: 'review',
        review: 'again',
      });
      expect(logAfterAgain.at(-1)).not.toHaveProperty('itemId');
      expect(j6LedgerPosts(harness)).toEqual([]);
      expect(harness.roster.state.ledgerRecords).toEqual([]);
    } finally {
      harness.teardown();
    }
  });

  it('J6 both-OFF flags hide the Do Now due chip and lesson Review button behind their flag gates', async () => {
    const harness = await bootDesk({
      now: NOW,
      flags: {
        dueTodayDeck: { enabled: false },
        reviewMode: { enabled: false },
      },
      localStorage: { [LOG_KEY]: j6DueSeeds() },
      roster: { grades: j6GradeFixture() },
    });

    try {
      await j6SettleSignIn(harness);
      await harness.flush(6);
      await harness.waitFor(() => harness.requests.some(({ method, url }) => (
        method === 'GET' && new URL(url).pathname.endsWith('/data/flashcard-flags.json')
      )), { message: 'both-OFF flashcard flags were not loaded from the disk router' });

      expect(harness.document.getElementById('fc-due-chip')).toBeNull();
      const overlay = await j6OpenDeck(harness);
      const reviewMode = [...overlay.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Review due cards'));
      expect(reviewMode).toBeUndefined();
      await j6SettleRoster(harness);
      expect(j6LedgerPosts(harness)).toEqual([]);
    } finally {
      harness.teardown();
    }
  });
});

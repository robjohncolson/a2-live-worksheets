/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bootDesk } from './harness.js';

const NOW = '2026-08-18T12:00:00.000Z';
const TOPIC = '1.1';
const CSV_FILE = 'u1_l1_blooket.csv';
const INITIAL_BLOOKET = 50;
const FRESH_BLOOKET = 99.5;
const LOG_KEY = 'a2_srs_log_alpha_otter';

function j5GradeFixture(blooket = INITIAL_BLOOKET) {
  return {
    ok: true,
    asOf: NOW,
    units: [],
    quarters: {
      Q1: {
        quarterGrade: 90,
        ceiling: 100,
        pcAvg: 88,
        workAvg: 90,
        lessonsDue: 1,
        lessonsGraded: 1,
        lessonsTotal: 10,
      },
    },
    completion: {},
    lessons: [{
      lessonKey: TOPIC,
      // Worksheet half NOT done (Cws < 60): a lesson with both halves done is
      // complete and the sequential calendar advances past it — 1.1 would no
      // longer be the current tile. Best-wins only needs the blooket half.
      Cws: 40,
      blooket,
      quizTotal: 0,
      items: { quiz: [] },
    }],
    gradebook: {},
  };
}

function j5ParseDeck(text) {
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

const J5_DECK = j5ParseDeck(
  readFileSync(resolve(import.meta.dirname, `../fixtures/a2/${CSV_FILE}`), 'utf8'),
);
const J5_BY_QUESTION = new Map(J5_DECK.map((card) => [card.q, card]));

async function j5SettleSignIn(harness) {
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => (
    harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter')
  ), { message: 'Alpha identity chip did not render' });

  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog?.style.display !== 'none') {
    harness.document.getElementById('dialog-btn').click();
  }
}

async function j5OpenPicker(harness) {
  const resourceOverlay = harness.document.getElementById('resource-overlay');
  if (resourceOverlay.style.display !== 'block') {
    // The calendar re-renders after sign-in (grade fetch) — wait for the tile
    // instead of racing the repaint.
    const tile = await harness.waitFor(() => (
      harness.document.querySelector(`#cg .dc[data-topic="${TOPIC}"]`)
    ), { message: `calendar has no ${TOPIC} tile` });
    tile.click();
    await harness.waitFor(() => resourceOverlay.style.display === 'block', {
      message: `${TOPIC} resource panel did not open`,
    });
  }

  const launcher = await harness.waitFor(() => (
    harness.document.querySelector(
      `#resource-body .desk-quiz-done-slot[data-topic="${TOPIC}"][data-artifact="blooket"] button`,
    )
  ), { message: 'real lesson panel has no flashcards launcher' });
  launcher.click();
  await harness.waitFor(() => harness.window._bfState.deck.length === 10);
  expect(harness.window._bfState.deck).toHaveLength(10);
  const FC = harness.window.Flashcards;
  const expected = FC.dailyDraw(J5_DECK, FC.localDateKey() + '|' + TOPIC, 10);
  expect(harness.window._bfState.deck.map(card => card.qnum)).toEqual(expected.map(card => card.qnum));
  expect(harness.document.getElementById('bf-full-deck')).toBeNull();
  // The secondary action opens the full timed deck.
  await harness.waitFor(() => (
    harness.document.getElementById('bf-overlay').style.display === 'block'
      && harness.document.querySelector('#bf-choices .bf-choice')
  ), { timeoutMs: 3_000, message: 'timed deck did not open directly' });
  return harness.document.getElementById('bf-header');
}

function j5CorrectButton(harness) {
  const question = harness.document.getElementById('bf-question').textContent.trim();
  const card = J5_BY_QUESTION.get(question);
  expect(card, `question was not parsed from ${CSV_FILE}: ${question}`).toBeTruthy();
  const correctAnswer = card.choices[card.correctIdx];
  const button = [...harness.document.querySelectorAll('#bf-choices .bf-choice')]
    .find((choice) => choice.textContent.trim().replace(/^[A-D]\.\s*/, '') === correctAnswer);
  expect(button, `visible choices omitted the CSV answer: ${correctAnswer}`).toBeTruthy();
  expect(button.textContent.trim().replace(/^[A-D]\.\s*/, '')).toBe(correctAnswer);
  expect(Number(button.dataset.i)).toBe(card.correctIdx);
  return { button, card };
}

async function j5CompleteTimedRun(harness, { missFirst }) {
  const maximumAnswers = 10;
  let deliberatelyMissed = false;

  for (let answer = 0; answer < maximumAnswers; answer += 1) {
    const ready = await harness.waitFor(() => {
      const result = harness.document.getElementById('bf-result');
      if (result.style.display === 'block') return 'finished';
      return harness.document.querySelector('#bf-choices .bf-choice:not(:disabled)');
    }, { timeoutMs: 1_500, message: `timed deck stalled before answer ${answer + 1}` });
    if (ready === 'finished') break;

    const current = j5CorrectButton(harness);
    let choice = current.button;
    if (missFirst && !deliberatelyMissed) {
      choice = [...harness.document.querySelectorAll('#bf-choices .bf-choice')]
        .find((button) => Number(button.dataset.i) !== current.card.correctIdx);
      expect(choice, 'timed card has no incorrect real choice').toBeTruthy();
      deliberatelyMissed = true;
    }
    choice.click();
    if (choice !== current.button) harness.document.getElementById('bf-next').click();

    await harness.waitFor(() => {
      const result = harness.document.getElementById('bf-result');
      return result.style.display === 'block'
        || harness.document.querySelector('#bf-choices .bf-choice:not(:disabled)');
    }, { timeoutMs: 1_500, message: `timed deck did not auto-advance after answer ${answer + 1}` });
  }

  const result = await harness.waitFor(() => {
    const candidate = harness.document.getElementById('bf-result');
    return candidate.style.display === 'block' ? candidate : false;
  }, { timeoutMs: 1_500, message: 'timed deck did not render its recap' });
  const match = /You got (\d+) of 10/.exec(result.textContent);
  expect(match, 'timed deck recap omitted its score').toBeTruthy();
  return Number(match[1]);
}

function j5LedgerPosts(harness) {
  return harness.roster.state.requests.filter((request) => (
    request.method === 'POST' && request.path === '/ledger/record'
  ));
}

async function j5SettleRoster(harness) {
  await harness.flush(6);
  await harness.waitFor(() => harness.roster.state.inflight === 0, {
    message: 'fake-roster requests did not settle',
  });
}

describe('Desk daily flashcard journey', () => {
  it('finishes all ten, records raw accuracy and retries without a completion row', async () => {
    const harness = await bootDesk({ now: NOW, fakeTimers: true, roster: { grades: j5GradeFixture() } });
    try {
      await j5SettleSignIn(harness);
      const daily = vi.fn(async () => ({ ok: true }));
      harness.window.gradebookClient.recordFlashcardRun = daily;
      const heading = await j5OpenPicker(harness);
      expect(heading.textContent).toContain('Flashcards —');
      expect(await j5CompleteTimedRun(harness, { missFirst: true })).toBe(9);
      expect(daily).toHaveBeenCalledWith(TOPIC, 'quick', 9, 10);
      expect(j5LedgerPosts(harness)).toEqual([]);
      const result = harness.document.getElementById('bf-result');
      expect(result.textContent).not.toMatch(/passed|80%/i);
      expect(result.textContent).toContain('Review your misses');
      const retry = [...result.querySelectorAll('button')]
        .find(button => button.textContent === 'Try again (new shuffle)');
      retry.click();
      expect(await j5CompleteTimedRun(harness, { missFirst: false })).toBe(10);
      expect(daily).toHaveBeenCalledTimes(2);
      expect(daily).toHaveBeenLastCalledWith(TOPIC, 'quick', 10, 10);
      await j5SettleRoster(harness);
      expect(j5LedgerPosts(harness)).toEqual([]);
      const entries = JSON.parse(harness.window.localStorage.getItem(LOG_KEY) || '[]');
      expect(entries).toHaveLength(20);
      expect(entries.every(entry => entry.mode === 'quick')).toBe(true);
      expect(result.textContent).toContain('You got 10 of 10');
    } finally { harness.teardown(); }
  }, 60_000);
});

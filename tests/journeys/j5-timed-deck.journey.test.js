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
      const daily = vi.spyOn(harness.window.OfflineQueue, 'enqueue');
      const heading = await j5OpenPicker(harness);
      expect(heading.textContent).toContain('Flashcards —');
      expect(await j5CompleteTimedRun(harness, { missFirst: true })).toBe(9);
      expect(daily).toHaveBeenCalledWith(expect.objectContaining({ kind: 'flashcard-run', studentId: harness.window.rosterClient.studentId(), response: expect.objectContaining({ correct: 9, total: 10 }) }));
      await harness.waitFor(() => ![...harness.document.querySelectorAll('#bf-result button')].find(button => button.textContent === 'Try again (new shuffle)').disabled);
      expect(j5LedgerPosts(harness)).toEqual([]);
      const result = harness.document.getElementById('bf-result');
      expect(result.textContent).not.toMatch(/passed|80%/i);
      expect(result.textContent).toContain('Review your misses');
      const retry = [...result.querySelectorAll('button')]
        .find(button => button.textContent === 'Try again (new shuffle)');
      retry.click();
      expect(await j5CompleteTimedRun(harness, { missFirst: false })).toBe(10);
      expect(daily).toHaveBeenCalledTimes(2);
      expect(daily).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'flashcard-run', response: expect.objectContaining({ correct: 10, total: 10 }) }));
      await j5SettleRoster(harness);
      expect(j5LedgerPosts(harness)).toEqual([]);
      const entries = JSON.parse(harness.window.localStorage.getItem(LOG_KEY) || '[]');
      expect(entries).toHaveLength(20);
      expect(entries.every(entry => entry.mode === 'quick')).toBe(true);
      expect(result.textContent).toContain('You got 10 of 10');
    } finally { harness.teardown(); }
  }, 60_000);
});


function progress(harness) {
  return JSON.parse(harness.window.localStorage.getItem(harness.window._bfStorageKey()) || '{}')[TOPIC];
}
function saveRetry(harness) {
  return [...harness.document.querySelectorAll('#bf-result button')].find(button => button.textContent === 'Retry');
}

describe('daily writer durability and ownership', () => {
  it('keeps a deferred enqueue until durable, then replays the owner record on reconnect', async () => {
    const harness = await bootDesk({ now: NOW, fakeTimers: true, roster: { grades: j5GradeFixture() } });
    try {
      await j5SettleSignIn(harness);
      Object.defineProperty(harness.window.navigator, 'onLine', { configurable: true, value: false });
      const queue = harness.window.OfflineQueue;
      const enqueue = queue.enqueue.bind(queue);
      let release;
      vi.spyOn(queue, 'enqueue').mockImplementation(record => new Promise(resolve => {
        release = async () => resolve(await enqueue(record));
      }));
      await j5OpenPicker(harness);
      await j5CompleteTimedRun(harness, { missFirst: true });
      expect(progress(harness).pendingResult.ownerId).toBe(harness.window.rosterClient.studentId());
      expect(harness.document.getElementById('bf-result').textContent).toContain('Saving...');
      await release();
      await harness.waitFor(() => !progress(harness));
      const rows = await queue.all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ studentId: harness.window.rosterClient.studentId(), kind: 'flashcard-run', response: { correct: 9, total: 10 } });
      const fetch = harness.window.fetch.bind(harness.window);
      const posts = [];
      harness.window.fetch = (url, options) => {
        if (String(url).endsWith('/flashcards/daily')) {
          posts.push(JSON.parse(options.body));
          return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
        }
        return fetch(url, options);
      };
      Object.defineProperty(harness.window.navigator, 'onLine', { configurable: true, value: true });
      harness.window.dispatchEvent(new harness.window.Event('online'));
      await harness.waitFor(() => posts.length === 1);
      await harness.window.gradebookClient.syncOfflineQueue();
      expect(await queue.all()).toHaveLength(0);
      expect(posts[0]).toMatchObject({ studentId: rows[0].studentId, correct: 9, total: 10 });
    } finally { harness.teardown(); }
  }, 60_000);

  it('retains a failed finished run across reload and retries the real writer', async () => {
    let harness = await bootDesk({ now: NOW, fakeTimers: true, roster: { grades: j5GradeFixture() } });
    try {
      await j5SettleSignIn(harness);
      Object.defineProperty(harness.window.navigator, 'onLine', { configurable: true, value: false });
      vi.spyOn(harness.window.OfflineQueue, 'enqueue').mockRejectedValue(new Error('queue unavailable'));
      await j5OpenPicker(harness);
      await j5CompleteTimedRun(harness, { missFirst: true });
      await harness.waitFor(() => !saveRetry(harness).hidden);
      const pending = progress(harness).pendingResult;
      expect(harness.document.getElementById('bf-result').textContent).toContain("Couldn't save yet");
      harness = await harness.reboot();
      Object.defineProperty(harness.window.navigator, 'onLine', { configurable: true, value: false });
      const enqueue = vi.spyOn(harness.window.OfflineQueue, 'enqueue');
      await harness.window._bfStartQuick(null, TOPIC);
      await harness.waitFor(() => !progress(harness));
      expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ studentId: pending.ownerId, response: expect.objectContaining({ timestamp: pending.timestamp, correct: 9, total: 10 }) }));
    } finally { harness.teardown(); }
  }, 60_000);

  it.each(['roster-session-changed', 'storage'])('closes a run on %s and refuses a mismatched finish', async event => {
    const harness = await bootDesk({ now: NOW, fakeTimers: true, roster: { grades: j5GradeFixture() } });
    try {
      await j5SettleSignIn(harness);
      await j5OpenPicker(harness);
      const owner = harness.window._bfState.ownerId;
      const enqueue = vi.spyOn(harness.window.OfflineQueue, 'enqueue');
      vi.spyOn(harness.window.rosterClient, 'studentId').mockReturnValue('different-owner');
      harness.window.dispatchEvent(new harness.window.Event(event));
      expect(harness.document.getElementById('bf-overlay').style.display).toBe('none');
      Object.assign(harness.window._bfState, { ownerId: owner, topic: TOPIC, finished: false });
      await harness.window._bfFinish();
      expect(enqueue).not.toHaveBeenCalled();
      expect(harness.document.getElementById('dialog-overlay').textContent).toContain('Sign in again');
    } finally { harness.teardown(); }
  }, 60_000);
});

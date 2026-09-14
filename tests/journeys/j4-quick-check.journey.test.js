/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootDesk } from './harness.js';

const NOW = '2026-08-18T12:00:00.000Z';
const TOPIC = '1.1';
const CSV_FILE = 'u1_l1_blooket.csv';
const PROGRESS_KEY = 'a2_desk_bf_progress_alpha_otter';
const MARKS_KEY = 'a2_desk_marks_alpha_otter';

function j4GradeFixture() {
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

function j4ParseDeck(text) {
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

const J4_DECK = j4ParseDeck(
  readFileSync(resolve(import.meta.dirname, `../fixtures/a2/${CSV_FILE}`), 'utf8'),
);
const J4_BY_QUESTION = new Map(J4_DECK.map((card) => [card.q, card]));

async function j4SettleSignIn(harness) {
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => (
    harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter')
  ), { message: 'Alpha identity chip did not render' });

  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog?.style.display !== 'none') {
    harness.document.getElementById('dialog-btn').click();
  }
}

async function j4OpenPicker(harness) {
  const resourceOverlay = harness.document.getElementById('resource-overlay');
  if (resourceOverlay.style.display !== 'block') {
    const tile = harness.document.querySelector(`#cg .dc[data-topic="${TOPIC}"]`);
    expect(tile, `calendar has no ${TOPIC} tile`).toBeTruthy();
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

  await harness.waitFor(() => {
    const overlay = harness.document.getElementById('bf-overlay');
    const picker = harness.document.getElementById('bf-modepick');
    return overlay.style.display === 'block' && picker.style.display === 'block';
  }, { message: 'flashcard mode picker did not open' });
  return harness.document.getElementById('bf-modepick');
}

function j4CorrectButton(harness) {
  const question = harness.document.getElementById('bf-question').textContent.trim();
  const card = J4_BY_QUESTION.get(question);
  expect(card, `question was not parsed from ${CSV_FILE}: ${question}`).toBeTruthy();
  const correctAnswer = card.choices[card.correctIdx];
  const button = [...harness.document.querySelectorAll('#bf-choices .bf-choice')]
    .find((choice) => choice.textContent.trim().replace(/^[A-D]\.\s*/, '') === correctAnswer);
  expect(button, `visible choices omitted the CSV answer: ${correctAnswer}`).toBeTruthy();
  expect(button.textContent.trim().replace(/^[A-D]\.\s*/, '')).toBe(correctAnswer);
  expect(Number(button.dataset.i)).toBe(card.correctIdx);
  return { button, card, question };
}

function j4LedgerPosts(harness) {
  return harness.roster.state.requests.filter((request) => (
    request.method === 'POST' && request.path === '/ledger/record'
  ));
}

async function j4SettleRoster(harness) {
  await harness.flush(6);
  await harness.waitFor(() => harness.roster.state.inflight === 0, {
    message: 'fake-roster requests did not settle',
  });
}

describe('Desk journey J4', () => {
  // RETIRED 2026-09-13: the quick check is unreachable from the UI (full timed deck is the only
  // graded mode). The engine stays for flashcards.js parity; this journey is kept for history.
  it.skip('J4 resumes answered snapshots without score inflation and commits one 8/10 Quick check (supersedes desk-blooket-flashcards it 55 “_bfSaveProgress persists the answered snapshot”, it 56 “answer saves after scoring and Next clears answered before saving”, it 57 “answer then Cancel resumes at the following card without another point”, it 58 “pass timer is canceled on close and resume commits the saved 80% once”, and it 58b “non-passing answer then Cancel resumes one card ahead without a commit”)', async () => {
    const harness = await bootDesk({
      now: NOW,
      fakeTimers: true,
      roster: { grades: j4GradeFixture() },
    });

    try {
      await j4SettleSignIn(harness);
      let picker = await j4OpenPicker(harness);
      let quick = [...picker.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Quick check'));
      expect(quick, 'mode picker has no Quick check button').toBeTruthy();
      quick.click();

      await harness.waitFor(() => (
        harness.document.querySelector('#bf-choices .bf-choice:not(:disabled)')
      ), { message: 'first Quick check card did not render' });
      const first = j4CorrectButton(harness);
      const wrong = [...harness.document.querySelectorAll('#bf-choices .bf-choice')]
        .find((button) => Number(button.dataset.i) !== first.card.correctIdx);
      expect(wrong, 'first card has no incorrect real choice').toBeTruthy();
      wrong.click();

      let saved = JSON.parse(harness.window.localStorage.getItem(PROGRESS_KEY));
      expect(saved[TOPIC]).toMatchObject({ idx: 0, score: 0, answered: true });
      const cancel = [...harness.document.querySelectorAll('#bf-actions button')]
        .find((button) => button.textContent.trim() === 'Cancel');
      expect(cancel, 'Quick check has no Cancel button').toBeTruthy();
      cancel.click();
      await harness.waitFor(() => (
        harness.document.getElementById('bf-overlay').style.display === 'none'
      ), { message: 'wrong-answer Cancel did not close the modal' });
      await j4SettleRoster(harness);
      expect(j4LedgerPosts(harness)).toEqual([]);

      picker = await j4OpenPicker(harness);
      expect(picker.textContent).toContain('Resume available');
      quick = [...picker.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Quick check'));
      quick.click();
      await harness.waitFor(() => {
        const progress = harness.document.getElementById('bf-progress').textContent;
        return progress.includes('Question 2 of 10') && progress.includes('Right so far: 0');
      }, { message: 'wrong answered snapshot did not resume one card ahead' });
      expect(harness.document.getElementById('bf-question').textContent.trim()).not.toBe(first.question);
      await j4SettleRoster(harness);
      expect(j4LedgerPosts(harness)).toEqual([]);

      const second = j4CorrectButton(harness);
      second.button.click();
      saved = JSON.parse(harness.window.localStorage.getItem(PROGRESS_KEY));
      expect(saved[TOPIC]).toMatchObject({ idx: 1, score: 1, answered: true });
      [...harness.document.querySelectorAll('#bf-actions button')]
        .find((button) => button.textContent.trim() === 'Cancel')
        .click();

      picker = await j4OpenPicker(harness);
      expect(picker.textContent).toContain('Resume available');
      [...picker.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Quick check'))
        .click();
      await harness.waitFor(() => {
        const progress = harness.document.getElementById('bf-progress').textContent;
        return progress.includes('Question 3 of 10') && progress.includes('Right so far: 1');
      }, { message: 'correct answered snapshot gained or lost a point on resume' });
      expect(harness.document.getElementById('bf-question').textContent.trim()).not.toBe(second.question);

      for (let answer = 0; answer < 7; answer += 1) {
        const current = j4CorrectButton(harness);
        current.button.click();
        if (answer >= 6) continue;
        const nextQuestionNumber = 4 + answer;
        await harness.waitFor(() => {
          const progress = harness.document.getElementById('bf-progress').textContent;
          const enabled = harness.document.querySelector('#bf-choices .bf-choice:not(:disabled)');
          return progress.includes(`Question ${nextQuestionNumber} of 10`) && enabled;
        }, { timeoutMs: 1_200, message: `Quick check did not advance to question ${nextQuestionNumber}` });
        if (answer === 0) {
          saved = JSON.parse(harness.window.localStorage.getItem(PROGRESS_KEY));
          expect(saved[TOPIC]).toMatchObject({ idx: 3, score: 2, answered: false });
        }
      }

      saved = JSON.parse(harness.window.localStorage.getItem(PROGRESS_KEY));
      expect(saved[TOPIC]).toMatchObject({ idx: 8, score: 8, answered: true });
      await j4SettleRoster(harness);
      expect(j4LedgerPosts(harness)).toEqual([]);
      [...harness.document.querySelectorAll('#bf-actions button')]
        .find((button) => button.textContent.trim() === 'Cancel')
        .click();

      picker = await j4OpenPicker(harness);
      expect(picker.textContent).toContain('Resume available');
      [...picker.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Quick check'))
        .click();
      await harness.waitFor(() => (
        harness.document.getElementById('bf-result').textContent.includes('8 of 10 (80.0%)')
      ), { message: 'resumed passing snapshot did not finish at its saved 80%' });
      expect(harness.document.getElementById('bf-header').textContent).toContain('(resuming)');
      expect(harness.document.getElementById('bf-result').textContent).not.toContain('90.0%');
      expect(harness.document.getElementById('bf-result').textContent).not.toContain('100.0%');

      await harness.waitFor(() => {
        const recorded = j4LedgerPosts(harness);
        return recorded.length >= 1;
      }, { timeoutMs: 3_000, message: 'resumed Quick check did not post' });
      await harness.waitFor(() => {
        const marks = JSON.parse(harness.window.localStorage.getItem(MARKS_KEY) || '{}');
        return marks[`${TOPIC}|blooket`]?.score === 80;
      }, { message: 'Quick check best was not persisted as 80' });
      harness.clock.advance(5_000);
      await harness.flush(6);
      await harness.waitFor(() => harness.roster.state.inflight === 0, {
        message: 'fake-roster requests did not settle after the pass timer',
      });

      const posts = j4LedgerPosts(harness);
      expect(j4LedgerPosts(harness)).toHaveLength(1);
      expect(harness.roster.state.ledgerRecords).toHaveLength(1);
      expect(posts[0].body.token).toBe('token:alpha_otter');
      const { token, ...payload } = posts[0].body;
      expect(token).toBe('token:alpha_otter');
      expect(payload).toEqual({
        source: 'worksheet',
        itemId: 'BL-U1-L1-DESK_DONE',
        unit: 'U1',
        topic: TOPIC,
        response: { selfAttest: 'blooket' },
        score: 80,
        attempt: 1,
      });
      expect(JSON.parse(harness.window.localStorage.getItem(PROGRESS_KEY) || '{}')[TOPIC])
        .toBeUndefined();
      expect(harness.requests.some(({ method, url }) => (
        method === 'GET' && new URL(url).pathname.endsWith(`/${CSV_FILE}`)
      )), `${CSV_FILE} was not served through the disk router`).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it.skip('J4 opens a legacy snapshot without answered at its saved card (supersedes desk-blooket-flashcards it 59 “legacy snapshot without answered resumes at its saved index”)', async () => {
    const legacyDeck = J4_DECK.slice(0, 10);
    const harness = await bootDesk({
      now: NOW,
      fakeTimers: true,
      localStorage: {
        [PROGRESS_KEY]: {
          [TOPIC]: {
            idx: 4,
            score: 3,
            deck: legacyDeck,
            ts: '2026-08-17T12:00:00.000Z',
          },
        },
      },
      roster: { grades: j4GradeFixture() },
    });

    try {
      await j4SettleSignIn(harness);
      const picker = await j4OpenPicker(harness);
      expect(picker.textContent).toContain('Resume available');
      [...picker.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Quick check'))
        .click();

      await harness.waitFor(() => (
        harness.document.getElementById('bf-question').textContent.trim() === legacyDeck[4].q
      ), { message: 'legacy snapshot did not render its saved card' });
      expect(harness.document.getElementById('bf-progress').textContent).toContain('Question 5 of 10');
      expect(harness.document.getElementById('bf-progress').textContent).toContain('Right so far: 3');
      await j4SettleRoster(harness);
      expect(j4LedgerPosts(harness)).toEqual([]);
    } finally {
      harness.teardown();
    }
  });
});

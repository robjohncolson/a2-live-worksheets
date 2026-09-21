/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeRoster } from './fake-roster.js';
import { bootDesk } from './harness.js';

const NOW = '2026-09-22T12:00:00.000Z';
const TOPIC = '1.1';
const CSV_FILE = 'u1_l1_blooket.csv';
const KID = 'alpha_otter';
const OTHER_STUDENT = 'beta_fox';
const KID_LOG_KEY = `a2_srs_log_${KID}`;
const OTHER_LOG_KEY = `a2_srs_log_${OTHER_STUDENT}`;
const FLAGS = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../data/flashcard-flags.json'), 'utf8'),
);

function parseDeck(text) {
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
    return [{ qnum, question, choices, correctIdx }];
  });
}

const DECK = parseDeck(
  readFileSync(resolve(import.meta.dirname, `../fixtures/a2/${CSV_FILE}`), 'utf8'),
);
const CARD_BY_QUESTION = new Map(DECK.map((card) => [card.question, card]));

function gradeFixture() {
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

function readLog(harness, key = KID_LOG_KEY) {
  return JSON.parse(harness.window.localStorage.getItem(key) || '[]');
}

function entryKey(entry) {
  if (entry.roundId != null) return `${entry.roundId}#${entry.seq}`;
  return `${entry.ts}#${entry.csv || entry.topic}#${entry.qnum}`;
}

function logKeys(entries) {
  return entries.map(entryKey).sort();
}

function wireKeys(state) {
  return state.e.map((tuple) => `${tuple[0]}#${tuple[1]}`).sort();
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function expectedTuple(entry, csvs) {
  const csv = entry.csv == null ? null : String(entry.csv);
  return [
    entry.roundId == null ? null : String(entry.roundId),
    numberOr(entry.seq, 0),
    csv === null ? -1 : csvs.indexOf(csv),
    numberOr(entry.qnum, 0),
    entry.correct ? 1 : 0,
    numberOr(entry.ts, 0),
    entry.mode == null ? 'full' : String(entry.mode),
    numberOr(entry.missIndex, 0),
    entry.wasTimeout ? 1 : 0,
    numberOr(entry.latencyMs, 0),
    entry.review == null ? null : String(entry.review),
    entry.topic == null ? null : String(entry.topic),
    entry.surface == null ? 'desk' : String(entry.surface),
    numberOr(entry.nChoices, 0),
    entry.stemHash == null ? null : String(entry.stemHash),
    typeof entry.chosenIdx === 'number' ? entry.chosenIdx : null,
  ];
}

function forbiddenGradeKeyPaths(value, path = '$', found = []) {
  if (!value || typeof value !== 'object') return found;
  const forbidden = new Set([
    'itemId',
    'response',
    'attempt',
    'score',
    'grade',
    'selfAttest',
  ]);
  for (const [key, child] of Object.entries(value)) {
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    if (forbidden.has(key)) found.push(childPath);
    forbiddenGradeKeyPaths(child, childPath, found);
  }
  return found;
}

function assertWireState(wire, entries, email) {
  expect(Object.keys(wire).sort()).toEqual([
    'v',
    'email',
    'csvs',
    'e',
    'tombstones',
    'savedAt',
  ].sort());
  expect(wire.v).toBe(1);
  expect(wire.email).toBe(email);
  expect(wire.csvs.every((csv) => typeof csv === 'string')).toBe(true);
  expect(new Set(wire.csvs).size).toBe(wire.csvs.length);
  expect(wire.e).toHaveLength(entries.length);
  expect(wire.tombstones).toEqual(expect.any(Object));
  expect(Array.isArray(wire.tombstones)).toBe(false);
  expect(typeof wire.savedAt).toBe('number');

  const entriesByKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  for (const tuple of wire.e) {
    expect(tuple).toHaveLength(16);
    const csv = tuple[2] >= 0 ? wire.csvs[tuple[2]] : null;
    const key = tuple[0] == null
      ? `${tuple[5]}#${csv || tuple[11]}#${tuple[3]}`
      : `${tuple[0]}#${tuple[1]}`;
    const entry = entriesByKey.get(key);
    expect(entry, `wire tuple has no matching local entry: ${key}`).toBeTruthy();
    expect(tuple).toEqual(expectedTuple(entry, wire.csvs));
  }

  expect(forbiddenGradeKeyPaths(wire)).toEqual([]);
}

function trainerRequests(roster, method, token) {
  return roster.state.requests.filter((request) => (
    request.method === method
      && request.path === '/flashcards/state'
      && (!token || request.body?.token === token || request.headers.authorization === `Bearer ${token}`)
  ));
}

async function settleRoster(harness) {
  await harness.flush(8);
  await harness.waitFor(() => harness.roster.state.inflight === 0, {
    message: 'fake-roster sync requests did not settle',
  });
  await harness.flush(2);
}

async function settleSignIn(harness, username) {
  await harness.waitFor(() => (
    typeof harness.window._fcFlag === 'function'
      && harness.window._fcFlag('flashcardSync') === true
  ), { message: 'flashcardSync did not load enabled from data/flashcard-flags.json' });

  await harness.signIn(username);
  const user = harness.roster.state.userByUsername(username);
  await harness.waitFor(() => (
    harness.document.getElementById('menu-identity').textContent.includes(user.realName)
  ), { message: `${user.realName} identity chip did not render` });

  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog?.style.display !== 'none') {
    harness.document.getElementById('dialog-btn').click();
  }
  await settleRoster(harness);
}

async function openTimedDeck(harness) {
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
  await harness.waitFor(() => harness.window._bfState.deck.length === 10);
  expect(harness.window._bfState.deck).toHaveLength(10);
  const FC = harness.window.Flashcards;
  const expected = FC.dailyDraw(harness.window._bfState.allCards, FC.localDateKey() + '|' + TOPIC, 10);
  expect(harness.window._bfState.deck.map(card => card.qnum)).toEqual(expected.map(card => card.qnum));
  expect(harness.document.getElementById('bf-full-deck')).toBeNull();

  // The secondary action opens the full timed deck.
  await harness.waitFor(() => (
    harness.document.getElementById('bf-overlay').style.display === 'block'
      && harness.document.querySelector('#bf-choices .bf-choice:not(:disabled)')
  ), { timeoutMs: 3_000, message: 'timed deck did not render its first card' });
}

function correctChoice(harness) {
  const question = harness.document.getElementById('bf-question').textContent.trim();
  const card = CARD_BY_QUESTION.get(question);
  expect(card, `timed deck rendered an unknown CSV question: ${question}`).toBeTruthy();
  const correctAnswer = card.choices[card.correctIdx];
  const choice = [...harness.document.querySelectorAll('#bf-choices .bf-choice')]
    .find((button) => button.textContent.trim().replace(/^[A-D]\.\s*/, '') === correctAnswer);
  expect(choice, `visible choices omitted the CSV answer: ${correctAnswer}`).toBeTruthy();
  return choice;
}

// The timed deck writes its per-card SRS entries when the run FINISHES (not per
// answer), so one practice session = one complete, all-correct run of the deck.
async function completeOneTimedRun(harness) {
  const before = readLog(harness).length;
  await openTimedDeck(harness);

  for (let answer = 0; answer < 10; answer += 1) {
    const ready = await harness.waitFor(() => {
      if (harness.document.getElementById('bf-result').style.display === 'block') return 'finished';
      return harness.document.querySelector('#bf-choices .bf-choice:not(:disabled)');
    }, { timeoutMs: 1_500, message: `timed deck stalled before answer ${answer + 1}` });
    if (ready === 'finished') break;
    correctChoice(harness).click();
    await harness.waitFor(() => (
      harness.document.getElementById('bf-result').style.display === 'block'
        || harness.document.querySelector('#bf-choices .bf-choice:not(:disabled)')
    ), { timeoutMs: 1_500, message: `timed deck did not auto-advance after answer ${answer + 1}` });
  }

  const log = await harness.waitFor(() => {
    const entries = readLog(harness);
    return entries.length === before + 10 ? entries : false;
  }, { timeoutMs: 1_500, message: 'timed deck did not append one SRS entry per card at finish' });

  const cancel = [...harness.document.querySelectorAll('#bf-actions button')]
    .find((button) => button.textContent.trim() === 'Cancel');
  expect(cancel, 'timed deck recap has no Cancel button').toBeTruthy();
  cancel.click();
  await harness.waitFor(() => (
    harness.document.getElementById('bf-overlay').style.display === 'none'
  ), { message: 'timed deck did not close' });

  const closeResource = [...harness.document.querySelectorAll('#resource-overlay button')]
    .find((button) => button.textContent.trim() === 'OK');
  expect(closeResource, 'resource panel has no OK button').toBeTruthy();
  closeResource.click();
  return log;
}

function clickSignOut(harness) {
  const signOut = [...harness.document.querySelectorAll('#menu-student .menu-dd-item')]
    .find((item) => item.textContent.includes('Sign Out'));
  expect(signOut, 'the real User menu has no Sign Out action').toBeTruthy();
  signOut.click();
}

function dispatchVisible(harness) {
  Object.defineProperty(harness.document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  harness.document.dispatchEvent(new harness.window.Event('visibilitychange'));
}

describe('Desk journey J9', () => {
  it('J9 unions flashcard practice across two real Desk devices, refreshes on visible, and isolates the next student', async () => {
    expect(FLAGS.flags.flashcardSync.enabled).toBe(true);
    const sharedRoster = createFakeRoster({
      grades: gradeFixture(),
    });
    let deviceA;
    let deviceB;

    try {
      deviceA = await bootDesk({
        now: NOW,
        fakeTimers: true,
        randomSeed: 'journey-j9-device-a',
        roster: sharedRoster,
      });
      expect(deviceA.roster).toBe(sharedRoster);
      await settleSignIn(deviceA, KID);

      const aLog = await completeOneTimedRun(deviceA);
      expect(aLog).toHaveLength(10);
      expect(aLog[0]).toMatchObject({
        topic: TOPIC,
        mode: 'quick',
        csv: CSV_FILE,
        surface: 'desk',
        seq: 0,
      });

      // Daily answers append during the run; allow the final debounced push.
      deviceA.clock.advance(3_001);
      await settleRoster(deviceA);

      const aGets = trainerRequests(sharedRoster, 'GET', 'token:alpha_otter');
      const aPuts = trainerRequests(sharedRoster, 'PUT', 'token:alpha_otter');
      expect(aGets.length).toBeGreaterThanOrEqual(1);
      expect(aGets[0].headers.authorization).toBe('Bearer token:alpha_otter');
      expect(aPuts).toHaveLength(1);
      expect(Object.keys(aPuts[0].body).sort()).toEqual(['baseUpdatedAt', 'state', 'token']);
      expect(aPuts[0].body.token).toBe('token:alpha_otter');
      expect(aPuts[0].body.baseUpdatedAt).toBeNull();
      assertWireState(aPuts[0].body.state, aLog, KID);
      expect(sharedRoster.state.flashcardStates).toHaveProperty('size', 1);
      const rowAfterA = sharedRoster.state.flashcardStates.get('stu-alpha');
      expect(rowAfterA.state).toEqual(aPuts[0].body.state);

      deviceB = await bootDesk({
        now: NOW,
        fakeTimers: true,
        randomSeed: 'journey-j9-device-b',
        roster: sharedRoster,
      });
      expect(deviceB.roster).toBe(sharedRoster);
      // A fresh device has only the Desk's own boot caches (year,
      // registry/overlay caches) — no student-scoped a2_* keys yet.
      {
        const ls = deviceB.window.localStorage;
        const studentKeys = [];
        for (let i = 0; i < ls.length; i += 1) {
          const key = ls.key(i);
          if (/^a2_(srs_log|fc_state|desk_marks|desk_bf_progress|desk_student_email)/.test(key)) studentKeys.push(key);
        }
        expect(studentKeys).toEqual([]);
      }
      await settleSignIn(deviceB, KID);

      const bAfterPull = await deviceB.waitFor(() => {
        const entries = readLog(deviceB);
        return logKeys(entries).join('|') === logKeys(aLog).join('|') ? entries : false;
      }, { message: "device B's sign-in pull did not merge device A's practice" });
      expect(logKeys(bAfterPull)).toEqual(logKeys(aLog));

      const bLog = await completeOneTimedRun(deviceB);
      expect(bLog).toHaveLength(20);
      expect(new Set(logKeys(bLog)).size).toBe(20);
      deviceB.clock.advance(3_001);
      await settleRoster(deviceB);

      const rowAfterB = sharedRoster.state.flashcardStates.get('stu-alpha');
      assertWireState(rowAfterB.state, bLog, KID);
      expect(wireKeys(rowAfterB.state)).toEqual(logKeys(bLog));
      expect(rowAfterB.state.email).toBe(KID);

      const aGetCountBeforeVisible = trainerRequests(
        sharedRoster,
        'GET',
        'token:alpha_otter',
      ).length;
      deviceA.clock.advance(61_001);
      dispatchVisible(deviceA);
      await deviceA.waitFor(() => (
        logKeys(readLog(deviceA)).join('|') === logKeys(bLog).join('|')
      ), { message: "device A's visible-tab pull did not merge device B's practice" });
      await settleRoster(deviceA);

      const aAfterVisible = readLog(deviceA);
      expect(logKeys(aAfterVisible)).toEqual(logKeys(bLog));
      expect(trainerRequests(sharedRoster, 'GET', 'token:alpha_otter').length)
        .toBeGreaterThan(aGetCountBeforeVisible);

      const putCountBeforeIdentitySwitch = trainerRequests(sharedRoster, 'PUT').length;
      clickSignOut(deviceB);
      deviceB = await deviceB.reboot();
      await settleSignIn(deviceB, OTHER_STUDENT);

      expect(readLog(deviceB, OTHER_LOG_KEY)).toEqual([]);
      expect(sharedRoster.state.flashcardStates.has('stu-beta')).toBe(false);
      expect(trainerRequests(sharedRoster, 'PUT')).toHaveLength(putCountBeforeIdentitySwitch);
      const putsAfterSwitch = sharedRoster.state.requests
        .filter((request) => request.method === 'PUT' && request.path === '/flashcards/state')
        .slice(putCountBeforeIdentitySwitch);
      expect(putsAfterSwitch).toEqual([]);
    } finally {
      deviceB?.teardown();
      deviceA?.teardown();
    }
  }, 90_000);   // two full timed-deck runs + two Desk boots; 30 s times out under a parallel full-suite run
});

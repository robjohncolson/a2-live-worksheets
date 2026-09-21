// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');
const MOBILE = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const ENGINE = readFileSync(resolve(repo, 'flashcards.js'), 'utf8');

// 'mobile-timed-reveals-on-miss' was closed by T3.4 (2026-08-18) — see the
// 'timed-mode miss reveals nothing on either surface' it below.
const KNOWN_DIVERGENCES = new Set([]);
const NOW = 2_000_000_000_000;
const TOPIC = '4.1-2';
const EMAIL = 'parity@roster.local';
const CSV = 'u4_l1_l2_blooket.csv';

const DECK = Array.from({ length: 10 }, function (_, index) {
  return {
    qnum: index + 1,
    q: 'Synthetic question ' + (index + 1),
    choices: ['miss ' + (index + 1), 'answer ' + (index + 1)],
    correctIdx: 1
  };
});

// Eight correct answers, with the pass secured on the final card.
const QUICK_CHOICES = [1, 0, 1, 1, 0, 1, 1, 1, 1, 1];

// This resolves the same pre-shuffled ten-card queue on both surfaces.
const TIMED_OUTCOMES = [
  'wrong', 'correct', 'timeout', 'correct', 'correct',
  'wrong', 'correct', 'correct', 'correct', 'correct',
  'correct', 'wrong', 'correct', 'correct'
];

function fnSource(source, name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  if (!match) throw new Error('function not found: ' + name);
  const open = source.indexOf('{', match.index);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

function writerSource(source, name, surface) {
  try {
    return fnSource(source, name);
  } catch (error) {
    throw new Error(
      surface + ' per-card log writer ' + name + ' could not be extracted: ' + error.message
    );
  }
}

function loadEngine() {
  const win = {};
  const context = createContext({
    window: win,
    globalThis: win,
    self: win,
    Math,
    String,
    Number,
    Array,
    Object,
    parseInt,
    isFinite,
    JSON
  });
  runInContext(ENGINE, context);
  return win.Flashcards;
}

const FC = loadEngine();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stemHash(stem) {
  const normalized = String(stem == null ? '' : stem).trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (((hash << 5) + hash) + normalized.charCodeAt(index)) >>> 0;
  }
  return ('00000000' + hash.toString(16)).slice(-8);
}

function createMemoryStorage(initial) {
  const values = Object.assign({}, initial || {});
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
    removeItem(key) {
      delete values[key];
    }
  };
}

function deskEmail(storage, rosterClient) {
  const factory = new Function('deps', [
    'var localStorage = deps.localStorage;',
    'var window = deps.windowObject;',
    fnSource(DESK, 'getStudentEmail'),
    'return getStudentEmail();'
  ].join('\n'));
  return factory({ localStorage: storage, windowObject: { rosterClient } });
}

function mobileEmail(storage, rosterClient) {
  const factory = new Function('deps', [
    'var localStorage = deps.localStorage;',
    'var window = deps.windowObject;',
    'var rosterClient = deps.rosterClient;',
    fnSource(MOBILE, '_fcStudent'),
    fnSource(MOBILE, '_fcEmail'),
    'return _fcEmail();'
  ].join('\n'));
  return factory({
    localStorage: storage,
    rosterClient,
    windowObject: { rosterClient }
  });
}

function createTimers() {
  let nextId = 1;
  const jobs = [];
  const canceled = new Set();

  function setTimeoutFake(callback) {
    const id = nextId;
    nextId += 1;
    jobs.push({ id, callback });
    return id;
  }

  function clearTimeoutFake(id) {
    canceled.add(id);
  }

  async function drain() {
    while (jobs.length) {
      const job = jobs.shift();
      if (canceled.has(job.id)) continue;
      await job.callback();
      await settlePromises();
    }
  }

  return { setTimeoutFake, clearTimeoutFake, drain };
}

async function settlePromises() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function choiceMarkup(className, dataAttribute) {
  return DECK[0].choices.map(function (_, index) {
    const data = dataAttribute ? ' data-i="' + index + '"' : '';
    return '<button class="' + className + '"' + data + '>choice</button>';
  }).join('');
}

function deskDom() {
  return new JSDOM(
    '<button id="launcher"></button>' +
    '<div id="bf-question"></div>' +
    '<div id="bf-choices">' + choiceMarkup('bf-choice', false) + '</div>' +
    '<div id="bf-progress"></div>' +
    '<div id="bf-feedback"></div>' +
    '<button id="bf-next"></button>' +
    '<div id="bf-result"></div>',
    { url: 'https://desk.test/' }
  );
}

function mobileDom() {
  return new JSDOM(
    '<div id="fco" class="timed">' +
      '<div id="fc-body">' +
        '<div id="fc-choices">' + choiceMarkup('fc-choice', true) + '</div>' +
        '<div id="fc-feedback"></div>' +
        '<button id="fc-next"></button>' +
      '</div>' +
    '</div>',
    { url: 'https://mobile.test/' }
  );
}

function readLog(storage) {
  return JSON.parse(storage.getItem('a2_srs_log_' + EMAIL) || '[]');
}

function makeDeskHarness(mode) {
  const dom = deskDom();
  const timers = createTimers();
  const recorded = [];
  dom.window.localStorage.setItem('a2_desk_student_email', EMAIL);
  const bfState = {
    topic: TOPIC,
    btn: dom.window.document.getElementById('launcher'),
    deck: clone(DECK),
    idx: 0,
    score: 0,
    answered: false,
    finishId: null,
    finished: false,
    roundId: 'desk-' + NOW + '-0001',
    seq: 0,
    cardStart: NOW - 500
  };
  const ftState = {
    topic: TOPIC,
    btn: dom.window.document.getElementById('launcher'),
    round: null,
    answered: false,
    timerId: null,
    advanceId: null,
    remaining: 40,
    cardStartMs: NOW - 500,
    roundId: 'desk-' + NOW + '-0002'
  };
  const windowObject = {
    __WS_READ_ONLY__: false,
    rosterClient: null,
    gradebookClient: {
      recordFlashcardRun(lesson, mode, correct, total) {
        recorded.push({ lesson, mode, correct, total });
        return { ok: true };
      },
      record(payload) {
        recorded.push(clone(payload));
        return { ok: true };
      }
    }
  };
  const dependencies = {
    bfState,
    ftState,
    windowObject,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    Date: { now() { return NOW; } },
    setTimeout: timers.setTimeoutFake,
    clearTimeout: timers.clearTimeoutFake,
    noop() {},
    identity(value) { return value.slice(); },
    quickRender() {
      bfState.answered = false;
      bfState.cardStart = NOW - 500;
    },
    csvFor() { return CSV; },
    stemHash,
    viewAsContext() { return null; },
    blooketScoreFor() { return null; },
    getStudentMarks() { return {}; },
    recordProgress() { return Promise.resolve(true); }
  };

  const factory = new Function('deps', [
    'var _bfState = deps.bfState;',
    'var _ftState = deps.ftState;',
    'var window = deps.windowObject;',
    'var document = deps.document;',
    'var localStorage = deps.localStorage;',
    'var Date = deps.Date;',
    'var setTimeout = deps.setTimeout;',
    'var clearTimeout = deps.clearTimeout;',
    'var clearInterval = deps.clearTimeout;',
    'var BLOOKET_PASS_THRESHOLD = 0.80;',
    'var _lastResourcePanel = null;',
    'var _bfSaveProgress = deps.noop;',
    'var _bfClearProgress = deps.noop;',
    'var _bfCloseUI = deps.noop;',
    'var _bfRenderCard = deps.quickRender;',
    'var _bfShuffle = deps.identity;',
    'var _ftRenderCard = deps.noop;',
    'var _ftRenderRecap = deps.noop;',
    'var _ftKeydownHandler = deps.noop;',
    'var _srsCsvFor = deps.csvFor;',
    'var _srsStemHash = deps.stemHash;',
    'var _viewAsContext = deps.viewAsContext;',
    'var _blooketScoreFor = deps.blooketScoreFor;',
    'var getStudentMarks = deps.getStudentMarks;',
    'var recordProgress = deps.recordProgress;',
    fnSource(DESK, '_mayScore'),
    fnSource(DESK, 'getStudentEmail'),
    writerSource(DESK, '_srsAppendLog', 'Desk'),
    fnSource(DESK, '_bfAnswer'),
    fnSource(DESK, '_bfNext'),
    fnSource(DESK, '_bfFinish'),
    fnSource(DESK, '_ftCreateRound'),
    fnSource(DESK, '_ftCurrentIdx'),
    fnSource(DESK, '_ftRecordOutcome'),
    fnSource(DESK, '_ftScore'),
    fnSource(DESK, '_ftClearTimer'),
    fnSource(DESK, '_ftHandle'),
    fnSource(DESK, '_ftLogToStore'),
    fnSource(DESK, '_ftFinish'),
    fnSource(DESK, '_studentMarkSave'),
    fnSource(DESK, '_blooketCommit'),
    'return {',
    '  answer: _bfAnswer, next: _bfNext, finishQuick: _bfFinish,',
    '  createRound: _ftCreateRound, currentIdx: _ftCurrentIdx,',
    '  handleTimed: _ftHandle, finishTimed: _ftFinish',
    '};'
  ].join('\n'));
  const api = factory(dependencies);

  if (mode === 'full') ftState.round = api.createRound(clone(DECK));
  return { api, bfState, ftState, recorded, timers, dom };
}

function makeMobileHarness(mode) {
  const dom = mobileDom();
  const timers = createTimers();
  const recorded = [];
  dom.window.localStorage.setItem('a2_desk_student_email', EMAIL);
  const fcState = mode === 'quick'
    ? {
        mode: 'quick',
        lesson: { id: TOPIC },
        deck: clone(DECK),
        idx: 0,
        correct: 0,
        need: FC.quickPassCount(DECK.length),
        answered: false,
        timer: null,
        csv: CSV,
        roundId: 'mobile-' + NOW + '-0001',
        seq: 0,
        misses: [],
        cardStart: NOW - 500
      }
    : {
        mode: 'full',
        lesson: { id: TOPIC },
        round: FC.createRound(clone(DECK)),
        answered: false,
        timer: null,
        csv: CSV,
        roundId: 'mobile-' + NOW + '-0002',
        seq: 0,
        misses: [],
        cardStart: NOW - 500
      };
  const windowObject = {
    __WS_READ_ONLY__: false,
    FlashcardSrs: { stemHash },
    rosterClient: null,
    gradebookClient: {
      recordFlashcardRun(lesson, mode, correct, total) {
        recorded.push({ lesson, mode, correct, total });
        return { ok: true };
      },
      record(payload) {
        recorded.push(clone(payload));
        return { ok: true };
      }
    }
  };
  const dependencies = {
    FC,
    fcState,
    windowObject,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    Date: { now() { return NOW; } },
    setTimeout: timers.setTimeoutFake,
    noop() {},
    fcBody() { return dom.window.document.getElementById('fc-body'); },
    fcoEl() { return dom.window.document.getElementById('fco'); },
    render() {
      fcState.answered = false;
      fcState.cardStart = NOW - 500;
    },
    loadGrade() { return Promise.resolve(true); },
    floor() { return 0; }
  };

  const factory = new Function('deps', [
    'var FC = deps.FC;',
    'var _fc = deps.fcState;',
    'var window = deps.windowObject;',
    'var document = deps.document;',
    'var localStorage = deps.localStorage;',
    'var Date = deps.Date;',
    'var setTimeout = deps.setTimeout;',
    'var fcBody = deps.fcBody;',
    'var fcoEl = deps.fcoEl;',
    'var _fcTimerStop = deps.noop;',
    'var _fcSaveQuickProgress = deps.noop;',
    'var _fcClearQuickProgress = deps.noop;',
    'var _fcRender = deps.render;',
    'var _fcRenderResult = deps.noop;',
    'var loadGrade = deps.loadGrade;',
    'var _fcBlooketFloor = deps.floor;',
    'var _fcBumpLocalBlooket = deps.noop;',
    'var rosterClient = window.rosterClient;',
    fnSource(MOBILE, '_fcStudent'),
    fnSource(MOBILE, '_fcEmail'),
    fnSource(MOBILE, '_fcRememberMiss'),
    fnSource(MOBILE, '_fcStemHash'),
    writerSource(MOBILE, '_fcSrsAppend', 'Mobile'),
    fnSource(MOBILE, '_fcResolve'),
    fnSource(MOBILE, '_fcNext'),
    fnSource(MOBILE, '_fcCommit'),
    fnSource(MOBILE, '_fcFinish'),
    'return { resolve: _fcResolve, next: _fcNext, commit: _fcCommit, finish: _fcFinish };'
  ].join('\n'));
  const api = factory(dependencies);

  return { api, fcState, recorded, timers, dom };
}

async function runQuickPair() {
  const desk = makeDeskHarness('quick');
  const mobile = makeMobileHarness('quick');

  for (let index = 0; index < QUICK_CHOICES.length; index += 1) {
    const choice = QUICK_CHOICES[index];
    const outcome = choice === DECK[index].correctIdx ? 'correct' : 'wrong';
    desk.api.answer(choice);
    mobile.api.resolve(outcome, mobile.fcState.deck[index], choice);
    if (index === QUICK_CHOICES.length - 1) continue;
    desk.api.next();
    mobile.api.next();
  }

  await desk.api.finishQuick();
  mobile.api.finish();
  await desk.timers.drain();
  await mobile.timers.drain();
  await settlePromises();

  const result = {
    deskRecords: desk.recorded,
    mobileRecords: mobile.recorded,
    deskLog: readLog(desk.dom.window.localStorage),
    mobileLog: readLog(mobile.dom.window.localStorage)
  };
  desk.dom.window.close();
  mobile.dom.window.close();
  return result;
}

async function runTimedPair() {
  const desk = makeDeskHarness('full');
  const mobile = makeMobileHarness('full');

  for (let index = 0; index < TIMED_OUTCOMES.length; index += 1) {
    const outcome = TIMED_OUTCOMES[index];
    const deskIndex = desk.api.currentIdx(desk.ftState.round);
    const mobileIndex = FC.currentIdx(mobile.fcState.round);
    if (deskIndex !== mobileIndex) throw new Error('timed queues diverged before outcome ' + index);
    const deskCard = desk.ftState.round.deck[deskIndex];
    const mobileCard = mobile.fcState.round.deck[mobileIndex];
    const choice = outcome === 'correct' ? deskCard.correctIdx : outcome === 'timeout' ? -1 : 0;

    desk.ftState.cardStartMs = NOW - 500;
    mobile.fcState.cardStart = NOW - 500;
    desk.api.handleTimed(outcome, choice);
    mobile.api.resolve(outcome, mobileCard, choice);

    if (index === TIMED_OUTCOMES.length - 1) continue;
    desk.ftState.answered = false;
    mobile.api.next();
  }

  await desk.api.finishTimed();
  mobile.api.finish();
  await settlePromises();

  const result = {
    deskRecords: desk.recorded,
    mobileRecords: mobile.recorded,
    deskLog: readLog(desk.dom.window.localStorage),
    mobileLog: readLog(mobile.dom.window.localStorage)
  };
  desk.dom.window.close();
  mobile.dom.window.close();
  return result;
}

function payloadContract(payload) {
  return {
    source: payload.source,
    itemId: payload.itemId,
    unit: payload.unit,
    topic: payload.topic,
    selfAttest: payload.response && payload.response.selfAttest,
    attempt: payload.attempt
  };
}

const LOG_PARITY_FIELDS = [
  'topic', 'qnum', 'correct', 'wasTimeout', 'missIndex', 'mode', 'csv', 'seq',
  'nChoices', 'chosenIdx', 'stemHash'
];

function assertLogEntryContract(entry, surface, mode) {
  LOG_PARITY_FIELDS.forEach(function (field) {
    expect(
      Object.prototype.hasOwnProperty.call(entry, field),
      surface + ' ' + mode + ' log entry is missing ' + field
    ).toBe(true);
  });
  expect(entry.mode).toBe(mode);
  expect(entry.surface).toBe(surface);
  expect(typeof entry.latencyMs).toBe('number');
  expect(Number.isFinite(entry.latencyMs)).toBe(true);
  expect(typeof entry.ts).toBe('number');
  expect(Number.isFinite(entry.ts)).toBe(true);
  expect(entry.roundId).toMatch(/^(desk|mobile)-\d+-[a-z0-9]{4}$/);
  expect(entry.roundId.indexOf(surface + '-')).toBe(0);
  if (entry.wasTimeout) expect(entry.chosenIdx).toBe(-1);
}

function normalizedLogEntry(entry) {
  const normalized = {};
  LOG_PARITY_FIELDS.forEach(function (field) {
    normalized[field] = entry[field];
  });
  normalized.latencyMs = entry.latencyMs;
  normalized.ts = entry.ts;
  normalized.surface = '<surface>';
  normalized.roundId = entry.roundId.replace(/^(desk|mobile)-/, '<surface>-');
  return normalized;
}

function expectLogParity(deskEntries, mobileEntries, mode) {
  expect(deskEntries).not.toHaveLength(0);
  expect(mobileEntries).toHaveLength(deskEntries.length);
  deskEntries.forEach(function (entry) {
    assertLogEntryContract(entry, 'desk', mode);
  });
  mobileEntries.forEach(function (entry) {
    assertLogEntryContract(entry, 'mobile', mode);
  });
  expect(deskEntries.map(normalizedLogEntry)).toEqual(mobileEntries.map(normalizedLogEntry));
}

describe('Desk ⇄ mobile flashcard surface parity', function () {
  it('requires extractable per-card log writers on both surfaces', function () {
    expect(function () {
      writerSource(DESK, '_srsAppendLog', 'Desk');
    }).not.toThrow();
    expect(function () {
      writerSource(MOBILE, '_fcSrsAppend', 'Mobile');
    }).not.toThrow();
  });

  it('executes identical legacy-first and roster-fallback email derivation', function () {
    const rosterClient = {
      current() { return { username: 'kid' }; }
    };
    const seeded = { a2_desk_student_email: 'kid' };

    expect(deskEmail(createMemoryStorage(seeded), rosterClient)).toBe('kid');
    expect(mobileEmail(createMemoryStorage(seeded), rosterClient)).toBe('kid');
    expect(deskEmail(createMemoryStorage(), rosterClient)).toBe('kid@roster.local');
    expect(mobileEmail(createMemoryStorage(), rosterClient)).toBe('kid@roster.local');
  });

  it('commits the same quick-mode score for the same ten answers', async function () {
    const result = await runQuickPair();
    expect(result.deskRecords).toHaveLength(1);
    expect(result.mobileRecords).toHaveLength(1);
    expect(result.deskRecords[0]).toEqual({ lesson: TOPIC, mode: 'quick', correct: 8, total: 10 });
    expect(result.mobileRecords[0]).toEqual(result.deskRecords[0]);
  });

  it('keeps the retired timed engine log parity without a mobile completion write', async function () {
    const result = await runTimedPair();
    expect(result.deskRecords.find(record => record.score != null).score).toBe(86.7);
    expect(result.mobileRecords[0].mode).toBe('full');
    expect(result.mobileRecords[0]).not.toHaveProperty('itemId');
  });

  it('records the same daily payload shape on both surfaces', async function () {
    const result = await runQuickPair();
    expect(result.deskRecords).toEqual(result.mobileRecords);
    expect(Object.keys(result.deskRecords[0]).sort()).toEqual(['correct', 'lesson', 'mode', 'total']);
  });

  it('writes normalized quick-mode log entries with field-by-field parity', async function () {
    const result = await runQuickPair();
    expectLogParity(result.deskLog, result.mobileLog, 'quick');
  });

  it('writes normalized full-mode log entries with field-by-field parity', async function () {
    const result = await runTimedPair();
    expectLogParity(result.deskLog, result.mobileLog, 'full');
    expect(result.deskLog.filter(function (entry) { return entry.wasTimeout; })
      .map(function (entry) { return entry.chosenIdx; })).toEqual([-1]);
    expect(result.mobileLog.filter(function (entry) { return entry.wasTimeout; })
      .map(function (entry) { return entry.chosenIdx; })).toEqual([-1]);
  });

  it('timed-mode miss reveals nothing on either surface (T3.4 closed the mobile divergence)', function () {
    const desk = makeDeskHarness('full');
    const mobile = makeMobileHarness('full');
    const deskCard = desk.ftState.round.deck[desk.api.currentIdx(desk.ftState.round)];
    const mobileCard = mobile.fcState.round.deck[FC.currentIdx(mobile.fcState.round)];

    desk.api.handleTimed('wrong', 0);
    mobile.api.resolve('wrong', mobileCard, 0);

    const deskCorrect = desk.dom.window.document.querySelectorAll('#bf-choices button')[deskCard.correctIdx];
    const mobileCorrect = mobile.dom.window.document.querySelector(
      '#fc-choices .fc-choice[data-i="' + mobileCard.correctIdx + '"]'
    );
    expect(deskCorrect.classList.contains('bf-correct')).toBe(false);
    expect(mobileCorrect.classList.contains('right')).toBe(false);
    expect(mobile.dom.window.document.getElementById('fc-feedback').textContent).toMatch(/come back/);

    desk.dom.window.close();
    mobile.dom.window.close();
  });

  KNOWN_DIVERGENCES.forEach(function (divergence) {
    it('known divergence still exists: ' + divergence, function () {
      const desk = makeDeskHarness('full');
      const mobile = makeMobileHarness('full');
      const deskCard = desk.ftState.round.deck[desk.api.currentIdx(desk.ftState.round)];
      const mobileCard = mobile.fcState.round.deck[FC.currentIdx(mobile.fcState.round)];

      desk.api.handleTimed('wrong', 0);
      mobile.api.resolve('wrong', mobileCard, 0);

      const deskCorrect = desk.dom.window.document.querySelectorAll('#bf-choices button')[deskCard.correctIdx];
      const mobileCorrect = mobile.dom.window.document.querySelector(
        '#fc-choices .fc-choice[data-i="' + mobileCard.correctIdx + '"]'
      );
      expect(mobileCorrect.classList.contains('right')).toBe(true);
      expect(deskCorrect.classList.contains('bf-correct')).toBe(false);
      expect(deskCorrect.classList.contains('right')).toBe(false);

      desk.dom.window.close();
      mobile.dom.window.close();
    });
  });
});

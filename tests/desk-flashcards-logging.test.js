// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCedLabels } from './fixtures/ced2026-labels.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(src);
  if (!match) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', match.index); i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(match.index, i + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

function memoryStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function loadAppend(storage, viewAsContext, readOnly) {
  const factory = new Function(
    'localStorage',
    'window',
    'getStudentEmail',
    '_viewAsContext',
    fnBody(DESK, '_srsAppendLog') + '\nreturn _srsAppendLog;'
  );
  return factory(
    storage,
    { __WS_READ_ONLY__: !!readOnly },
    function () { return 'student@roster.local'; },
    function () { return viewAsContext; }
  );
}

describe('Desk flashcard per-card logging — static contract', () => {
  it('_srsAppendLog is gated, student-keyed, and capped at 2000', () => {
    const body = fnBody(DESK, '_srsAppendLog');
    expect(body).toMatch(/typeof\s+_viewAsContext\s*===\s*['"]function['"]/);
    expect(body).toMatch(/window\.__WS_READ_ONLY__/);
    expect(body).toMatch(/a2_srs_log_/);
    expect(body).toMatch(/saved\.length\s*>\s*2000/);
    expect(body).toMatch(/saved\.slice\(saved\.length\s*-\s*2000\)/);
  });

  it('quick answers append the complete quick-mode shape', () => {
    const body = fnBody(DESK, '_bfAnswer');
    expect(body).toMatch(/_srsAppendLog\s*\(\s*\[\s*\{/);
    expect(body).toMatch(/mode\s*:\s*['"]quick['"]/);
    expect(body).toMatch(/surface\s*:\s*['"]desk['"]/);
    expect(body).toMatch(/roundId\s*:\s*_bfState\.roundId/);
    expect(body).toMatch(/seq\s*:\s*_bfState\.seq\+\+/);
    expect(body).toMatch(/stemHash/);
  });

  it('timed logging adds the full-mode fields and routes through the shared writer', () => {
    const body = fnBody(DESK, '_ftLogToStore');
    expect(body).toMatch(/mode\s*:\s*['"]full['"]/);
    expect(body).toMatch(/csv\s*:\s*csv/);
    expect(body).toMatch(/surface\s*:\s*['"]desk['"]/);
    expect(body).toMatch(/roundId\s*:\s*roundId/);
    expect(body).toMatch(/seq\s*:\s*i/);
    expect(body).toMatch(/nChoices/);
    expect(body).toMatch(/chosenIdx/);
    expect(body).toMatch(/stemHash/);
    expect(body).toMatch(/_srsAppendLog\s*\(\s*entries\s*\)/);
  });

  it('timed outcomes patch choice evidence without changing _ftRecordOutcome', () => {
    const body = fnBody(DESK, '_ftHandle');
    expect(body).toMatch(/var\s+last\s*=\s*round\.log\[round\.log\.length\s*-\s*1\]/);
    expect(body).toMatch(/last\.nChoices\s*=\s*card\.choices\.length/);
    expect(body).toMatch(/last\.chosenIdx\s*=\s*\(outcome\s*===\s*['"]timeout['"]\)\s*\?\s*-1\s*:\s*choiceIdx/);
  });

  it('quick resume fields persist and teardown clears them', () => {
    const save = fnBody(DESK, '_bfSaveProgress');
    expect(save).toMatch(/roundId\s*:\s*_bfState\.roundId/);
    expect(save).toMatch(/seq\s*:\s*_bfState\.seq/);
    const close = fnBody(DESK, '_bfCloseUI');
    expect(close).toMatch(/_bfState\.roundId\s*=\s*null/);
    expect(close).toMatch(/_bfState\.seq\s*=\s*0/);
    expect(close).toMatch(/_bfState\.cardStart\s*=\s*0/);
  });

  it('desk resume mints and persists a desk round for cross-surface progress', async () => {
    const body = fnBody(DESK, '_bfStartQuick');
    expect(body).toMatch(/resumed\.roundId\.indexOf\(['"]desk-['"]\)\s*===\s*0/);
    expect(body).toMatch(/_bfState\.roundId\s*=\s*canReuseRoundId/);
    expect(body).toMatch(/if\s*\(!canReuseRoundId\)\s*_bfSaveProgress\(\)/);

    const resumed = {
      deck: [{ qnum: 1, q: 'Question', choices: ['Yes', 'No'], correctIdx: 0 }],
      idx: 0,
      score: 0,
      answered: false,
      roundId: 'mobile-1000-abcd',
      seq: 7,
      misses: []
    };
    const state = {};
    const persisted = [];
    const elements = {
      'bf-header': { textContent: '' },
      'bf-result': { style: { display: '' } },
      'bf-overlay': { style: { display: '' } }
    };
    const factory = new Function(
      '_bfState', '_bfLoadProgress', '_bfSaveProgress', '_srsRoundId',
      'document', '_bfShowQuizUI', '_bfRenderCard', '_bfKeydownHandler',
      'cedLabel',
      fnBody(DESK, '_bfStartQuick') + '\nreturn _bfStartQuick;'
    );
    const start = factory(
      state,
      function () { return resumed; },
      function () { persisted.push({ roundId: state.roundId, seq: state.seq }); },
      function () { return 'desk-2000-efgh'; },
      {
        getElementById(id) { return elements[id] || null; },
        addEventListener() {}
      },
      function () {},
      function () {},
      function () {},
      loadCedLabels().cedLabel
    );

    await start({}, '4.1');

    expect(state.roundId).toBe('desk-2000-efgh');
    expect(state.seq).toBe(0);
    expect(persisted).toEqual([{ roundId: 'desk-2000-efgh', seq: 0 }]);
  });
});

describe('Desk flashcard per-card logging — executed behavior', () => {
  it('appends entries and drops the oldest records above the cap', () => {
    const key = 'a2_srs_log_student@roster.local';
    const old = Array.from({ length: 1999 }, function (_, i) { return { old: i }; });
    const storage = memoryStorage({ [key]: JSON.stringify(old) });
    const append = loadAppend(storage, null, false);
    append([{ fresh: 1 }, { fresh: 2 }, { fresh: 3 }]);
    const saved = JSON.parse(storage.getItem(key));
    expect(saved).toHaveLength(2000);
    expect(saved[0]).toEqual({ old: 2 });
    expect(saved.slice(-3)).toEqual([{ fresh: 1 }, { fresh: 2 }, { fresh: 3 }]);
  });

  it('skips the write when view-as is active', () => {
    const key = 'a2_srs_log_student@roster.local';
    const storage = memoryStorage({ [key]: JSON.stringify([{ kept: true }]) });
    const append = loadAppend(storage, { studentId: 'viewed-student' }, false);
    append([{ shouldNotWrite: true }]);
    expect(JSON.parse(storage.getItem(key))).toEqual([{ kept: true }]);
  });

  it('_bfAnswer writes every required quick-mode field', () => {
    const captured = [];
    const state = {
      topic: '4.1',
      deck: [{ qnum: 7, q: '  Sampling   variability ', choices: ['No', 'Yes'], correctIdx: 1 }],
      idx: 0,
      score: 0,
      answered: false,
      finishId: null,
      roundId: 'desk-1000-abcd',
      seq: 0,
      cardStart: 1000
    };
    const choices = [0, 1].map(function (i) {
      // data-i = real choice index (P2-D7 permutation renders by data-i, not position)
      return { disabled: false, classList: { add() {} }, getAttribute(name) { return name === 'data-i' ? String(i) : null; } };
    });
    const elements = {
      'bf-choices': { querySelectorAll() { return choices; } },
      'bf-feedback': { textContent: '' },
      'bf-next': { style: { display: 'none' } }
    };
    const factory = new Function(
      '_bfState', '_bfSaveProgress', '_srsAppendLog', '_srsCsvFor', '_srsStemHash',
      'document', 'BLOOKET_PASS_THRESHOLD', 'Date', 'setTimeout', '_bfFinish',
      fnBody(DESK, '_bfAnswer') + '\nreturn _bfAnswer;'
    );
    const answer = factory(
      state,
      function () {},
      function (entries) { captured.push(entries[0]); },
      function () { return 'u4_l1_l2_blooket.csv'; },
      function () { return 'feedbeef'; },
      { getElementById(id) { return elements[id] || null; } },
      0.80,
      { now() { return 1600; } },
      function () { return 1; },
      function () {}
    );

    answer(1);

    expect(captured).toEqual([{
      topic: '4.1',
      qnum: 7,
      correct: true,
      latencyMs: 600,
      wasTimeout: false,
      missIndex: 0,
      ts: 1600,
      mode: 'quick',
      csv: 'u4_l1_l2_blooket.csv',
      surface: 'desk',
      roundId: 'desk-1000-abcd',
      seq: 0,
      nChoices: 2,
      chosenIdx: 1,
      stemHash: 'feedbeef',
      displayedPerm: [0, 1]   // identity when permutation is off / no perm on state (P2-D7, additive §3 field)
    }]);
    expect(state.seq).toBe(1);
  });
});

/**
 * tests/ai-worksheet-grade.test.js
 *
 * Acceptance tests for AI_WORKSHEET_GRADING_BUILD.md — the AI worksheet-grading
 * client flow injected by scripts/wire-ai-worksheet-grade.mjs.
 *
 * Three layers:
 *   1. Behavioral — RUNS the real shipped INJECTED_JS in jsdom with mocked
 *      worksheet globals, then drives window.aiGradeWorksheet and asserts the
 *      load-bearing guarantees (upgrade-only, never-downgrade, dedup, single-
 *      flight, soft-fail, batched-call, FRQ fold).
 *   2. Static-parse — pins the invariants directly in the shipped string.
 *   3. wireHtml properties — idempotency, EOL-preservation, placement, targeting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SENTINEL = 'AI_WORKSHEET_GRADING_WIRED';
const INJECTED_JS = readFileSync(resolve(import.meta.dirname, '../lib/worksheet-ai-grade.js'), 'utf8');

// ---------------------------------------------------------------------------
// Harness: install the REAL shipped flow with mocked worksheet globals.
// ---------------------------------------------------------------------------
let mocks;

function installShippedFlow(overrides = {}) {
  // Reset the runtime idempotency guard + any prior install.
  delete window.__aiWorksheetGradeWired;
  delete window.aiGradeWorksheet;
  delete window._aiGradeBusy;
  delete window._aiLastGradedHash;

  const gradingState = new Map();
  mocks = {
    gradingState,
    checkAnswer: vi.fn((blank) => blank.dataset.verdict || 'incorrect'),
    gradeReflection: vi.fn(async () => ({ score: 'E', feedback: 'good', matched: [], missing: [] })),
    fetchEnrichedAnswer: vi.fn(async () => ({ score: 'E', suggestion: 'polished answer' })),
    renderEnrichedPass: vi.fn(),
    showFeedback: vi.fn(),
    recordReflectionToGradebook: vi.fn(),
    recordReflectionDraft: vi.fn(),
    updateWorksheetCompletion: vi.fn(),
    gbUnitFromItemId: vi.fn((id) => { const m = /^WS-(U\d+)/.exec(id || ''); return m ? m[1] : undefined; }),
    gbWsPrefix: vi.fn(() => 'WS-' + (globalThis.UNIT_ID || 'U6L1-2')),
    _wsReflectionTextareas: vi.fn(() => Array.from(document.querySelectorAll('textarea[id]'))),
    checkAnswersOrig: vi.fn(),
    // The worksheet's ORIGINAL verbatim blank feeder (what handleLiveUpdate calls
    // on blur) — mirrors recordBlankToGradebook: records the verbatim score.
    recordBlankToGradebook: vi.fn(function (blank) {
      const v = (blank.value || '').trim();
      if (!v) return;
      const verdict = mocks.checkAnswer(blank);
      const sc = { correct: 1, partial: 0.5, incorrect: 0 }[verdict];
      mocks.record({ source: 'worksheet', itemId: blank.dataset.questionId, response: v, score: sc, attempt: 1 });
    }),
    record: vi.fn(async () => ({ ok: true, ledgerId: 'x' })),
    requestFrqGrade: vi.fn(async () => ({ ok: true, ledgerId: 'frq-x', status: 'queued', clientScoreIgnored: true, responseVersion: 1 })),
    fetchPrior: vi.fn(async () => new Map()),
    fetch: vi.fn(),
    // class-view drawer deps
    loadAggregateData: vi.fn(),
    spawnPeerSnow: vi.fn(),
    rosterToken: null,                              // null = not signed in
    rosterUsername: 'test_student',
    submitAppeal: vi.fn(),
    submitAppealForQuestion: vi.fn(),
    ...overrides
  };

  // Worksheet globals the IIFE reads as BARE identifiers (function declarations
  // are global in a classic worksheet script).
  globalThis.UNIT_ID = overrides.UNIT_ID || 'U6L1-2';
  globalThis.checkAnswer = mocks.checkAnswer;
  globalThis.gradeReflection = mocks.gradeReflection;
  globalThis.fetchEnrichedAnswer = mocks.fetchEnrichedAnswer;
  globalThis.renderEnrichedPass = mocks.renderEnrichedPass;
  globalThis.showFeedback = mocks.showFeedback;
  globalThis.recordReflectionToGradebook = mocks.recordReflectionToGradebook;
  globalThis.recordReflectionDraft = mocks.recordReflectionDraft;
  globalThis.updateWorksheetCompletion = mocks.updateWorksheetCompletion;
  globalThis.gbUnitFromItemId = mocks.gbUnitFromItemId;
  globalThis.gbWsPrefix = mocks.gbWsPrefix;
  globalThis._wsReflectionTextareas = mocks._wsReflectionTextareas;
  globalThis.recordBlankToGradebook = mocks.recordBlankToGradebook;
  globalThis.gradingState = gradingState;
  globalThis.submitAppeal = mocks.submitAppeal;
  globalThis.submitAppealForQuestion = mocks.submitAppealForQuestion;

  // class-view drawer globals
  globalThis.loadAggregateData = mocks.loadAggregateData;
  globalThis.currentQuestionBlanks = [];
  globalThis.spawnPeerSnow = mocks.spawnPeerSnow;
  globalThis.normalize = (s) => String(s == null ? '' : s).toLowerCase().trim().replace(/[^\w\s./-]/g, '');

  // window.* the IIFE reads/writes.
  window.checkAnswers = mocks.checkAnswersOrig;
  window.gradebookClient = { record: mocks.record, requestFrqGrade: mocks.requestFrqGrade, fetchPrior: mocks.fetchPrior };
  window.rosterClient = {
    token: () => mocks.rosterToken,
    studentId: () => mocks.rosterToken ? 'student-id' : null,
    current: () => mocks.rosterToken ? { username: mocks.rosterUsername } : null
  };
  window.ROSTER_SERVICE_URL = 'https://roster.example';
  window.RAILWAY_SERVER_URL = 'https://ai.example';
  window.__AI_FRQ_TEST_SEAMS__ = true;
  globalThis.fetch = mocks.fetch;

  // Run the REAL shipped code (indirect eval → resolves bare names off globalThis).
  // eslint-disable-next-line no-eval
  (0, eval)(INJECTED_JS);
}

function okFetch(blanks) {
  return { ok: true, json: async () => ({ blanks }) };
}

function addBlank(id, { answer = 'evidence', value = '', verdict = 'incorrect', question = 'Some prose here.' } = {}) {
  const q = document.createElement('div');
  q.className = 'question';
  q.appendChild(document.createTextNode(question + ' '));
  const input = document.createElement('input');
  input.className = 'blank';
  input.dataset.questionId = id;
  input.dataset.answer = answer;
  input.dataset.verdict = verdict;
  input.value = value;
  if (verdict === 'correct') input.classList.add('correct');
  q.appendChild(input);
  document.body.appendChild(q);
  return input;
}

function makeDrawerContent() {
  const dc = document.createElement('div');
  dc.id = 'drawerContent';
  document.body.appendChild(dc);
  return dc;
}
function classFetch(responses) {
  return { ok: true, json: async () => ({ ok: true, itemId: 'x', section: 'B', total: responses.length, responses }) };
}

function addTextarea(id, value) {
  const ta = document.createElement('textarea');
  ta.id = id;
  ta.value = value || '';
  document.body.appendChild(ta);
  return ta;
}

function renderExistingAppealUi(questionId) {
  let container = document.getElementById(questionId + '-feedback');
  if (!container) {
    container = document.createElement('div');
    container.id = questionId + '-feedback';
    document.body.appendChild(container);
  }
  container.innerHTML =
    '<div class="ai-feedback"><div class="appeal-section">' +
    '<button class="appeal-btn">Disagree? Appeal</button>' +
    '<div class="appeal-form" id="appeal-form-' + questionId + '">' +
    '<p>Explain why your answer deserves a higher score:</p>' +
    '<textarea id="appeal-text-' + questionId + '">old draft</textarea>' +
    '<button class="btn-check">Submit Appeal</button><button class="btn-show">Cancel</button>' +
    '</div><div class="appeal-count">Appeals used: 0/3</div></div></div>';
  return document.getElementById('appeal-form-' + questionId);
}

beforeEach(() => {
  document.body.innerHTML = '';
  expect(window === globalThis).toBe(true); // jsdom env sanity
});

afterEach(() => {
  try { window.__aiFrqTicketClient && window.__aiFrqTicketClient.teardown(); } catch (_) {}
  vi.restoreAllMocks();
  // Defensive: clear the worksheet globals we injected so nothing leaks to
  // another test file (vitest isolates files, but keep this hermetic anyway).
  for (const k of ['UNIT_ID', 'checkAnswer', 'gradeReflection', 'fetchEnrichedAnswer',
    'renderEnrichedPass', 'showFeedback', 'recordReflectionToGradebook', 'recordReflectionDraft', 'recordBlankToGradebook',
    'updateWorksheetCompletion', 'gbUnitFromItemId', 'gbWsPrefix', '_wsReflectionTextareas',
    'gradingState', 'fetch', 'loadAggregateData', 'currentQuestionBlanks', 'spawnPeerSnow', 'normalize',
    'submitAppeal', 'submitAppealForQuestion']) {
    try { delete globalThis[k]; } catch (_) {}
  }
  for (const k of ['aiGradeWorksheet', 'checkAnswers', 'gradebookClient', 'rosterClient',
    'ROSTER_SERVICE_URL', 'RAILWAY_SERVER_URL', '_aiGradeBusy', '_aiLastGradedHash', '__aiWorksheetGradeWired',
    '__aiFrqTicketClient', '__AI_FRQ_TEST_SEAMS__', 'submitAppeal', 'submitAppealForQuestion']) {
    try { delete window[k]; } catch (_) {}
  }
});

// ===========================================================================
// 1. BEHAVIORAL — runs the real shipped flow
// ===========================================================================
describe('aiGradeWorksheet — batched collection', () => {
  it('sends ONE call for all filled blanks (empty skipped) with DOM question + accepted answers', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', answer: 'evidence', question: 'How do we identify ___ for a claim?' });
    addBlank('WS-U6L1-2-Q2', { value: 'convincing', answer: 'convincing|persuasive' });
    addBlank('WS-U6L1-2-Q3', { value: '' }); // empty → not sent
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mocks.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/ai\/grade-worksheet$/);
    const body = JSON.parse(opts.body);
    expect(body.blanks).toHaveLength(2);
    const q1 = body.blanks.find((b) => b.id === 'WS-U6L1-2-Q1');
    expect(q1.studentAnswer).toBe('proof');
    expect(q1.question).toMatch(/identify/);
    expect(q1.acceptedAnswers).toEqual(['evidence']);
    const q2 = body.blanks.find((b) => b.id === 'WS-U6L1-2-Q2');
    expect(q2.acceptedAnswers).toEqual(['convincing', 'persuasive']);
    // scenario carries unit/lesson for framework grounding
    expect(body.scenario.unit).toBe(6);
    expect(body.scenario.lessons).toEqual([1, 2]);
  });
});

describe('aiGradeWorksheet — upgrade-only blank credit (never downgrades)', () => {
  it('credit:true on a below-full blank → green + ledger write at score 1 (source worksheet)', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'proof', answer: 'evidence', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: true, reason: 'same idea' }]));

    await window.aiGradeWorksheet({ manual: false });

    expect(b.classList.contains('correct')).toBe(true);
    expect(b.classList.contains('incorrect')).toBe(false);
    const recCalls = mocks.record.mock.calls.map((c) => c[0]);
    const credit = recCalls.find((r) => r.itemId === 'WS-U6L1-2-Q1');
    expect(credit).toMatchObject({ source: 'worksheet', itemId: 'WS-U6L1-2-Q1', score: 1, response: 'proof' });
    expect(credit.unit).toBe('U6'); // no new ledger source / migration
  });

  it('credit:false → NO upgrade (verbatim grade stands, no score-1 write)', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'banana', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: false, reason: 'different concept' }]));

    await window.aiGradeWorksheet({ manual: false });

    expect(b.classList.contains('correct')).toBe(false);
    const wroteFull = mocks.record.mock.calls.some((c) => c[0].itemId === 'WS-U6L1-2-Q1' && c[0].score === 1);
    expect(wroteFull).toBe(false);
  });

  it('strict: a non-boolean "credit" (string "true" / number 1) is IGNORED', async () => {
    const b1 = addBlank('WS-U6L1-2-Q1', { value: 'x', verdict: 'incorrect' });
    const b2 = addBlank('WS-U6L1-2-Q2', { value: 'y', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([
      { id: 'WS-U6L1-2-Q1', credit: 'true', reason: 'stringy' },
      { id: 'WS-U6L1-2-Q2', credit: 1, reason: 'numbery' }
    ]));

    await window.aiGradeWorksheet({ manual: false });

    expect(b1.classList.contains('correct')).toBe(false);
    expect(b2.classList.contains('correct')).toBe(false);
    expect(mocks.record.mock.calls.some((c) => c[0].score === 1)).toBe(false);
  });

  it('a verbatim-correct blank is sent for context but never re-acted on (no double write)', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'evidence', answer: 'evidence', verdict: 'correct' });
    addBlank('WS-U6L1-2-Q2', { value: 'wrongish', verdict: 'incorrect' }); // keeps actMap non-empty
    installShippedFlow();
    // Even if the AI hallucinates credit:true for the already-correct blank, it
    // is not in actMap (currentScore === 1) → no AI ledger write for it.
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: true, reason: 'already right' }]));

    await window.aiGradeWorksheet({ manual: false });

    const wroteQ1 = mocks.record.mock.calls.some((c) => c[0].itemId === 'WS-U6L1-2-Q1' && c[0].score === 1);
    expect(wroteQ1).toBe(false);
    // and the verbatim-correct blank WAS sent for context
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.blanks.map((b) => b.id)).toContain('WS-U6L1-2-Q1');
  });

  it('GUARD 1: a re-blur on an UNCHANGED AI-credited blank records full credit, not verbatim', () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    b.dataset.aiCredit = '1';
    b.dataset.aiCreditValue = 'proof';
    // handleLiveUpdate would call the (now-wrapped) recordBlankToGradebook on blur:
    window.recordBlankToGradebook(b);
    expect(mocks.recordBlankToGradebook).not.toHaveBeenCalled();      // verbatim path skipped
    const full = mocks.record.mock.calls.map((c) => c[0]).find((a) => a.itemId === 'WS-U6L1-2-Q1');
    expect(full.score).toBe(1);                                       // full credit preserved
  });

  it('GUARD 1: a blur on an EDITED ai-credit blank records verbatim (credit dropped)', () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'changed', verdict: 'incorrect' });
    installShippedFlow();
    b.dataset.aiCredit = '1';
    b.dataset.aiCreditValue = 'proof';                               // value changed since credit
    window.recordBlankToGradebook(b);
    expect(mocks.recordBlankToGradebook).toHaveBeenCalledTimes(1);   // delegated to verbatim original
  });
});

describe('aiGradeWorksheet — anti-spam (dedup + single-flight + soft-fail)', () => {
  it('hash dedup: identical content does not call the API twice', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));

    await window.aiGradeWorksheet({ manual: false });
    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('single-flight: a pass while busy is a no-op', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    window._aiGradeBusy = true;
    mocks.fetch.mockResolvedValue(okFetch([]));

    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('soft-fail: AI down (fetch rejects) does not throw and writes no upgrade', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockRejectedValue(new Error('network down'));

    await expect(window.aiGradeWorksheet({ manual: false })).resolves.toBeUndefined();
    expect(b.classList.contains('correct')).toBe(false);
    expect(mocks.record.mock.calls.some((c) => c[0].score === 1)).toBe(false);
  });

  it('soft-fail: non-OK response (503) writes no upgrade', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'off' }) });

    await window.aiGradeWorksheet({ manual: false });
    expect(b.classList.contains('correct')).toBe(false);
  });
});

describe('aiGradeWorksheet — FRQ fold (upgrade-only, deduped)', () => {
  it('grades an ungraded reflection and records it', async () => {
    addTextarea('reflect1', 'This is a sufficiently long reflection answer about evidence.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'nice' });

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.gradeReflection).toHaveBeenCalledWith('reflect1', expect.stringMatching(/reflection answer/));
    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
  });

  it('never downgrades: a prior E is kept when the AI now returns P', async () => {
    const ta = addTextarea('reflect1', 'A long enough previously-E reflection answer here.');
    installShippedFlow();
    mocks.gradingState.set('reflect1', { result: { score: 'E' }, originalAnswer: 'different older text that was graded E', appealCount: 0, history: [] });
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.gradeReflection.mockResolvedValue({ score: 'P', feedback: 'meh' });

    await window.aiGradeWorksheet({ manual: false });

    // It re-graded (content changed vs stored originalAnswer) but P <= E → not recorded.
    const recordedP = mocks.recordReflectionToGradebook.mock.calls.some((c) => c[2] === 'P');
    expect(recordedP).toBe(false);
  });

  it('LEDGER FLOOR: a persisted E is kept when the student edits and the AI now returns P', async () => {
    // The edit cleared gradingState (no in-session prev), but the ledger holds E.
    addTextarea('reflect1', 'An edited but still long enough reflection answer about evidence.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map([
      ['WS-U6L1-2-reflect1', { response: 'older graded-E text', score: 1, source: 'frq' }]
    ]));
    mocks.gradeReflection.mockResolvedValue({ score: 'P', feedback: 'now weaker' });

    await window.aiGradeWorksheet({ manual: false });

    const wroteLower = mocks.recordReflectionToGradebook.mock.calls.some((c) => c[2] === 'P');
    expect(wroteLower).toBe(false);
  });

  it('LEDGER FLOOR: a genuine upgrade above the persisted grade IS recorded', async () => {
    addTextarea('reflect1', 'A much improved and sufficiently long reflection answer here now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map([
      ['WS-U6L1-2-reflect1', { response: 'older P text', score: 0.5, source: 'frq' }]
    ]));
    mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'great now' });

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
  });

  it('dedup: an unchanged already-graded reflection is not re-graded on the next pass', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    const ta = addTextarea('reflect1', 'A long enough reflection answer about evidence and proof.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'nice' });

    await window.aiGradeWorksheet({ manual: false });   // grades reflect1 once
    expect(mocks.gradeReflection).toHaveBeenCalledTimes(1);

    // Change a BLANK so the top-level hash check passes, but leave the FRQ as-is.
    document.querySelector('.blank').value = 'proof-edited';
    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.gradeReflection).toHaveBeenCalledTimes(1); // FRQ deduped
  });
});

describe('GUARD 2 — every FRQ record path is upgrade-only (covers the legacy button + appeal)', () => {
  it('records the first E, then SKIPS a later P for the same item (no downgrade)', () => {
    addTextarea('reflect1', 'some answer');
    installShippedFlow();
    window.recordReflectionToGradebook('reflect1', 'a1', 'E');   // first → records
    window.recordReflectionToGradebook('reflect1', 'a2', 'P');   // P <= E → blocked
    window.recordReflectionToGradebook('reflect1', 'a3', 'I');   // I <= E → blocked
    const reached = mocks.recordReflectionToGradebook.mock.calls.map((c) => c[2]);
    expect(reached).toEqual(['E']);
  });

  it('allows a genuine upgrade chain I -> P -> E', () => {
    addTextarea('reflect1', 'some answer');
    installShippedFlow();
    window.recordReflectionToGradebook('reflect1', 'a', 'I');
    window.recordReflectionToGradebook('reflect1', 'a', 'P');
    window.recordReflectionToGradebook('reflect1', 'a', 'E');
    expect(mocks.recordReflectionToGradebook.mock.calls.map((c) => c[2])).toEqual(['I', 'P', 'E']);
  });
});

describe('FRQ coverage — a first-ever I IS persisted on the AUTO path (2026-08-19; was #10 suppression)', () => {
  it('auto (Done) path persists a first-ever I for an ungraded FRQ (floored, so it can only be raised later)', async () => {
    addTextarea('reflect1', 'A sufficiently long but weak reflection answer goes here now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'I', feedback: 'weak' });

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'I');
    expect(mocks.showFeedback).toHaveBeenCalled();
  });

  it('a later pass that returns P raises the persisted I (floor is monotone)', async () => {
    addTextarea('reflect1', 'A sufficiently long but weak reflection answer goes here now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValueOnce({ score: 'I', feedback: 'weak' });
    await window.aiGradeWorksheet({ manual: false });
    document.getElementById('reflect1').value = 'A sufficiently long and now much better reflection answer goes here.';
    mocks.gradeReflection.mockResolvedValueOnce({ score: 'P', feedback: 'better', missing: ['x'] });
    await window.aiGradeWorksheet({ manual: false });
    expect(mocks.recordReflectionToGradebook.mock.calls.map((c) => c[2])).toEqual(['I', 'P']);
  });

  it('MANUAL re-check DOES persist a first-ever I (the student asked)', async () => {
    addTextarea('reflect1', 'A sufficiently long but weak reflection answer goes here now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'I', feedback: 'weak' });

    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'I');
  });
});

describe('anti-spam — blanks endpoint skipped when nothing is upgradeable (#8)', () => {
  it('all blanks already full verbatim credit + a changed FRQ → no blanks call, FRQ still graded', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'evidence', answer: 'evidence', verdict: 'correct' });
    addTextarea('reflect1', 'A sufficiently long reflection answer to trigger the FRQ pass now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'E' });

    await window.aiGradeWorksheet({ manual: false });

    const blanksCalls = mocks.fetch.mock.calls.filter((c) => /grade-worksheet/.test(c[0]));
    expect(blanksCalls).toHaveLength(0);   // actMap empty → no API call
    expect(mocks.gradeReflection).toHaveBeenCalled();
  });
});

describe('merged button — polish fold + win feedback', () => {
  it('manual polish: a close-P written answer is rewritten to full-credit E', async () => {
    addTextarea('reflect1', 'A decent but incomplete reflection answer about evidence here.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'P', matched: ['a', 'b'], missing: ['c'] });
    mocks.fetchEnrichedAnswer.mockResolvedValue({ score: 'E', suggestion: 'polished with <strong>c</strong>' });

    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.fetchEnrichedAnswer).toHaveBeenCalledWith('reflect1', expect.any(String), ['c']);
    expect(mocks.renderEnrichedPass).toHaveBeenCalled();
    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
  });

  it('AUTO (Done) path does NOT run the polish (keeps Check Answers cheap)', async () => {
    addTextarea('reflect1', 'A decent but incomplete reflection answer about evidence here.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'P', matched: ['a', 'b'], missing: ['c'] });

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.fetchEnrichedAnswer).not.toHaveBeenCalled();
    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'P');
  });

  it('updates the visible Score to count AI-accepted blanks + toasts the win', async () => {
    const sd = document.createElement('div'); sd.id = 'scoreDisplay'; document.body.appendChild(sd);
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    addBlank('WS-U6L1-2-Q2', { value: 'evidence', answer: 'evidence', verdict: 'correct' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: true, reason: 'syn' }]));
    mocks.fetchPrior.mockResolvedValue(new Map());

    await window.aiGradeWorksheet({ manual: true });

    expect(sd.textContent).toMatch(/This worksheet's blanks: 100%/);  // counts the AI-accepted blank
    expect(sd.textContent).toMatch(/2 correct of 2/);
    expect(document.body.textContent).toMatch(/AI accepted 1 more answer/);
    expect(document.body.textContent).toMatch(/Score 50% → 100%/);
  });

  it('toasts "no new credit" when nothing was upgraded', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'wrong', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: false, reason: 'no' }]));
    mocks.fetchPrior.mockResolvedValue(new Map());

    await window.aiGradeWorksheet({ manual: true });
    expect(document.body.textContent).toMatch(/no new credit/);
  });
});

describe('class view drawer — named dotplot / frequency table', () => {
  it('signed in: dotplot with labels, counts, and the key highlighted (≤10 distinct)', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'x', answer: '0.728|.728' });
    const dc = makeDrawerContent();
    installShippedFlow({ rosterToken: 'tok' });
    globalThis.currentQuestionBlanks = [b];
    mocks.fetch.mockResolvedValue(classFetch([
      { answer: '0.728', label: 'Ana S.' },
      { answer: '0.728', label: 'Ben J.' },
      { answer: '0.73', label: 'Cara' },
    ]));

    await window.loadAggregateData();

    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/class\/blank\/WS-U6L1-2-Q1$/), expect.any(Object));
    const html = dc.innerHTML;
    expect(html).toContain('dotplot');
    expect(html).toContain('●●');            // two dots for the "0.728" column
    expect(html).toContain('Ana S.');
    expect(html).toContain('Ben J.');
    expect(html).toMatch(/0\.728 ✓/);        // the key answer is highlighted correct
    expect(html).not.toMatch(/0\.73 ✓/);     // a wrong value is not
  });

  it('switches to a frequency table when there are >10 distinct answers', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'x', answer: 'whatever' });
    const dc = makeDrawerContent();
    installShippedFlow({ rosterToken: 'tok' });
    globalThis.currentQuestionBlanks = [b];
    const many = [];
    for (let i = 0; i < 12; i++) many.push({ answer: 'ans' + i, label: 'S' + i });
    mocks.fetch.mockResolvedValue(classFetch(many));

    await window.loadAggregateData();

    expect(dc.innerHTML).toContain('freq-table');
    expect(dc.innerHTML).not.toContain('class="dotplot"');
  });

  it('not signed in: falls back to the original anonymous drawer', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'x', answer: '0.728' });
    makeDrawerContent();
    installShippedFlow({ rosterToken: null });
    globalThis.currentQuestionBlanks = [b];

    await window.loadAggregateData();

    expect(mocks.loadAggregateData).toHaveBeenCalled();   // original anonymous renderer
    expect(mocks.fetch).not.toHaveBeenCalled();           // no roster call when signed out
  });

  it('signed in but nobody answered: shows the empty class message', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'x', answer: '0.728' });
    const dc = makeDrawerContent();
    installShippedFlow({ rosterToken: 'tok' });
    globalThis.currentQuestionBlanks = [b];
    mocks.fetch.mockResolvedValue(classFetch([]));

    await window.loadAggregateData();

    expect(dc.innerHTML).toMatch(/No one in your class has answered/);
  });
});

describe('auto-on-Done — checkAnswers is wrapped', () => {
  it('calling the (wrapped) checkAnswers runs the original AND kicks the AI pass', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));

    expect(window.checkAnswers).not.toBe(mocks.checkAnswersOrig); // wrapped
    window.checkAnswers();
    await Promise.resolve(); await Promise.resolve();

    expect(mocks.checkAnswersOrig).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 2. STATIC-PARSE — pin the invariants in the shipped string
// ===========================================================================
describe('INJECTED_JS invariants (load-bearing)', () => {
  it('carries the sentinel', () => {
    expect(INJECTED_JS).toContain(SENTINEL);
  });
  it('single-flight guard', () => {
    expect(INJECTED_JS).toMatch(/window\._aiGradeBusy/);
  });
  it('hash dedup', () => {
    expect(INJECTED_JS).toMatch(/_aiLastGradedHash/);
    expect(INJECTED_JS).toMatch(/function _aiHash/);
  });
  it('ONE batched call (single endpoint, not per-blank)', () => {
    const hits = (INJECTED_JS.match(/grade-worksheet/g) || []).length;
    expect(hits).toBeGreaterThanOrEqual(1);
    // the endpoint is fetched inside a single forEach-free POST (blanks array sent whole)
    expect(INJECTED_JS).toMatch(/blanks:\s*send/);
  });
  it('blank credit is strict (only boolean true) + upgrade-only (records score 1)', () => {
    expect(INJECTED_JS).toMatch(/g\.credit !== true/);
    expect(INJECTED_JS).toMatch(/score:\s*1/);
    expect(INJECTED_JS).toMatch(/cur < 1/);            // only acts below full credit
  });
  it('FRQ fold is upgrade-only via an E>P>I rank', () => {
    expect(INJECTED_JS).toMatch(/_AI_FRQ_RANK\s*=\s*\{\s*I:\s*0,\s*P:\s*1,\s*E:\s*2\s*\}/);
    expect(INJECTED_JS).toMatch(/newRank <= floor/);
  });
  it('FRQ floor includes the PERSISTED ledger grade (no downgrade across edits)', () => {
    expect(INJECTED_JS).toMatch(/_aiFetchPriorScores/);
    expect(INJECTED_JS).toMatch(/function _aiLedgerRank/);
    expect(INJECTED_JS).toMatch(/_aiSeedFrqFloor/);
    expect(INJECTED_JS).toMatch(/floor = Math\.max\(floor, _aiFrqFloor\[itemId\]\)/);
  });
  it('soft-fail: fetch wrapped in try/catch + resp.ok guard', () => {
    expect(INJECTED_JS).toMatch(/if \(resp\.ok\)/);
    expect(INJECTED_JS).toMatch(/catch \(_\) \{ \/\* soft-fail/);
  });
  it('ledger write keeps source worksheet (no new source / migration)', () => {
    expect(INJECTED_JS).toMatch(/source:\s*'worksheet'/);
  });
  it('reveals (Show Answers) are excluded', () => {
    expect(INJECTED_JS).toMatch(/contains\('revealed'\)/);
  });
  it('GUARD 1: wraps recordBlankToGradebook to honor unchanged AI credit', () => {
    expect(INJECTED_JS).toMatch(/window\.recordBlankToGradebook = function/);
    expect(INJECTED_JS).toMatch(/dataset\.aiCredit === '1'/);
  });
  it('GUARD 2: wraps recordReflectionToGradebook upgrade-only (covers legacy button + appeal)', () => {
    expect(INJECTED_JS).toMatch(/window\.recordReflectionToGradebook = function/);
    expect(INJECTED_JS).toMatch(/if \(nr <= floor\) return;/);
    expect(INJECTED_JS).toMatch(/_aiFrqFloor/);
  });
  it('restores AI-credit flags from the ledger on load (post-reload protection)', () => {
    expect(INJECTED_JS).toMatch(/_aiRestoreBlankCredits/);
    expect(INJECTED_JS).toMatch(/_aiSeedFrqFloor/);
  });
  it('blanks endpoint only fires when something is upgradeable (#8)', () => {
    expect(INJECTED_JS).toMatch(/Object\.keys\(actMap\)\.length/);
  });
  it('auto path PERSISTS a fresh I (2026-08-19 FRQ coverage; the #10 suppression is gone)', () => {
    expect(INJECTED_JS).not.toMatch(/!manual && floor < 0 && newRank === 0/);
    expect(INJECTED_JS).toMatch(/FIRST-EVER "I" IS persisted/);
  });
  it('folds the "polish" pass into the one button (manual only)', () => {
    expect(INJECTED_JS).toMatch(/fetchEnrichedAnswer/);
    expect(INJECTED_JS).toMatch(/renderEnrichedPass/);
    expect(INJECTED_JS).toMatch(/manual && result\.score === 'P'/);
  });
  it('updates the local Score to include AI-accepted blanks', () => {
    expect(INJECTED_JS).toMatch(/function _aiUpdateScoreDisplay/);
    expect(INJECTED_JS).toMatch(/getElementById\('scoreDisplay'\)/);
  });
  it('win toast reports the accepted count + score delta', () => {
    expect(INJECTED_JS).toMatch(/accepted ' \+ aiAccepted/);
    expect(INJECTED_JS).toMatch(/Score ' \+ pre/);
  });
  it('class view: named dotplot/table from roster /class/blank, with anon fallback', () => {
    expect(INJECTED_JS).toMatch(/\/class\/blank\//);
    expect(INJECTED_JS).toMatch(/function _aiRenderClassNamed/);
    expect(INJECTED_JS).toMatch(/distinct <= 10/);          // dotplot vs table cutoff
    expect(INJECTED_JS).toMatch(/freq-table/);
    expect(INJECTED_JS).toMatch(/window\.loadAggregateData = async function/);
    expect(INJECTED_JS).toMatch(/Authorization': 'Bearer '/);  // signed-in only
  });
});

void 0;

// ===========================================================================
// 3. wireHtml properties
// ===========================================================================
const SAMPLE = [
  '<html>', '<body>',
  '  <div class="controls">',
  '    <button class="btn-check" onclick="checkAnswers()">&#10003; Check Answers</button>',
  '    <button class="btn-ai" onclick="gradeAllReflections()">&#129302; Grade My Reflections</button>',
  '  </div>',
  '  <script>const UNIT_ID="U6L1-2"; function gradeReflection(){}</script>',
  '</body>', '</html>'
].join('\n');

void 0;

void 0;

void 0;

describe('FRQ coverage — retry, triggers, on-load regrade (2026-08-19)', () => {
  it('retries a failing gradeReflection (2 retries) and records the eventual verdict', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', 'A sufficiently long reflection answer that the grader flakes on at first.');
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map());
      localStorage.setItem('a2_desk_student_email', 'kid');
      mocks.gradeReflection
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ score: 'P', feedback: 'ok', missing: ['x'] });
      const run = window.aiGradeWorksheet({ manual: false });
      await vi.advanceTimersByTimeAsync(5000);
      await run;
      expect(mocks.gradeReflection).toHaveBeenCalledTimes(2);   // one bounded retry
      expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'P');
      expect(localStorage.getItem('a2_frq_ungraded_kid_WS-U6L1-2')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('remembers an FRQ that failed all retries and regrades it on the next load', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', 'A sufficiently long reflection answer whose grading is down for now.');
      localStorage.setItem('a2_desk_student_email', 'kid');
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map());
      mocks.gradeReflection.mockRejectedValue(new Error('down'));
      const run = window.aiGradeWorksheet({ manual: false });
      await vi.advanceTimersByTimeAsync(5000);
      await run;
      expect(JSON.parse(localStorage.getItem('a2_frq_ungraded_kid_WS-U6L1-2'))).toEqual(['reflect1']);
      expect(mocks.recordReflectionToGradebook).not.toHaveBeenCalled();

      // "Next load": reinstall the flow; the on-load hook sees the pending list and grades.
      mocks.gradeReflection.mockReset();
      mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'good', matched: ['a'], missing: [] });
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map());
      await vi.advanceTimersByTimeAsync(600);    // _aiOnLoad delay
      await vi.advanceTimersByTimeAsync(1500);   // scheduled auto grade
      await vi.advanceTimersByTimeAsync(10);
      expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
      expect(localStorage.getItem('a2_frq_ungraded_kid_WS-U6L1-2')).toBeNull();
    } finally { vi.useRealTimers(); localStorage.removeItem('a2_desk_student_email'); }
  });

  it('on load, a prior FRQ row with text but no score is graded automatically', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', 'A restored reflection answer that was saved as a draft and never graded.');
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map([
        ['WS-U6L1-2-reflect1', { response: 'A restored reflection answer that was saved as a draft and never graded.', score: null }],
      ]));
      mocks.gradeReflection.mockResolvedValue({ score: 'P', feedback: 'ok', missing: ['x'] });
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(1500);
      await vi.advanceTimersByTimeAsync(10);
      expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'P');
    } finally { vi.useRealTimers(); }
  });

  it('typing then leaving the textarea (blur) triggers an auto grade without any button', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', '');
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map());
      mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'good', matched: ['a'], missing: [] });
      await vi.advanceTimersByTimeAsync(600);   // on-load wiring
      const ta = document.getElementById('reflect1');
      ta.value = 'A sufficiently long reflection answer typed by the student right now.';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(800);
      await vi.advanceTimersByTimeAsync(10);
      expect(mocks.gradeReflection).toHaveBeenCalledTimes(1);
      expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
    } finally { vi.useRealTimers(); }
  });

  it('20 s of idle after typing triggers an auto grade', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', '');
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map());
      mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'good', matched: ['a'], missing: [] });
      await vi.advanceTimersByTimeAsync(600);
      const ta = document.getElementById('reflect1');
      ta.value = 'A sufficiently long reflection answer typed by the student right now.';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(19000);
      expect(mocks.gradeReflection).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1100);
      await vi.advanceTimersByTimeAsync(10);
      expect(mocks.gradeReflection).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('FRQ coverage — review hardening (stale verdicts, malformed verdicts, budget, inline grader)', () => {
  it('a verdict that arrives after the student kept typing is neither shown nor recorded; a trailing pass grades the new text', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', 'A sufficiently long first version of the reflection answer here.');
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map());
      let resolveFirst;
      mocks.gradeReflection.mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }));
      const run = window.aiGradeWorksheet({ manual: false });
      await vi.advanceTimersByTimeAsync(10);
      // Student keeps typing while the grader is slow.
      document.getElementById('reflect1').value = 'A sufficiently long SECOND version of the reflection answer here, longer.';
      resolveFirst({ score: 'I', feedback: 'weak (for the old text)' });
      await run;
      expect(mocks.recordReflectionToGradebook).not.toHaveBeenCalled();
      expect(mocks.showFeedback).not.toHaveBeenCalled();
      // Trailing pass (1.5 s) grades the current text.
      mocks.gradeReflection.mockResolvedValueOnce({ score: 'E', feedback: 'good', matched: ['a'], missing: [] });
      await vi.advanceTimersByTimeAsync(1600);
      await vi.advanceTimersByTimeAsync(10);
      expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.stringContaining('SECOND'), 'E');
    } finally { vi.useRealTimers(); }
  });

  it('a malformed truthy verdict ("maybe") is not a success: retried once, then remembered as ungraded', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', 'A sufficiently long reflection answer with a flaky grader today.');
      localStorage.setItem('a2_desk_student_email', 'kid');
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map());
      mocks.gradeReflection.mockResolvedValue({ score: 'maybe', feedback: '?' });
      const run = window.aiGradeWorksheet({ manual: false });
      await vi.advanceTimersByTimeAsync(5000);
      await run;
      expect(mocks.gradeReflection).toHaveBeenCalledTimes(2);
      expect(mocks.recordReflectionToGradebook).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem('a2_frq_ungraded_kid_WS-U6L1-2'))).toEqual(['reflect1']);
    } finally { vi.useRealTimers(); localStorage.removeItem('a2_desk_student_email'); }
  });

  it('auto passes are budgeted (6 per 10 min); manual passes are not', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', '');
      installShippedFlow();
      mocks.fetch.mockResolvedValue(okFetch([]));
      mocks.fetchPrior.mockResolvedValue(new Map());
      mocks.gradeReflection.mockImplementation(async (id, text) => ({ score: 'P', feedback: 'ok', missing: ['x'] }));
      await vi.advanceTimersByTimeAsync(600);
      const ta = document.getElementById('reflect1');
      for (let i = 1; i <= 8; i += 1) {
        ta.value = 'A sufficiently long reflection answer, distinct revision number ' + i + ' of many.';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('blur'));
        await vi.advanceTimersByTimeAsync(900);
        await vi.advanceTimersByTimeAsync(10);
      }
      expect(mocks.gradeReflection.mock.calls.length).toBeLessThanOrEqual(6);
      const before = mocks.gradeReflection.mock.calls.length;
      ta.value = 'A sufficiently long reflection answer, the manual final revision of many.';
      await window.aiGradeWorksheet({ manual: true });
      expect(mocks.gradeReflection.mock.calls.length).toBe(before + 1);
    } finally { vi.useRealTimers(); }
  });

  it('a worksheet without a global gradeReflection but with a ReflectionGrader instance is graded through the adapter', async () => {
    addTextarea('reflect1', 'A sufficiently long reflection answer on the inline-grader worksheet.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    // Simulate u3_lesson6-7: no global gradeReflection; a window.reflectionGrader instance instead.
    const inline = { gradeReflection: vi.fn(async () => ({ score: 'E', feedback: 'good', matched: ['a'], missing: [] })) };
    const savedGlobal = globalThis.gradeReflection;
    delete globalThis.gradeReflection;
    window.reflectionGrader = inline;
    try {
      await window.aiGradeWorksheet({ manual: false });
      expect(inline.gradeReflection).toHaveBeenCalledTimes(1);
      expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
    } finally {
      delete window.reflectionGrader;
      if (savedGlobal) globalThis.gradeReflection = savedGlobal;
    }
  });
});

describe('FRQ batch grading (2026-08-19) — one /api/ai/grade-batch call when the page exposes its prompt builder', () => {
  function withBatchPage(fn) {
    // Simulate a page: a builder + lesson context on window, a gradeReflection whose source carries the topic.
    window.buildReflectionPromptU6L12 = (id, ans) => 'PROMPT[' + id + ']:' + ans;
    window.LESSON_CONTEXT_U6L12 = 'ctx';
    const savedGlobal = globalThis.gradeReflection;
    return Promise.resolve().then(fn).finally(() => {
      delete window.buildReflectionPromptU6L12; delete window.LESSON_CONTEXT_U6L12;
      if (savedGlobal) globalThis.gradeReflection = savedGlobal;
    });
  }
  it('grades 3 reflections with ONE batch request; per-item grader is not called', async () => {
    await withBatchPage(async () => {
      addTextarea('reflect1', 'A sufficiently long first reflection answer typed by the student.');
      addTextarea('reflect2', 'A sufficiently long second reflection answer typed by the student.');
      addTextarea('exitTicket', 'A sufficiently long exit ticket answer typed by the student today.');
      installShippedFlow();
      // gradeReflection source must carry the topic literal the block looks for.
      globalThis.gradeReflection = mocks.gradeReflection;
      mocks.gradeReflection.toString = () => "async function gradeReflection(q,a){ fetch(x,{body:JSON.stringify({scenario:{topic: 'Algebra 2 - Topic 6.1: test'}})}) }";
      window.RAILWAY_SERVER_URL = 'https://cr.test';
      mocks.fetch.mockImplementation(async (url, init) => {
        if (String(url).endsWith('/api/ai/grade-batch')) {
          const body = JSON.parse(init.body);
          expect(body.items.map((i) => i.questionId)).toEqual(['reflect1', 'reflect2', 'exitTicket']);
          expect(body.items[0].prompt).toMatch(/^PROMPT\[reflect1\]:/);
          expect(body.scenario.topic).toBe('Algebra 2 - Topic 6.1: test');
          const results = {};
          for (const it of body.items) results[it.questionId] = { score: it.questionId === 'reflect2' ? 'P' : 'E', feedback: 'ok', matched: ['a'], missing: it.questionId === 'reflect2' ? ['x'] : [] };
          return { ok: true, status: 200, json: async () => ({ results }) };
        }
        return okFetch([]);
      });
      mocks.fetchPrior.mockResolvedValue(new Map());
      await window.aiGradeWorksheet({ manual: false });
      expect(mocks.gradeReflection).not.toHaveBeenCalled();
      const recorded = mocks.recordReflectionToGradebook.mock.calls.map((c) => [c[0], c[2]]);
      expect(recorded).toEqual(expect.arrayContaining([['reflect1', 'E'], ['reflect2', 'P'], ['exitTicket', 'E']]));
      expect(recorded).toHaveLength(3);
    });
  });
  it('an item the batch omitted falls back to the per-item grader', async () => {
    await withBatchPage(async () => {
      addTextarea('reflect1', 'A sufficiently long first reflection answer typed by the student.');
      addTextarea('reflect2', 'A sufficiently long second reflection answer typed by the student.');
      installShippedFlow();
      globalThis.gradeReflection = mocks.gradeReflection;
      mocks.gradeReflection.toString = () => "topic: 'T'";
      window.RAILWAY_SERVER_URL = 'https://cr.test';
      mocks.fetch.mockImplementation(async (url) => {
        if (String(url).endsWith('/api/ai/grade-batch')) return { ok: true, status: 200, json: async () => ({ results: { reflect1: { score: 'E', feedback: 'ok', matched: [], missing: [] } } }) };
        return okFetch([]);
      });
      mocks.gradeReflection.mockResolvedValue({ score: 'P', feedback: 'ok', missing: ['x'] });
      mocks.fetchPrior.mockResolvedValue(new Map());
      await window.aiGradeWorksheet({ manual: false });
      expect(mocks.gradeReflection).toHaveBeenCalledTimes(1);
      expect(mocks.gradeReflection.mock.calls[0][0]).toBe('reflect2');
      expect(mocks.recordReflectionToGradebook.mock.calls.map((c) => [c[0], c[2]])).toEqual(expect.arrayContaining([['reflect1', 'E'], ['reflect2', 'P']]));
    });
  });
  it('without a discoverable builder (no topic), the per-item path runs as before', async () => {
    addTextarea('reflect1', 'A sufficiently long first reflection answer typed by the student.');
    addTextarea('reflect2', 'A sufficiently long second reflection answer typed by the student.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'ok', matched: ['a'], missing: [] });
    await window.aiGradeWorksheet({ manual: false });
    expect(mocks.gradeReflection).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls.some((c) => String(c[0]).endsWith('/api/ai/grade-batch'))).toBe(false);
  });
});

// ===========================================================================
// 4. FRQ grade tickets — authoritative/legacy client contract
// ===========================================================================
describe('FRQ ticket capability gating', () => {
  it.each([
    ['off', false, false],
    ['shadow', false, false],
    ['unknown', false, false],
    ['authoritative non-canary', false, false],
    ['authoritative canary', true, true]
  ])('%s selects the expected FRQ path', async (label, authoritative, expectsTicket) => {
    addTextarea('reflect1', 'A sufficiently long response for the capability gate.');
    installShippedFlow({ rosterToken: 'roster-token' });
    const mode = label.startsWith('authoritative') ? 'authoritative' : label;
    mocks.fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode, bundleVersion: 'v1', pollMs: 2000, authoritative }) };
      }
      if (String(url).includes('/ledger/frq-status')) {
        return { ok: true, json: async () => ({ ok: true, mode, bundleVersion: 'v1', items: {} }) };
      }
      return okFetch([]);
    });

    await window.__aiFrqTicketClient.fetchConfig(true);
    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.requestFrqGrade.mock.calls.length > 0).toBe(expectsTicket);
    expect(mocks.gradeReflection.mock.calls.length > 0).toBe(!expectsTicket);
    if (expectsTicket) {
      const gradeUrls = mocks.fetch.mock.calls.map((call) => String(call[0]))
        .filter((url) => /\/api\/ai\/grade(?:-|$)/.test(url));
      expect(gradeUrls).toEqual([]);
    }
  });

  it('latches a stale gradebook-client.js into the complete legacy FRQ flow', async () => {
    addTextarea('reflect1', 'A sufficiently long response for the stale-client fallback.');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installShippedFlow({ rosterToken: 'roster-token' });
    delete window.gradebookClient.requestFrqGrade;
    mocks.fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', authoritative: true, pollMs: 2000 }) };
      }
      return okFetch([]);
    });

    await window.__aiFrqTicketClient.fetchConfig(true);
    expect(window.__aiFrqTicketClient.isAuthoritative()).toBe(false);
    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.requestFrqGrade).not.toHaveBeenCalled();
    expect(mocks.gradeReflection).toHaveBeenCalledWith(
      'reflect1', 'A sufficiently long response for the stale-client fallback.'
    );
    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith(
      'reflect1', 'A sufficiently long response for the stale-client fallback.', 'E'
    );
    expect(document.body.textContent).not.toContain('⚠ Not saved — check your connection');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('stale gradebook-client.js');
  });

  it('adds the roster bearer to all three retained legacy grader endpoints', async () => {
    installShippedFlow({ rosterToken: 'signed-roster-token' });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    for (const endpoint of ['grade', 'grade-batch', 'grade-worksheet']) {
      await globalThis.fetch('https://ai.example/api/ai/' + endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
    }

    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    for (const call of mocks.fetch.mock.calls) {
      expect(call[1].headers.Authorization).toBe('Bearer signed-roster-token');
      expect(call[1].headers['Content-Type']).toBe('application/json');
    }
  });
});

describe('authoritative FRQ ticket requests and numeric-sink suppression', () => {
  it('flushes latest text on blur and manual Grade without calling a direct FRQ grader', async () => {
    const ta = addTextarea('reflect1', 'A sufficiently long first response for blur.');
    installShippedFlow({ rosterToken: 'roster-token' });
    mocks.fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', bundleVersion: 'v1', pollMs: 2000, authoritative: true }) };
      }
      if (String(url).includes('/ledger/frq-status')) {
        return { ok: true, json: async () => ({ ok: true, mode: 'authoritative', items: {} }) };
      }
      return okFetch([]);
    });
    await window.__aiFrqTicketClient.fetchConfig(true);
    window.__aiFrqTicketClient.wireTriggers();

    ta.dispatchEvent(new Event('blur'));
    await Promise.resolve();
    await Promise.resolve();
    ta.value = 'A sufficiently long newer response for the manual action.';
    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.requestFrqGrade).toHaveBeenCalledWith({
      itemId: 'WS-U6L1-2-reflect1',
      response: 'A sufficiently long first response for blur.'
    });
    expect(mocks.requestFrqGrade).toHaveBeenCalledWith({
      itemId: 'WS-U6L1-2-reflect1',
      response: 'A sufficiently long newer response for the manual action.'
    });
    expect(mocks.gradeReflection).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls.some((call) => /\/api\/ai\/grade(?:-|$)/.test(String(call[0])))).toBe(false);
  });

  it('the wrapped reflection sink requests a ticket and never forwards a numeric model result', async () => {
    addTextarea('reflect1', 'The latest authoritative response in the textarea.');
    installShippedFlow({ rosterToken: 'roster-token' });
    mocks.fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', bundleVersion: 'v1', pollMs: 2000, authoritative: true }) };
      }
      return { ok: true, json: async () => ({ ok: true, mode: 'authoritative', items: {} }) };
    });
    await window.__aiFrqTicketClient.fetchConfig(true);

    await window.recordReflectionToGradebook('reflect1', 'old model text', 'E');

    expect(mocks.recordReflectionToGradebook).not.toHaveBeenCalled();
    expect(mocks.requestFrqGrade).toHaveBeenCalledWith({
      itemId: 'WS-U6L1-2-reflect1',
      response: 'The latest authoritative response in the textarea.'
    });
  });
});

describe('authoritative FRQ contractual state copy and stale guard', () => {
  it('renders every non-verdict copy-table state exactly', async () => {
    addTextarea('reflect1', 'Current reflection text.');
    installShippedFlow();
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-reflect1';
    const statusText = () => document.getElementById('reflect1-ai-status').textContent;

    hook.renderConnection('reflect1');
    expect(statusText()).toBe('Saved on this device · waiting for a connection to queue grading.');
    await hook.renderStatus(itemId, { status: 'draft' });
    expect(statusText()).toBe('Answer saved · grading starts after you pause or leave the box.');
    await hook.renderStatus(itemId, { status: 'queued', estimatedWaitMs: 9000 });
    expect(statusText()).toBe('✓ Saved · queued for grading · ~9 s');
    await hook.renderStatus(itemId, { status: 'grading', estimatedWaitMs: 6000 });
    expect(statusText()).toBe('⏳ Grading… ~6 s');
    const retryAt = '2030-01-02T03:04:05.000Z';
    await hook.renderStatus(itemId, { status: 'retrying', retryAt });
    const retryTime = new Date(retryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    expect(statusText()).toBe('⚠ Saved. The grader is unavailable; retrying automatically around ' + retryTime + '.');
    await hook.renderStatus(itemId, { status: 'failed' });
    expect(statusText()).toBe('⚠ Saved, but grading needs teacher help.');

    await hook.renderStatus(itemId, {
      status: 'graded', score: 1, responseHash: 'stale-hash', gradedAt: '2030-01-02T03:04:05.000Z',
      appealCount: null,
      result: { score: 1, feedback: 'Feedback for old text.' }
    });
    expect(statusText()).toBe('This response is already graded — appeal to have your revised answer reviewed.');
    expect(mocks.showFeedback).not.toHaveBeenCalled();

    await hook.renderStatus(itemId, {
      status: 'graded', score: 1, responseHash: 'original-hash', gradedAt: '2030-01-02T03:04:06.000Z',
      appealCount: 1, appealLimit: 3,
      result: { score: 1, feedback: 'Feedback for the revised text.', revisedTextUsed: true }
    });
    expect(statusText()).toBe('✓ Revised answer reviewed: Essentially Correct');
    expect(mocks.showFeedback).toHaveBeenCalledWith('reflect1', expect.objectContaining({
      revisedTextUsed: true,
      feedback: 'Feedback for the revised text.'
    }));
  });

  it('renders only a hash-matched server result and announces graded-while-away once', async () => {
    addTextarea('reflect1', 'Current reflection text.');
    installShippedFlow({ rosterToken: 'roster-token', rosterUsername: 'away_student' });
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-reflect1';
    const gradedAt = '2000-01-02T03:04:05.000Z';
    const hash = await hook.hash('Current reflection text.');
    const item = {
      status: 'graded', score: 0.5, responseHash: hash, gradedAt,
      result: { score: 0.5, feedback: 'Stored feedback.', matched: ['context'], missing: ['link'] }
    };
    const marker = 'a2_frq_last_seen_graded_away_student_' + itemId;
    localStorage.removeItem(marker);

    await hook.renderStatus(itemId, item);
    const live = document.getElementById('reflect1-ai-status');
    expect(live.textContent).toBe('✓ Graded while you were away: Partially Correct');
    expect(live.getAttribute('aria-live')).toBe('off');
    expect(live.querySelector('.ai-status-copy').getAttribute('aria-live')).toBe('assertive');
    expect(mocks.showFeedback).toHaveBeenCalledWith('reflect1', {
      score: 'P', feedback: 'Stored feedback.', matched: ['context'], missing: ['link']
    });
    expect(localStorage.getItem(marker)).toBe(gradedAt);

    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(live, { childList: true, characterData: true, subtree: true });
    await hook.renderStatus(itemId, item);
    await Promise.resolve();
    observer.disconnect();
    expect(mutations).toBe(0);
    localStorage.removeItem(marker);
  });

  it.each([
    ['graded', 'reflect1', 1, new Date(Date.now() + 60_000).toISOString(), '✓ Graded: Essentially Correct'],
    ['graded-away', 'reflect2', 0, '2000-01-02T03:04:05.000Z', '✓ Graded while you were away: Incorrect'],
  ])('renders a %s score label when legacy feedback is missing', async (_, taId, score, gradedAt, expected) => {
    addTextarea(taId, 'Legacy response text.');
    installShippedFlow({ rosterToken: 'roster-token', rosterUsername: 'legacy_result_student_' + taId });
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-' + taId;
    const hash = await hook.hash('Legacy response text.');

    await hook.renderStatus(itemId, { status: 'graded', score, responseHash: hash, gradedAt });

    const status = document.getElementById(taId + '-ai-status');
    expect(status.textContent).toBe(expected);
    expect(mocks.showFeedback).not.toHaveBeenCalled();
  });
});

describe('authoritative FRQ poll lifecycle', () => {
  it('does not mutate identical pending copy across two polls and announces a new grade once', async () => {
    addTextarea('reflect1', 'Current reflection text.');
    installShippedFlow({ rosterToken: 'roster-token' });
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-reflect1';
    const hash = await hook.hash('Current reflection text.');
    let polls = 0;
    let graded = false;
    mocks.fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', authoritative: true, pollMs: 2000 }) };
      }
      polls += 1;
      const item = graded
        ? { status: 'graded', score: 1, responseHash: hash, gradedAt: '2030-01-02T03:04:05.000Z', result: { score: 1, feedback: 'Done.' } }
        : { status: 'queued', estimatedWaitMs: 9000 };
      return { ok: true, json: async () => ({ ok: true, mode: 'authoritative', items: { [itemId]: item } }) };
    });
    await hook.fetchConfig(true);
    hook.setState(itemId, { status: 'queued', estimatedWaitMs: 9000 });
    await hook.renderStatus(itemId, { status: 'queued', estimatedWaitMs: 9000 });
    const status = document.getElementById('reflect1-ai-status');
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(status, { attributes: true, childList: true, characterData: true, subtree: true });

    await hook.pollOnce();
    await hook.pollOnce();
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(mutations).toBe(0);
    graded = true;
    await hook.pollOnce();
    observer.disconnect();
    // The graded render rebuilds the feedback DOM, so re-query the status node
    // rather than holding the pre-grade reference.
    const gradedNode = document.getElementById('reflect1-ai-status');
    expect(gradedNode.dataset.frqState).toBe('graded');
    const gradedCopy = gradedNode.querySelector('.ai-status-copy');
    expect(gradedCopy.getAttribute('aria-live')).toBe('assertive');
    expect(gradedCopy.textContent).toContain('Graded');
    // Announce-once: an identical graded status re-render must not touch the node.
    let postGradeMutations = 0;
    const postObserver = new MutationObserver((records) => { postGradeMutations += records.length; });
    postObserver.observe(gradedNode, { attributes: true, childList: true, characterData: true, subtree: true });
    await hook.renderStatus(itemId, {
      status: 'graded', score: 1, responseHash: hash, gradedAt: '2030-01-02T03:04:05.000Z', result: { score: 1, feedback: 'Done.' }
    });
    await Promise.resolve();
    expect(postGradeMutations).toBe(0);
    postObserver.disconnect();
  });

  // 20 s budget: advancing fake time through the 2-minute poll cap drives ~60
  // poll iterations of async mock work — comfortably under 5 s alone, but not
  // when the whole 87-test file shares the process.
  it('starts only for visible pending work, stops on terminal/hidden/2-minute cap, and resumes on visibility/online', { timeout: 20000 }, async () => {
    vi.useFakeTimers();
    const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    try {
      addTextarea('reflect1', 'Current reflection text.');
      installShippedFlow({ rosterToken: 'roster-token' });
      let status = 'queued';
      mocks.fetch.mockImplementation(async (url) => {
        if (String(url).endsWith('/ledger/frq-config')) {
          return { ok: true, json: async () => ({ mode: 'authoritative', bundleVersion: 'v1', pollMs: 2000, authoritative: true }) };
        }
        return { ok: true, json: async () => ({
          ok: true, mode: 'authoritative', items: { 'WS-U6L1-2-reflect1': { status } }
        }) };
      });
      const hook = window.__aiFrqTicketClient;
      await hook.fetchConfig(true);
      hook.wireTriggers();
      hook.setState('WS-U6L1-2-reflect1', { status: 'queued' });
      hook.startPolling(true);
      expect(hook.isPolling()).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(hook.isPolling()).toBe(true);

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(hook.isPolling()).toBe(false);
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(hook.isPolling()).toBe(true);

      status = 'failed';
      await vi.advanceTimersByTimeAsync(2001);
      expect(hook.isPolling()).toBe(false);

      status = 'queued';
      hook.setState('WS-U6L1-2-reflect1', { status: 'queued' });
      window.dispatchEvent(new Event('online'));
      expect(hook.isPolling()).toBe(true);
      await vi.advanceTimersByTimeAsync(120001);
      expect(hook.isPolling()).toBe(false);
    } finally {
      window.__aiFrqTicketClient && window.__aiFrqTicketClient.stopPolling();
      if (visibility) Object.defineProperty(document, 'visibilityState', visibility);
      vi.useRealTimers();
    }
  });
});

describe('authoritative FRQ durability boundaries', () => {
  it('times out a single-flight config fetch and promptly falls back to legacy', async () => {
    vi.useFakeTimers();
    try {
      addTextarea('reflect1', 'A sufficiently long legacy response.');
      installShippedFlow({ rosterToken: 'roster-token' });
      mocks.fetch.mockImplementation(() => new Promise(() => {}));
      const hook = window.__aiFrqTicketClient;
      const first = hook.fetchConfig(true);
      const second = hook.fetchConfig(true);
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(4001);
      await expect(first).resolves.toMatchObject({ mode: 'off', authoritative: false });
      await expect(second).resolves.toMatchObject({ mode: 'off', authoritative: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshes expired authority before blur and pagehide flushes', async () => {
    vi.useFakeTimers();
    const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    try {
      const ta = addTextarea('reflect1', 'A sufficiently long response for rollback.');
      installShippedFlow({ rosterToken: 'roster-token' });
      let mode = 'authoritative';
      mocks.fetch.mockImplementation(async (url) => {
        if (String(url).endsWith('/ledger/frq-config')) {
          return { ok: true, json: async () => ({ mode, authoritative: mode === 'authoritative', pollMs: 2000 }) };
        }
        return okFetch([]);
      });
      const hook = window.__aiFrqTicketClient;
      await hook.fetchConfig(true);
      hook.wireTriggers();
      await vi.advanceTimersByTimeAsync(60001);
      mode = 'off';
      ta.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(1);
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(1);

      expect(hook.isAuthoritative()).toBe(false);
      expect(mocks.requestFrqGrade).not.toHaveBeenCalled();
    } finally {
      if (visibility) Object.defineProperty(document, 'visibilityState', visibility);
      vi.useRealTimers();
    }
  });

  it('downgrades to legacy within one status poll when the response mode is off', async () => {
    addTextarea('reflect1', 'A sufficiently long response for status rollback.');
    installShippedFlow({ rosterToken: 'roster-token' });
    mocks.fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', authoritative: true, pollMs: 2000 }) };
      }
      return { ok: true, json: async () => ({ ok: true, mode: 'off', items: {} }) };
    });
    const hook = window.__aiFrqTicketClient;
    await hook.fetchConfig(true);
    await hook.refreshStatus();
    expect(hook.isAuthoritative()).toBe(false);
  });

  it('reconciles prior text before a terminal status that wins the hydration race', async () => {
    const ta = addTextarea('reflect1', '');
    let resolvePrior;
    const priorPromise = new Promise((resolve) => { resolvePrior = resolve; });
    installShippedFlow({ rosterToken: 'roster-token', rosterUsername: 'hydrate_late', fetchPrior: vi.fn(() => priorPromise) });
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-reflect1';
    const restored = 'Restored response that was graded while away.';
    const hash = await hook.hash(restored);
    const render = hook.renderStatus(itemId, {
      status: 'graded', score: 0.5, responseHash: hash, gradedAt: '2000-01-02T03:04:05.000Z',
      result: { score: 0.5, feedback: 'Restored feedback.' }
    });
    expect(mocks.showFeedback).not.toHaveBeenCalled();
    resolvePrior(new Map([[itemId, { response: restored, score: 0.5, source: 'frq' }]]));
    await render;
    expect(ta.value).toBe(restored);
    expect(mocks.showFeedback).toHaveBeenCalledWith('reflect1', expect.objectContaining({ feedback: 'Restored feedback.' }));
  });

  it('renders the same terminal result when hydration finishes first', async () => {
    const restored = 'Restored response before the status poll.';
    const ta = addTextarea('reflect1', restored);
    ta.dataset.restored = '1';
    installShippedFlow({ rosterToken: 'roster-token' });
    const hook = window.__aiFrqTicketClient;
    const hash = await hook.hash(restored);
    await hook.renderStatus('WS-U6L1-2-reflect1', {
      status: 'graded', score: 1, responseHash: hash, gradedAt: '2030-01-02T03:04:05.000Z',
      result: { score: 1, feedback: 'Hydrated first.' }
    });
    expect(mocks.showFeedback).toHaveBeenCalledWith('reflect1', expect.objectContaining({ feedback: 'Hydrated first.' }));
  });

  it.each([
    ['server acknowledgement', { ok: true, ledgerId: 'draft' }, 'draft', 'Answer saved · grading starts after you pause or leave the box.'],
    ['confirmed queue capture', { ok: false, reason: 'network', queued: true }, 'local-only', 'Saved on this device · waiting for a connection to queue grading.'],
    ['500 without capture', { ok: false, reason: 'server' }, 'unsaved', '⚠ Not saved — check your connection'],
    ['queue capture failure', { ok: false, reason: 'network' }, 'unsaved', '⚠ Not saved — check your connection']
  ])('renders acknowledgement-backed draft state for %s', async (_, result, state, copy) => {
    addTextarea('reflect1', 'Draft answer awaiting acknowledgement.');
    installShippedFlow({ rosterToken: 'roster-token', record: vi.fn(async () => result) });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ mode: 'authoritative', authoritative: true, pollMs: 2000 }) });
    const hook = window.__aiFrqTicketClient;
    await hook.fetchConfig(true);
    await hook.saveDraft('reflect1', 'Draft answer awaiting acknowledgement.');
    await hook.refreshStatus();
    const statusEl = document.getElementById('reflect1-ai-status');
    expect(statusEl.dataset.frqState).toBe(state);
    expect(statusEl.textContent).toBe(copy);
  });
});

describe('authoritative appeals', () => {
  it('puts an inline appeal control in graded, graded-away, and already-graded-edited states', async () => {
    addTextarea('reflect1', 'Current first reflection text.');
    addTextarea('reflect2', 'Current second reflection text.');
    addTextarea('reflect3', 'Current third reflection text.');
    installShippedFlow({ rosterToken: 'roster-token', rosterUsername: 'appeal_states_student' });
    const hook = window.__aiFrqTicketClient;
    const currentAt = new Date(Date.now() + 60_000).toISOString();
    const cases = [
      ['reflect1', 'WS-U6L1-2-reflect1', await hook.hash('Current first reflection text.'), currentAt, 'graded'],
      ['reflect2', 'WS-U6L1-2-reflect2', await hook.hash('Current second reflection text.'), '2000-01-02T03:04:05.000Z', 'graded-away'],
      ['reflect3', 'WS-U6L1-2-reflect3', 'stale-response-hash', currentAt, 'already-graded-edited']
    ];

    for (const [taId, itemId, responseHash, gradedAt, expectedState] of cases) {
      await hook.renderStatus(itemId, {
        status: 'graded', score: 0.5, responseHash, gradedAt, appealCount: 0,
        result: { score: 0.5, feedback: 'Stored feedback.' }
      });
      const status = document.getElementById(taId + '-ai-status');
      const control = status.querySelector('.ai-frq-appeal-control');
      expect(status.dataset.frqState).toBe(expectedState);
      expect(control).not.toBeNull();
      expect(control.value).toBe('Appeal this grade…');
    }
  });

  it('omits the inline appeal control when the authoritative appeal count is exhausted', async () => {
    addTextarea('reflect1', 'Current exhausted reflection text.');
    installShippedFlow({ rosterToken: 'roster-token' });
    const hook = window.__aiFrqTicketClient;
    const hash = await hook.hash('Current exhausted reflection text.');

    await hook.renderStatus('WS-U6L1-2-reflect1', {
      status: 'graded', score: 0.5, responseHash: hash,
      gradedAt: new Date(Date.now() + 60_000).toISOString(), appealCount: 3,
      result: { score: 0.5, feedback: 'Stored feedback.' }
    });

    expect(document.querySelector('.ai-frq-appeal-control')).toBeNull();
  });

  it('renders the last appeal read-only in the worksheet appeal area', async () => {
    addTextarea('reflect1', 'Current appealed reflection text.');
    const showFeedback = vi.fn((questionId) => renderExistingAppealUi(questionId));
    installShippedFlow({ rosterToken: 'roster-token', showFeedback });
    const hook = window.__aiFrqTicketClient;
    const appealedAt = '2030-01-02T03:04:05.000Z';
    const responseHash = await hook.hash('Current appealed reflection text.');

    await hook.renderStatus('WS-U6L1-2-reflect1', {
      status: 'graded',
      score: 0.5,
      responseHash,
      gradedAt: '2030-01-02T03:05:00.000Z',
      appealCount: 1,
      result: { score: 0.5, feedback: 'Stored feedback.' },
      lastAppeal: {
        text: 'The rubric supports my original reasoning.',
        at: appealedAt,
        outcome: 'maintained',
      },
    });

    const rendered = document.getElementById('reflect1-frq-last-appeal');
    expect(rendered.textContent).toBe(
      'Your last appeal (' + new Date(appealedAt).toLocaleDateString()
        + '): The rubric supports my original reasoning. — maintained',
    );
    expect(rendered.closest('.appeal-section')).not.toBeNull();
    expect(rendered.querySelector('button, input, textarea')).toBeNull();
  });

  it('re-renders the worksheet appeal count from authoritative status and removes it at the limit', async () => {
    addTextarea('reflect1', 'Current count reflection text.');
    const showFeedback = vi.fn((questionId) => renderExistingAppealUi(questionId));
    installShippedFlow({ rosterToken: 'roster-token', showFeedback });
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-reflect1';
    const responseHash = await hook.hash('Current count reflection text.');
    const base = {
      status: 'graded', score: 0.5, responseHash,
      gradedAt: new Date(Date.now() + 60_000).toISOString(), appealLimit: 3,
      result: { score: 0.5, feedback: 'Stored feedback.' }
    };

    await hook.renderStatus(itemId, { ...base, appealCount: 2 });
    expect(document.querySelector('.appeal-count').textContent).toBe('Appeals used: 2/3');
    expect(document.querySelector('.ai-frq-appeal-control')).not.toBeNull();

    await hook.renderStatus(itemId, { ...base, appealCount: 3 });
    expect(document.querySelector('.appeal-count')).toBeNull();
    expect(document.querySelector('.ai-frq-appeal-control')).toBeNull();
  });

  it.each([
    ['graded', 'The original legacy response.', 'The original legacy response.'],
    ['already-graded-edited', 'The original legacy response.', 'The teacher edited this response after grading.']
  ])('materializes and submits a result-less legacy item in %s state', async (expectedState, gradedText, currentText) => {
    const ta = addTextarea('reflect1', currentText);
    const showFeedback = vi.fn((questionId, result) => {
      renderExistingAppealUi(questionId);
      ta.classList.add('graded-' + result.score);
      const badge = document.createElement('span');
      badge.className = 'grade-badge';
      badge.textContent = result.score;
      document.getElementById(questionId + '-feedback').prepend(badge);
    });
    installShippedFlow({ rosterToken: 'roster-token', showFeedback });
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-reflect1';
    const item = {
      status: 'graded', score: 0, responseHash: await hook.hash(gradedText),
      gradedAt: new Date(Date.now() + 60_000).toISOString(), appealCount: 0,
      result: null
    };
    let appealBody = null;
    mocks.fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', authoritative: true, pollMs: 2000 }) };
      }
      if (String(url).endsWith('/ledger/frq-appeal')) {
        appealBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ ok: true, queued: true, appealCount: 1 }) };
      }
      if (String(url).includes('/ledger/frq-status')) {
        return { ok: true, json: async () => ({ ok: true, mode: 'authoritative', items: {} }) };
      }
      throw new Error('unexpected fetch: ' + url);
    });
    await hook.fetchConfig(true);
    await hook.renderStatus(itemId, item);

    const status = document.getElementById('reflect1-ai-status');
    expect(status.dataset.frqState).toBe(expectedState);
    status.querySelector('.ai-frq-appeal-control').click();

    const form = document.getElementById('appeal-form-reflect1');
    const appealText = document.getElementById('appeal-text-reflect1');
    expect(form.classList.contains('visible')).toBe(true);
    expect(showFeedback).toHaveBeenCalledWith('reflect1', {
      score: 'I', feedback: '', matched: [], missing: []
    });
    expect(item.result).toBeNull();
    expect(mocks.gradingState.has('reflect1')).toBe(false);
    expect(ta.className).not.toMatch(/\bgraded-[EPI]\b/);
    expect(document.querySelector('.grade-badge')).toBeNull();

    appealText.value = 'Please review this legacy grade.';
    form.querySelector('.btn-check').click();
    for (let waited = 0; waited < 500 && !appealBody; waited += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const expectedBody = { itemId, appealText: 'Please review this legacy grade.' };
    if (expectedState === 'already-graded-edited') expectedBody.revisedText = currentText;
    expect(appealBody).toEqual(expectedBody);
    if (expectedState === 'already-graded-edited') {
      expect(form.querySelector('.ai-frq-revised-appeal-notice').textContent)
        .toBe('Your revised answer will be included.');
      expect(form.querySelector('.ai-frq-revised-appeal-notice').hidden).toBe(false);
    }
    hook.stopPolling();
  });

  it('builds and submits the bare fallback form when showFeedback is absent', async () => {
    addTextarea('reflect1', 'A legacy response without worksheet feedback rendering.');
    installShippedFlow({ rosterToken: 'roster-token', showFeedback: undefined });
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-reflect1';
    const responseHash = await hook.hash('A legacy response without worksheet feedback rendering.');
    let appealBody = null;
    mocks.fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', authoritative: true, pollMs: 2000 }) };
      }
      if (String(url).endsWith('/ledger/frq-appeal')) {
        appealBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ ok: true, queued: true, appealCount: 1 }) };
      }
      if (String(url).includes('/ledger/frq-status')) {
        return { ok: true, json: async () => ({ ok: true, mode: 'authoritative', items: {} }) };
      }
      throw new Error('unexpected fetch: ' + url);
    });
    await hook.fetchConfig(true);
    await hook.renderStatus(itemId, {
      status: 'graded', score: 0, responseHash,
      gradedAt: new Date(Date.now() + 60_000).toISOString(), appealCount: 0,
      result: null
    });

    const status = document.getElementById('reflect1-ai-status');
    status.querySelector('.ai-frq-appeal-control').click();

    const form = document.getElementById('appeal-form-reflect1');
    const appealText = document.getElementById('appeal-text-reflect1');
    expect(status.nextElementSibling).toBe(form);
    expect(form.className).toContain('appeal-form');
    expect(form.classList.contains('visible')).toBe(true);
    expect(form.querySelector('.btn-check')).not.toBeNull();
    expect(mocks.gradingState.has('reflect1')).toBe(false);

    appealText.value = 'Please review the fallback appeal.';
    form.querySelector('.btn-check').click();
    for (let waited = 0; waited < 500 && !appealBody; waited += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(appealBody).toEqual({ itemId, appealText: 'Please review the fallback appeal.' });
    hook.stopPolling();
  });

  it('opens the existing form, submits through its control, and renders appeal-queued', async () => {
    addTextarea('reflect1', 'Current reflection text.');
    const showFeedback = vi.fn((questionId) => renderExistingAppealUi(questionId));
    installShippedFlow({ rosterToken: 'roster-token', showFeedback });
    const hook = window.__aiFrqTicketClient;
    const itemId = 'WS-U6L1-2-reflect1';
    const hash = await hook.hash('Current reflection text.');
    const item = {
      status: 'graded', score: 0.5, responseHash: hash,
      gradedAt: new Date(Date.now() + 60_000).toISOString(), appealCount: 0,
      result: { score: 0.5, feedback: 'Stored feedback.' }
    };
    let liveItem = item;
    let appealPosts = 0;
    mocks.fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', authoritative: true, pollMs: 2000 }) };
      }
      if (String(url).endsWith('/ledger/frq-appeal')) {
        const expectedAppealText = appealPosts === 0
          ? 'Please review this reasoning.'
          : 'Please review this updated reasoning.';
        expect(JSON.parse(init.body)).toEqual({
          itemId: 'WS-U6L1-2-reflect1', appealText: expectedAppealText
        });
        appealPosts += 1;
        return { ok: true, json: async () => ({ ok: true, queued: true, appealCount: appealPosts }) };
      }
      if (String(url).includes('/ledger/frq-status')) {
        return { ok: true, json: async () => ({
          ok: true, mode: 'authoritative',
          items: { [itemId]: { ...liveItem, status: 'appeal-queued', appealCount: appealPosts } }
        }) };
      }
      throw new Error('unexpected fetch: ' + url);
    });
    await hook.fetchConfig(true);
    await hook.renderStatus(itemId, item);

    const control = document.querySelector('.ai-frq-appeal-control');
    const form = document.getElementById('appeal-form-reflect1');
    const appealText = document.getElementById('appeal-text-reflect1');
    expect(appealText.value).toBe('old draft');
    control.click();
    expect(form.classList.contains('visible')).toBe(true);
    expect(appealText.value).toBe('');
    appealText.value = 'Please review this reasoning.';

    form.querySelector('.btn-check').click();
    // The submit chain awaits fetch -> json -> a crypto.subtle digest for the hash
    // guard; that digest resolves a macrotask later in Node, so poll briefly
    // instead of assuming one setTimeout(0) is enough.
    const statusNode = () => document.getElementById('reflect1-ai-status');
    for (let waited = 0; waited < 500 && statusNode().dataset.frqState !== 'appeal-queued'; waited += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const status = document.getElementById('reflect1-ai-status');
    expect(status.dataset.frqState).toBe('appeal-queued');
    expect(status.textContent).toBe('✓ Saved · queued for grading');
    expect(status.querySelector('.ai-frq-appeal-control')).toBeNull();
    expect(document.getElementById('reflect1-frq-appeal-status').textContent)
      .toBe('Appeal submitted · waiting for review.');

    hook.stopPolling();
    const secondItem = {
      ...item,
      gradedAt: new Date(Date.now() + 120_000).toISOString(),
      appealCount: 1,
      result: { score: 0.5, feedback: 'Stored feedback after the first appeal.' }
    };
    liveItem = secondItem;
    await hook.renderStatus(itemId, secondItem);

    const secondControl = document.querySelector('.ai-frq-appeal-control');
    const secondForm = document.getElementById('appeal-form-reflect1');
    const secondAppealText = document.getElementById('appeal-text-reflect1');
    expect(secondForm).not.toBe(form);
    expect(secondAppealText.value).toBe('old draft');
    secondControl.click();
    expect(secondForm.classList.contains('visible')).toBe(true);
    expect(secondAppealText.value).toBe('');
    secondAppealText.value = 'Please review this updated reasoning.';

    secondForm.querySelector('.btn-check').click();
    // Same async chain as the first cycle: poll briefly for the render to land.
    for (let waited = 0; waited < 500 && statusNode().dataset.frqState !== 'appeal-queued'; waited += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const secondStatus = document.getElementById('reflect1-ai-status');
    expect(secondStatus.dataset.frqState).toBe('appeal-queued');
    expect(secondStatus.querySelector('.ai-frq-appeal-control')).toBeNull();
    expect(document.getElementById('reflect1-frq-appeal-status').textContent)
      .toBe('Appeal submitted · waiting for review.');
    expect(appealPosts).toBe(2);
  });

  it.each([
    [409, 'already-pending', 3, 'This appeal is already pending review.'],
    [429, 'limit', 3, "You've used all 3 appeals for this question."],
    [429, 'cooldown', 1, 'Please wait a minute before submitting another appeal.'],
    [409, 'duplicate', 1, 'This appeal is already pending review.'],
    [400, 'appealText must be at least 10 characters and at most 2048 bytes', 0,
      'appealText must be at least 10 characters and at most 2048 bytes']
  ])('POSTs the unchanged answer without revisedText and maps a %s server message', async (status, error, appealCount, copy) => {
    addTextarea('reflect1', 'Current reflection text.');
    const form = document.createElement('div');
    form.id = 'appeal-form-reflect1';
    form.innerHTML = '<textarea id="appeal-text-reflect1"></textarea><button class="btn-check">Submit</button>';
    document.body.appendChild(form);
    installShippedFlow({ rosterToken: 'roster-token' });
    mocks.fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/ledger/frq-config')) {
        return { ok: true, json: async () => ({ mode: 'authoritative', bundleVersion: 'v1', pollMs: 2000, authoritative: true }) };
      }
      if (String(url).endsWith('/ledger/frq-appeal')) {
        expect(init.headers.Authorization).toBe('Bearer roster-token');
        expect(JSON.parse(init.body)).toEqual({
          itemId: 'WS-U6L1-2-reflect1', appealText: 'Please review this reasoning.'
        });
        return { ok: false, status, json: async () => ({ ok: false, error, appealCount }) };
      }
      throw new Error('unexpected fetch: ' + url);
    });
    const hook = window.__aiFrqTicketClient;
    await hook.fetchConfig(true);
    const hash = await hook.hash('Current reflection text.');
    await hook.renderStatus('WS-U6L1-2-reflect1', {
      status: 'graded', score: 0.5, responseHash: hash,
      gradedAt: new Date(Date.now() + 60_000).toISOString(), appealCount: 0,
      result: { score: 0.5, feedback: 'Stored feedback.' }
    });

    document.querySelector('.ai-frq-appeal-control').click();
    document.getElementById('appeal-text-reflect1').value = 'Please review this reasoning.';
    form.querySelector('.btn-check').click();
    const appealStatus = () => document.getElementById('reflect1-frq-appeal-status');
    for (let waited = 0; waited < 500 && !appealStatus(); waited += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(appealStatus().textContent).toBe(copy);
    expect(!!document.querySelector('.ai-frq-appeal-control')).toBe(appealCount < 3);
    if (appealCount >= 3) expect(form.querySelector('.btn-check').disabled).toBe(true);
    expect(mocks.submitAppeal).not.toHaveBeenCalled();
  });

  it('delegates to the original appeal function unchanged in legacy mode', async () => {
    installShippedFlow({ rosterToken: 'roster-token' });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'shadow', bundleVersion: 'v1', pollMs: 2000, authoritative: false })
    });
    await window.__aiFrqTicketClient.fetchConfig(true);

    await window.submitAppeal('reflect1');

    expect(mocks.submitAppeal).toHaveBeenCalledWith('reflect1');
  });
});

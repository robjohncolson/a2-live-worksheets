/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const source = readFileSync('lib/worksheet-hydration.js', 'utf8');
const windows = [];

// These are synthetic protocol IDs, not dependencies on an authored worksheet.
function mount(prior = new Map()) {
  const w = new JSDOM('<input class="blank" data-question-id="WS-U1L1-Q1"><textarea id="reflect1"></textarea>', {
    url: 'https://example.test/', runScripts: 'outside-only'
  }).window;
  windows.push(w);
  w.gbWsPrefix = () => 'WS-U1L1';
  w.gradebookClient = { fetchPrior: vi.fn().mockResolvedValue(prior) };
  w.rosterClient = { token: () => 'student-token' };
  w.gradingState = new Map();
  w.checkAnswer = vi.fn();
  w._markRestored = vi.fn();
  w._markAutoGraded = vi.fn();
  w.recordBlankToGradebook = vi.fn();
  w.eval(source);
  return w;
}

afterEach(() => { windows.splice(0).forEach(w => w.close()); });

describe('retained worksheet hydration module', () => {
  it.each([[1, 'E'], [0.5, 'P'], [0, 'I']])('restores score %s and its feedback as %s', async (score, letter) => {
    const entry = {
      response: 'Subtract 2 from both sides to get x = 4.', score,
      gradedAt: '2026-09-16T12:00:00Z',
      result: { feedback: 'Explain the subtraction property of equality.', provider: 'teacher', missing: ['justification'] }
    };
    const w = mount(new Map([
      ['WS-U1L1-Q1', { response: 4, score: 1 }],
      ['WS-U1L1-reflect1', entry]
    ]));
    await w.hydratePriorAnswers();
    const blank = w.document.querySelector('input');
    const textarea = w.document.querySelector('textarea');
    expect(blank.value).toBe('4');
    expect(w.checkAnswer).toHaveBeenCalledWith(blank);
    expect(textarea.value).toBe(entry.response);
    expect(textarea.classList.contains('graded-' + letter)).toBe(true);
    expect(w.gradingState.get('reflect1')).toEqual({
      result: { score: letter, feedback: entry.result.feedback },
      originalAnswer: entry.response, appealCount: 0, history: []
    });
    expect(w._markAutoGraded).toHaveBeenCalledWith(
      textarea, letter, entry.result.feedback, entry.gradedAt, 'teacher', ['justification']
    );
    expect(w._markRestored).toHaveBeenCalledTimes(2);
    expect(w.gradebookClient.fetchPrior).toHaveBeenCalledWith('WS-U1L1', { restore: true });
  });

  it('does not overwrite typed text or deliberately cleared reflections', async () => {
    const w = mount(new Map([
      ['WS-U1L1-Q1', { response: '4' }],
      ['WS-U1L1-reflect1', { response: 'Old explanation', score: 1 }]
    ]));
    w.document.querySelector('input').value = 'my working';
    w.document.querySelector('textarea').dataset.gbEdited = '1';
    await w.hydratePriorAnswers();
    expect(w.document.querySelector('input').value).toBe('my working');
    expect(w.document.querySelector('textarea').value).toBe('');
    expect(w._markRestored).not.toHaveBeenCalled();
    expect(w.gradingState.size).toBe(0);
  });

  it('rechecks edits made while the saved answers are downloading', async () => {
    const w = mount();
    let finish;
    w.gradebookClient.fetchPrior.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = w.hydratePriorAnswers();
    w.document.querySelector('input').dataset.gbEdited = '1';
    finish(new Map([['WS-U1L1-Q1', { response: '4' }]]));
    await pending;
    expect(w.document.querySelector('input').value).toBe('');
    expect(w.checkAnswer).not.toHaveBeenCalled();
  });

  it('exposes explicit entry points without inventing page initialization glue', async () => {
    const w = mount(new Map([['WS-U1L1-Q1', { response: '4' }]]));
    expect(typeof w.hydratePriorAnswers).toBe('function');
    expect(typeof w.healLocalAnswersToLedger).toBe('function');
    expect(w.gradebookClient.fetchPrior).not.toHaveBeenCalled();
    await w.hydratePriorAnswers();
    await w.hydratePriorAnswers();
    expect(w._markRestored).toHaveBeenCalledTimes(1);
  });

  it('finishes diagnostics even when the ledger read fails', async () => {
    const w = mount();
    const run = {};
    w.worksheetDiagnostics = { begin: vi.fn(() => run), finish: vi.fn() };
    w.gradebookClient.fetchPrior.mockRejectedValue(new Error('offline'));
    await expect(w.hydratePriorAnswers()).resolves.toBeUndefined();
    expect(w.worksheetDiagnostics.finish).toHaveBeenCalledWith(run, undefined);
    expect(w.document.querySelector('input').value).toBe('');
    delete w.gradebookClient;
    await expect(w.hydratePriorAnswers()).resolves.toBeUndefined();
  });

  it('repairs unrecorded local answers only after a successful signed-in read', async () => {
    const w = mount();
    const blank = w.document.querySelector('input');
    blank.value = '4';
    w.rosterClient.token = () => null;
    await w.healLocalAnswersToLedger();
    expect(w.gradebookClient.fetchPrior).not.toHaveBeenCalled();
    w.rosterClient.token = () => 'student-token';
    await w.healLocalAnswersToLedger();
    expect(w.recordBlankToGradebook).toHaveBeenCalledWith(blank);
    expect(w.gradebookClient.fetchPrior).toHaveBeenCalledWith('WS-U1L1', { repair: true });
    w.recordBlankToGradebook.mockClear();
    w.gradebookClient.fetchPrior.mockResolvedValue(new Map([['WS-U1L1-Q1', { response: '4', score: 1 }]]));
    await w.healLocalAnswersToLedger();
    expect(w.recordBlankToGradebook).not.toHaveBeenCalled();
  });
});

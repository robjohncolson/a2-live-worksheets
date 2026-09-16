/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const runtime = readFileSync('lib/worksheet-ai-grade.js', 'utf8');
const windows = [];
const answer = 'Subtract 2 from both sides of x + 2 = 6 to obtain x = 4.';
const rubric = 'Explain the same operation on both sides and verify the solution.';

function mount({ prior = new Map() } = {}) {
  const w = new JSDOM('<textarea id="reflect1"></textarea><textarea id="reflect2"></textarea>', {
    url: 'https://example.test/', runScripts: 'outside-only'
  }).window;
  windows.push(w);
  w.document.querySelectorAll('textarea').forEach(ta => { ta.value = answer; });
  w.UNIT_ID = 'U1L1';
  w.gbWsPrefix = () => 'WS-U1L1';
  w.gradingState = new Map();
  w.rosterClient = { token: () => null, current: () => null };
  w.RAILWAY_SERVER_URL = 'https://grader.example.test';
  w.gradebookClient = { fetchPrior: vi.fn().mockResolvedValue(prior), record: vi.fn() };
  w.recordReflectionToGradebook = vi.fn();
  const record = w.recordReflectionToGradebook;
  w.showFeedback = vi.fn();
  const fallback = vi.fn().mockResolvedValue({ score: 'P', feedback: 'Verify x = 4.', missing: ['verification'] });
  // Mock only the page-provided per-item grader. Batching, grades and state run
  // through the shipped module; no copied ReflectionGrader implementation.
  w.gradeReflection = async function (id, text) {
    const scenario = { topic: 'Algebra 2 - Linear equations' };
    return fallback(id, text, scenario);
  };
  w.buildReflectionPromptAlgebra = (id, text) => rubric + '\nQuestion: ' + id + '\nAnswer: ' + text;
  w.LESSON_CONTEXT_Algebra = { unit: 1, lessons: '1' };
  const fetchSpy = vi.fn(async url => ({
    ok: true,
    json: async () => String(url).endsWith('/api/ai/grade-batch')
      ? { results: {
        reflect1: { score: 'E', feedback: 'Both sides stay equal.', matched: ['equality'], missing: [] },
        reflect2: { score: 'P', feedback: 'Verify x = 4.', missing: ['verification'] }
      } }
      : {}
  }));
  w.fetch = fetchSpy;
  w.__AI_FRQ_TEST_SEAMS__ = true;
  w.eval(runtime);
  return { w, record, fallback, fetchSpy };
}

afterEach(() => {
  for (const w of windows.splice(0)) {
    w.__aiFrqTicketClient.teardown();
    w.close();
  }
});

describe('reflection grading through the retained worksheet runtime', () => {
  it('sends algebra prompts and rubric in one batch and records the returned grades', async () => {
    const { w, record, fallback, fetchSpy } = mount();
    await w.aiGradeWorksheet({ manual: false });
    const calls = fetchSpy.mock.calls.filter(([url]) => url.endsWith('/api/ai/grade-batch'));
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1].body);
    expect(body.scenario).toEqual({ topic: 'Algebra 2 - Linear equations', lessonContext: { unit: 1, lessons: '1' } });
    expect(body.items).toEqual(['reflect1', 'reflect2'].map(id => ({
      questionId: id, answer, prompt: rubric + '\nQuestion: ' + id + '\nAnswer: ' + answer
    })));
    expect(record.mock.calls).toEqual([['reflect1', answer, 'E'], ['reflect2', answer, 'P']]);
    expect(w.gradingState.get('reflect1').result.feedback).toBe('Both sides stay equal.');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('skips empty and too-short reflections', async () => {
    const { w, record, fallback, fetchSpy } = mount();
    w.document.getElementById('reflect1').value = '';
    w.document.getElementById('reflect2').value = 'x = 4';
    await w.aiGradeWorksheet({ manual: false });
    expect(record).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to the page grader when batching is unavailable', async () => {
    const { w, record, fallback, fetchSpy } = mount();
    fetchSpy.mockResolvedValue({ ok: false, status: 503 });
    await w.aiGradeWorksheet({ manual: false });
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(record.mock.calls).toEqual([['reflect1', answer, 'P'], ['reflect2', answer, 'P']]);
    expect(w._aiGradeBusy).toBe(false);
  });

  it('keeps the persisted reflection floor when an edited answer earns less credit', async () => {
    const { w, record } = mount({
      prior: new Map([['WS-U1L1-reflect2', { response: 'Earlier complete solution.', score: 1 }]])
    });
    await w.aiGradeWorksheet({ manual: false });
    expect(record.mock.calls.filter(([id]) => id === 'reflect2')).toEqual([]);
  });

  it('preserves appeal count and history when a revised reflection improves', async () => {
    const { w, record } = mount();
    const history = [{ appealText: 'I applied subtraction to both sides.', previousScore: 'I', newScore: 'P' }];
    w.gradingState.set('reflect1', { result: { score: 'P' }, originalAnswer: 'Earlier incomplete solution.', appealCount: 1, history });
    await w.aiGradeWorksheet({ manual: false });
    expect(w.gradingState.get('reflect1')).toMatchObject({
      result: { score: 'E' }, originalAnswer: answer, appealCount: 1, history
    });
    expect(record).toHaveBeenCalledWith('reflect1', answer, 'E');
  });

  it('does not grade unchanged text again', async () => {
    const { w, record, fetchSpy } = mount();
    await w.aiGradeWorksheet({ manual: false });
    const calls = fetchSpy.mock.calls.length;
    await w.aiGradeWorksheet({ manual: false });
    expect(fetchSpy).toHaveBeenCalledTimes(calls);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('does not apply a grade to text edited during the request', async () => {
    const { w, record, fallback } = mount();
    w.document.getElementById('reflect2').value = '';
    let finish;
    fallback.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const grading = w.aiGradeWorksheet({ manual: false });
    // Wait only for the grader boundary, without timers or a second grade pass.
    for (let i = 0; i < 20 && !finish; i++) await Promise.resolve();
    expect(finish).toBeTypeOf('function');
    w.document.getElementById('reflect1').value = 'My revised explanation checks both sides using substitution.';
    finish({ score: 'E', feedback: 'Earlier text was correct.' });
    await grading;
    expect(record).not.toHaveBeenCalled();
    expect(w.gradingState.get('reflect1')?.result).toBeUndefined();
  });
});

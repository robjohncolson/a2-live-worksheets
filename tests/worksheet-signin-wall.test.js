/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInContext } from 'node:vm';

const read = file => readFileSync(file, 'utf8');
const windows = [];
const lesson = {
  key: '1-1', title: 'Solving linear equations',
  lessonCheck: Array.from({ length: 6 }, (_, i) => ({
    registryId: 'A2-1-1-Q' + (i + 1), type: 'text', prompt: 'Solve x + 2 = 6.', answer: '4'
  }))
};

async function mount({ token = null, lessonKey = '1-1', lessons = [lesson] } = {}) {
  const dom = new JSDOM(read('check.html'), {
    url: 'https://example.test/check.html?lesson=' + lessonKey, runScripts: 'outside-only'
  });
  const w = dom.window;
  windows.push(w);
  Object.defineProperty(w.crypto, 'randomUUID', { value: randomUUID });
  if (token) w.localStorage.setItem('a2_roster.v1', JSON.stringify({
    studentId: 'student-c', username: 'algebra_c', section: 'C', token
  }));
  w.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => lessons });
  w.eval(read('roster-client.js'));
  w.A2Client = {
    request: vi.fn().mockResolvedValue({ attempt: 1, score: 10, bestScore: 10 }),
    changed: vi.fn()
  };
  w.eval(read('lib/a2-answers.js'));
  // Await the runner's async IIFE in this window's realm before dispatching events.
  await runInContext(read('check.js'), dom.getInternalVMContext());
  return w;
}

async function submit(w) {
  w.document.querySelectorAll('input[data-answer]').forEach(input => {
    if (!input.value) input.value = input.dataset.answer;
  });
  w.document.querySelectorAll('#items fieldset').forEach(field => {
    const radio = field.querySelector('input[type="radio"]');
    if (radio && !field.querySelector('input[type="radio"]:checked')) radio.checked = true;
  });
  w.document.getElementById('check').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  // Settle the mocked request and the async event handler.
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => { windows.splice(0).forEach(w => w.close()); });

describe('A2 lesson-check sign-in boundary', () => {
  it('permits signed-out reading and practice but refuses even a dispatched submission', async () => {
    const w = await mount();
    expect(w.document.querySelectorAll('fieldset')).toHaveLength(6);
    expect(w.document.getElementById('submit').disabled).toBe(true);
    expect(w.document.getElementById('wall').textContent).toContain('You can read the items here');
    const input = w.document.querySelector('#items input');
    expect(input.disabled).toBe(false);
    input.value = '4';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(w.document.querySelector('.feedback').textContent).toBe('Correct');
    await submit(w);
    expect(w.A2Client.request).not.toHaveBeenCalled();
  });

  it('enables submission for a token-bearing session', async () => {
    const w = await mount({ token: 'token-c' });
    expect(w.document.getElementById('submit').disabled).toBe(false);
    expect(w.document.getElementById('wall').textContent).toContain('Answer all six items');
  });

  it('responds to real roster sign-in and a later session-change notification', async () => {
    const w = await mount();
    w.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
      ok: true, studentId: 'student-g', username: 'algebra_g', realName: 'Student G', section: 'G', token: 'token-g'
    }) });
    await w.rosterClient.signIn('algebra_g', 'fixture-password');
    expect(w.document.getElementById('submit').disabled).toBe(false);
    w.localStorage.removeItem('a2_roster.v1');
    w.dispatchEvent(new w.Event('roster-session-changed'));
    expect(w.document.getElementById('submit').disabled).toBe(true);
    await submit(w);
    expect(w.A2Client.request).not.toHaveBeenCalled();
  });

  it('keeps an unknown lesson unsubmitable even with a token', async () => {
    const w = await mount({ token: 'token-c', lessonKey: 'missing' });
    expect(w.document.getElementById('message').textContent).toBe('Unknown lesson');
    expect(w.document.getElementById('submit').disabled).toBe(true);
    await submit(w);
    expect(w.A2Client.request).not.toHaveBeenCalled();
  });

  it('sends all six A2 answers with stable lesson identity and announces the result', async () => {
    const w = await mount({ token: 'token-c' });
    w.document.querySelectorAll('#items input').forEach(input => { input.value = '4'; });
    await submit(w);
    expect(w.A2Client.request).toHaveBeenCalledTimes(1);
    expect(w.A2Client.request).toHaveBeenCalledWith('/ledger/record', {
      source: 'lesson-check', itemId: 'LC-1-1', lesson: '1-1',
      answers: Object.fromEntries(lesson.lessonCheck.map(item => [item.registryId, '4'])),
      requestId: expect.any(String)
    });
    expect(w.A2Client.changed).toHaveBeenCalledTimes(1);
    expect(w.document.getElementById('message').textContent).toContain('Attempt 1: 10.00/10. Best: 10.00/10.');
    expect(w.document.getElementById('submit').disabled).toBe(false);
  });

  it('retains answers and request identity for retry after a failed submission', async () => {
    const w = await mount({ token: 'token-c' });
    w.document.querySelectorAll('#items input').forEach(input => { input.value = '4'; });
    w.A2Client.request.mockRejectedValueOnce(new Error('offline'));
    await submit(w);
    expect(w.document.getElementById('message').textContent).toContain('Retry when connected');
    expect(Array.from(w.document.querySelectorAll('input[data-answer]'), input => input.value))
      .toEqual(Array(6).fill('4'));
    expect(w.A2Client.changed).not.toHaveBeenCalled();
    expect(w.A2Client.request).toHaveBeenCalledTimes(1);
    const first = w.A2Client.request.mock.calls[0][1];
    await submit(w);
    expect(w.A2Client.request).toHaveBeenCalledTimes(2);
    expect(w.A2Client.request.mock.calls[1][1]).toEqual(first);
  });

  it('resets practice feedback and answers for a retake', async () => {
    const w = await mount({ token: 'token-c' });
    const input = w.document.querySelector('#items input');
    input.value = '4';
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    w.document.getElementById('retake').click();
    expect(input.value).toBe('');
    expect(w.document.querySelector('.feedback').textContent).toBe('');
    expect(w.document.querySelector('fieldset').className).toBe('');
    expect(w.document.getElementById('submit').disabled).toBe(false);
  });
});

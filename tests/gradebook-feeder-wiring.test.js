// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const scripts = Object.fromEntries(['roster-client.js', 'gradebook-client.js', 'a2-client.js', 'check.js']
  .map(name => [name, source(name)]));
const doms = [];
afterEach(() => { for (const dom of doms.splice(0)) dom.window.close(); });

function browser(html, signedIn = true) {
  const dom = new JSDOM(html, { url: 'https://a2.example/check.html?lesson=1-1', runScripts: 'outside-only' });
  doms.push(dom);
  const win = dom.window;
  win.ROSTER_SERVICE_URL = 'https://roster.example';
  if (signedIn) win.localStorage.setItem('a2_roster.v1', JSON.stringify({
    studentId: 'student-c', username: 'algebra_student', section: 'PeriodC', token: 'token-c',
  }));
  win.eval(scripts['roster-client.js']);
  return win;
}

const receipt = { receiptId: 'receipt-1', compact: 'synthetic.signed-receipt' };

describe('A2 worksheet DOM to retained gradebook feeder', () => {
  it('preserves item identity, response and signed receipt through a real client write', async () => {
    const win = browser('<input class="blank" data-question-id="WS-A2-1-1-Q1" value="4">');
    win.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, ledgerId: 'row-1', receipt }) }));
    win.eval(scripts['gradebook-client.js']);
    const blank = win.document.querySelector('.blank');
    const result = await win.gradebookClient.record({
      source: 'worksheet', itemId: blank.dataset.questionId, response: blank.value, unit: 'U1', score: 1,
    });
    expect(result).toEqual({ ok: true, ledgerId: 'row-1', receipt });
    expect(win.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = win.fetch.mock.calls[0];
    expect(url).toBe('https://roster.example/ledger/record');
    expect(JSON.parse(options.body)).toEqual({
      token: 'token-c', source: 'worksheet', itemId: 'WS-A2-1-1-Q1', response: '4', unit: 'U1', score: 1,
    });
    expect(options.headers).not.toHaveProperty('x-proctor-secret');
    expect(JSON.parse(win.localStorage.getItem('desk_receipts_v1'))).toEqual([
      expect.objectContaining({ id: receipt.receiptId, compact: receipt.compact, src: 'worksheet', i: blank.dataset.questionId }),
    ]);
  });

  it('blocks writes without identity and in read-only mode', async () => {
    const win = browser('<textarea id="reflect1">Subtract 3, then divide by 2.</textarea>', false);
    win.fetch = vi.fn();
    win.eval(scripts['gradebook-client.js']);
    const row = { source: 'frq', itemId: 'WS-A2-1-1-reflect1', response: win.document.getElementById('reflect1').value };
    expect(await win.gradebookClient.record(row)).toEqual({ ok: false, reason: 'no-identity' });
    win.__WS_READ_ONLY__ = true;
    expect(await win.gradebookClient.record(row)).toEqual({ ok: false, reason: 'read-only' });
    expect(win.fetch).not.toHaveBeenCalled();
  });
});

const lesson = {
  key: '1-1', title: 'Synthetic equation practice',
  lessonCheck: Array.from({ length: 6 }, (_, index) => ({
    registryId: 'A2-1-1-CHECK-' + (index + 1),
    prompt: 'Solve x + ' + index + ' = ' + (index + 4),
    type: index < 3 ? 'mc' : 'text', answer: index < 3 ? 'A' : '4',
    ...(index < 3 ? { choices: ['A. 4', 'B. 5'] } : {}),
  })),
};

async function checkBrowser(signedIn = true, failFirst = false) {
  const win = browser('<h1 id="title"></h1><div id="wall"></div><div id="view-as-banner" hidden></div>'
    + '<form id="check"><div id="items"></div><button id="submit">Submit</button></form>'
    + '<button id="retake">Retake</button><p id="message"></p>', signedIn);
  let sequence = 0;
  win.crypto.randomUUID = () => 'request-' + (++sequence);
  const posts = [];
  win.fetch = vi.fn(async (url, options) => {
    if (url === 'content/a2/lessons.json') return { ok: true, json: async () => [lesson] };
    posts.push({ url, options, body: JSON.parse(options.body) });
    if (failFirst && posts.length === 1) throw new Error('offline');
    return { ok: true, json: async () => ({ ok: true, score: 10, bestScore: 10, attempt: 1, receipt }) };
  });
  win.eval(scripts['a2-client.js']);
  await win.eval(scripts['check.js']);
  for (const item of lesson.lessonCheck) {
    if (item.type === 'mc') win.document.querySelector('input[name="' + item.registryId + '"]').checked = true;
    else win.document.getElementById(item.registryId).value = '4';
  }
  return { win, posts };
}

function submitCheck(win) {
  win.document.getElementById('check').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}

describe('six-item A2 lesson check to real A2Client', () => {
  it('submits all registry IDs with current roster identity and announces saved work', async () => {
    const { win, posts } = await checkBrowser();
    const changed = vi.fn();
    win.addEventListener('a2-lesson-changed', changed);
    submitCheck(win);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('https://roster.example/ledger/record');
    expect(posts[0].options.headers.Authorization).toBe('Bearer token-c');
    expect(posts[0].body).toEqual({
      source: 'lesson-check', itemId: 'LC-1-1', lesson: '1-1', requestId: 'request-1',
      answers: Object.fromEntries(lesson.lessonCheck.map(item => [item.registryId, item.answer])),
    });
    expect(win.document.querySelectorAll('fieldset')).toHaveLength(6);
    expect(win.document.getElementById('message').textContent).toContain('10.00/10');
    expect(win.localStorage.getItem('a2_lesson_changed')).toBeTruthy();
  });

  it('preserves the receipt-bearing response from the request boundary', async () => {
    const { win } = await checkBrowser();
    const result = await win.A2Client.request('/ledger/record', {
      source: 'lesson-check', itemId: 'LC-1-1', lesson: '1-1', answers: {}, requestId: 'receipt-contract',
    });
    expect(result.receipt).toEqual(receipt);
  });

  it('keeps the same request ID after a failure and rotates it after success', async () => {
    const { win, posts } = await checkBrowser(true, true);
    submitCheck(win);
    await vi.waitFor(() => expect(win.document.getElementById('message').textContent).toContain('Not submitted'));
    expect(win.localStorage.getItem('a2_lesson_changed')).toBeNull();
    submitCheck(win);
    await vi.waitFor(() => expect(win.document.getElementById('message').textContent).toContain('10.00/10'));
    expect(posts.map(post => post.body.requestId)).toEqual(['request-1', 'request-1']);
    submitCheck(win);
    await vi.waitFor(() => expect(posts).toHaveLength(3));
    expect(posts[2].body.requestId).toBe('request-2');
  });

  it('does not submit after roster sign-out', async () => {
    const { win, posts } = await checkBrowser();
    win.localStorage.removeItem('a2_roster.v1');
    win.dispatchEvent(new win.Event('roster-session-changed'));
    submitCheck(win);
    await Promise.resolve();
    expect(win.document.getElementById('submit').disabled).toBe(true);
    expect(posts).toHaveLength(0);
    expect(win.document.getElementById('wall').textContent).toContain('Sign in');
  });
});

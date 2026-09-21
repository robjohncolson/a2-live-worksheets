// @vitest-environment node
// B15: retained display contracts with inline Algebra 2 records.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadCedLabels } from './fixtures/ced2026-labels.js';

const deskUrl = pathToFileURL(resolve(__dirname, '../desk.html')).href;
const source = readFileSync(new URL(deskUrl), 'utf8');
const opened = [];
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()));

function functionSource(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  if (!match) throw new Error('Missing Desk function: ' + name);
  let depth = 0;
  for (let i = source.indexOf('{', match.index); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(match.index, i + 1);
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

import { computeDonow } from '../roster-server/donow.js';

const activities = [
  { activity: 'try-it', source: 'try-it', itemIds: ['TI-1-1-1', 'TI-1-1-2'] },
  { activity: 'lesson-check', source: 'lesson-check', itemIds: ['LC-1-1'] },
  { activity: 'flashcard', source: 'flashcard', itemIds: ['BL-U1-L1-DESK_DONE'] },
];
const registry = { lessons: { '1.1': { title: 'Key Features of Functions',
  ced2026: { status: 'core', newTopic: '1.1', newUnit: 1, newLabel: 'Key Features of Functions' },
} } };

function boot(names, values = {}) {
  const dom = new JSDOM(['donow-card', 'donow-msg', 'bf-header', 'bf-result', 'bf-overlay']
    .map(id => '<div id="' + id + '"></div>').join(''), {
    runScripts: 'outside-only', url: 'https://school.test/desk.html',
  });
  opened.push(dom);
  const labels = loadCedLabels(registry);
  Object.assign(dom.window, {
    cedLabel: labels.cedLabel, cedDisplayText: labels.cedDisplayText, REGISTRY: registry,
    ...values,
  });
  dom.window.eval(names.map(functionSource).join('\n') + '\n//# sourceURL=' + deskUrl);
  return dom.window;
}

describe('A2 Do Now preserves ledger identities', () => {
  it.each([0])('renders activity %s without rewriting its item IDs or source data', async index => {
    const manifest = { units: [{ unit: 'U1', lessons: [{ lesson: '1.1', activities }] }] };
    const rows = activities.slice(0, index).flatMap(activity => activity.itemIds.map(item_id => ({ item_id })));
    const task = { ok: true, ...computeDonow(rows, manifest) };
    const snapshot = JSON.stringify({ task, manifest, rows });
    const fetch = vi.fn(async () => ({ json: async () => task }));
    const win = boot(['renderDoNow'], {
      fetch, ROSTER_SERVICE_URL: 'https://roster.test', rosterClient: { token: () => 'session' },
    });
    await win.renderDoNow();
    expect(task.nextTask).toMatchObject({ lesson: '1.1', source: activities[index].source,
      itemIds: activities[index].itemIds });
    expect(win.document.getElementById('donow-msg').textContent).toContain('1-1 · Key Features of Functions');
    expect(win._donowData).toBe(task);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer session');
    expect(JSON.stringify({ task, manifest, rows })).toBe(snapshot);
  });

  it('a deck pass does not complete missing Try-Its or the lesson check', () => {
    const manifest = { units: [{ unit: 'U1', lessons: [{ lesson: '1.1', activities }] }] };
    const task = computeDonow([{ item_id: 'BL-U1-L1-DESK_DONE', topic: '1.1' }], manifest);
    expect(task.nextTask.itemIds).toEqual(['TI-1-1-1', 'TI-1-1-2']);
    expect(task.lessons[0].lessonState).toBe('none');
    expect(task.lessons[0].selfDoneArtifacts).toEqual(['blooket']);
  });
});

describe('retained signed receipts', () => {
  it.each(['TI-1-1-1', 'LC-1-1', 'BL-U1-L1-DESK_DONE'])('keeps %s evidence and verification target unchanged', itemId => {
    const payload = { i: itemId, src: itemId.startsWith('TI') ? 'try-it'
      : itemId.startsWith('LC') ? 'lesson-check' : 'flashcard', sc: 0.8 };
    const receipt = { compact: Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature',
      id: 'a2-receipt' };
    const snapshot = JSON.stringify(receipt);
    const verify = vi.fn(), qr = vi.fn();
    // Historical helper names belong to the surviving academic receipt UI.
    const win = boot(['_receiptPayload', '_receiptVerifyUrl', '_receiptViewUrl', '_walletReceiptRow'], {
      _reviewByItem: {}, _walletVerifyAndCheck: verify, _renderReceiptQr: qr,
    });
    const row = win._walletReceiptRow(receipt);
    expect(win._receiptPayload(receipt)).toEqual(payload);
    expect(row.textContent).toContain('80%');
    [...row.querySelectorAll('button')].find(button => button.textContent.includes('Verify')).click();
    expect(verify.mock.calls[0][0]).toBe(receipt);
    expect(qr.mock.calls[0][1]).toBe('https://school.test/verify.html#r=' + encodeURIComponent(receipt.compact));
    expect(JSON.stringify(receipt)).toBe(snapshot);
  });
});

describe('A2 quick-check resume identity', () => {
  it('resumes the same topic, ordered deck, round and score without fetching again', async () => {
    const deck = [{ qnum: 7, q: 'Domain?', choices: ['All real numbers', 'Zero'], correctIdx: 0 }];
    const resumed = { deck, idx: 0, score: 0, roundId: 'desk-a2-round', seq: 4 };
    const snapshot = JSON.stringify(resumed);
    const load = vi.fn(() => resumed), fetch = vi.fn(), render = vi.fn();
    const win = boot(['_bfStartQuick'], { _bfOwner: () => 'owner',
      _bfState: {}, _bfLoadProgress: load, fetch,
      _bfSaveProgress: vi.fn(), _bfShowQuizUI: vi.fn(),
      _bfRenderCard: render, _bfKeydownHandler: vi.fn(),
    });
    await win._bfStartQuick(null, '1.1');
    expect(load).toHaveBeenCalledWith('1.1');
    expect(fetch).not.toHaveBeenCalled();
    expect(win._bfState).toMatchObject({ topic: '1.1', deck, idx: 0, score: 0,
      roundId: 'desk-a2-round', seq: 4 });
    expect(win.document.getElementById('bf-header').textContent).toContain('Key Features of Functions');
    expect(render).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(resumed)).toBe(snapshot);
  });
});

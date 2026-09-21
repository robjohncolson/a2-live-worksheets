/**
 * tests/desk-donow-card.test.js
 *
 * DN3a — the Do Now card in desk.html.
 * Frozen contract: DESK_DONOW_DN3_BUILD.md (DN3a section).
 *
 * jsdom DOM-structure (scripts NOT executed) + Node `vm` runtime, mirroring
 * the DN2c/DN2d test approach. No network, no Supabase.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';
import { computeDonow } from '../roster-server/donow.js';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(__dirname, '..');
const DESK_PATH = resolve(REPO_ROOT, 'desk.html');
const opened = [];
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()));
afterAll(() => document?.defaultView.close());

describe('A2 Do Now actions', () => {
  it.each([
    ['try-it', 'Try-Its (scored in class)'],
    ['lesson-check', 'Try-Its (scored in class)'],
    ['flashcard', 'Try-Its (scored in class)'],
  ])('renders %s with the A2 title and correct action', async (source, activityLabel) => {
    const dom = new JSDOM('<div id="donow-card"><span id="donow-msg"></span></div>');
    const launches = [];
    const sandbox = {
      document: dom.window.document,
      window: { ROSTER_SERVICE_URL: 'https://roster.example', rosterClient: { token: () => 'token' } },
      REGISTRY: { lessons: { '1.1': { title: 'Key Features of Functions' } } },
      cedLabel: () => ({ text: 'inherited AP title' }),
      // A deck pass must not suppress the remaining check or Try-Its.
      getStudentMarks: () => ({}),
      localLessonState: () => 'done',
      _calNextUp: null,
      fetch: async () => ({ json: async () => ({ ok: true,
        nextTask: { unit: 'U1', lesson: '1.1', activity: source, source, done: 0, total: 1 },
      }) }),
      openBlooketFlashcards: (...args) => launches.push(args),
    };
    createContext(sandbox);
    runInContext(fnBody(readFileSync(DESK_PATH, 'utf8'), 'renderDoNow') + '\nthis.run = renderDoNow;', sandbox);
    await sandbox.run();
    const msg = dom.window.document.getElementById('donow-msg');
    expect(msg.textContent).toContain('Do Now: 1-1 · Key Features of Functions — ' + activityLabel);
    expect(msg.querySelector('a, button')).toBeNull();
    expect(launches).toEqual([]);
    dom.window.close();
  });
});

let html;
let document;

beforeAll(() => {
  html = readFileSync(DESK_PATH, 'utf-8');
  document = new JSDOM(html).window.document;
});

// ─── slicer (skips the param list so default params don't fool it) ──────────
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Card markup present + mounted before the calendar
// ─────────────────────────────────────────────────────────────────────────────

describe('DN3a — Do Now card markup', () => {
  it('has #donow-card and #donow-msg', () => {
    expect(document.getElementById('donow-card')).not.toBeNull();
    expect(document.getElementById('donow-msg')).not.toBeNull();
  });

  it('the card sits before the calendar grid (#cg)', () => {
    const iCard = html.indexOf('id="donow-card"');
    const iCal = html.indexOf('id="cg"');
    expect(iCard).toBeGreaterThan(-1);
    expect(iCal).toBeGreaterThan(iCard);
  });

  it('starts hidden (renderDoNow reveals it)', () => {
    const card = document.getElementById('donow-card');
    expect(card.getAttribute('style')).toMatch(/display:\s*none/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Source wiring — server-mediated, invoked at the right moments
// ─────────────────────────────────────────────────────────────────────────────

describe('DN3a — wiring', () => {
  // moved to journeys/j1-signin-donow.journey.test.js — J1 sign-in renders fake /grade values and sign-out clears the identity chip (supersedes desk-donow-card “renderDoNow fetches /donow with a Bearer token” and post-sign-in refresh pins)

  it('renderDoNow makes ZERO direct Supabase calls (D7)', () => {
    const b = fnBody(html, 'renderDoNow');
    expect(b).not.toMatch(/SUPABASE_URL|supabase/i);
  });

  // moved to journeys/j1-signin-donow.journey.test.js — J1 sign-in renders fake /grade values and sign-out clears the identity chip (supersedes desk-donow-card “renderDoNow fetches /donow with a Bearer token” and post-sign-in refresh pins)
  // moved to journeys/j1-signin-donow.journey.test.js — J1 sign-in renders fake /grade values and sign-out clears the identity chip (supersedes desk-donow-card “renderDoNow fetches /donow with a Bearer token” and post-sign-in refresh pins)
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RUNTIME — renderDoNow behaves correctly against fakes
// ─────────────────────────────────────────────────────────────────────────────

function makeDesk({ token, tokenThrows, fetchImpl, serviceUrl = 'https://roster.example' } = {}) {
  const dom = new JSDOM('<div id="donow-card"></div><div id="donow-msg"></div>');
  opened.push(dom);
  const el = id => dom.window.document.getElementById(id);

  const fetchCalls = [];
  const spiedFetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    if (fetchImpl) return fetchImpl(url, opts);
    throw new Error('no fetch');
  };

  const sandbox = {
    REGISTRY: { lessons: { '1.1': { title: 'Key Features of Functions' } } },
    cedLabel: () => ({ text: '1-1 · Key Features of Functions' }),
    document: dom.window.document,
    window: {
      ROSTER_SERVICE_URL: serviceUrl,
      rosterClient: {
        token: () => { if (tokenThrows) throw new Error('token boom'); return token || null; },
      },
    },
    fetch: spiedFetch,
    console,
  };
  createContext(sandbox);
  runInContext(fnBody(html, 'renderDoNow') + '\nthis.__rd = renderDoNow;', sandbox,
    { filename: pathToFileURL(DESK_PATH).href });
  return { run: sandbox.__rd, el, fetchCalls };
}

describe('DN3a runtime — renderDoNow states', () => {
  it('no token → sign-in nudge, amber, card shown', async () => {
    const d = makeDesk({ token: null });
    await d.run();
    expect(d.el('donow-msg').textContent).toMatch(/Sign in/i);
    expect(d.el('donow-card').className).toBe('donow-signin');
    expect(d.el('donow-card').style.display).toBe('flex');
    expect(d.fetchCalls).toHaveLength(0);
  });

  it('token + nextTask → message + fetches /donow with exact Bearer header (D7)', async () => {
    const d = makeDesk({
      token: 'tok',
      fetchImpl: async () => ({ json: async () => ({
        ok: true,
        nextTask: { unit: 'U1', lesson: '1.1', activity: 'try-it', source: 'try-it', itemIds: ['TI-1-1-1'], progress: { done: 0, total: 1 } },
      }) }),
    });
    await d.run();
    expect(d.el('donow-msg').textContent).toBe('Do Now: 1-1 · Key Features of Functions — Try-Its (scored in class)');
    expect(d.el('donow-card').className).toBe('donow-todo');
    // Fetch spy: exact URL + Authorization header (not just a source regex).
    expect(d.fetchCalls).toHaveLength(1);
    expect(d.fetchCalls[0].url).toBe('https://roster.example/donow');
    expect(d.fetchCalls[0].opts.headers.Authorization).toBe('Bearer tok');
    expect(d.fetchCalls[0].opts.method || 'GET').toBe('GET');
    expect(d.fetchCalls[0].opts.body).toBeUndefined();
  });

  it('rosterClient.token() throws → graceful sign-in nudge, no throw, no fetch', async () => {
    const d = makeDesk({ tokenThrows: true });
    await expect(d.run()).resolves.toBeUndefined();
    expect(d.el('donow-msg').textContent).toMatch(/Sign in/i);
    expect(d.fetchCalls).toHaveLength(0);
  });

  it('malformed truthy nextTask (no unit) → quiet fallback, never "undefined"', async () => {
    const d = makeDesk({
      token: 'tok',
      fetchImpl: async () => ({ json: async () => ({ ok: true, nextTask: { lesson: '1.2' } }) }),
    });
    await d.run();
    expect(d.el('donow-msg').textContent).not.toMatch(/undefined/);
    expect(d.el('donow-msg').textContent).toMatch(/Could not load/i);
  });

  it('token + nextTask null → celebratory all-caught-up, green', async () => {
    const d = makeDesk({
      token: 'tok',
      fetchImpl: async () => ({ json: async () => ({ ok: true, nextTask: null }) }),
    });
    await d.run();
    expect(d.el('donow-msg').textContent).toMatch(/All caught up/i);
    expect(d.el('donow-card').className).toBe('donow-done');
  });

  it('ignores ledger work outside the published manifest without writing or launching it', async () => {
    const manifest = { units: [{ unit: 'U1', lessons: [{ lesson: '1.1', activities: [
      { activity: 'try-it', source: 'try-it', itemIds: ['TI-1-1-1'] },
    ] }] }] };
    const rows = [{ item_id: 'LC-1-2', source: 'lesson-check' }];
    const snapshot = JSON.stringify({ rows, manifest });
    const payload = { ok: true, ...computeDonow(rows, manifest) };
    const d = makeDesk({ token: 'tok', fetchImpl: async () => ({ json: async () => payload }) });
    await d.run();
    expect(payload.lessons.map(lesson => lesson.lesson)).toEqual(['1.1']);
    expect(payload.nextTask.itemIds).toEqual(['TI-1-1-1']);
    expect(d.el('donow-msg').textContent).not.toContain('1-2');
    expect(d.el('donow-msg').querySelector('a, button')).toBeNull();
    expect(d.fetchCalls).toHaveLength(1);
    expect(d.fetchCalls[0].opts.body).toBeUndefined();
    expect(JSON.stringify({ rows, manifest })).toBe(snapshot);
  });

  it('fetch throws → quiet fallback, NEVER throws', async () => {
    const d = makeDesk({ token: 'tok', fetchImpl: async () => { throw new Error('network'); } });
    await expect(d.run()).resolves.toBeUndefined();
    expect(d.el('donow-msg').textContent).toMatch(/Could not load/i);
  });

  it('server ok:false → quiet fallback, no throw', async () => {
    const d = makeDesk({ token: 'tok', fetchImpl: async () => ({ json: async () => ({ ok: false }) }) });
    await expect(d.run()).resolves.toBeUndefined();
    expect(d.el('donow-msg').textContent).toMatch(/Could not load/i);
  });

  it('no ROSTER_SERVICE_URL → graceful unavailable message', async () => {
    const d = makeDesk({ token: 'tok', serviceUrl: null }); // null ≠ undefined: skips the destructuring default
    await d.run();
    expect(d.el('donow-msg').textContent).toMatch(/unavailable/i);
  });
});


describe('district Do Now readiness and motion', () => {
  function readiness(cells, nextTask, loadState = 'available') {
    const dom = new JSDOM('<div id="donow-card" class="donow-todo"><span>Task</span><button>Action</button></div><div class="app-icon" data-app="progress"></div><div class="app-icon" data-app="receipts"></div>');
    opened.push(dom);
    let opens = 0;
    const context = createContext({ document: dom.window.document,
      _gradeLoadState: loadState,
      _gradeGradebookCache: { quarters: { Q1: { formula: 'district', cells, columns: [
        { key: 'LC-1-1', due: true }, { key: 'TI-1-1-1', due: true }, { key: 'future', due: false },
      ] } } },
      _donowData: { ok: true, nextTask }, openMyGradebook: () => opens++,
    });
    runInContext(['_donowOpensLedger', '_paintDoNowReadiness', '_paintDeskMotionCues'].map(name => fnBody(html, name)).join('\n'), context,
      { filename: pathToFileURL(DESK_PATH).href });
    context._paintDoNowReadiness();
    return { dom, context, card: dom.window.document.getElementById('donow-card'), opens: () => opens };
  }

  it.each([
    [{}, { source: 'lesson-check' }, 'behind', 0],
    [{ 'LC-1-1': 0 }, { source: 'try-it' }, 'catching-up', 60],
    [{ 'LC-1-1': 0, 'TI-1-1-1': 2 }, { source: 'flashcard' }, 'on-pace', 185],
    [{ 'LC-1-1': 0, 'TI-1-1-1': 2 }, null, 'caught-up', 120],
  ])('uses due district cells and the next task for %s', (cells, task, state, hue) => {
    const { card, dom } = readiness(cells, task);
    expect(card.dataset.readiness).toBe(state);
    const expected = dom.window.document.createElement('div');
    expected.style.background = `hsl(${hue},60%,92%)`;
    expected.style.borderColor = `hsl(${hue},65%,45%)`;
    expect(card.style.background).toBe(expected.style.background);
    expect(card.style.borderColor).toBe(expected.style.borderColor);
  });

  it('clears stale readiness when grade evidence becomes unavailable or sign-in is required', () => {
    const { card, context } = readiness({}, { source: 'lesson-check' });
    context._gradeLoadState = 'unavailable'; context._paintDoNowReadiness();
    expect(card.style.background).toBe('');
    expect(card.dataset.readiness).toBeUndefined();
    context._gradeLoadState = 'available'; card.className = 'donow-signin'; context._paintDoNowReadiness();
    expect(card.style.borderColor).toBe('');
  });

  it('keeps click and keyboard Gradebook access without intercepting child actions', () => {
    const { card, dom, context, opens } = readiness({}, null);
    context._paintDoNowReadiness();
    card.querySelector('span').click();
    card.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    card.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    card.querySelector('button').click();
    expect(opens()).toBe(3);
    expect(card.tabIndex).toBe(0);
  });

  it('moves and clears the next-task icon cue, falling back to Gradebook for absent icons', () => {
    const { context, dom } = readiness({}, null);
    const doc = dom.window.document;
    context._paintDeskMotionCues('flashcards');
    expect(doc.querySelector('.donow-next').dataset.app).toBe('progress');
    context._paintDeskMotionCues('receipts');
    expect(doc.querySelectorAll('.donow-next')).toHaveLength(1);
    expect(doc.querySelector('.donow-next').dataset.app).toBe('receipts');
    context._paintDeskMotionCues(null);
    expect(doc.querySelector('.donow-next')).toBeNull();
    expect(fnBody(html, 'renderDoNow')).toContain("_paintDeskMotionCues(mode === 'todo' ? _dnNextApp : null)");
  });
});


describe('Work Day uses the server next task for motion', () => {
  it.each([
    [{ unit: 'U1', lesson: '1.1', source: 'lesson-check' }, null, 'progress', 'todo'],
    [{ unit: 'U1', lesson: '1.1', source: 'try-it' }, null, 'progress', 'todo'],
    [{ unit: 'U1', lesson: '1.1', source: 'flashcard' }, null, 'flashcards', 'todo'],
    [null, { inf: { t: '1.1' } }, null, 'done'],
  ])('follows nextTask %j despite conflicting local marks', async (nextTask, localNext, cue, mode) => {
    const dom = new JSDOM('<div id="donow-card"><span id="donow-msg"></span></div>');
    opened.push(dom);
    const cues = [];
    const sandbox = createContext({
      document: dom.window.document,
      window: { ROSTER_SERVICE_URL: 'https://roster.example', rosterClient: { token: () => 'token' } },
      _todayLessonInf: { kind: 'work' },
      _workDayNextLesson: () => localNext,
      cedLabel: topic => ({ text: topic + ' lesson' }),
      _paintDeskMotionCues: value => cues.push(value),
      fetch: async () => ({ json: async () => ({ ok: true, nextTask }) }),
    });
    runInContext(fnBody(html, 'renderDoNow'), sandbox);
    await sandbox.renderDoNow();
    expect(cues).toEqual([cue]);
    expect(dom.window.document.getElementById('donow-card').className).toBe('donow-' + mode);
    expect(dom.window.document.getElementById('donow-msg').textContent).toContain(
      nextTask ? 'Finish: 1.1 lesson' : 'All caught up.'
    );
  });
});

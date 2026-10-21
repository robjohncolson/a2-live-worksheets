// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const SOURCE = readFileSync(new URL('../lib/class-log-summary.js', import.meta.url), 'utf8');
const DESK = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const context = createContext({ module: { exports: {} }, Intl, Date, Number, Promise });
runInContext(SOURCE, context);
const R = context.module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

const row = {
  date: '2026-10-20', course: 'algebra2', section: 'G', model: 'deepseek-chat',
  landed: ['Translations', ' '], studentQuestions: ['Is the SAT long?'], promises: ['Quiz Thursday', 'Show Try-It site'], nextPrep: [],
  recordedAt: '2026-10-21T00:50:20.124+00:00',
};

describe('class-log-summary: view', () => {
  it('renders the four lists under their labels, then model and recorded time (New York)', () => {
    expect(plain(R.view(row))).toEqual({
      lists: [
        { label: 'Landed', items: ['Translations'] },
        { label: 'Student questions', items: ['Is the SAT long?'] },
        { label: 'Promises', items: ['Quiz Thursday', 'Show Try-It site'] },
      ],
      footer: 'deepseek-chat · recorded 20:50',
    });
    expect(plain(R.view({ ...row, model: null, recordedAt: 'nope', landed: 'x' })).footer).toBe('');
    expect(R.clock('2026-10-20T17:05:00Z')).toBe('13:05');
  });
  it('no row says so', () => {
    expect(plain(R.view(null))).toEqual({ message: 'No recording summary' });
  });
  it('picks the Algebra 2 row for the section and date', () => {
    const body = { summaries: [{ ...row, section: 'C' }, { ...row, course: 'apstats' }, row] };
    expect(R.pick(body, '2026-10-20', 'G')).toBe(row);
    expect(R.pick(body, '2026-10-20', 'D')).toBeNull();
    expect(R.pick(null, '2026-10-20', 'G')).toBeNull();
  });
});

// A tiny DOM: enough for render() (createElement, appendChild, removeChild, textContent).
function fakeDoc() {
  const make = tag => {
    const el = { tag, children: [], className: '', textContent: '',
      appendChild(c) { el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); } };
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
    Object.defineProperty(el, 'lastChild', { get: () => el.children[el.children.length - 1] || null });
    return el;
  };
  return { createElement: make };
}
const texts = el => el.children.slice(1).map(c => c.tag === 'ul' ? c.children.map(li => '- ' + li.textContent).join('\n') : c.textContent);

describe('class-log-summary: fill', () => {
  it('fetches once per date, renders the row, and says unavailable on failure', async () => {
    R._reset();
    const doc = fakeDoc();
    let calls = 0, fail = false;
    const win = {
      document: doc, ROSTER_SERVICE_URL: 'https://srv',
      rosterClient: { current: () => ({ role: 'teacher' }), token: () => 'tok' },
      fetch: async (url, init) => {
        calls++;
        expect(url).toBe('https://srv/teacher/summaries?from=2026-10-20&to=2026-10-20');
        expect(init.headers.Authorization).toBe('Bearer tok');
        if (fail) return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, json: async () => ({ summaries: [row] }) };
      },
    };
    const fold = doc.createElement('details'); fold.appendChild(doc.createElement('summary'));
    await R.fill(win, fold, '2026-10-20', 'G');
    expect(texts(fold)).toEqual(['Landed', '- Translations', 'Student questions', '- Is the SAT long?',
      'Promises', '- Quiz Thursday\n- Show Try-It site', 'deepseek-chat · recorded 20:50']);
    expect(fold.children[1].className).toBe('a2-rec-label');
    await R.fill(win, fold, '2026-10-20', 'D');
    expect(texts(fold)).toEqual(['No recording summary']);
    expect(calls).toBe(1);
    fail = true;
    await R.fill(win, fold, '2026-10-21', 'G');
    expect(texts(fold)).toEqual(['Recording summary unavailable']);
    await R.fill(win, fold, '2026-10-21', 'G');
    expect(calls).toBe(3); // a failure is not cached
    await R.fill({ ...win, rosterClient: null }, fold, '2026-10-22', 'G');
    expect(texts(fold)).toEqual(['Recording summary unavailable']);
    expect(fold.children[0].tag).toBe('summary');
  });

  it('does not cache a malformed success body; the next open fetches again', async () => {
    R._reset();
    const doc = fakeDoc();
    const bodies = [{ summaries: {} }, {}, { summaries: [row] }];
    let calls = 0;
    const win = {
      document: doc, ROSTER_SERVICE_URL: 'https://srv',
      rosterClient: { current: () => ({ role: 'teacher' }), token: () => 'tok' },
      fetch: async () => ({ ok: true, json: async () => bodies[calls++] }),
    };
    const fold = doc.createElement('details'); fold.appendChild(doc.createElement('summary'));
    await R.fill(win, fold, '2026-10-20', 'G');
    expect(texts(fold)).toEqual(['Recording summary unavailable']);
    await R.fill(win, fold, '2026-10-20', 'G');
    expect(texts(fold)).toEqual(['Recording summary unavailable']); // a missing field is not an empty day
    await R.fill(win, fold, '2026-10-20', 'G');
    expect(texts(fold)[0]).toBe('Landed');
    expect(calls).toBe(3);
  });
});

describe('class-log-summary: Desk wiring', () => {
  it('loads the script, adds the fold to the teacher day panel, and precaches it', () => {
    expect(DESK).toContain('<script src="lib/class-log-summary.js"></script>');
    expect(DESK).toMatch(/var rec = fold\('Recording'\);[\s\S]{0,120}ClassLogSummary\.fill\(window, rec, isoDate, section\)/);
    expect(DESK).toMatch(/\.a2-rec-label \{ font-variant: small-caps;/);
    expect(SW).toContain("'lib/class-log-summary.js',");
  });
});

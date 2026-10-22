// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const SOURCE = readFileSync(new URL('../lib/class-log-deck.js', import.meta.url), 'utf8');
const DESK = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const context = createContext({ module: { exports: {} }, Number, Promise });
runInContext(SOURCE, context);
const D = context.module.exports;

const items = n => Array.from({ length: n }, (_, i) => ({ id: 'item-000' + i }));
const deck = {
  cardId: 'c', course: 'algebra2', section: 'C', items: items(11),
  results: { sessions: 3, asked: 20, again: 4 },
  missed: [{ itemId: 'x', type: 'trap', front: '2f(x) is horizontal', again: 3 }, { itemId: 'y', type: 'anchor', front: 'b?', again: 1 }],
};

describe('class-log-deck: line', () => {
  it('renders items, sessions, again and the most missed item', () => {
    expect(D.line(deck)).toBe('Deck: 11 items · 3 sessions · 4 again (trap: "2f(x) is horizontal")');
    expect(D.line({ ...deck, missed: [], results: { sessions: 0, asked: 0, again: 0 } })).toBe('Deck: 11 items · 0 sessions · 0 again');
    expect(D.line({ ...deck, items: items(1), missed: undefined, results: { sessions: 1, again: 2 } })).toBe('Deck: 1 item · 1 session · 2 again');
    expect(D.line({ ...deck, results: null, missed: [{ front: ' ' }] })).toBe('Deck: 11 items · 0 sessions · 0 again');
  });
  it('no deck says so', () => {
    expect(D.line(null)).toBe('No deck');
  });
  it('picks the section deck, then the course-wide deck, Algebra 2 only', () => {
    const all = { ...deck, section: null, cardId: 'all' };
    const body = { decks: [{ ...deck, course: 'apstats', section: 'G' }, all, deck] };
    expect(D.pick(body, 'C')).toBe(deck);
    expect(D.pick(body, 'G')).toBe(all);
    expect(D.pick({ decks: [deck] }, 'G')).toBeNull();
    expect(D.pick(null, 'C')).toBeNull();
  });
});

function fakeDoc() {
  const make = tag => {
    const el = { tag, children: [], className: '', textContent: '',
      appendChild(c) { el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); } };
    Object.defineProperty(el, 'lastChild', { get: () => el.children[el.children.length - 1] || null });
    return el;
  };
  return { createElement: make };
}
const texts = el => el.children.map(c => c.textContent);

describe('class-log-deck: fill', () => {
  it('fetches once per date, renders the line, and says unavailable on failure (not cached)', async () => {
    D._reset();
    const doc = fakeDoc();
    let calls = 0, fail = false;
    const win = {
      document: doc, ROSTER_SERVICE_URL: 'https://srv',
      rosterClient: { current: () => ({ role: 'teacher' }), token: () => 'tok' },
      fetch: async (url, init) => {
        calls++;
        expect(url).toBe(fail ? 'https://srv/teacher/decks?date=2026-10-23' : 'https://srv/teacher/decks?date=2026-10-22');
        expect(init.headers.Authorization).toBe('Bearer tok');
        if (fail) return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, json: async () => ({ date: '2026-10-22', decks: [deck] }) };
      },
    };
    const host = doc.createElement('div');
    await D.fill(win, host, '2026-10-22', 'C');
    expect(texts(host)).toEqual(['Rehearsal', 'Deck: 11 items · 3 sessions · 4 again (trap: "2f(x) is horizontal")']);
    expect(host.children[0].className).toBe('a2-rec-label');
    await D.fill(win, host, '2026-10-22', 'G');
    expect(texts(host)).toEqual(['Rehearsal', 'No deck']);
    expect(calls).toBe(1);
    fail = true;
    await D.fill(win, host, '2026-10-23', 'C');
    expect(texts(host)).toEqual(['Rehearsal', 'Deck unavailable']);
    await D.fill(win, host, '2026-10-23', 'C');
    expect(calls).toBe(3);
    await D.fill({ ...win, rosterClient: null }, host, '2026-10-24', 'C');
    expect(texts(host)).toEqual(['Rehearsal', 'Deck unavailable']);
  });
  it('does not cache a malformed success body', async () => {
    D._reset();
    const doc = fakeDoc();
    const bodies = [{ decks: {} }, { decks: [deck] }];
    let calls = 0;
    const win = { document: doc, ROSTER_SERVICE_URL: 'https://srv', rosterClient: { current: () => ({ role: 'teacher' }), token: () => 't' },
      fetch: async () => ({ ok: true, json: async () => bodies[calls++] }) };
    const host = doc.createElement('div');
    await D.fill(win, host, '2026-10-22', 'C');
    expect(texts(host)[1]).toBe('Deck unavailable');
    await D.fill(win, host, '2026-10-22', 'C');
    expect(texts(host)[1]).toMatch(/^Deck: 11 items/);
  });
});

describe('class-log-deck: Desk wiring', () => {
  it('loads the script, adds the line right after the Recording fold, and precaches it', () => {
    expect(DESK).toContain('<script src="lib/class-log-summary.js"></script><script src="lib/class-log-deck.js"></script>');
    expect(DESK).toMatch(/ClassLogSummary\.fill\(window, rec, isoDate, section\);\s*\}\s*\/\/ Rehearsal[^\n]*\n\s*if \(isoDate && window\.ClassLogDeck\) \{[\s\S]{0,200}ClassLogDeck\.fill\(window, reh, isoDate, section\)/);
    expect(SW).toContain("'lib/class-log-deck.js',");
  });
});

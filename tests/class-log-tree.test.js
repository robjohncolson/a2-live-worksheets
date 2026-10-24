// @vitest-environment node
// Knowledge-tree Rehearsal line (KNOWLEDGE_TREE_SPEC.md WP-1 1.5): lib/class-log-tree.js.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const TREE = readFileSync(new URL('../lib/class-log-tree.js', import.meta.url), 'utf8');
const DECK = readFileSync(new URL('../lib/class-log-deck.js', import.meta.url), 'utf8');
const DESK = readFileSync(new URL('../desk.html', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const load = source => { const context = createContext({ module: { exports: {} }, Number, Promise, Math, Object, String, encodeURIComponent }); runInContext(source, context); return context.module.exports; };
const T = load(TREE);
const D = load(DECK);

const hex = n => n.toString(16).padStart(12, '0');
const items = Array.from({ length: 5 }, (_, i) => ({ id: hex(i), node: hex(i), lesson: '1-3', type: 'cue', front: `Front ${i}`, order: i + 1 }));
const deck = { cardId: 'c', course: 'algebra2', section: 'C', items, ready: 1, results: { sessions: 2, asked: 9, again: 2 }, missed: [] };
const row = (n, p, device = 's24') => ({ device, nodeId: hex(n), lesson: '1-3', p, asked: 2, again: 1 });
const rows = [row(0, 0.979), row(1, 0.502), row(2, 0.319), row(3, 0.8999999762), row(4, 0.1, 'tablet')];
// The lesson tree has the deck's five nodes plus two the deck left out.
const tree = { lesson: '1-3', nodes: [...items.map(item => ({ id: item.node, type: item.type, front: item.front })),
  { id: hex(10), type: 'anchor', front: 'Not in the deck, weak' }, { id: hex(11), type: 'anchor', front: '<b>Not in the deck, new</b>' }] };
const lessonRows = [...rows, row(10, 0.25)];

describe('class-log-tree: pure', () => {
  it('a tree deck has a node on every item', () => {
    expect(T.isTreeDeck(deck)).toBe(true);
    expect(T.isTreeDeck({ items: [{ id: 'a' }] })).toBe(false);
    expect(T.isTreeDeck({ items: [] })).toBe(false);
    expect(T.isTreeDeck(null)).toBe(false);
  });
  it('nodes: the deck items joined with this device only, least ready first, never-asked at the starting p', () => {
    const list = T.nodes(deck, rows);
    expect(list.map(n => [n.front, n.p, n.known])).toEqual([
      ['Front 4', null, false], ['Front 2', 0.319, false], ['Front 1', 0.502, false], ['Front 3', 0.8999999762, true], ['Front 0', 0.979, true]]);
    expect(T.weakest(list).front).toBe('Front 2');
    expect(T.weakest(T.nodes(deck, []))).toBeNull();
  });
  it('lessonNodes: every node of the lesson tree, sorted by p; the deck items without a tree', () => {
    expect(T.lessonNodes([tree], deck, lessonRows).map(n => n.front)).toEqual([
      'Front 4', '<b>Not in the deck, new</b>', 'Not in the deck, weak', 'Front 2', 'Front 1', 'Front 3', 'Front 0']);
    expect(T.lessonNodes([], deck, rows).map(n => n.front)).toEqual(T.nodes(deck, rows).map(n => n.front));
  });
  it('ready is scoped to the deck items, counted from fresh mastery; the server count when mastery failed', () => {
    expect(T.readyCount(deck, [...lessonRows, row(11, 0.99)])).toBe(2);
    expect(T.readyCount(deck, null)).toBe(1);
    expect(T.readyCount({ ...deck, ready: null }, null)).toBeNull();
  });
  it('line: items, ready, sessions, weakest (a deck item)', () => {
    expect(T.line(deck, T.nodes(deck, rows), 2)).toBe('Deck: 5 items · 2 ready · 2 sessions · weakest: "Front 2"');
    expect(T.line({ ...deck, ready: null, results: null }, T.nodes(deck, []))).toBe('Deck: 5 items · 0 sessions');
    expect(T.line({ ...deck, ready: 0 }, [])).toBe('Deck: 5 items · 0 ready · 2 sessions');
  });
});

function fakeDoc() {
  const make = tag => {
    const el = { tag, children: [], className: '', textContent: '', style: {},
      appendChild(c) { el.children.push(c); return c; },
      removeChild(c) { el.children.splice(el.children.indexOf(c), 1); } };
    Object.defineProperty(el, 'lastChild', { get: () => el.children[el.children.length - 1] || null });
    Object.defineProperty(el, 'innerHTML', { set() { throw new Error('innerHTML is never used'); } });
    return el;
  };
  return { createElement: make };
}
const teacherWin = (doc, fetch) => ({ document: doc, ROSTER_SERVICE_URL: 'https://srv', ClassLogTree: T,
  rosterClient: { current: () => ({ role: 'teacher' }), token: () => 'tok' }, fetch });

describe('class-log-tree: fill through the deck line', () => {
  it('shows the tree line and one bar per lesson node; mastery and the tree file are fetched again on every panel open', async () => {
    D._reset(); T._reset();
    const doc = fakeDoc();
    const urls = [];
    let masteryRows = lessonRows;
    const win = teacherWin(doc, async (url, init) => {
      urls.push(url);
      if (url.includes('/teacher/decks')) return { ok: true, json: async () => ({ decks: [deck] }) };
      if (url.includes('/teacher/mastery')) return { ok: true, json: async () => ({ rows: masteryRows }) };
      expect(init.headers).toBeUndefined(); // the static tree file goes out without the teacher token
      return { ok: true, json: async () => tree };
    });
    const host = doc.createElement('div');
    await D.fill(win, host, '2026-10-26', 'C');
    expect(host.children.map(c => c.textContent).slice(0, 2)).toEqual(['Rehearsal', 'Deck: 5 items · 2 ready · 2 sessions · weakest: "Front 2"']);
    const list = host.children[2];
    expect(list.className).toBe('a2-tree-list');
    expect(list.children.map(li => li.children[1].textContent)).toEqual([
      'new · Front 4', 'new · <b>Not in the deck, new</b>', '25% · Not in the deck, weak', '32% · Front 2', '50% · Front 1', '90% · Front 3', '98% · Front 0']);
    expect(list.children[3].children[0].children[0].style.width).toBe('32%');
    expect(list.children[5].className).toBe('a2-tree-node known');
    expect(urls).toEqual(['https://srv/teacher/decks?date=2026-10-26', 'https://srv/teacher/mastery?course=algebra2&lesson=1-3', 'content/a2/lesson-trees/1-3.json']);
    // The phone pushed more mastery: the next panel open shows it, ready included.
    masteryRows = [...lessonRows, row(1, 0.93)];
    await D.fill(win, host, '2026-10-26', 'C');
    expect(host.children[1].textContent).toBe('Deck: 5 items · 3 ready · 2 sessions · weakest: "Front 2"');
    expect(urls.filter(url => url.includes('/teacher/mastery'))).toHaveLength(2);
    expect(urls.filter(url => url.includes('lesson-trees'))).toHaveLength(2);
  });
  it('shares a request already in flight', async () => {
    D._reset(); T._reset();
    const doc = fakeDoc();
    let mastery = 0;
    const win = teacherWin(doc, async url => {
      if (url.includes('/teacher/decks')) return { ok: true, json: async () => ({ decks: [deck] }) };
      if (url.includes('/teacher/mastery')) mastery++;
      return { ok: true, json: async () => (url.includes('mastery') ? { rows } : tree) };
    });
    await Promise.all([D.fill(win, doc.createElement('div'), '2026-10-26', 'C'), D.fill(win, doc.createElement('div'), '2026-10-26', 'C')]);
    expect(mastery).toBe(1);
  });
  it('a mastery failure shows every node new with the server ready; no tree file lists the deck items; a nodeless deck keeps the old line', async () => {
    D._reset(); T._reset();
    const doc = fakeDoc();
    const plain = { ...deck, items: items.map(({ node, lesson, ...rest }) => rest), missed: [{ type: 'trap', front: 'x' }], results: { sessions: 1, again: 3 } };
    const win = teacherWin(doc, async url => (url.includes('/teacher/decks')
      ? { ok: true, json: async () => ({ decks: [deck, { ...plain, section: 'G' }] }) }
      : { ok: false, status: url.includes('mastery') ? 503 : 404, json: async () => ({}) }));
    const host = doc.createElement('div');
    await D.fill(win, host, '2026-10-26', 'C');
    expect(host.children[1].textContent).toBe('Deck: 5 items · 1 ready · 2 sessions');
    expect(host.children[2].children).toHaveLength(5);
    expect(host.children[2].children.every(li => li.children[1].textContent.startsWith('new · '))).toBe(true);
    await D.fill(win, host, '2026-10-26', 'G');
    expect(host.children.map(c => c.textContent)).toEqual(['Rehearsal', 'Deck: 5 items · 1 session · 3 again (trap: "x")']);
  });
});

describe('class-log-tree: Desk wiring', () => {
  it('loads the script and precaches it, but never the per-lesson tree files', () => {
    expect(DESK).toContain('<script src="lib/a2-tomorrow.js"></script><script src="lib/class-log-tree.js"></script>');
    expect(SW).toContain("'lib/class-log-tree.js',");
    const core = SW.slice(SW.indexOf('const CORE'), SW.indexOf('];', SW.indexOf('const CORE')));
    expect(core).toContain("'lib/class-log-tree.js'");
    expect(core).not.toContain('lesson-trees');
    expect(SW).toContain("url.pathname.includes('/content/a2/lesson-trees/')) return 'passthrough'");
  });
});

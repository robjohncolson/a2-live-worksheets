// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = readFileSync('desk.html', 'utf8');
const roadmap = JSON.parse(readFileSync('roadmap-data.json', 'utf8'));
const panelSource = html.slice(html.indexOf('function _showA2ResourcePanel('), html.indexOf('var _lastResourcePanel = null;'));
const bumpSource = html.slice(html.indexOf('function maybeBumpThenOpen('), html.indexOf('// Quarter-band labels'));

function calendar(viewAs = false) {
  const dom = new JSDOM('<div id="cell"></div><div id="resource-overlay" style="display:none"><h2 id="resource-header"></h2><div id="resource-body"></div></div>', { url: 'https://desk.test/desk.html' });
  const c = dom.window.document.getElementById('cell');
  const openDayGrade = vi.fn();
  const openBlooketFlashcards = vi.fn();
  const context = createContext({
    document: dom.window.document,
    window: { A2Desk: { getLesson: () => ({ supportingSkills: [
      { name: 'Read a graph', url: 'https://www.ixl.com/math/algebra-2/domain-and-range', level: 'prereq' },
    ] }), getStatus: () => ({ tryIts: { scored: 2, total: 5, points: 3, scores: [] }, lessonCheck: null, flashcardPassed: false }) } },
    REGISTRY: roadmap, getRegistryEntry: () => null, _donowData: null, _bumpAcked: false, _lastResourcePanel: null,
    _viewAsContext: () => viewAs ? { studentId: 'student-123' } : null, hTip: vi.fn(), openDayGrade, openBlooketFlashcards,
    c, inf: { t: '1.1' }, ds: 'Sep 16',
  });
  const click = html.match(/c\.onclick=\(\)=>\{hTip\(\);maybeBumpThenOpen[^\n]+/)[0];
  const doubleClick = html.match(/c\.ondblclick=\(ev\)=>[^\n]+/)[0];
  runInContext(readFileSync('a2-client.js', 'utf8'), context, { filename: pathToFileURL(resolve('a2-client.js')).href });
  runInContext(panelSource + bumpSource + click + '\n' + doubleClick, context, { filename: pathToFileURL(resolve('desk.html')).href });
  return { dom, c, context, openDayGrade, openBlooketFlashcards };
}

describe('A2 calendar resource panel', () => {
  it.each([false, true])('opens the lesson panel on click, including view-as=%s', viewAs => {
    const { dom, c, openDayGrade, openBlooketFlashcards } = calendar(viewAs);
    try {
      c.click();
      const doc = dom.window.document;
      expect(doc.getElementById('resource-overlay').style.display).toBe('block');
      expect(doc.querySelector('#resource-body a[href*="check.html"]')).toBeNull();
      const deck = doc.querySelector('#resource-body button');
      deck.click();
      expect(openBlooketFlashcards).toHaveBeenCalledWith(deck, '1.1');
      expect(doc.querySelector('#resource-body a[target="_blank"]').textContent).toContain('IXL: Read a graph');
      expect(doc.getElementById('resource-body').textContent.includes('Try-Its 2/5')).toBe(!viewAs);
      // A real double click dispatches clicks before dblclick; neither click navigates away.
      c.click();
      c.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      expect(openDayGrade).toHaveBeenCalledWith('Sep 16');
    } finally { dom.window.close(); }
  });

  it('opens the deck with optional lesson metadata and status absent', () => {
    const { dom, c, context } = calendar();
    try {
      context.window.A2Desk = { getLesson: () => ({}) };
      c.click();
      expect(dom.window.document.querySelector('#resource-body a[href*="check.html"]')).toBeNull();
      expect(dom.window.document.querySelector('#resource-body button').textContent).toBe('Open Flashcards');
      expect(dom.window.document.querySelector('#resource-body .a2-lesson-chip')).toBeNull();
    } finally { dom.window.close(); }
  });
});


describe('A2 resource panel grade-cache fallback', () => {
  it.each([false, true])('renders cached status without A2Desk status, view-as=%s', viewAs => {
    const { dom, c, context } = calendar(viewAs);
    try {
      context.window.A2Desk.getStatus = vi.fn(() => undefined);
      const cached = { lessonKey: '1.1', tryIts: { scored: 3, total: 5, points: 6 }, lessonCheck: 80, flashcardPassed: true };
      context.window._gradeLessonsCache = [null, { lessonKey: '1.2' }, cached];
      const before = JSON.stringify(cached);
      c.click();
      const summary = dom.window.document.querySelector('#resource-body .a2-lesson-chip').textContent;
      expect(summary).toContain('Try-Its 3/5 scored, 6 points');
      expect(summary).not.toContain('Lesson check 80%');
      expect(summary).not.toContain('Flashcards passed');
      expect(JSON.stringify(cached)).toBe(before);
      if (viewAs) expect(context.window.A2Desk.getStatus).not.toHaveBeenCalled();
    } finally { dom.window.close(); }
  });

  it.each([{}, { tryIts: {} }, { tryIts: { scores: [{ score: 2 }] } }])('guards partial cached entries: %j', fields => {
    const { dom, c, context } = calendar();
    try {
      context.window.A2Desk.getStatus = () => undefined;
      const cached = { lessonKey: '1-1', ...fields };
      context.window._gradeLessonsCache = [null, cached];
      const before = JSON.stringify(cached);
      c.click();
      const summary = dom.window.document.querySelector('#resource-body .a2-lesson-chip').textContent;
      expect(summary).toContain('Try-Its 0/' + (fields.tryIts?.scores?.length || 0) + ' scored, 0 points');
      expect(summary).not.toContain('Lesson check not attempted');
      expect(summary).not.toContain('Flashcards not passed');
      expect(summary).not.toMatch(/undefined|NaN/);
      expect(JSON.stringify(cached)).toBe(before);
    } finally { dom.window.close(); }
  });
});

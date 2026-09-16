// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const html = readFileSync('desk.html', 'utf8');
const roadmap = JSON.parse(readFileSync('roadmap-data.json', 'utf8'));
const panelSource = html.slice(html.indexOf('function _showA2ResourcePanel('), html.indexOf('var _lastResourcePanel = null;'));
const bumpSource = html.slice(html.indexOf('function maybeBumpThenOpen('), html.indexOf('// Quarter-band labels'));

function calendar(viewAs = false) {
  const dom = new JSDOM('<div id="cell"></div><div id="resource-overlay" style="display:none"><h2 id="resource-header"></h2><div id="resource-body"></div></div><div id="a2-lessons"><article data-lesson="1-1"><span class="a2-lesson-chip">Try-Its 2/5 scored, 3 points</span></article></div>', { url: 'https://desk.test/desk.html' });
  const c = dom.window.document.getElementById('cell');
  const openDayGrade = vi.fn();
  const openBlooketFlashcards = vi.fn();
  const context = createContext({
    document: dom.window.document,
    window: { A2Desk: { getLesson: () => ({ supportingSkills: [
      { name: 'Read a graph', url: 'https://www.ixl.com/math/algebra-2/domain-and-range', level: 'prereq' },
    ] }) } },
    REGISTRY: roadmap, _donowData: null, _bumpAcked: false, _lastResourcePanel: null,
    _viewAsContext: () => viewAs ? { studentId: 'student-123' } : null, hTip: vi.fn(), openDayGrade, openBlooketFlashcards,
    c, inf: { t: '1.1' }, ds: 'Sep 16',
  });
  const click = html.match(/c\.onclick=\(\)=>\{hTip\(\);maybeBumpThenOpen[^\n]+/)[0];
  const doubleClick = html.match(/c\.ondblclick=\(ev\)=>[^\n]+/)[0];
  runInContext(panelSource + bumpSource + click + '\n' + doubleClick, context);
  return { dom, c, context, openDayGrade, openBlooketFlashcards };
}

describe('A2 calendar resource panel', () => {
  it.each([false, true])('opens the lesson panel on click, including view-as=%s', viewAs => {
    const { dom, c, openDayGrade, openBlooketFlashcards } = calendar(viewAs);
    try {
      c.click();
      const doc = dom.window.document;
      expect(doc.getElementById('resource-overlay').style.display).toBe('block');
      const check = doc.querySelector('#resource-body a');
      expect(check.textContent).toBe('Open lesson check');
      const href = check.getAttribute('href');
      if (viewAs) {
        expect(href).toBe('check.html?lesson=1-1&viewAsUserId=student-123');
      } else {
        expect(href).toBe('check.html?lesson=1-1');
        expect(href).not.toContain('viewAsUserId');
      }
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

  it('opens the check and deck with optional lesson metadata and status absent', () => {
    const { dom, c, context } = calendar();
    try {
      context.window.A2Desk = undefined;
      dom.window.document.getElementById('a2-lessons').remove();
      c.click();
      expect(dom.window.document.querySelector('#resource-body a').getAttribute('href')).toBe('check.html?lesson=1-1');
      expect(dom.window.document.querySelector('#resource-body button').textContent).toBe('Open Flashcards');
      expect(dom.window.document.querySelector('#resource-body .a2-lesson-chip')).toBeNull();
    } finally { dom.window.close(); }
  });
});

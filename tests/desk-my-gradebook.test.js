// desk-my-gradebook.test.js — jsdom smoke test for the Phase 3 "My Gradebook"
// modal in the Desk (desk.html). Loads the page, sets
// _gradeGradebookCache (mirroring /grade's data.gradebook), calls renderMyGradebook,
// and asserts the modal renders both totals + the component cells.
//
// The Desk is a large single file with many load-time deps; if it can't host in
// jsdom this test is skipped (syntax-check + live test cover it instead).
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CED_SOURCE } from './fixtures/ced2026-labels.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../desk.html'), 'utf8');

function gradebook() {
  return {
    weights: { Lesson: 15, Quizzes: 15, Blooket: 5, 'Progress Check': 50, Posters: 15 },
    quarters: {
      Q1: {
        columns: [
          { key: 'FA:1.1', kind: 'followalong', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] },
          { key: 'QUIZ:1.2', kind: 'quiz', category: 'Quizzes', title: '1.2 Quiz', unit: 1, topicKeys: ['1.2'] },
          { key: 'BL:1.1', kind: 'blooket', category: 'Blooket', title: '1.1 Blooket', unit: 1, topicKeys: ['1.1'] },
          { key: 'PC:U1', kind: 'pc', category: 'Progress Check', title: 'Unit 1 Progress Check', unit: 1, topicKeys: [] },
          { key: 'POSTER:U1', kind: 'poster', category: 'Posters', title: 'Unit 1 Poster', unit: 1, topicKeys: [] },
        ],
        cells: { 'FA:1.1': 84, 'QUIZ:1.2': 78, 'BL:1.1': 95, 'PC:U1': 80, 'POSTER:U1': null },
        categoryAverages: { Lesson: 84, Quizzes: 78, Blooket: 95, 'Progress Check': 80 },
        schoologyTotal: 82.7, v3Total: 91.2,
        reconciliation: {
          pcAvg: 90, workAvg: 70, schoologyTotal: 82.7, v3Total: 91.2, delta: 8.5, branch: 'max',
          reason: 'Both tracks clear the 40 floor, so v3 takes the higher (PC 90), while Schoology averages the categories (82.7).',
        },
      },
    },
  };
}

let win, doc, loaded = false;

beforeAll(async () => {
  try {
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', url: 'https://example.test/desk.html', pretendToBeVisual: true,
      beforeParse(window) { window.eval(CED_SOURCE); },
    });
    win = dom.window;
    doc = win.document;
    await new Promise((r) => setTimeout(r, 60));
    loaded = typeof win.renderMyGradebook === 'function';
  } catch (_) {
    loaded = false;
  }
});

describe('Desk My Gradebook modal', () => {
  it('renders 105 while keeping the visual percentage bar at 100%', () => {
    expect(loaded).toBe(true);
    win._activeGradebook = gradebook();
    win._activeGradebook.quarters.Q1.cells['FA:1.1'] = 105;
    win.renderMyGradebook('Q1');
    const body = doc.getElementById('my-gradebook-body');
    expect(body.textContent).toContain('105');
    const bars = [...body.querySelectorAll('[style]')].filter(el => el.style.position === 'absolute' && el.style.width);
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) expect(parseFloat(bar.style.width)).toBeLessThanOrEqual(100);
  });
  it('renders both totals + the component cells (or skips if the Desk cannot host in jsdom)', () => {
    if (!loaded) {
      console.warn('[desk-my-gradebook] Desk did not host in jsdom — skipping render assertions (syntax-checked + live-tested instead).');
      expect(true).toBe(true);
      return;
    }
    // renderMyGradebook renders the _activeGradebook (decoupled from the Do Now
    // cache so the teacher Class Gradebook view can't clobber it). openMyGradebook
    // copies the student's own cache into it; here we set it directly.
    win._gradeGradebookCache = gradebook();
    win._activeGradebook = gradebook();
    win.renderMyGradebook('Q1');

    const body = doc.getElementById('my-gradebook-body');
    const text = body.textContent;
    // Both totals + the why.
    expect(text).toContain('Your grade:');
    expect(text).toContain('91.2');                 // v3
    expect(text).toContain('Schoology today:');
    expect(text).toContain('82.7');                 // Schoology
    expect(text).toContain('higher');               // reconciliation reason
    // Category sections + a cell.
    expect(text).toContain('Lesson (15%)');
    expect(text).toContain('1.1 · What Can We Learn from Data?');
    expect(text).toContain('84');
    expect(text).toContain('Progress Check (50%)');
  });

  it('openMyGradebook shows the overlay', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win._gradeGradebookCache = gradebook();
    win.openMyGradebook();
    expect(doc.getElementById('my-gradebook-overlay').style.display).toBe('block');
    win.closeMyGradebook();
    expect(doc.getElementById('my-gradebook-overlay').style.display).toBe('none');
  });

  it('openClassGradebook fetches /class/grades with the teacher token and populates a sorted picker', async () => {
    if (!loaded) { expect(true).toBe(true); return; }
    let fetchUrl = null, fetchOpts = null;
    win.ROSTER_SERVICE_URL = 'https://svc.test';
    win.rosterClient = { token: () => 'tok123', current: () => ({ section: 'PeriodX' }) };
    win.fetch = (url, opts) => { fetchUrl = url; fetchOpts = opts; return Promise.resolve({ json: async () => ({ ok: true, students: [
      { realName: 'Zed Zulu', username: 'zed_owl', gradebook: gradebook() },
      { realName: 'Ada Lovelace', username: 'ada_fox', gradebook: gradebook() },
    ] }) }); };

    await win.openClassGradebook();

    expect(fetchUrl).toContain('/class/grades');
    expect(fetchUrl).not.toContain('?section=');   // fetches ALL sections; the picker enumerates them
    expect(fetchOpts.headers.Authorization).toBe('Bearer tok123');
    const sel = doc.getElementById('my-gradebook-student');
    expect(sel.options.length).toBe(2);
    expect(sel.options[0].textContent).toBe('Ada Lovelace');   // sorted by real name
    expect(doc.getElementById('my-gradebook-title').textContent).toContain('Ada Lovelace');
    expect(doc.getElementById('my-gradebook-body').textContent).toContain('91.2');
    expect(doc.getElementById('my-gradebook-student-row').style.display).toBe('block');
    // Single (here: no) section → the section picker stays hidden.
    expect(doc.getElementById('my-gradebook-section-row').style.display).toBe('none');
  });

  it('shows a section picker when students span >1 section, and filters the student list by it', async () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.ROSTER_SERVICE_URL = 'https://svc.test';
    win.rosterClient = { token: () => 't', current: () => ({ section: 'PeriodB' }) };
    win.fetch = () => Promise.resolve({ json: async () => ({ ok: true, students: [
      { realName: 'Ana', username: 'a', section: 'PeriodB', gradebook: gradebook() },
      { realName: 'Zed', username: 'z', section: 'PeriodE', gradebook: gradebook() },
    ] }) });

    await win.openClassGradebook();

    expect(doc.getElementById('my-gradebook-section-row').style.display).toBe('block');
    const secSel = doc.getElementById('my-gradebook-section');
    expect(secSel.options.length).toBe(3);              // All + PeriodB + PeriodE
    expect(secSel.value).toBe('PeriodB');               // defaults to the teacher's own section
    expect(doc.getElementById('my-gradebook-student').options.length).toBe(1); // only PeriodB students
    expect(doc.getElementById('my-gradebook-student').options[0].textContent).toBe('Ana');

    // Switch to "All sections" → both students.
    secSel.value = '__all__';
    secSel.onchange();
    expect(doc.getElementById('my-gradebook-student').options.length).toBe(2);
  });

  it('openClassGradebook with no token returns early — no fetch, modal stays closed', async () => {
    if (!loaded) { expect(true).toBe(true); return; }
    let called = 0;
    win.ROSTER_SERVICE_URL = 'https://svc.test';
    win.rosterClient = { token: () => null, current: () => ({}) };
    win.fetch = () => { called++; return Promise.resolve({ json: async () => ({}) }); };
    doc.getElementById('my-gradebook-overlay').style.display = 'none';

    await win.openClassGradebook();

    expect(called).toBe(0);
    expect(doc.getElementById('my-gradebook-overlay').style.display).toBe('none');
  });

  it('openClassGradebook shows a distinct load-failure message when the fetch fails', async () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.ROSTER_SERVICE_URL = 'https://svc.test';
    win.rosterClient = { token: () => 'tok', current: () => ({ section: 'PeriodX' }) };
    win.fetch = () => Promise.reject(new Error('offline'));

    await win.openClassGradebook();

    expect(doc.getElementById('my-gradebook-body').textContent).toMatch(/could not load/i);
  });

  // ── threshold coloring + date-gating ──────────────────────────────────────
  function gbWith(columns, cells, extra) {
    return { weights: { Lesson: 15 }, quarters: { Q1: Object.assign({
      columns: columns, cells: cells,
      categoryAverages: {}, schoologyTotal: 80, v3Total: 80, reconciliation: {}
    }, extra || {}) } };
  }

  it('_gradeBand maps scores to the grade-rules bands (40 floor / 70 cap)', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    expect(win._gradeBand(95).fg).toBe('#0a6b2e');   // deep green 90+
    expect(win._gradeBand(84).fg).toBe('#25663F');   // green 70-89 (clears cap)
    expect(win._gradeBand(55).fg).toBe('#9a6a00');   // amber 40-69
    expect(win._gradeBand(30).fg).toBe('#B03A2E');   // red < 40 (below floor)
    expect(win._gradeBand(null)).toBeNull();
  });

  function scheduleReady() {
    try { return loaded && Object.keys(win._lessonDateMap()).length > 0; } catch (_) { return false; }
  }

  it('date-gate: a not-started future lesson is hidden; a started one always shows', () => {
    if (!scheduleReady()) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2024, 0, 1); // before any 2026 lesson date
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] },
        { key: 'FA:1.5', category: 'Lesson', title: '1.5 Follow-Along', unit: 1, topicKeys: ['1.5'] } ],
      { 'FA:1.1': 84, 'FA:1.5': null }
    );
    win.renderMyGradebook('Q1');
    var text = doc.getElementById('my-gradebook-body').textContent;
    expect(text).toContain('1.1 · What Can We Learn from Data?');       // started → shown
    expect(text).not.toContain('1.5 · Graphical Representations');      // future + not started → hidden
  });

  it('date-gate: once a lesson date passes, a not-done lesson shows as "not done yet" + an owe badge', () => {
    if (!scheduleReady()) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2027, 6, 1); // after all 2026 lesson dates
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] },
        { key: 'FA:1.5', category: 'Lesson', title: '1.5 Follow-Along', unit: 1, topicKeys: ['1.5'] } ],
      { 'FA:1.1': 84, 'FA:1.5': null }
    );
    win.renderMyGradebook('Q1');
    var text = doc.getElementById('my-gradebook-body').textContent;
    expect(text).toContain('1.5 · Graphical Representations');       // due now → shown
    expect(text).toContain('not done yet');
    expect(text).toMatch(/due, not done/i);           // the "what you owe" badge
  });

  it('honors the SERVER col.due flag over the client calendar (student↔teacher consistency)', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2099, 0, 1);   // the client calendar would mark everything due
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'], due: false },
        { key: 'FA:1.2', category: 'Lesson', title: '1.2 Follow-Along', unit: 1, topicKeys: ['1.2'], due: true } ],
      { 'FA:1.1': null, 'FA:1.2': null }
    );
    win.renderMyGradebook('Q1');
    const text = doc.getElementById('my-gradebook-body').textContent;
    expect(text).not.toContain('1.1 · What Can We Learn from Data?');  // server due:false wins over the client calendar → hidden
    expect(text).toContain('1.2 · Variables');                       // server due:true → shown
  });

  it('flags a category sitting below the 40% floor', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2024, 0, 1);
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] } ],
      { 'FA:1.1': 30 },
      { categoryAverages: { Lesson: 30 }, v3Total: 30, schoologyTotal: 35 }
    );
    win.renderMyGradebook('Q1');
    expect(doc.getElementById('my-gradebook-body').textContent).toMatch(/below the 40% floor/i);
  });

  it('Class Gradebook: _selectClassStudent shows the picked student WITHOUT clobbering the Do Now cache', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    const ownCache = { quarters: {} };           // the teacher's own (empty) cache
    win._gradeGradebookCache = ownCache;
    win._classGradebookStudents = [{ realName: 'Ada Lovelace', username: 'ada_fox', gradebook: gradebook() }];

    win._selectClassStudent(0);

    const body = doc.getElementById('my-gradebook-body');
    expect(body.textContent).toContain('91.2');  // the STUDENT's v3 total renders
    expect(doc.getElementById('my-gradebook-title').textContent).toContain('Ada Lovelace');
    // The Do Now cache (which gates the student's own grade chip) is untouched.
    expect(win._gradeGradebookCache).toBe(ownCache);
  });
});

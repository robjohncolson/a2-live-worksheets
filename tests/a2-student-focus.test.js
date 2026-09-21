import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { bootDesk } from './journeys/harness.js';

const dayLog = JSON.parse(readFileSync('content/a2/day-log.json', 'utf8'));
const cTuesday = dayLog.entries.find(entry => entry.section === 'C' && entry.date === '2026-09-22').student;

function cell(win, iso) {
  return [...win.document.querySelectorAll('#cg .dc')].find(node =>
    node.dataset.dts && win._a2IsoDate(new win.Date(+node.dataset.dts)) === iso);
}

function visibleText(win) {
  const walker = win.document.createTreeWalker(win.document.body, win.NodeFilter.SHOW_TEXT);
  const visible = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!/Try-?Its?|scored|Lesson check|On pace|Landed/.test(node.textContent)) continue;
    let parent = node.parentElement, hidden = false;
    while (parent) {
      if (['SCRIPT', 'STYLE'].includes(parent.tagName) || parent.hidden) { hidden = true; break; }
      const style = win.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') { hidden = true; break; }
      parent = parent.parentElement;
    }
    if (!hidden) visible.push(node.textContent);
  }
  return visible.join(' ');
}

it.each(['signed-out', 'student'])('%s sees only the focused student Desk', async role => {
  const desk = await bootDesk({ now: '2026-09-22T16:00:00Z' });
  const win = desk.window;
  try {
    if (role === 'student') await desk.signIn('alpha_otter');
    await win.A2Desk.refresh();
    await vi.waitFor(() => expect(win.eval('A2_DAY_LOG.entries.length')).toBeGreaterThan(0));
    win.setP('C'); win.calToday(); await win.renderDoNow();
    expect(win.a2FocusedView()).toBe(true);
    expect(win.A2_SHOW_TRYIT_GRADES).toBe(false);
    expect(cell(win, '2026-09-21').textContent).toBe('');
    expect(cell(win, '2026-09-21').onmouseenter).toBeNull();
    expect(cell(win, '2026-09-21').hasAttribute('title')).toBe(false);
    expect(cell(win, '2026-09-22').textContent).toBe('1-1 · Key Features of Functions' + cTuesday);
    expect(cell(win, '2026-09-22').classList.contains('cell-today')).toBe(true);
    expect(cell(win, '2026-09-23').textContent).toBe('');
    expect(cell(win, '2026-09-28').textContent).toBe('1-2 · Transformations of Functions');
    expect(win.document.getElementById('donow-msg').textContent).toBe('Today: ' + cTuesday);
    expect(win.getComputedStyle(win.document.querySelector('.prog-area')).display).toBe('none');
    cell(win, '2026-09-22').click();
    expect(win.document.getElementById('resource-body').textContent).toContain('Open Flashcards');
    expect(win.document.querySelector('#resource-body .desk-day-log')).toBeNull();
    expect(win.document.querySelector('#resource-body .a2-lesson-chip')).toBeNull();
    expect(visibleText(win)).not.toMatch(/Try-?Its?|scored|Lesson check|On pace|Landed/);
    win.eval('_calPageOffset = 2'); win.rCal();
    expect(cell(win, '2026-10-05').textContent).toBe('');
    win.eval('_calPageOffset = 7'); win.rCal();
    expect(cell(win, '2026-11-09').textContent).toBe('Topic 1 Assessment');
    expect(cell(win, '2026-11-10').textContent).toBe('');
  } finally { win.close(); }
}, 15000);

it('uses the next meeting on a non-meeting day', async () => {
  const desk = await bootDesk({ now: '2026-09-23T16:00:00Z' });
  try {
    await desk.window.A2Desk.refresh(); desk.window.setP('C');
    await desk.window.renderDoNow();
    expect(desk.document.getElementById('donow-msg').textContent).toBe('Next class Thursday: 1-1 Quiz');
  } finally { desk.window.close(); }
});

it('keeps teacher details and focuses the page after sign-out', async () => {
  const desk = await bootDesk({ now: '2026-09-21T16:00:00Z' });
  const win = desk.window;
  try {
    await desk.signIn('teacher_one', 'teacher-pass');
    await win.A2Desk.refresh();
    await vi.waitFor(() => expect(win.eval('A2_DAY_LOG.entries.length')).toBeGreaterThan(0));
    win.setP('C'); win.calToday();
    expect(win.a2FocusedView()).toBe(false);
    expect(cell(win, '2026-09-21').getAttribute('aria-label')).toContain('Landed: Blooket opener');
    expect(cell(win, '2026-09-21').onmouseenter).toBeTypeOf('function');
    expect(win.getComputedStyle(win.document.querySelector('.prog-area')).display).not.toBe('none');
    cell(win, '2026-09-21').dispatchEvent(new win.MouseEvent('mouseenter'));
    expect(win.document.getElementById('tip').textContent).toContain('Landed');
    win.localStorage.removeItem('a2_roster.v1');
    win.dispatchEvent(new win.StorageEvent('storage', { key: 'a2_roster.v1' }));
    expect(win.document.getElementById('tip').style.display).toBe('none');
    expect(win.document.getElementById('tip').textContent).toBe('');
    expect(win.a2FocusedView()).toBe(true);
    expect(win.document.documentElement.classList.contains('a2-focused')).toBe(true);
  } finally { win.close(); }
}, 15000);


it('uses identity and view-as sections for Do Now, and refreshes visitors on pill changes', async () => {
  const desk = await bootDesk({ now: '2026-09-22T16:00:00Z' });
  const win = desk.window;
  try {
    await win.A2Desk.refresh();
    await vi.waitFor(() => expect(win.eval('A2_DAY_LOG.entries.length')).toBeGreaterThan(0));
    win.setP('D');
    await vi.waitFor(() => expect(desk.document.getElementById('donow-msg').textContent).toBe('Next class Wednesday: Try It 5, then Example 4'));
    await desk.signIn('alpha_otter');
    win.setP('D');
    await vi.waitFor(() => expect(desk.document.getElementById('donow-msg').textContent).toBe('Today: ' + cTuesday));
    await desk.signIn('teacher_one', 'teacher-pass');
    win.sessionStorage.setItem('a2_view_as_context', JSON.stringify({ studentId: 'stu-beta', section: 'G' }));
    win.dispatchEvent(new win.Event('roster-session-changed'));
    win.setP('C');
    await vi.waitFor(() => expect(desk.document.getElementById('donow-msg').textContent).toBe('Today: ' + dayLog.entries.find(entry => entry.section === 'G' && entry.date === '2026-09-22').student));
  } finally { win.close(); }
}, 15000);

it('uses the configured notebook fallback, preferring a lesson link and omitting an empty URL', async () => {
  const desk = await bootDesk({ now: '2026-09-22T16:00:00Z' });
  const win = desk.window;
  try {
    await win.A2Desk.refresh();
    await vi.waitFor(() => expect(win.eval('A2_DAY_LOG.entries.length')).toBeGreaterThan(0));
    const lesson = win.A2Desk.getLesson('1.1');
    const open = () => { win.setP('C'); win.calToday(); cell(win, '2026-09-22').click(); };
    const notebook = () => [...desk.document.querySelectorAll('#resource-body a')].find(link => link.textContent === 'OneNote notebook');
    // Each section has its own notebook; the viewed section (pill C here) picks it.
    win.eval('A2_DAY_LOG.resources.notebookUrlBySection = { C: "", D: "https://example.org/d" }');
    open(); expect(notebook()).toBeUndefined();
    win.eval('A2_DAY_LOG.resources.notebookUrlBySection.C = "https://example.org/notebook"');
    open(); expect(notebook().href).toBe('https://example.org/notebook');
    lesson.onenoteUrl = 'https://example.org/lesson';
    open(); expect(notebook().href).toBe('https://example.org/lesson');
  } finally { win.close(); }
});

it.each(['signed-out', 'student', 'teacher'])('filters scored receipts and counts for %s, including durable and signed payload sources', async role => {
  const desk = await bootDesk({ now: '2026-09-22T16:00:00Z' });
  const win = desk.window;
  const receipt = (src, id) => ({ id, compact: Buffer.from(JSON.stringify({ src, item: id, ts: 123, score: 9 })).toString('base64url') + '.signature' });
  try {
    if (role === 'student') await desk.signIn('alpha_otter');
    if (role === 'teacher') await desk.signIn('teacher_one', 'teacher-pass');
    win.localStorage.setItem('desk_receipts_v1', JSON.stringify([receipt('try-it', 'packet'), receipt('blooket', 'deck')]));
    win.gradebookClient.fetchReceipts = async () => [receipt('lesson-check', 'check'), receipt('worksheet', 'sheet')];
    win.openMyReceipts();
    await win.renderMyReceipts();
    const body = desk.document.getElementById('my-receipts-body');
    expect(body.querySelectorAll('.academic-receipt')).toHaveLength(role === 'teacher' ? 4 : 2);
    expect(body.querySelector('.receipt-session').textContent).toContain(role === 'teacher' ? '4 receipts' : '2 receipts');
    if (role !== 'teacher') {
      expect(body.textContent).not.toMatch(/try-it|lesson-check/);
      const requests = desk.roster.state.requests.length;
      await win.printSealedSummary(); await win.exportSealedTranscript();
      expect(desk.roster.state.requests.slice(requests).some(request => request.path === '/transcript')).toBe(false);
    }
  } finally { win.close(); }
}, 15000);

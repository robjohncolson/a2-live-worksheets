import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('teacher-dashboard.html'), 'utf8');
const panel = html.slice(html.indexOf('// BEGIN MISCONCEPTIONS PANEL'), html.indexOf('// END MISCONCEPTIONS PANEL'));
let render, load, openDrawer, fetchJson;
const fixture = {
  ok: true, section: 'PeriodE', vocabReviewed: false,
  class: [{ key: 'test', label: '<img src=x onerror=alert(1)>', draft: true, students: 1, activeStudents: 3,
    lessons: ['1.4'], sources: { mcq: 1, frq: 1 }, lastSeen: '2026-09-11T12:00:00Z', skills: ['3.C'] }],
  students: { one: { username: 'one', realName: '<script>bad()</script>', persistent: [
    { key: 'test', label: 'Conditional percentages', draft: true, count: 2, itemIds: ['U1-L4-Q01'] },
  ] } },
  evidence: { test: [{ studentId: 'one', ts: '2026-09-11T12:00:00Z', source: 'mcq', itemId: 'U1-L4-Q01',
    evidence: { chosen: 'C', correct: 'A' } },
  { studentId: 'one', ts: '2026-09-07T12:00:00Z', source: 'frq', itemId: 'WS-U1L4-reflect1',
    evidence: { missing: '<b>denominator</b>', feedback: '<svg onload=bad()>' } }] },
};

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(parsed.getElementById('misconceptions-section'));
  for (const [id, tag] of [['section-filter', 'select'], ['load-btn', 'button'], ['tsc-nudge-broadcast', 'input'], ['tsc-nudge-text', 'textarea']]) {
    const node = document.createElement(tag); node.id = id; document.body.appendChild(node);
  }
  openDrawer = vi.fn();
  fetchJson = vi.fn(async () => ({ status: 200, data: structuredClone(fixture) }));
  const functions = new Function('$', 'fetchJson', 'teacherSecret', 'openTscDrawer', panel + ';return { renderMisconceptions, loadMisconceptions };')(
    id => document.getElementById(id), fetchJson, () => 'fixture-secret', openDrawer);
  render = functions.renderMisconceptions;
  load = functions.loadMisconceptions;
});

describe('teacher misconception panel', () => {
  it('renders all three Status states safely and sorts untriaged first in both tables', () => {
    const triage = { sheet: '1.1', sheetTitle: '<img src=x onerror=bad()>', triagedAt: '2026-09-18' };
    const rows = [
      { ...fixture.class[0], key: 'done', triage },
      { ...fixture.class[0], key: 'fresh', label: 'Fresh label', triage: null },
      { ...fixture.class[0], key: 'recurring', triage, recurringAfterTriage: true },
    ];
    render({ ...fixture, frequent: rows, class: rows });
    for (const id of ['misconceptions-frequent', 'misconceptions-class']) {
      const host = document.getElementById(id);
      expect([...host.querySelectorAll('th')].map(node => node.textContent)).toContain('Status');
      const statuses = [...host.querySelectorAll('tr:not([hidden]) td:nth-child(2)')];
      expect(statuses.map(node => node.textContent)).toEqual([
        'untriaged', 'triaged → <img src=x onerror=bad()> (Sep 18)',
        'still recurring after <img src=x onerror=bad()>',
      ]);
      expect(statuses[2].style.color).toBe('rgb(185, 28, 28)');
      expect(host.querySelector('img')).toBeNull();
      expect(host.querySelector('tr[hidden] td').colSpan).toBe(id.endsWith('frequent') ? 7 : 8);
    }
    expect(rows[0].key).toBe('done');
  });
  it('renders frequent evidence above persistence with pills, quiz links, and the same actions', () => {
    render({ ...fixture, frequent: [{ ...fixture.class[0], events: 2, weak: true, questionId: 'U1-L4-Q01' }] });
    const host = document.getElementById('misconceptions-frequent');
    expect(host.nextElementSibling.id).toBe('misconceptions-class');
    expect(host.querySelector('h3').textContent).toBe('Most frequent this window (no persistence filter)');
    expect([...host.querySelectorAll('th')].map(node => node.textContent)).toEqual([
      'Label', 'Status', 'Students', 'Events', 'Lessons', 'Sources', 'Last seen',
    ]);
    expect([...host.querySelectorAll('.pct-badge')].map(node => node.textContent)).toEqual(['draft — not yet reviewed', 'weak']);
    expect(host.querySelector('img, script, svg')).toBeNull();
    const toggle = host.querySelector('button');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const evidence = host.querySelectorAll('tr')[2];
    expect(evidence.hidden).toBe(false);
    expect(evidence.textContent).toContain('<svg onload=bad()>');
    expect(host.querySelector('a').href).toBe('https://robjohncolson.github.io/curriculum_render/?u=1&l=4');
    [...host.querySelectorAll('button')].find(node => node.textContent === 'Nudge').click();
    expect(openDrawer).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'one' }));
    expect(fetchJson).not.toHaveBeenCalled();
    toggle.click();
    expect(evidence.hidden).toBe(true);
  });
  it('shows the frequent empty state and clears stale frequent rows while loading', async () => {
    render({ ...fixture, frequent: [] });
    const host = document.getElementById('misconceptions-frequent');
    expect(host.textContent).toContain('No graded evidence in this window yet.');
    const pending = load();
    expect(host.children).toHaveLength(0);
    await pending;
    expect(host.textContent).toContain('No graded evidence in this window yet.');
  });
  it('appears between Skills to review and Remediation with all windows and map links', () => {
    expect(html.indexOf('id="misconceptions-section"')).toBeGreaterThan(html.indexOf('Skills to review'));
    expect(html.indexOf('id="misconceptions-section"')).toBeLessThan(html.indexOf('<!-- Remediation (Phase 4b) -->'));
    expect([...document.querySelectorAll('#misconceptions-days option')].map(node => node.value)).toEqual(['14', '42', '0']);
    expect(document.querySelectorAll('#misconceptions-draft a')).toHaveLength(2);
  });
  it('renders draft labels, names and feedback safely and expands evidence', () => {
    render(fixture);
    expect(document.getElementById('misconceptions-draft').hidden).toBe(false);
    expect(document.body.textContent).toContain('draft — not yet reviewed');
    expect(document.querySelector('img, script, svg')).toBeNull();
    expect(panel).not.toMatch(/innerHTML|insertAdjacentHTML/);
    const evidence = document.querySelector('#misconceptions-class tr[hidden]');
    expect(evidence.hidden).toBe(true);
    document.querySelector('#misconceptions-class button').click();
    expect(evidence.hidden).toBe(false);
    expect(evidence.textContent).toContain('chose C on U1-L4-Q01');
    expect(evidence.textContent).toContain('<svg onload=bad()>');
    expect(document.querySelector('#misconceptions-students summary').textContent).toContain('2');
  });
  it('hides reviewed vocabulary pill and renders the specified empty state', () => {
    render({ ...fixture, vocabReviewed: true, class: [], students: {}, evidence: {} });
    expect(document.getElementById('misconceptions-draft').hidden).toBe(true);
    expect(document.getElementById('misconceptions-status').textContent).toBe('No persistent misconceptions in this window yet.');
  });
  it('opens the existing composer prefilled without sending', () => {
    render(fixture);
    [...document.querySelectorAll('button')].find(node => node.textContent === 'Nudge').click();
    expect(openDrawer).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'one', section: 'PeriodE' }));
    expect(document.getElementById('tsc-nudge-text').value).toContain('lessons 1.4');
    expect(document.getElementById('tsc-nudge-broadcast').checked).toBe(false);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(document.querySelector('#misconceptions-class a').getAttribute('href')).toBe('u1_lesson4_live.html');
  });
  it('uses the section, selected window and existing authenticated fetch helper', async () => {
    const option = document.createElement('option'); option.value = 'PeriodE';
    document.getElementById('section-filter').appendChild(option);
    document.getElementById('misconceptions-days').value = '14';
    await load();
    expect(fetchJson).toHaveBeenCalledWith('/class/misconceptions?section=PeriodE&days=14', 'fixture-secret');
  });
  it('lists all active remediation sheets from the DOK manifest with student/board/teacher links (textContent only)', () => {
    expect(html).toContain('id="misconceptions-sheets"');
    const fn = html.slice(html.indexOf('async function loadRemediationSheets'), html.indexOf('loadRemediationSheets();'));
    expect(fn).toContain("fetch('data/remediation-sheets.json'");
    expect(fn).not.toContain('standalone === true');
    expect(fn).toContain('m.misconceptions');
    expect(fn).toContain('m.links[link[0]]');
    expect(fn).toMatch(/\['student', 'Student'\], \['board', 'Board'\], \['teacher', 'Teacher key'\]/);
    expect(fn).not.toContain('innerHTML');
    const manifest = JSON.parse(readFileSync(resolve('tests/fixtures/a2/remediation-manifest.empty.json'), 'utf8'));
    expect(manifest).toEqual({});
  });
});

 it('renders all manifest sheets and target labels safely, and hides an empty strip', async () => {
    const fn = html.slice(html.indexOf('async function loadRemediationSheets'), html.indexOf('loadRemediationSheets();'));
    const manifest = JSON.parse(readFileSync(resolve('tests/fixtures/a2/remediation-manifest.empty.json'), 'utf8'));
    manifest.extra = { title: '<img src=x>', misconceptions: ['label:<b>context</b>'], links: { student: 'student.pdf', board: 'board.pdf', teacher: 'teacher.pdf' } };
    const fetch = vi.fn(async () => ({ ok: true, json: async () => manifest }));
    const loadSheets = new Function('$', 'fetch', fn + ';return loadRemediationSheets;')(id => document.getElementById(id), fetch);
    await loadSheets();
    const host = document.getElementById('misconceptions-sheets');
    expect(host.hidden).toBe(false);
    expect(host.querySelectorAll('a')).toHaveLength(Object.keys(manifest).length * 3);
    for (const sheet of Object.values(manifest)) {
      expect(host.textContent).toContain(sheet.title);
      for (const key of sheet.misconceptions) expect(host.textContent).toContain(key.replace(/^label:/, ''));
    }
    expect(host.querySelector('img, b')).toBeNull();
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await loadSheets();
    expect(host.hidden).toBe(true);
 });

 it('uses vocabulary label text for tagged remediation targets without interpreting markup', async () => {
    const fn = html.slice(html.indexOf('async function loadRemediationSheets'), html.indexOf('loadRemediationSheets();'));
    const fetch = vi.fn(async url => ({ ok: true, json: async () => url === 'data/remediation-sheets.json'
      ? { '1.1': { title: 'New sheet', misconceptions: ['counts-vs-percents', 'label:context'] } }
      : { tags: { 'counts-vs-percents': { label: '<b>Compare percentages</b>' } } } }));
    const loadSheets = new Function('$', 'fetch', fn + ';return loadRemediationSheets;')(id => document.getElementById(id), fetch);
    await loadSheets();
    const host = document.getElementById('misconceptions-sheets');
    expect(host.textContent).toContain('Targets: <b>Compare percentages</b>; context');
    expect(host.querySelector('b')).toBeNull();
 });

// teacher-gradebook.test.js — jsdom smoke test for the in-app gradebook grid in
// teacher-dashboard.html. Loads the page, feeds renderGradebook a synthetic
// /class/grades payload (mirroring roster-server/gradebook-grid.js buildGradebook
// output), and asserts the component grid renders with both totals.
//
// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../teacher-dashboard.html'), 'utf8');

function synthPayload() {
  const columns = [
    { key: 'LC:1-1', kind: 'lesson_check', category: 'Assessments', title: '1-1 Lesson Check', maxPoints: 10, topicKeys: ['1-1'] },
    { key: 'TA:T1', kind: 'topic_assessment', category: 'Assessments', title: 'Topic 1 Assessment', maxPoints: 100, topicKeys: [] },
    { key: 'TI:1-1', kind: 'try_it', category: 'Assignments', title: '1-1 Try-It', maxPoints: 2, topicKeys: ['1-1'] },
    { key: 'BL:1-1', kind: 'flashcard', category: 'Engagement', title: '1-1 Lesson Deck', maxPoints: 1, topicKeys: ['1-1'] },
  ];
  const gradebook = {
    weights: { Assessments: 50, Assignments: 40, Engagement: 10 },
    quarters: { Q1: {
      columns,
      cells: { 'LC:1-1': 8, 'TA:T1': 80, 'TI:1-1': 1, 'BL:1-1': 1 },
      categoryAverages: { Assessments: 80, Assignments: 50, Engagement: 100 },
      schoologyTotal: 70,
      v3Total: 70,
      formula: 'district',
      reconciliation: {
        schoologyTotal: 70, v3Total: 70, delta: 0, branch: 'district',
        reason: 'Assessments 50%, Assignments 40%, Engagement 10%.',
      },
    } },
  };
  return { ok: true, students: [
    { studentId: 's1', realName: 'Ana Smith', username: 'apple_cat', section: 'C',
      quarters: { Q1: { quarterGrade: 70 } }, units: {}, completion: {}, lessons: [], gradebook },
  ] };
}

describe('teacher-dashboard in-app gradebook grid', () => {
  let win, doc;

  beforeAll(async () => {
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://example.test/teacher-dashboard.html',
      pretendToBeVisual: true,
    });
    win = dom.window;
    doc = win.document;
    // Let any DOMContentLoaded wiring run.
    await new Promise((r) => setTimeout(r, 30));
  });

  afterAll(() => win.close());

  it('exposes renderGradebook and has the grid mount points', () => {
    expect(typeof win.renderGradebook).toBe('function');
    expect(doc.getElementById('gb-thead')).toBeTruthy();
    expect(doc.getElementById('gb-tbody')).toBeTruthy();
  });

  

  it('renders surviving component cells, student identity, matching district totals', () => {
    const payload = synthPayload();
    win.renderGradebook(payload);
    expect(doc.getElementById('gb-wrap').style.display).not.toBe('none');
    expect(doc.getElementById('gb-empty').style.display).toBe('none');
    const rows = doc.querySelectorAll('#gb-tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelectorAll('td')).toHaveLength(7);
    expect(rows[0].querySelector('td').textContent).toContain('Ana Smith');
    const totals = rows[0].querySelectorAll('td.gb-tot');
    expect(totals).toHaveLength(2);
    expect(totals[0].textContent).toContain('70');
    expect(totals[1].textContent).toContain('70');
    expect(rows[0].querySelector('.gb-delta')).toBeNull();
    expect(rows[0].dataset.section).toBe('C');
    expect(doc.getElementById('gb-thead').textContent).not.toMatch(/Progress Check|Poster/);
  });

  it('renders a 105-point synthetic assessment without clipping the number', () => {
    const payload = synthPayload();
    payload.students[0].gradebook.quarters.Q1.cells['TA:T1'] = 105;
    win.renderGradebook(payload);
    expect([...doc.querySelectorAll('#gb-tbody td.gb-cell')].some(td => td.textContent.includes('105'))).toBe(true);
  });

  

  function payloadWithDue() {
    const payload = synthPayload();
    const quarter = payload.students[0].gradebook.quarters.Q1;
    quarter.columns.forEach(column => { column.due = true; });
    quarter.columns.push({ key: 'LC:1-9', kind: 'lesson_check', category: 'Assessments', title: '1-9 Lesson Check', maxPoints: 10, topicKeys: ['1-9'], due: false });
    quarter.cells['LC:1-9'] = null;
    return payload;
  }

  it('date-gates: hides a future, not-started column + notes how many were hidden', () => {
    win.renderGradebook(payloadWithDue());
    const titles = Array.from(doc.querySelectorAll('#gb-thead th.gb-col')).map((th) => th.getAttribute('title'));
    expect(titles).toContain('1-1 Lesson Check');        // due → shown
    expect(titles).not.toContain('1-9 Lesson Check');    // future + not started → hidden
    expect(doc.getElementById('gb-scope').textContent).toMatch(/hidden/i);
  });

  it('date-gates: keeps a future column that some student HAS started', () => {
    const p = payloadWithDue();
    p.students[0].gradebook.quarters.Q1.cells['LC:1-9'] = 7.5; // started despite due:false
    win.renderGradebook(p);
    const titles = Array.from(doc.querySelectorAll('#gb-thead th.gb-col')).map((th) => th.getAttribute('title'));
    expect(titles).toContain('1-9 Lesson Check');
  });

  it('colors cells by the grade-rules bands (90+ deep green, <40 red)', () => {
    const p = synthPayload();
    p.students[0].gradebook.quarters.Q1.cells['TA:T1'] = 30; // below the 40 floor
    win.renderGradebook(p);
    expect(doc.querySelector('#gb-tbody td.gb-cell.gb-top')).toBeTruthy(); // BL:1-1 = 1 / 1
    expect(doc.querySelector('#gb-tbody td.gb-cell.gb-low')).toBeTruthy(); // TA:T1 = 30 / 100
  });

  it('shows the empty note when no gradebook data is present', () => {
    win.renderGradebook({ students: [] });
    expect(doc.getElementById('gb-wrap').style.display).toBe('none');
    expect(doc.getElementById('gb-empty').style.display).toBe('');
  });

  it('renders the per-student district category reconciliation in the drawer', () => {
    win.lastGradesPayload = synthPayload();
    win.currentQuarter = 'Q1';
    win.renderTscReconcile('s1');
    const card = doc.getElementById('tsc-reconcile-card');
    expect(card.textContent).toContain('Schoology');
    expect(card.textContent).toContain('70');
    for (const category of ['Assessments 80', 'Assignments 50', 'Engagement 100']) {
      expect(card.textContent).toContain(category);
    }
    expect(card.textContent).toContain('Assessments 50%, Assignments 40%, Engagement 10%.');
  });
});

it('renders A2 category headers and all four feeder kinds in the teacher grid',()=>{
 const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://example.test/teacher-dashboard.html'});
 const columns=[['LC','lesson_check','Assessments',10],['TA','topic_assessment','Assessments',100],['TI','try_it','Assignments',2],['BL','flashcard','Engagement',1]]
  .map(([key,kind,category,maxPoints])=>({key,kind,category,maxPoints,title:key,due:true,topicKeys:['1.1']}));
 dom.window.renderGradebook({students:[{studentId:'a2',realName:'A2 Student',quarters:{Q1:{quarterGrade:100}},gradebook:{weights:{Assessments:50,Assignments:40,Engagement:10},quarters:{Q1:{columns,cells:{LC:10,TA:100,TI:2,BL:1},schoologyTotal:100,v3Total:100,formula:'district'}}}}]});
 const d=dom.window.document;
 expect(d.querySelectorAll('#gb-tbody td.gb-cell').length).toBe(4);
 for(const category of ['Assessments 50%','Assignments 40%','Engagement 10%']) expect(d.getElementById('gb-thead').textContent).toContain(category);
 expect(d.getElementById('gb-tbody').textContent).toContain('A2 Student');dom.window.close();
});

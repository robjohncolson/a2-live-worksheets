// teacher-gradebook.test.js — jsdom smoke test for the in-app gradebook grid in
// teacher-dashboard.html. Loads the page, feeds renderGradebook a synthetic
// /class/grades payload (mirroring roster-server/gradebook-grid.js buildGradebook
// output), and asserts the component grid renders with both totals.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../teacher-dashboard.html'), 'utf8');

function synthPayload() {
  const columns = [
    { key: 'FA:1.1', kind: 'followalong', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] },
    { key: 'FA:1.2', kind: 'followalong', category: 'Lesson', title: '1.2 Follow-Along', unit: 1, topicKeys: ['1.2'] },
    { key: 'QUIZ:1.2', kind: 'quiz', category: 'Quizzes', title: '1.2 Quiz', unit: 1, topicKeys: ['1.2'] },
    { key: 'BL:1.1', kind: 'blooket', category: 'Blooket', title: '1.1 Blooket', unit: 1, topicKeys: ['1.1'] },
    { key: 'PC:U1', kind: 'pc', category: 'Progress Check', title: 'Unit 1 Progress Check', unit: 1, topicKeys: [] },
    { key: 'POSTER:U1', kind: 'poster', category: 'Posters', title: 'Unit 1 Poster', unit: 1, topicKeys: [] },
  ];
  const gradebook = {
    weights: { Lesson: 15, Quizzes: 15, Blooket: 5, 'Progress Check': 50, Posters: 15 },
    quarters: {
      Q1: {
        columns,
        cells: { 'FA:1.1': 88, 'FA:1.2': 90, 'QUIZ:1.2': 78, 'BL:1.1': 95, 'PC:U1': 80, 'POSTER:U1': null },
        categoryAverages: { Lesson: 89, Quizzes: 78, Blooket: 95, 'Progress Check': 80 },
        schoologyTotal: 82.7,
        v3Total: 91.2,
        reconciliation: {
          pcAvg: 90, workAvg: 70, schoologyTotal: 82.7, v3Total: 91.2, delta: 8.5, branch: 'max',
          reason: 'Both tracks clear the 40 floor, so v3 takes the higher (PC 90), while Schoology averages the categories (82.7).',
        },
      },
    },
  };
  return {
    ok: true,
    students: [
      { studentId: 's1', realName: 'Ana Smith', username: 'apple_cat', section: 'PeriodB',
        quarters: { Q1: { quarterGrade: 91.2 } }, units: {}, completion: {}, lessons: [], gradebook },
    ],
  };
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

  it('exposes renderGradebook and has the grid mount points', () => {
    expect(typeof win.renderGradebook).toBe('function');
    expect(doc.getElementById('gb-thead')).toBeTruthy();
    expect(doc.getElementById('gb-tbody')).toBeTruthy();
  });

  

  it('renders surviving component cells, student identity, both totals and their difference', () => {
    const payload = synthPayload();
    const quarter = payload.students[0].gradebook.quarters.Q1;
    quarter.columns = quarter.columns.filter(column => ['followalong', 'quiz', 'blooket'].includes(column.kind));
    win.renderGradebook(payload);
    expect(doc.getElementById('gb-wrap').style.display).not.toBe('none');
    expect(doc.getElementById('gb-empty').style.display).toBe('none');
    const rows = doc.querySelectorAll('#gb-tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelectorAll('td')).toHaveLength(7);
    expect(rows[0].querySelector('td').textContent).toContain('Ana Smith');
    const totals = rows[0].querySelectorAll('td.gb-tot');
    expect(totals).toHaveLength(2);
    expect(totals[0].textContent).toContain('82.7');
    expect(totals[1].textContent).toContain('91.2');
    expect(totals[1].textContent).toContain('8.5');
  });

  it('renders a 105-point follow-along without clipping the number', () => {
    const payload = synthPayload();
    payload.students[0].gradebook.quarters.Q1.cells['FA:1.1'] = 105;
    win.renderGradebook(payload);
    expect([...doc.querySelectorAll('#gb-tbody td.gb-cell')].some(td => td.textContent.includes('105'))).toBe(true);
  });

  

  function payloadWithDue() {
    const columns = [
      { key: 'FA:1.1', kind: 'followalong', category: 'Lesson', title: '1.1 FA', unit: 1, topicKeys: ['1.1'], due: true },
      { key: 'FA:1.9', kind: 'followalong', category: 'Lesson', title: '1.9 FA', unit: 1, topicKeys: ['1.9'], due: false },
      { key: 'POSTER:U1', kind: 'poster', category: 'Posters', title: 'U1 Poster', unit: 1, topicKeys: [], due: false },
    ];
    const gradebook = { weights: { Lesson: 15, Posters: 15 }, quarters: { Q1: {
      columns, cells: { 'FA:1.1': 88, 'FA:1.9': null, 'POSTER:U1': null },
      categoryAverages: { Lesson: 88 }, schoologyTotal: 88, v3Total: 88, reconciliation: {},
    } } };
    return { ok: true, students: [{ studentId: 's1', realName: 'Ana', username: 'a', section: 'PeriodX', gradebook }] };
  }

  it('date-gates: hides a future, not-started column + notes how many were hidden', () => {
    win.renderGradebook(payloadWithDue());
    const titles = Array.from(doc.querySelectorAll('#gb-thead th.gb-col')).map((th) => th.getAttribute('title'));
    expect(titles).toContain('1.1 FA');        // due → shown
    expect(titles).not.toContain('1.9 FA');    // future + not started → hidden
    expect(titles).not.toContain('U1 Poster'); // future + not started → hidden
    expect(doc.getElementById('gb-scope').textContent).toMatch(/hidden/i);
  });

  it('date-gates: keeps a future column that some student HAS started', () => {
    const p = payloadWithDue();
    p.students[0].gradebook.quarters.Q1.cells['FA:1.9'] = 75; // started despite due:false
    win.renderGradebook(p);
    const titles = Array.from(doc.querySelectorAll('#gb-thead th.gb-col')).map((th) => th.getAttribute('title'));
    expect(titles).toContain('1.9 FA');
  });

  it('colors cells by the grade-rules bands (90+ deep green, <40 red)', () => {
    const p = synthPayload();
    p.students[0].gradebook.quarters.Q1.cells['QUIZ:1.2'] = 30; // below the 40 floor
    win.renderGradebook(p);
    expect(doc.querySelector('#gb-tbody td.gb-cell.gb-top')).toBeTruthy(); // BL:1.1 = 95
    expect(doc.querySelector('#gb-tbody td.gb-cell.gb-low')).toBeTruthy(); // QUIZ:1.2 = 30
  });

  it('shows the empty note when no gradebook data is present', () => {
    win.renderGradebook({ students: [] });
    expect(doc.getElementById('gb-wrap').style.display).toBe('none');
    expect(doc.getElementById('gb-empty').style.display).toBe('');
  });

  it('renders the per-student Schoology-vs-v3 reconciliation in the drawer', () => {
    win.lastGradesPayload = synthPayload();
    win.currentQuarter = 'Q1';
    win.renderTscReconcile('s1');
    const card = doc.getElementById('tsc-reconcile-card');
    expect(card.textContent).toContain('PC track');
    expect(card.textContent).toContain('Work track');
    expect(card.textContent).toContain('v3');
    expect(card.textContent).toContain('Schoology');
    expect(card.textContent).toContain('Δ'); // delta shown
    expect(card.textContent.toLowerCase()).toContain('higher'); // max-branch reason
    expect(card.textContent).toContain('Schoology categories'); // Schoology category averages line
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

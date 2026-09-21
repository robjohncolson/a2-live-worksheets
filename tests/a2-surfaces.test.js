// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../desk.html',import.meta.url),'utf8');
it('renders district scores, minimum counts, grade and ceiling as text',()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'});
 const start=html.indexOf('function renderA2Categories('),end=html.indexOf('function renderMyGradebook(',start);
 dom.window.eval(html.slice(start,end));
 dom.window.renderA2Categories(dom.window.document.querySelector('main'),{quarterGrade:84,ceiling:96,
 categoryBreakdown:{assessments:{score:80,count:3,minimum:4,bonusWindowExcluded:2,bonusWindowIgnored:{count:1,itemIds:["LC-B"]}},assignments:{score:90,count:8,minimum:10},engagement:{score:80,count:9,minimum:10}}});
 const text=dom.window.document.body.textContent;
 expect(text).toContain('2 bonus not attempted ? 1 bonus not counted');
 expect(text).toContain('Topic assessments can be retaken any number of times.');
 expect(text).toContain('Assessments 3 of 4 minimum');expect(text).toContain('Assignments 8 of 10 minimum');
 expect(text).toContain('Engagement 9 of 10 minimum');expect(text).toContain('84.0%');expect(text).toContain('96.0%');dom.window.close();
});
it('renders exactly three ledger-backed lesson chips',()=>{
 const dom=new JSDOM('<div></div>',{runScripts:'outside-only'});
 dom.window.eval(readFileSync(new URL('../a2-client.js',import.meta.url),'utf8'));
 dom.window._gradeLessonsCache=[{lessonKey:'1.1',tryIts:{scored:3,total:5,points:5},lessonCheck:90,flashcardPassed:true}];
 const a=html.indexOf('function renderA2LessonChips('),b=html.indexOf('function renderA2Categories(',a);
 dom.window.eval(html.slice(a,b));dom.window.renderA2LessonChips(dom.window.document.querySelector('div'),'1.1');
 expect([...dom.window.document.querySelectorAll('span')].map(n=>n.textContent)).toEqual(['Try-Its 3/5 scored, 5 points','Lesson check 90%','Flashcards passed']);
 const tile=dom.window.document.querySelector('div');
 dom.window.A2Desk={getStatus:()=>({tryIts:{scored:5,total:5,points:10},lessonCheck:100,flashcardPassed:false})};
 tile.textContent='';dom.window.renderA2LessonChips(tile,'1-1');
 expect([...tile.querySelectorAll('span')].map(n=>n.textContent)).toEqual(['Try-Its 5/5 scored, 10 points','Lesson check 100%','Flashcards not passed']);
 dom.window.__WS_READ_ONLY__=true;
 tile.textContent='';dom.window.renderA2LessonChips(tile,'1-1');
 expect([...tile.querySelectorAll('span')].map(n=>n.textContent)).toEqual(['Try-Its 3/5 scored, 5 points','Lesson check 90%','Flashcards passed']);dom.window.close();
});
it('ships the renamed Desk and three section controls',()=>{
 expect(existsSync(new URL('../desk.html',import.meta.url))).toBe(true);
 expect(existsSync(new URL('../ap_stats_roadmap_square_mode.html',import.meta.url))).toBe(false);
 for(const section of ['C','D','G']) expect(html).toContain(`setP('${section}')`);
 const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url)));
 expect(manifest.name).toBe('Algebra 2 Desk');
});

it('pins the five short orientation sections and grading table', () => {
 const start=readFileSync(new URL('../start-here.html',import.meta.url),'utf8');
 const dom=new JSDOM(start);
 const doc=dom.window.document;
 expect([...doc.querySelectorAll('h2')].slice(0,5).map(n=>n.textContent)).toEqual([
  'An average day','What gets graded','How the number is computed','The first two weeks','Dates']);
 expect([...doc.querySelectorAll('tbody tr')].map(n=>n.cells[0].textContent)).toEqual(['Daily Engagement','Try-Its','IXL Web Jam','IXL homework, when assigned','Quiz','Topic assessment','Bonus']);
 expect(doc.body.textContent).toContain('Work through Friday, Sep 18 could only help you. It became your starting Bonus points and nothing from those weeks counts against you. Graded work starts Monday, Sep 21.');
 expect(doc.body.textContent).toContain('Retake any number of times; makeup and retake times announced in class.');
 expect(doc.querySelectorAll('section')).toHaveLength(7);
 expect([...doc.querySelectorAll('h2')].slice(5).map(n=>n.textContent)).toEqual(['Bonus','Try the grade playground']);
 expect(doc.body.textContent).not.toMatch(/\bAP\b|Progress Check|video|Blooket warm/i);
 const prose=[...doc.querySelectorAll('section')].slice(0,5).flatMap(n=>[...n.querySelectorAll('p, li, td')]).map(n=>n.textContent).join(' ');
 expect(prose.split(/\s+/).length).toBeGreaterThanOrEqual(450);
 expect(prose.split(/\s+/).length).toBeLessThanOrEqual(725);
 dom.window.close();
});
it('shows the configured bonus date read-only in the teacher header', () => {
 const source=readFileSync(new URL('../teacher-dashboard.html',import.meta.url),'utf8');
 const dom=new JSDOM(source,{runScripts:'outside-only'});
 const script=[...dom.window.document.scripts].find(n=>n.textContent.includes('const bonusWindowDate'));
 dom.window.GradeEngine={PHASE3_CONFIG:{bonusOnlyThrough:'2026-09-18'}};
 dom.window.eval(script.textContent);
 expect(dom.window.document.getElementById('bonus-window-setting').textContent).toBe('Bonus-only through Sep 18 (only-raise)');
 expect(source).toContain('Topic assessments can be retaken any number of times.');
 dom.window.close();
});

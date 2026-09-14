import { describe, it, expect } from 'vitest';
import { quarterGradeDistrict, yearGradeDistrict, selectOnlyRaiseBonus, A2_CATEGORIES } from '../district-grade.js';
import { computeGrade } from '../grade.js';
import { PHASE3_CONFIG } from '../grade-config.js';
import { buildGradebook } from '../gradebook-grid.js';
const cfg = { ...PHASE3_CONFIG, useDistrictFormula: true, today: '2026-10-10' };
const item = (category, points, maxPoints, attempted = true, dueDate = '2026-10-01') => ({ category, points, maxPoints, attempted, dueDate });
const perfect = [item('assessments', 10, 10), item('assessments', 100, 100),
  item('assignments', 2, 2), item('engagement', 1, 1)];
describe('district worked examples', () => {
  it.each([
    ['all perfect', perfect, 100],
    ['missing topic assessment', perfect.map((x,i) => i === 1 ? {...x, attempted:false} : x), 600/11],
    ['empty quarter', [], null],
    ['only Assignments', [item('assignments',1,2)], 50],
  ])('%s', (_, items, expected) => {
    const result = quarterGradeDistrict(items, 'Q1', cfg);
    if (expected === null) expect(result.quarterGrade).toBeNull();
    else expect(result.quarterGrade).toBeCloseTo(expected, 10);
  });
  it('counts unattempted due denominators, reports minimum progress and recoverable ceiling', () => {
    const result = quarterGradeDistrict(perfect.map((x,i) => i===1 ? {...x,attempted:false}:x), 'Q1', cfg);
    expect(result.categoryBreakdown.assessments).toEqual({score:100/11,earned:10,possible:110,count:2,bonusWindowExcluded:0,bonusWindowIgnored:{count:0,itemIds:[]},minimum:4,minimumMet:false});
    expect(result.ceiling).toBe(100);
  });
  it('excludes future, other-quarter and same-day work; counts it after the lesson day', () => {
    const items = [item('assignments',2,2,true,'2026-10-10')];
    expect(quarterGradeDistrict(items,'Q1',cfg).quarterGrade).toBeNull();
    expect(quarterGradeDistrict(items,'Q1',{...cfg,today:'2026-10-11'}).quarterGrade).toBe(100);
    expect(quarterGradeDistrict(items,'Q2',cfg).quarterGrade).toBeNull();
  });
  it('closed quarter cannot recover unattempted work', () => {
    const result=quarterGradeDistrict([item('assignments',0,2,false)],'Q1',{...cfg,today:'2026-11-07'});
    expect(result.ceiling).toBe(0);
  });
  it('year is a mean of nonempty quarters', () => {
    expect(yearGradeDistrict({Q1:{quarterGrade:80},Q2:{quarterGrade:100},Q3:{quarterGrade:null}})).toBe(90);
    expect(yearGradeDistrict({})).toBeNull();
  });
  it('pins district policy and section meeting days', () => {
    expect(cfg.a2Categories).toEqual(A2_CATEGORIES);
    expect(cfg.meetingDays).toEqual({C:[1,2,4],D:[1,3,5],G:[2,3,4,5]});
  });
});
describe('A2 ledger adapter and gradebook', () => {
  const lessonSchedule={'1.1':{unit:1,worksheetKey:'1',periods:{C:'2026-10-01',D:'2026-10-20'},tryItCount:1}};
  const opts={lessonSchedule,section:'PeriodC',asOf:new Date('2026-10-10T16:00:00Z')};
  const row=(source,item_id,score,attempt=1)=>({source,item_id,score,attempt,created_at:'2026-10-02'});
  const rows=[row('lesson-check','LC-U1-L1',10),row('lesson-check','LC-U1-L1',4,2),
    row('try-it','TI-U1-L1-1',2),row('try-it','TI-U1-L1-1',1,2),
    row('worksheet','BL-U1-L1-DESK_DONE',80),row('flashcard','BL-U1-L1-DESK_DONE',100,2)];
  it('best checks, latest Try-It rescore and one existing flashcard commit',()=>{
    const grade=computeGrade(rows,{},cfg,opts);
    expect(grade.formula).toBe('district');expect(grade.quarters.Q1.quarterGrade).toBe(80);
    expect(grade.lessons[0].tryIts.points).toBe(1);
    expect(grade.lessons[0].lessonCheck).toBe(100);
    expect(grade.quarters.Q1.categoryBreakdown.engagement.possible).toBe(1);
    expect(grade.lessons[0].flashcardPassed).toBe(true);
  });
  it('district wins when both flags are set',()=>expect(computeGrade(rows,{}, {...cfg,useV3:true},opts).formula).toBe('district'));
  it('section dates differ and future work does not create zeros',()=>expect(computeGrade(rows,{},cfg,{...opts,section:'D'}).quarters.Q1.quarterGrade).toBeNull());
  it('Schoology counts points over due completed items, while Desk includes missing work',()=>{
    const grade=computeGrade(rows.slice(0,2),{},cfg,opts);const grid=buildGradebook(grade);
    expect(grid.weights).toEqual({Assessments:50,Assignments:40,Engagement:10});
    expect(grid.quarters.Q1.schoologyTotal).toBe(100);
    expect(grade.quarters.Q1.quarterGrade).toBe(50);
    expect(grid.quarters.Q1.columns.map(c=>c.kind)).toEqual(['lesson_check','try_it','flashcard']);
    expect(grid.quarters.Q1.cells['LC-U1-L1']).toBe(10);
  });
});

describe('A2 v3 alternative mastery source', () => {
  const items=[{itemId:'TA-U1',source:'topic-assessment',dueDate:'2026-10-01'},
    {itemId:'TA-U2',source:'topic-assessment',dueDate:'2026-10-01'},
    {itemId:'TI-U1-L1-1',source:'try-it',dueDate:'2026-10-01'}];
  const opts={items,asOf:new Date('2026-10-10T16:00:00Z')};
  const rows=[{source:'topic-assessment',item_id:'TA-U1',score:80},
    {source:'topic-assessment',item_id:'TA-U2',score:100},
    {source:'try-it',item_id:'TI-U1-L1-1',score:1}];
  it('mastery is the mean of topic assessments and both tracks clear the floor',()=>{
    const result=computeGrade(rows,{}, {...cfg,useDistrictFormula:false,useV3:true},opts);
    expect(result.formula).toBe('v3');
    expect(result.quarters.Q1.masteryAvg).toBe(90);
    expect(result.quarters.Q1.quarterGrade).toBe(90);
  });
  it('missing due mastery engages the retained 70% gate',()=>{
    const result=computeGrade([{source:'try-it',item_id:'TI-U1-L1-1',score:2}],{},
      {...cfg,useDistrictFormula:false,useV3:true},opts);
    expect(result.quarters.Q1.masteryAvg).toBe(0);
    expect(result.quarters.Q1.quarterGrade).toBe(70);
  });
});

describe('add/drop bonus-only window', () => {
  it('starts an empty category with the best bonus and ignores the attempted zero', () => {
    const items = [
      {...item('assignments', 0, 2, true, '2026-09-15'), itemId: 'TI-Z'},
      {...item('assignments', 2, 2, true, '2026-09-15'), itemId: 'TI-A'},
    ];
    const result = quarterGradeDistrict(items, 'Q1', cfg);
    expect(result.categoryBreakdown.assignments).toMatchObject({score: 100, earned: 2, possible: 2,
      count: 1, bonusWindowIgnored: {count: 1, itemIds: ['TI-Z']}});
    expect(result.ceiling).toBe(100);
  });
  it.each([[2, 75], [1, 50]])('includes a bonus Try-It earning %s points without lowering the base', (points, score) => {
    const result = quarterGradeDistrict([
      item('assignments', 1, 2, true, '2026-09-25'),
      {...item('assignments', points, 2, true, '2026-09-15'), itemId: 'TI-B'},
    ], 'Q1', cfg);
    expect(result.categoryBreakdown.assignments).toMatchObject({score, earned: 1 + points, possible: 4,
      count: 2, bonusWindowIgnored: {count: 0, itemIds: []}});
    expect(result.ceiling).toBe(score);
  });
  it('sorts equal ratios by larger possible points and then itemId regardless of input order', () => {
    const candidates = [
      {...item('assessments', 1, 2, true, '2026-09-15'), itemId: 'B'},
      {...item('assessments', 2, 4, true, '2026-09-15'), itemId: 'C'},
      {...item('assessments', 1, 2, true, '2026-09-15'), itemId: 'A'},
    ];
    for (const items of [candidates, [...candidates].reverse(), [candidates[1], candidates[0], candidates[2]]]) {
      expect(selectOnlyRaiseBonus(items, cfg.bonusOnlyThrough).members.map(item => item.itemId)).toEqual(['C', 'A', 'B']);
      expect(quarterGradeDistrict(items, 'Q1', cfg).quarterGrade).toBe(50);
      const result = quarterGradeDistrict([...items, item('assessments', 10, 10)], 'Q1', cfg);
      expect(result.categoryBreakdown.assessments.bonusWindowIgnored).toEqual({count: 3, itemIds: ['C', 'A', 'B']});
    }
  });
  it('disabling the window counts attempted low scores normally too', () => {
    const result = quarterGradeDistrict([
      item('assessments', 5, 10, true, '2026-09-15'), item('assessments', 10, 10),
    ], 'Q1', {...cfg, bonusOnlyThrough: null});
    expect(result.quarterGrade).toBe(75);
    expect(result.categoryBreakdown.assessments.bonusWindowIgnored).toEqual({count: 0, itemIds: []});
  });
  it('keeps v3 mastery and work tracks from being lowered by attempted bonuses', () => {
    const items = ['TA', 'LC', 'TI'].flatMap((prefix, index) => ['B', 'R'].map(suffix => ({
      itemId: `${prefix}-${suffix}`, source: ['topic-assessment', 'lesson-check', 'try-it'][index],
      dueDate: suffix === 'B' ? '2026-09-15' : '2026-09-25',
    })));
    const rows = items.map(item => ({source: item.source, item_id: item.itemId,
      score: item.itemId.endsWith('B') ? 0 : {TA: 100, LC: 10, TI: 2}[item.itemId.slice(0, 2)]}));
    const result = computeGrade(rows, {}, {...cfg, useDistrictFormula: false, useV3: true},
      {items, asOf: new Date('2026-10-10T16:00:00Z')}).quarters.Q1;
    expect(result.masteryAvg).toBe(100);
    expect(result.workAvg).toBe(100);
    expect(result.quarterGrade).toBe(100);
    expect(result.ceiling).toBe(100);
  });
  const missing = {...item('assessments', 0, 10, false, '2026-09-15'), itemId: 'LC-B'};
  const perfectCheck = item('assessments', 10, 10, true, '2026-09-22');
  it.each([
    ['missing bonus check', [missing, perfectCheck], cfg, 100, 1],
    ['attempted bonus check', [{...missing, attempted: true, points: 5}, perfectCheck], cfg, 100, 0],
    ['missing later Try-It', [item('assignments', 0, 2, false, '2026-09-25')], cfg, 0, 0],
    ['disabled window', [missing, perfectCheck], {...cfg, bonusOnlyThrough: null}, 50, 0],
  ])('%s', (_, items, config, score, excluded) => {
    const result = quarterGradeDistrict(items, 'Q1', config);
    const category = result.categoryBreakdown[items[0].category];
    expect(category.score).toBe(score);
    expect(category.bonusWindowExcluded).toBe(excluded);
    expect(result.quarterGrade).toBe(score);
    expect(result.ceiling).toBe(100);
    expect(category.bonusWindowIgnored).toEqual({count: items[0].points === 5 ? 1 : 0, itemIds: items[0].points === 5 ? ['LC-B'] : []});
    if (items[0].category === 'assignments') expect(category).toMatchObject({earned: 0, possible: 2});
  });
  it('includes Sep 18, ignores a lowering attempted zero, and leaves Sep 19 required', () => {
    const result = quarterGradeDistrict([
      {...missing, dueDate: '2026-09-18'},
      {...missing, attempted: true},
      {...missing, dueDate: '2026-09-19'}, perfectCheck,
    ], 'Q1', cfg);
    expect(result.categoryBreakdown.assessments).toMatchObject({earned: 10, possible: 20, count: 2, bonusWindowExcluded: 1, bonusWindowIgnored: {count: 1, itemIds: ["LC-B"]}});
  });
  it('keeps bonus omissions excluded at close and never projects below the live grade', () => {
    const result = quarterGradeDistrict([missing, perfectCheck], 'Q1', {...cfg, today: '2026-11-07'});
    expect(result.quarterGrade).toBe(100);
    expect(result.ceiling).toBe(100);
  });
  it('uses the school-timezone lesson-day boundary through the ledger adapter', () => {
    const opts = {items: [{itemId: 'LC-B', source: 'lesson-check', dueDate: '2026-09-18'}],
      asOf: new Date('2026-09-19T03:59:00Z')};
    expect(computeGrade([], {}, cfg, opts).quarters.Q1.categoryBreakdown.assessments.bonusWindowExcluded).toBe(0);
    opts.asOf = new Date('2026-09-19T04:00:00Z');
    expect(computeGrade([], {}, cfg, opts).quarters.Q1.categoryBreakdown.assessments.bonusWindowExcluded).toBe(1);
  });
  it('excludes missing bonus mastery in v3 and retains its completion projection', () => {
    const opts = {items: [
      {itemId: 'TA-B', source: 'topic-assessment', dueDate: '2026-09-18'},
      {itemId: 'TA-R', source: 'topic-assessment', dueDate: '2026-09-22'},
      {itemId: 'TI-R', source: 'try-it', dueDate: '2026-09-22'},
    ], asOf: new Date('2026-10-10T16:00:00Z')};
    const rows = [{source: 'topic-assessment', item_id: 'TA-R', score: 80}, {source: 'try-it', item_id: 'TI-R', score: 2}];
    const result = computeGrade(rows, {}, {...cfg, useDistrictFormula: false, useV3: true}, opts).quarters.Q1;
    expect(result.masteryAvg).toBe(80);
    expect(result.categoryBreakdown.assessments.bonusWindowExcluded).toBe(1);
    expect(result.ceiling).toBeGreaterThanOrEqual(result.quarterGrade);
  });
});

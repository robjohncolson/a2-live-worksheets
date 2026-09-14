import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import { mountClass } from '../class.js';
import { computeMisconceptions, extractEvents, resolveElement } from '../misconceptions.js';

const NOW = Date.parse('2026-09-11T12:00:00Z');
const elements = [{ id: 'denominator', description: 'Uses group total for conditional percentage' }];
const assets = {
  vocabulary: { reviewed: false, tags: { conditional: { label: 'Uses the wrong conditional denominator', skills: ['3.C'] } } },
  answerKey: { 'U1-L1-Q01': { answerKey: 'B', topic: '1.1' }, 'U1-L2-Q01': { answerKey: 'B', topic: '1.2' } },
  distractorMap: { reviewed: false, items: { 'U1-L1-Q01': { A: ['conditional'] }, 'U1-L2-Q01': { A: ['conditional'] } } },
  rubricMap: { reviewed: false, items: { 'WS-U1L2-reflect1': { denominator: ['conditional'] } },
    rubrics: { 'WS-U1L2-reflect1': { elements, commonMistakes: ['Dividing by the grand total'] } } },
};
function quiz(item = 'U1-L1-Q01', age = 7, response = 'A') {
  return { source: 'quiz', item_id: item, student_id: 'one', response,
    recorded_at: new Date(NOW - age * 86400000).toISOString() };
}
function frq(missing, feedback = '') {
  return { ...quiz('WS-U1L2-reflect1', 3), source: 'frq', frq_result: { missing, feedback } };
}
function fan(rows, id = 'one') {
  return { roster: { student_id: id, login_username: id, real_name: id, section: 'PeriodE' }, ledgerRows: rows };
}
function compute(rows, options = {}) {
  return computeMisconceptions(rows, assets, { now: NOW, section: 'PeriodE', ...options });
}

describe('misconception signals', () => {
  it('keeps legacy I evidence weak and still extracts verbatim feedback mistakes', () => {
    const row = { ...frq(undefined, 'Dividing by the grand total'), score: 0 };
    expect(extractEvents([row], assets)).toEqual(expect.arrayContaining([
      expect.objectContaining({ weak: true, tags: [], label: row.item_id,
        evidence: { kind: 'score-only', feedback: 'Dividing by the grand total' } }),
      expect.objectContaining({ label: 'Dividing by the grand total' }),
    ]));
    expect(extractEvents([{ ...row, frq_result: null }], assets)[0].weak).toBe(true);
    for (const score of [null, undefined, 0.5, 1]) {
      expect(extractEvents([{ ...row, score, frq_result: { feedback: 'Try again' } }], assets)).toEqual([]);
    }
    expect(extractEvents([{ ...row, frq_result: { missing: [], feedback: 'Try again' } }], assets)).toEqual([]);
  });
  it('never lets weak evidence satisfy class share or lesson thresholds', () => {
    const localAssets = structuredClone(assets);
    localAssets.rubricMap.rubrics['WS-U1L1-reflect1'] = { question: 'Interpret the context' };
    localAssets.rubricMap.rubrics['WS-U1L2-reflect1'].question = 'Interpret the context';
    const weak = [1, 2].map((lesson, i) => ({ ...quiz(`WS-U1L${lesson}-reflect1`, 7 - i * 4),
      source: 'frq', score: 0, frq_result: { feedback: 'Try again' } }));
    const result = computeMisconceptions([fan(weak)], localAssets, { now: NOW });
    expect(result.class).toEqual([]);
    expect(result.students.one.persistent).toHaveLength(1);
    expect(result.evidence['label:interpret the context'].every(event => event.weak)).toBe(true);
    const strong = { ...weak[0], frq_result: { missing: ['Interpret the context'] } };
    expect(computeMisconceptions([fan([strong, weak[1]])], localAssets, { now: NOW }).class).toEqual([]);
    const twoStrong = [strong, { ...strong, item_id: weak[1].item_id }];
    expect(computeMisconceptions([fan(twoStrong), fan(weak, 'two'), fan(weak, 'three'), fan(weak, 'four')],
      localAssets, { now: NOW }).class).toEqual([]);
  });
  it('treats curriculum_quiz rows like quiz rows, including null scores', () => {
    const rows = [quiz(), quiz(undefined, 7, 'B'), quiz(undefined, 7, '')];
    const curriculumRows = rows.map(row => ({ ...row, source: 'curriculum_quiz', score: null }));
    expect(extractEvents(curriculumRows, assets)).toEqual(extractEvents(rows, assets));
    expect(extractEvents(curriculumRows, assets)).toHaveLength(1);
  });
  it('emits wrong letters only, including untagged evidence', () => {
    const events = extractEvents([quiz(), quiz(undefined, 7, 'B'), quiz(undefined, 7, ''), quiz(undefined, 7, 'C')], assets);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ tags: ['conditional'], evidence: { chosen: 'A', correct: 'B' } });
    expect(events[1]).toMatchObject({ tags: [], label: 'chose C on U1-L1-Q01' });
  });
  it('resolves exact and fuzzy descriptions, returning null below threshold', () => {
    expect(resolveElement(elements[0].description, elements)?.id).toBe('denominator');
    expect(resolveElement('group total conditional percentage', elements)?.id).toBe('denominator');
    expect(resolveElement('unrelated normal distribution tail', elements)).toBeNull();
  });
  it('keeps the first element when overlaps tie', () => {
    expect(resolveElement('group total conditional percentage', [...elements, { ...elements[0], id: 'second' }])?.id).toBe('denominator');
  });
  it('retains the raw missing label and feedback for unmatched quiz FRQs', () => {
    const row = { ...frq(['Unknown but useful feedback'], 'Try again'), item_id: 'U1-PC-FRQ-Q02' };
    expect(extractEvents([row], assets)[0]).toMatchObject({ tags: [], label: 'Unknown but useful feedback',
      evidence: { elementId: null, feedback: 'Try again' } });
  });
  it('tags matched elements and only emits verbatim common mistakes', () => {
    const events = extractEvents([frq([elements[0].description], 'Dividing by the grand total is the problem.')], assets);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ tags: ['conditional'], evidence: { elementId: 'denominator' } });
    expect(events[1].label).toBe('Dividing by the grand total');
    expect(extractEvents([frq([], 'Use a different denominator')], assets)).toEqual([]);
  });
});

describe('frequent misconceptions', () => {
  it('ranks distinct students before events, breaks ties by key, and caps at 15', () => {
    const labels = Array.from({ length: 18 }, (_, i) => `Issue ${String(i).padStart(2, '0')}`);
    const rows = [fan([frq(labels), frq(['Issue 17']), frq(['Issue 17']), frq(['Issue 16'])]),
      fan([frq(['Issue 15'])], 'two')];
    const result = compute(rows);
    expect(result.frequent).toHaveLength(15);
    expect(result.frequent.map(entry => entry.label)).toEqual([
      'Issue 15', 'Issue 17', 'Issue 16', ...labels.slice(0, 12),
    ]);
    expect(result.frequent[0]).toMatchObject({ students: 2, activeStudents: 2, events: 2, weak: false });
    expect(result.class).toEqual([]);
    expect(compute([...rows].reverse()).frequent).toEqual(result.frequent);
  });
  it('includes readable untagged MCQ and rubric labels, both sources, and weak-only groups', () => {
    const weak = { ...frq(undefined), score: 0 };
    const result = compute([fan([quiz(undefined, 7, 'C'), quiz(), frq([elements[0].description]), weak]),
      fan([frq([elements[0].description]), weak], 'two')]);
    expect(result.frequent.find(entry => entry.key === 'conditional')).toMatchObject({
      label: assets.vocabulary.tags.conditional.label, draft: true, weak: false,
      students: 2, events: 3, sources: { mcq: 1, frq: 2 }, skills: ['3.C'],
    });
    expect(result.frequent.find(entry => entry.questionId)).toMatchObject({
      key: 'label:chose c on u1 l1 q01', label: 'U1-L1-Q01 · chose C, correct B',
      questionId: 'U1-L1-Q01', itemIds: ['U1-L1-Q01'], lessons: ['1.1'],
      weak: false, draft: false, sources: { mcq: 1, frq: 0 }, lastSeen: quiz().recorded_at,
    });
    expect(result.frequent.find(entry => entry.weak)).toMatchObject({ students: 2, events: 2, lessons: ['1.2'], sources: { mcq: 0, frq: 2 } });
    const untagged = structuredClone(assets);
    untagged.rubricMap.items = {};
    expect(computeMisconceptions([fan([frq([elements[0].description])]), fan([frq([elements[0].description])], 'two')],
      untagged, { now: NOW }).frequent[0]).toMatchObject({ label: elements[0].description, students: 2 });
  });
  it('flags mixed groups strong and caps items without capping events or lessons', () => {
    const local = structuredClone(assets);
    const rows = Array.from({ length: 12 }, (_, i) => {
      const item_id = `WS-U1L${i + 1}-reflect1`;
      local.rubricMap.rubrics[item_id] = { question: 'Shared issue' };
      return { ...frq(undefined), item_id, score: 0 };
    });
    rows.push(frq(['Shared issue']));
    const entry = computeMisconceptions([fan(rows)], local, { now: NOW }).frequent[0];
    expect(entry).toMatchObject({ weak: false, students: 1, events: 13 });
    expect(entry.itemIds).toHaveLength(10);
    expect(entry.lessons).toHaveLength(12);
  });
  it('applies the window to frequent groups and returns an empty array without evidence', () => {
    expect(compute([fan([quiz(undefined, 43)])]).frequent).toEqual([]);
    expect(compute([fan([quiz(undefined, 43)])], { days: 0 }).frequent).toHaveLength(1);
    expect(compute([]).frequent).toEqual([]);
  });
});

describe('misconception persistence', () => {
  it('requires distinct items at least three days apart for a student', () => {
    const result = compute([fan([quiz(), quiz('U1-L2-Q01', 4)])]);
    expect(result.students.one.persistent).toHaveLength(1);
    expect(result.students.one.persistent[0]).toMatchObject({ count: 2, draft: true });
    expect(result.class[0]).toMatchObject({ students: 1, activeStudents: 1, lessons: ['1.1', '1.2'] });
  });
  it.each([
    [quiz(), quiz('U1-L2-Q01', 7)],
    [quiz(), quiz('U1-L1-Q01', 1)],
    [quiz(), quiz('U1-L2-Q01', 4.01)],
  ])('does not call same-day, repeated-item, or too-close evidence student-persistent', (a, b) => {
    expect(compute([fan([a, b])]).students.one.persistent).toEqual([]);
  });
  it('requires the class share threshold and at least two lessons', () => {
    const relevant = fan([quiz(), quiz('U1-L2-Q01', 4)]);
    const others = ['two', 'three', 'four'].map(id => fan([quiz(undefined, 1, 'B')], id));
    expect(compute([relevant, ...others]).class).toEqual([]);
    expect(compute([relevant, ...others.slice(0, 2)]).class).toHaveLength(1);
    expect(compute([fan([quiz(), quiz()])]).class).toEqual([]);
  });
  it('filters the rolling window, includes its boundary, and supports whole year', () => {
    const rows = [fan([quiz(undefined, 42), quiz('U1-L2-Q01', 43)])];
    expect(compute(rows).students.one.persistent).toEqual([]);
    expect(compute(rows, { days: 0, config: { minDaysApart: 1 } }).students.one.persistent).toHaveLength(1);
    expect(compute(rows).evidence.conditional).toHaveLength(1);
    expect(compute(rows, { days: 0 }).window.from).toBeNull();
  });
  it('keeps untagged labels useful across written items', () => {
    const first = frq(['Needs a population context']);
    const second = { ...first, item_id: 'U1-PC-FRQ-Q02', recorded_at: quiz(undefined, 7).recorded_at };
    expect(compute([fan([first, second])]).students.one.persistent[0]).toMatchObject({
      key: 'label:needs a population context', draft: false, count: 2,
    });
  });
  it('caps evidence at the newest 50 without capping counts', () => {
    const rows = Array.from({ length: 80 }, (_, i) => quiz(i % 2 ? 'U1-L1-Q01' : 'U1-L2-Q01', i / 2));
    const result = compute([fan(rows)]);
    expect(result.evidence.conditional).toHaveLength(50);
    expect(result.students.one.persistent[0].count).toBe(80);
    expect(result.evidence.conditional[0].ts).toBe(new Date(NOW).toISOString());
  });
  it('keeps any unreviewed mapping draft even when the vocabulary is reviewed', () => {
    const reviewed = structuredClone(assets);
    reviewed.vocabulary.reviewed = true;
    const rows = [fan([quiz(), quiz('U1-L2-Q01', 4)])];
    expect(computeMisconceptions(rows, reviewed, { now: NOW }).class[0].draft).toBe(true);
    reviewed.distractorMap.reviewed = true;
    expect(computeMisconceptions(rows, reviewed, { now: NOW }).class[0].draft).toBe(false);
  });
  it('does not mutate input rows or assets and ignores teacher accounts', () => {
    const rows = [fan([quiz(), quiz('U1-L2-Q01', 4)])];
    const before = JSON.stringify({ rows, assets });
    compute(rows);
    expect(JSON.stringify({ rows, assets })).toBe(before);
    rows[0].roster.role = 'teacher';
    expect(compute(rows).students).toEqual({});
  });
});

let server;
it('sorts class entries by student count and then most recent evidence', () => {
  const rows = [fan([
    quiz(), quiz('U1-L2-Q01', 4),
    { ...frq(['A recurring issue']), item_id: 'WS-U1L1-reflect1' },
    { ...frq(['A recurring issue']), recorded_at: quiz(undefined, 1).recorded_at },
  ])];
  const result = compute(rows);
  expect(result.class.map(entry => entry.key)).toEqual(['label:a recurring issue', 'conditional']);
  rows.push(fan([quiz(), quiz('U1-L2-Q01', 4)], 'two'));
  expect(compute(rows).class.map(entry => entry.key)).toEqual(['conditional', 'label:a recurring issue']);
});

it('resolves split lesson links from the recorded combined worksheet filename', () => {
  const combined = structuredClone(assets);
  combined.rubricMap.rubrics['WS-U4L3-5-reflect1'] = { elements: [], worksheet: 'u4_lesson3-4-5_live.html' };
  expect(computeMisconceptions([], combined).worksheetLinks).toMatchObject({
    '4.3': 'u4_lesson3-4-5_live.html', '4.4': 'u4_lesson3-4-5_live.html', '4.5': 'u4_lesson3-4-5_live.html',
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) { await new Promise(resolve => server.close(resolve)); server = null; }
});
describe('GET /class/misconceptions', () => {
  it('returns nonpersistent frequent rows unchanged from the same cache', async () => {
    vi.stubEnv('ROSTER_TEACHER_SECRET', 'misconception-test-secret');
    const listRoster = vi.fn(async () => ({ data: [{ student_id: 'one', section: 'PeriodE' }] }));
    const getLedgerByStudent = vi.fn(async () => ({ data: [
      { ...quiz(undefined, 0, 'C'), recorded_at: new Date(Date.now() - 1000).toISOString() },
    ] }));
    const app = express();
    mountClass(app, { db: { listRoster }, ledgerDb: { getLedgerByStudent },
      loadAnswerKey: async () => ({ answerKey: assets.answerKey }) });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/class/misconceptions?section=PeriodE&days=42`;
    const headers = { 'x-teacher-secret': 'misconception-test-secret' };
    const first = await (await fetch(url, { headers })).json();
    expect(first.class).toEqual([]);
    expect(first.frequent[0]).toMatchObject({ questionId: 'U1-L1-Q01', students: 1, events: 1 });
    expect(await (await fetch(url, { headers })).json()).toEqual(first);
    expect(getLedgerByStudent).toHaveBeenCalledTimes(1);
  });
  it('uses teacher auth, returns an empty section, caches by section/days, and rejects invalid days', async () => {
    vi.stubEnv('ROSTER_TEACHER_SECRET', 'misconception-test-secret');
    const listRoster = vi.fn(async () => ({ data: [], error: null }));
    const app = express();
    mountClass(app, { db: { listRoster }, ledgerDb: {}, loadAnswerKey: async () => ({ answerKey: assets.answerKey }) });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/class/misconceptions`;
    expect((await fetch(base)).status).toBe(401);
    const headers = { 'x-teacher-secret': 'misconception-test-secret' };
    const response = await fetch(base + '?section=Empty&days=42', { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, section: 'Empty', class: [], frequent: [], students: {}, vocabReviewed: false });
    await fetch(base + '?section=Empty&days=42', { headers });
    expect(listRoster).toHaveBeenCalledTimes(1);
    expect((await fetch(base + '?section=Empty&days=42')).status).toBe(401);
    await fetch(base + '?section=Other&days=42', { headers });
    await fetch(base + '?section=Empty&days=14', { headers });
    expect(listRoster).toHaveBeenCalledTimes(3);
    expect((await fetch(base + '?days=-1', { headers })).status).toBe(400);
  });
});

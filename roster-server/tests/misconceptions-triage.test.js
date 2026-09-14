import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { computeMisconceptions } from '../misconceptions.js';
import { mountClass } from '../class.js';
import { loadMisconceptionTriage, triageStatus } from '../misconception-triage.js';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const assets = { vocabulary: { tags: {} }, answerKey: {}, distractorMap: { items: {} }, rubricMap: { items: {}, rubrics: {} } };
const entry = { sheet: '1.1+1.2', sheetTitle: 'Fresh Context', triagedAt: '2026-09-12' };
const history = dates => dates.map(date => ({ at: `${date}T21:00:00Z`, keys: ['label:target'] }));
const triage = { entries: { 'label:target': entry }, weeklyRuns: history(['2026-09-18', '2026-09-25', '2026-10-02']) };
const student = (id, labels, at = '2026-10-01T12:00:00Z') => ({ roster: { student_id: id },
  ledgerRows: labels.map(label => ({ source: 'frq', item_id: 'WS-U1L1-reflect1', recorded_at: at,
    frq_result: { missing: [label] } })) });
const compute = (fan, document = triage) => computeMisconceptions(fan, assets, { now: NOW, days: 42,
  triage: document, config: { classMinLessons: 1, classShare: 0 } });

describe('misconception triage', () => {
  it('adds triage to frequent and class rows and keeps untriaged first', () => {
    const result = compute([student('one', ['target', 'fresh']), student('two', ['target'])]);
    for (const rows of [result.frequent, result.class]) {
      expect(rows.map(row => row.key)).toEqual(['label:fresh', 'label:target']);
      expect(rows[0]).toMatchObject({ triage: null, recurringAfterTriage: false });
      expect(rows[1]).toMatchObject({ triage: entry, recurringAfterTriage: true });
    }
  });
  it('requires three distinct consecutive qualifying weeks after triage', () => {
    for (const dates of [['2026-09-25', '2026-10-02'], ['2026-09-18', '2026-09-18', '2026-09-18'],
      ['2026-09-11', '2026-09-18', '2026-10-02']]) {
      const document = { ...triage, weeklyRuns: history(dates) };
      expect(compute([student('one', ['target'])], document).frequent[0].recurringAfterTriage).toBe(false);
    }
    const broken = structuredClone(triage);
    broken.weeklyRuns[1].keys = [];
    expect(compute([student('one', ['target'])], broken).frequent[0].recurringAfterTriage).toBe(false);
    const retriaged = { ...triage, entries: { 'label:target': { ...entry, triagedAt: '2026-10-02' } } };
    expect(compute([student('one', ['target'])], retriaged).frequent[0].recurringAfterTriage).toBe(false);
  });
  it('uses post-triage events for the top fifteen, not pre-triage counts or capped excerpts', () => {
    const fan = Array.from({ length: 60 }, (_, i) => student(`old-${i}`, ['target'], '2026-09-10T12:00:00Z'));
    const competitors = Array.from({ length: 15 }, (_, i) => `competitor ${String(i).padStart(2, '0')}`);
    fan.push(student('new-one', [...competitors, 'target']), student('new-two', competitors));
    const result = compute(fan);
    const target = result.frequent.find(row => row.key === 'label:target');
    expect(target.students).toBe(61);
    expect(result.evidence['label:target']).toHaveLength(50);
    expect(target.recurringAfterTriage).toBe(false);
    expect(result.postTriageFrequent).toHaveLength(15);
    expect(result.postTriageFrequent.some(row => row.key === 'label:target')).toBe(false);
  });
  it('does not count future observations and never mutates bundled triage', () => {
    const before = JSON.stringify(triage);
    expect(triageStatus('label:target', triage, new Set(['label:target']), Date.parse('2026-09-26')).recurringAfterTriage).toBe(false);
    compute([student('one', ['target'])]);
    expect(JSON.stringify(triage)).toBe(before);
    const bundled = loadMisconceptionTriage();
    expect(Object.keys(bundled.entries)).toHaveLength(5);
    expect(Object.values(bundled.entries).every(row => row.sheetTitle === 'Screen Time, Two Deletions')).toBe(true);
  });
  it('loads triage through the authenticated endpoint boundary and caches it', async () => {
    vi.stubEnv('ROSTER_TEACHER_SECRET', 'synthetic-triage-test');
    const loadTriage = vi.fn(() => triage);
    const app = express();
    mountClass(app, { db: { listRoster: async () => ({ data: [] }) }, ledgerDb: {},
      loadAnswerKey: async () => ({ answerKey: {} }), loadTriage });
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise(resolve => server.once('listening', resolve));
      const url = `http://127.0.0.1:${server.address().port}/class/misconceptions?section=PeriodB&days=14`;
      expect((await fetch(url)).status).toBe(401);
      expect(loadTriage).not.toHaveBeenCalled();
      const options = { headers: { 'x-teacher-secret': 'synthetic-triage-test' } };
      expect((await fetch(url, options)).status).toBe(200);
      expect((await fetch(url, options)).status).toBe(200);
      expect(loadTriage).toHaveBeenCalledOnce();
    } finally {
      await new Promise(resolve => server.close(resolve));
      vi.unstubAllEnvs();
    }
  });
});

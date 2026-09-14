/**
 * tests/teacher-app.test.js — ANDROID Phase 4 teacher-app grading logic.
 * Pure functions (queue derivation, E/P/I scoring, record building) extracted from
 * teacher-app.html. The signing/network/biometric shell is exercised on-device.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HTML = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'teacher-app.html'), 'utf8');

function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const FNS = ['_itemKey', '_findPendingFrqs', '_scoreFromGrade', '_buildGradeRecord', '_rowsForHead'].map((n) => fnBody(HTML, n)).join('\n');
const api = new Function(FNS + '\nreturn { _itemKey, _findPendingFrqs, _scoreFromGrade, _buildGradeRecord, _rowsForHead };')();

describe('_findPendingFrqs', () => {
  const snapshot = {
    students: [
      { studentId: 's1', username: 'Foo', bundle: { records: [
        { source: 'frq', itemId: 'i-r1', response: 'ans1', score: null, attempt: 1 },           // pending
        { source: 'frq', itemId: 'i-r2', response: 'ans2', score: 1, attempt: 1 },               // graded → skip
        { source: 'frq', itemId: 'i-r3', response: 'old', score: null, attempt: 1 },
        { source: 'frq', itemId: 'i-r3', response: 'new', score: 0.5, attempt: 2 },              // latest scored → skip
        { source: 'worksheet', itemId: 'i-q1', response: 'x', score: null, attempt: 1 },          // non-frq → ignore
      ] } },
      { studentId: 's2', username: 'Bar', bundle: { records: [
        { source: 'frq', itemId: 'i-z', response: 'b', score: undefined, attempt: 1 },           // pending
      ] } },
    ],
  };

  it('returns only latest-attempt frq rows with a null/undefined score', () => {
    const pending = api._findPendingFrqs(snapshot);
    const keys = pending.map((p) => p.studentId + '/' + p.itemId).sort();
    expect(keys).toEqual(['s1/i-r1', 's2/i-z']);
  });

  it('carries the response + attempt for signing', () => {
    const p = api._findPendingFrqs(snapshot).find((x) => x.itemId === 'i-r1');
    expect(p).toMatchObject({ studentId: 's1', response: 'ans1', attempt: 1 });
  });

  it('empty / malformed snapshot → empty', () => {
    expect(api._findPendingFrqs(null)).toEqual([]);
    expect(api._findPendingFrqs({ students: [] })).toEqual([]);
  });
});

describe('_scoreFromGrade', () => {
  it('maps E/P/I to 1/0.5/0', () => {
    expect(api._scoreFromGrade('E')).toBe(1);
    expect(api._scoreFromGrade('P')).toBe(0.5);
    expect(api._scoreFromGrade('I')).toBe(0);
  });
  it('passes a 0..1 number, rejects out-of-range / junk', () => {
    expect(api._scoreFromGrade(0.7)).toBe(0.7);
    expect(api._scoreFromGrade('1')).toBe(1);
    expect(api._scoreFromGrade(2)).toBeNull();
    expect(api._scoreFromGrade(-1)).toBeNull();
    expect(api._scoreFromGrade('x')).toBeNull();
    expect(api._scoreFromGrade(null)).toBeNull();
  });
});

describe('_buildGradeRecord', () => {
  it('supersedes with attempt+1, binds response, carries the signed receipt', () => {
    const pending = { studentId: 's1', itemId: 'i-r1', response: 'ans1', attempt: 1 };
    const signed = { receiptId: 'rid', compact: 'payload.sig', payload: { ts: 1700000000000 } };
    const rec = api._buildGradeRecord(pending, 0.5, signed);
    expect(rec).toEqual({
      studentId: 's1', source: 'frq', itemId: 'i-r1', response: 'ans1', score: 0.5,
      attempt: 2, recorded_at: new Date(1700000000000).toISOString(),
      receipt_id: 'rid', receipt_compact: 'payload.sig',
    });
  });
});

describe('_rowsForHead', () => {
  it('keeps only receipt-bearing rows, shaped {id, ts}', () => {
    const rows = api._rowsForHead([
      { receipt_id: 'a', receipt_compact: 'c', recorded_at: '2026-09-20T00:00:00Z' },
      { receipt_id: null, receipt_compact: null, recorded_at: '2026-09-20T00:00:00Z' }, // dropped
      { receipt_id: 'b', receipt_compact: 'c2', recorded_at: '2026-09-21T00:00:00Z' },
    ]);
    expect(rows).toEqual([
      { id: 'a', ts: Date.parse('2026-09-20T00:00:00Z') },
      { id: 'b', ts: Date.parse('2026-09-21T00:00:00Z') },
    ]);
  });
});

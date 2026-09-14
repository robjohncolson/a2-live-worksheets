// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { firstDiffPath } from './firstDiffPath.js';

describe('firstDiffPath', () => {
  it('returns null for equal JSON values', () => {
    expect(firstDiffPath({ a: [1, null, { b: true }] }, { a: [1, null, { b: true }] })).toBeNull();
  });

  it('returns the first nested object path in sorted-key order', () => {
    const actual = { z: 1, student: { grade: { Q1: 82, Q2: 90 } } };
    const expected = { z: 1, student: { grade: { Q1: 83, Q2: 90 } } };

    expect(firstDiffPath(actual, expected)).toBe('$.student.grade.Q1');
  });

  it('returns an array index for a changed or missing entry', () => {
    expect(firstDiffPath({ rows: ['a', 'b'] }, { rows: ['a', 'c'] })).toBe('$.rows[1]');
    expect(firstDiffPath({ rows: ['a'] }, { rows: ['a', 'b'] })).toBe('$.rows[1]');
  });

  it('quotes object keys that are not identifier-safe', () => {
    expect(firstDiffPath({ 'gm-one': 1 }, { 'gm-one': 2 })).toBe('$["gm-one"]');
  });

  it('reports a missing property instead of treating it as undefined', () => {
    expect(firstDiffPath({ grade: undefined }, {})).toBe('$.grade');
  });

  it('reports the current path when JSON value kinds differ', () => {
    expect(firstDiffPath({ value: null }, { value: {} })).toBe('$.value');
    expect(firstDiffPath([], {})).toBe('$');
  });
});

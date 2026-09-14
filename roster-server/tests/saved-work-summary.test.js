import { describe, it, expect } from 'vitest';
import { summarizeSavedWork } from '../class.js';

describe('class workspace saved-work summary', () => {
  it('uses latest attempts, clears graded retries, and sends metadata only', () => {
    const rows = [
      { source: 'frq', item_id: 'a', recorded_at: '2026-09-09', response: 'Private answer', score: null },
      { source: 'frq', item_id: 'a', recorded_at: '2026-09-10', response: 'Private retry', score: 0 },
      { source: 'frq', item_id: 'b', recorded_at: '2026-09-10', response: 'Saved answer', score: null },
      { source: 'worksheet', item_id: 'c', recorded_at: '2026-09-10', response: 'Blank', score: null },
      { source: 'frq', item_id: 'empty', recorded_at: '2026-09-10', response: ' ', score: null }
    ];
    const result = summarizeSavedWork(rows);
    expect(result.available).toBe(true);
    expect(result.pendingGrading).toBe(1);
    expect(result.recent.filter(r => r.itemId === 'a')).toHaveLength(1);
    expect(result.recent.find(r => r.itemId === 'a').score).toBe(0);
    expect(JSON.stringify(result)).not.toContain('Private');
    expect(result.recent.every(r => !('response' in r))).toBe(true);
  });
  it('bounds the feed without losing the total awaiting grading', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ source: 'frq', item_id: String(i), response: 'answer', score: null, recorded_at: String(i).padStart(2, '0') }));
    expect(summarizeSavedWork(rows).recent).toHaveLength(8);
    expect(summarizeSavedWork(rows).pendingGrading).toBe(20);
  });
  it('distinguishes a failed ledger read from a successful empty ledger', () => {
    expect(summarizeSavedWork([], new Error('offline'))).toEqual({ available: false, recent: [], pendingGrading: null });
    expect(summarizeSavedWork([])).toEqual({ available: true, recent: [], pendingGrading: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import { classifyAnswerSource } from '../../scripts/ingest-answers-to-ledger.mjs';

describe('classifyAnswerSource', () => {
  it('classifies progress-check question ids', () => {
    expect(classifyAnswerSource('U4-PC-03')).toBe('pc');
    expect(classifyAnswerSource('u7-pc-item-2')).toBe('pc');
  });

  it('classifies curriculum quiz question ids', () => {
    expect(classifyAnswerSource('U4-L3-Q2')).toBe('curriculum_quiz');
    expect(classifyAnswerSource('u9-l12-q-final')).toBe('curriculum_quiz');
  });

  it('skips unknown question ids', () => {
    expect(classifyAnswerSource('junk')).toBeNull();
    expect(classifyAnswerSource('U4-L3-FRQ1')).toBeNull();
    expect(classifyAnswerSource(null)).toBeNull();
  });
});

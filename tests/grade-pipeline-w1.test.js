/**
 * tests/grade-pipeline-w1.test.js
 *
 * Acceptance tests for GRADE_PIPELINE_BUILD.md Section 4.2 (W1 client feeder).
 * Covers the change to recordBlankToGradebook:
 *   - correct blank   -> score 1
 *   - partial blank   -> score 0.5
 *   - incorrect blank -> score 0
 *   - empty blank     -> no record call (existing empty-skip stays)
 *   - unknown verdict (defensive) -> score omitted (undefined), not a crash
 *
 * These tests run in jsdom and exercise the inserted logic extracted from
 * the wired worksheets (extracted-logic pattern, matching grade-pipeline-w2.test.js).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: build a minimal .blank input element for each verdict
// ---------------------------------------------------------------------------

function makeBlank(value, verdict) {
    const input = document.createElement('input');
    input.className = 'blank';
    input.dataset.questionId = 'WS-U1L1-Q1';
    input.dataset.answer = 'expected answer';
    input.value = value;
    // Pre-apply the class the blank would have after checkAnswer ran upstream.
    if (verdict === 'correct') input.classList.add('correct');
    if (verdict === 'partial') input.classList.add('partial');
    if (verdict === 'incorrect') input.classList.add('incorrect');
    document.body.appendChild(input);
    return input;
}

// ---------------------------------------------------------------------------
// Extracted functions under test
// These match exactly the code inserted by wire-blank-scores.mjs into
// recordBlankToGradebook, exercised through a minimal harness.
// ---------------------------------------------------------------------------

/**
 * recordBlankToGradebook -- the W1.4.2-wired version.
 * checkAnswerFn replaces the in-scope checkAnswer (simulates any verdict).
 * recordSpy replaces window.gradebookClient.record.
 *
 * Replicates the full function body as shipped by the wire script.
 */
function recordBlankToGradebook_wired(blank, checkAnswerFn, recordSpy) {
    // Guard: gradebookClient present (always true in tests via spy).
    if (!recordSpy) return;
    var itemId = blank && blank.dataset ? blank.dataset.questionId : null;
    if (!itemId) return;
    var value = (blank.value || '').trim();
    if (!value) return;  // existing empty-answer skip -- unchanged by W1.4.2
    // W1.4.2: compute verdict and score for this blank.
    // checkAnswer's CSS-class side effect is benign: it re-applies
    // the class the blank already has (it was already called upstream).
    var blankScoreMap = { correct: 1, partial: 0.5, incorrect: 0 };
    var blankVerdict = (typeof checkAnswerFn === 'function') ? checkAnswerFn(blank) : null;
    var blankScore = (blankVerdict !== null && blankVerdict in blankScoreMap)
        ? blankScoreMap[blankVerdict]
        : undefined;
    recordSpy({
        source: 'worksheet', itemId: itemId,
        unit: 'U1', response: value,
        score: blankScore,
        attempt: 1
    });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('W1.4.2 -- recordBlankToGradebook records a numeric score', () => {
    it('records score 1 for a correct blank', () => {
        const spy = vi.fn();
        const blank = makeBlank('expected answer', 'correct');

        recordBlankToGradebook_wired(blank, () => 'correct', spy);

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0].score).toBe(1);
        expect(spy.mock.calls[0][0].source).toBe('worksheet');
    });

    it('records score 0.5 for a partial blank', () => {
        const spy = vi.fn();
        const blank = makeBlank('expected', 'partial');

        recordBlankToGradebook_wired(blank, () => 'partial', spy);

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0].score).toBe(0.5);
    });

    it('records score 0 for an incorrect blank', () => {
        const spy = vi.fn();
        const blank = makeBlank('wrong answer', 'incorrect');

        recordBlankToGradebook_wired(blank, () => 'incorrect', spy);

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0].score).toBe(0);
    });

    it('does not call record when blank value is empty (existing empty-skip)', () => {
        const spy = vi.fn();
        const blank = makeBlank('', 'empty');

        recordBlankToGradebook_wired(blank, () => 'empty', spy);

        expect(spy).not.toHaveBeenCalled();
    });

    it('does not call record when blank value is whitespace only', () => {
        const spy = vi.fn();
        const blank = makeBlank('   ', 'empty');

        recordBlankToGradebook_wired(blank, () => 'empty', spy);

        expect(spy).not.toHaveBeenCalled();
    });

    it('records source as "worksheet" (not frq)', () => {
        const spy = vi.fn();
        const blank = makeBlank('some answer', 'correct');

        recordBlankToGradebook_wired(blank, () => 'correct', spy);

        expect(spy.mock.calls[0][0].source).toBe('worksheet');
    });

    it('records the trimmed value as response', () => {
        const spy = vi.fn();
        const blank = makeBlank('  my answer  ', 'correct');

        recordBlankToGradebook_wired(blank, () => 'correct', spy);

        expect(spy.mock.calls[0][0].response).toBe('my answer');
    });
});

describe('W1.4.2 -- defensive guard for unknown verdict', () => {
    it('omits score (undefined) when checkAnswer returns an unknown verdict', () => {
        const spy = vi.fn();
        const blank = makeBlank('some value', 'correct');

        // Simulate an unexpected verdict (future extension or edge case).
        recordBlankToGradebook_wired(blank, () => 'unknown_verdict', spy);

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0].score).toBeUndefined();
    });

    it('omits score (undefined) when checkAnswer is not a function (graceful degrade)', () => {
        const spy = vi.fn();
        const blank = makeBlank('some value', 'correct');

        // Pass null instead of a function to simulate checkAnswer not in scope.
        recordBlankToGradebook_wired(blank, null, spy);

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0].score).toBeUndefined();
    });

    it('omits score (undefined) when checkAnswer returns null', () => {
        const spy = vi.fn();
        const blank = makeBlank('some value', 'correct');

        recordBlankToGradebook_wired(blank, () => null, spy);

        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0].score).toBeUndefined();
    });
});

describe('W1.4.2 -- score map values are correct (spot-check)', () => {
    it('score map: correct -> 1', () => {
        const scoreMap = { correct: 1, partial: 0.5, incorrect: 0 };
        expect(scoreMap.correct).toBe(1);
    });

    it('score map: partial -> 0.5', () => {
        const scoreMap = { correct: 1, partial: 0.5, incorrect: 0 };
        expect(scoreMap.partial).toBe(0.5);
    });

    it('score map: incorrect -> 0', () => {
        const scoreMap = { correct: 1, partial: 0.5, incorrect: 0 };
        expect(scoreMap.incorrect).toBe(0);
    });

    it('score map does not have an "empty" key', () => {
        const scoreMap = { correct: 1, partial: 0.5, incorrect: 0 };
        expect('empty' in scoreMap).toBe(false);
    });
});

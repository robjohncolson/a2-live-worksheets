/**
 * tests/grade-pipeline-w3-parser.test.js
 *
 * Acceptance tests for GRADE_PIPELINE_BUILD.md Section 3 W3.2
 * (tolerant verdict parser).
 *
 * W3.2 splits the reflection ledger sink in two:
 *   recordReflectionDraft(textareaId, answer)
 *     -- the W2.1 draft sink: records the in-progress answer with
 *        score:undefined and runs no verdict logic.
 *   recordReflectionToGradebook(textareaId, answer, scoreLetter)
 *     -- the GRADED/appeal sink: coerceVerdict(scoreLetter); a valid
 *        E/P/I records the mapped score; null (an ambiguous OR missing
 *        verdict) is console.error'd and the write is skipped -- never
 *        a silent no-score row.
 *
 * coerceVerdict reads the FIRST character after trim + uppercase.
 *
 * The functions below are extracted copies that match the code
 * scripts/wire-verdict-parser.mjs inserts into the 69 worksheets.
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Extracted functions under test
// ---------------------------------------------------------------------------

// W3.2a -- coerceVerdict: trim, uppercase, read the FIRST character.
function coerceVerdict(raw) {
    if (raw === null || raw === undefined) return null;
    var s = String(raw).trim().toUpperCase();
    if (!s) return null;
    var c = s.charAt(0);
    return (c === 'E' || c === 'P' || c === 'I') ? c : null;
}

// W3.2a -- recordReflectionDraft: the W2.1 draft sink. Records the
// in-progress answer with score:undefined; runs no verdict logic.
// recordSpy stands in for window.gradebookClient.record.
function recordReflectionDraft(textareaId, answer, recordSpy) {
    if (!recordSpy) return;                       // no gradebookClient
    if (!answer || !answer.trim()) return;        // empty-answer guard
    var itemId = 'WS-U1L1-' + textareaId;
    recordSpy({
        source: 'frq', itemId: itemId,
        response: answer,
        score: undefined,
        attempt: 1
    });
}

// W3.2b -- recordReflectionToGradebook: the GRADED/appeal sink.
// recordSpy stands in for window.gradebookClient.record;
// errorSpy stands in for console.error.
function recordReflectionToGradebook(textareaId, answer, scoreLetter, recordSpy, errorSpy) {
    if (!recordSpy) return;                       // no gradebookClient
    if (!answer || !answer.trim()) return;        // W2.0 empty-answer guard
    var itemId = 'WS-U1L1-' + textareaId;
    // W3.2: graded verdict -- coerce or loudly skip (never silent).
    var verdict = coerceVerdict(scoreLetter);
    if (verdict === null) {
        if (errorSpy) errorSpy('[recordReflectionToGradebook] ambiguous or missing AI verdict:', scoreLetter, 'itemId:', itemId);
        return;
    }
    var scoreMap = { E: 1, P: 0.5, I: 0 };
    recordSpy({
        source: 'frq', itemId: itemId,
        response: answer,
        score: scoreMap[verdict],
        attempt: 1
    });
}

// ---------------------------------------------------------------------------
// coerceVerdict -- first-character mapping
// ---------------------------------------------------------------------------

describe('coerceVerdict -- first-character mapping', () => {
    it('returns E for "E"', () => { expect(coerceVerdict('E')).toBe('E'); });
    it('returns P for "P"', () => { expect(coerceVerdict('P')).toBe('P'); });
    it('returns I for "I"', () => { expect(coerceVerdict('I')).toBe('I'); });

    it('returns E for "e" (lowercase)', () => { expect(coerceVerdict('e')).toBe('E'); });
    it('returns P for "p" (lowercase)', () => { expect(coerceVerdict('p')).toBe('P'); });
    it('returns I for "i" (lowercase)', () => { expect(coerceVerdict('i')).toBe('I'); });

    it('returns E for "Essentially" (starts with E)', () => { expect(coerceVerdict('Essentially')).toBe('E'); });
    it('returns P for "Partial" (starts with P)', () => { expect(coerceVerdict('Partial')).toBe('P'); });
    it('returns I for "Incorrect" (starts with I)', () => { expect(coerceVerdict('Incorrect')).toBe('I'); });
    it('returns I for "incorrect" (lowercase word)', () => { expect(coerceVerdict('incorrect')).toBe('I'); });

    it('returns P for "  P  " (padded whitespace)', () => { expect(coerceVerdict('  P  ')).toBe('P'); });
    it('returns E for "  e  " (padded lowercase)', () => { expect(coerceVerdict('  e  ')).toBe('E'); });

    it('returns I for "I." (trailing period)', () => { expect(coerceVerdict('I.')).toBe('I'); });
    it('returns E for "E!" (trailing exclamation)', () => { expect(coerceVerdict('E!')).toBe('E'); });

    it('returns null for null', () => { expect(coerceVerdict(null)).toBeNull(); });
    it('returns null for undefined', () => { expect(coerceVerdict(undefined)).toBeNull(); });
    it('returns null for empty string', () => { expect(coerceVerdict('')).toBeNull(); });
    it('returns null for whitespace-only string', () => { expect(coerceVerdict('   ')).toBeNull(); });

    // First character not E/P/I -- ambiguous, returns null (must be flagged,
    // never silently coerced).
    it('returns null for "maybe" (first char M)', () => { expect(coerceVerdict('maybe')).toBeNull(); });
    it('returns null for "yes" (first char Y)', () => { expect(coerceVerdict('yes')).toBeNull(); });
    it('returns null for "correct" (first char C -- ambiguous)', () => { expect(coerceVerdict('correct')).toBeNull(); });
    it('returns null for "bad" (first char B)', () => { expect(coerceVerdict('bad')).toBeNull(); });
    it('returns null for "wrong" (first char W)', () => { expect(coerceVerdict('wrong')).toBeNull(); });

    it('returns null for number 1', () => { expect(coerceVerdict(1)).toBeNull(); });
    it('returns null for number 0', () => { expect(coerceVerdict(0)).toBeNull(); });
    it('returns null for number 0.5', () => { expect(coerceVerdict(0.5)).toBeNull(); });

    it('returns E for "EP" (first char E)', () => { expect(coerceVerdict('EP')).toBe('E'); });
    it('returns P for "PI" (first char P)', () => { expect(coerceVerdict('PI')).toBe('P'); });
});

// ---------------------------------------------------------------------------
// recordReflectionDraft -- the W2.1 draft sink
// ---------------------------------------------------------------------------

describe('recordReflectionDraft -- W2.1 draft sink', () => {
    it('records the answer with score:undefined', () => {
        const recordSpy = vi.fn();
        recordReflectionDraft('reflect1', 'my in-progress answer', recordSpy);
        expect(recordSpy).toHaveBeenCalledOnce();
        expect(recordSpy.mock.calls[0][0].score).toBeUndefined();
    });

    it('records source frq, itemId, response, attempt', () => {
        const recordSpy = vi.fn();
        recordReflectionDraft('exitTicket', 'draft text', recordSpy);
        const call = recordSpy.mock.calls[0][0];
        expect(call.source).toBe('frq');
        expect(call.itemId).toContain('exitTicket');
        expect(call.response).toBe('draft text');
        expect(call.attempt).toBe(1);
    });

    it('skips an empty answer', () => {
        const recordSpy = vi.fn();
        recordReflectionDraft('reflect1', '', recordSpy);
        expect(recordSpy).not.toHaveBeenCalled();
    });

    it('skips a whitespace-only answer', () => {
        const recordSpy = vi.fn();
        recordReflectionDraft('reflect1', '   ', recordSpy);
        expect(recordSpy).not.toHaveBeenCalled();
    });

    it('no-ops without a gradebook client', () => {
        expect(() => recordReflectionDraft('reflect1', 'answer', null)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// recordReflectionToGradebook -- the GRADED/appeal sink
// ---------------------------------------------------------------------------

describe('recordReflectionToGradebook -- valid verdict records the mapped score', () => {
    it('records score 1 for "E"', () => {
        const recordSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'great answer', 'E', recordSpy, vi.fn());
        expect(recordSpy.mock.calls[0][0].score).toBe(1);
    });
    it('records score 0.5 for "P"', () => {
        const recordSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'ok answer', 'P', recordSpy, vi.fn());
        expect(recordSpy.mock.calls[0][0].score).toBe(0.5);
    });
    it('records score 0 for "I"', () => {
        const recordSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'wrong answer', 'I', recordSpy, vi.fn());
        expect(recordSpy.mock.calls[0][0].score).toBe(0);
    });
    it('records score 1 for lowercase "e" (coercion)', () => {
        const recordSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'good', 'e', recordSpy, vi.fn());
        expect(recordSpy.mock.calls[0][0].score).toBe(1);
    });
    it('records score 1 for "Essentially correct" (word coercion)', () => {
        const recordSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'good', 'Essentially correct', recordSpy, vi.fn());
        expect(recordSpy.mock.calls[0][0].score).toBe(1);
    });
    it('does not call console.error for a valid verdict', () => {
        const errorSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'good', 'E', vi.fn(), errorSpy);
        expect(errorSpy).not.toHaveBeenCalled();
    });
});

describe('recordReflectionToGradebook -- null/missing verdict is loud, never silent (Codex W3 MAJOR)', () => {
    // The graded path passes result.score; a malformed AI response makes that
    // null or undefined. That must NOT silently land as a no-score row -- it
    // must be console.error'd and skipped.
    it('null verdict (AI returned no score): console.error, no record', () => {
        const recordSpy = vi.fn();
        const errorSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'a graded answer', null, recordSpy, errorSpy);
        expect(recordSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledOnce();
    });
    it('undefined verdict (AI omitted the score field): console.error, no record', () => {
        const recordSpy = vi.fn();
        const errorSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'a graded answer', undefined, recordSpy, errorSpy);
        expect(recordSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledOnce();
    });
    it('uncoercible verdict "maybe": console.error, no record', () => {
        const recordSpy = vi.fn();
        const errorSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'a graded answer', 'maybe', recordSpy, errorSpy);
        expect(recordSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledOnce();
    });
    it('uncoercible verdict "" (empty string): console.error, no record', () => {
        const recordSpy = vi.fn();
        const errorSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'a graded answer', '', recordSpy, errorSpy);
        expect(recordSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledOnce();
    });
    it('the error message carries the raw verdict and the itemId', () => {
        const errorSpy = vi.fn();
        recordReflectionToGradebook('reflect1', 'a graded answer', 'maybe', vi.fn(), errorSpy);
        const allArgs = errorSpy.mock.calls[0].map(String).join(' ');
        expect(allArgs).toContain('maybe');
        expect(allArgs).toContain('reflect1');
    });
});

describe('recordReflectionToGradebook -- W2.0 empty-answer guard', () => {
    it('skips when the answer is empty, even for a valid verdict', () => {
        const recordSpy = vi.fn();
        recordReflectionToGradebook('reflect1', '', 'E', recordSpy, vi.fn());
        expect(recordSpy).not.toHaveBeenCalled();
    });
    it('skips when the answer is whitespace-only', () => {
        const recordSpy = vi.fn();
        recordReflectionToGradebook('reflect1', '   ', 'E', recordSpy, vi.fn());
        expect(recordSpy).not.toHaveBeenCalled();
    });
});

/**
 * tests/grade-pipeline-w2.test.js
 *
 * Acceptance tests for GRADE_PIPELINE_BUILD.md Section 2 (W2).
 * Covers all four sub-changes + empty-skip guard:
 *   W2.0 -- recordReflectionToGradebook empty-answer skip guard
 *   W2.1 -- draft-persist on edit (no-score record)
 *   W2.2 -- stale-grade clear on edit
 *   W2.3 -- appeals re-record via recordReflectionToGradebook
 *   W2.4 -- hydration restores graded-{E|P|I} class from ledger score
 *
 * These tests run in jsdom and exercise the in-browser JS logic
 * extracted from the wired worksheets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal DOM environment helpers (jsdom provided by vitest config)
// ---------------------------------------------------------------------------

function makeTextarea(id, value, classes) {
    const ta = document.createElement('textarea');
    ta.id = id;
    ta.value = value || '';
    if (classes) classes.forEach((c) => ta.classList.add(c));
    document.body.appendChild(ta);
    return ta;
}

function makeFeedbackDiv(id) {
    const div = document.createElement('div');
    div.id = id + '-feedback';
    div.innerHTML = '<span>some old feedback</span>';
    document.body.appendChild(div);
    return div;
}

// ---------------------------------------------------------------------------
// Extracted functions under test
// These match exactly the code inserted by wire-reflection-persistence.mjs
// ---------------------------------------------------------------------------

// W2.0 -- empty-answer skip guard
// (inserted into recordReflectionToGradebook)
function recordReflectionToGradebook_withGuard(textareaId, answer, scoreLetter, recordSpy) {
    // The guard the wire script inserts at the top of recordReflectionToGradebook:
    if (!answer || !answer.trim()) return;
    var scoreMap = { E: 1, P: 0.5, I: 0 };
    recordSpy({
        source: 'frq',
        itemId: 'WS-U1L1-' + textareaId,
        response: answer,
        score: (scoreLetter in scoreMap) ? scoreMap[scoreLetter] : undefined,
        attempt: 1
    });
}

// W2.1 + W2.2 -- the input listener logic (extracted for unit testing)
// gradingState is the Map used by all worksheets.
// recordReflectionFn is the module-level function (spy here).
function makeReflectionInputHandler(gradingState, recordReflectionFn) {
    var _reflDebounce = {};
    return function handleReflectionInput(e) {
        var ta = e.target;
        if (!ta || ta.tagName !== 'TEXTAREA' || !ta.id) return;
        if (ta.closest && ta.closest('.appeal-form')) return;
        var id = ta.id;
        var text = (ta.value || '').trim();
        // W2.2: clear stale grade if text differs from the scored answer.
        var state = gradingState.get(id);
        if (state && (ta.classList.contains('graded-E') ||
                      ta.classList.contains('graded-P') ||
                      ta.classList.contains('graded-I'))) {
            if (text !== (state.originalAnswer || '').trim()) {
                ta.classList.remove('graded-E', 'graded-P', 'graded-I');
                var fb = document.getElementById(id + '-feedback');
                if (fb) fb.innerHTML = '';
                gradingState.delete(id);
            }
        }
        // W2.1: draft-persist (skip if unchanged since grading, skip empty).
        if (!text) return;
        var graded = gradingState.get(id);
        if (graded && (graded.originalAnswer || '').trim() === text) return;
        if (_reflDebounce[id]) clearTimeout(_reflDebounce[id]);
        _reflDebounce[id] = setTimeout(function () {
            recordReflectionFn(id, text, null);
        }, 400);
    };
}

// W2.3 -- appeal re-record (the two lines inserted after state.result = appealResult)
function applyW23AppealRecord(state, questionId, appealResult, recordFn) {
    state.result = appealResult;
    recordFn(questionId, state.originalAnswer, appealResult.score);
}

// W2.3 (u3_lesson6-7 variant) -- object-spread state.result update + the
// hand-applied recordReflectionToGradebook call in submitAppealForQuestion.
function applyW23U3AppealRecord(state, textareaId, result, recordFn) {
    state.result = {
        ...state.result,
        score: result.score,
        feedback: result.feedback || result.appealResponse,
        _appealProcessed: true
    };
    recordFn(textareaId, state.originalAnswer, result.score);
}

// W2.4 -- hydration grade class restore
// W2.5 -- hydration rebuilds the gradingState entry (Codex BLOCKER fold)
function applyW24HydrationGradeClass(ta, entry, gradingState) {
    ta.dataset.restored = '1';
    // W2.4: restore grade class from ledger score (1->E, 0.5->P, 0->I).
    if (entry.score !== null && entry.score !== undefined) {
        var gradeMap = { 1: 'E', 0.5: 'P', 0: 'I' };
        var gradeClass = gradeMap[entry.score];
        if (gradeClass) {
            ta.classList.remove('graded-E', 'graded-P', 'graded-I');
            ta.classList.add('graded-' + gradeClass);
            // W2.5: rebuild gradingState so a post-reload edit clears the stale grade.
            var v = (entry.response !== undefined && entry.response !== null) ? String(entry.response) : '';
            if (gradingState && typeof gradingState.set === 'function') {
                gradingState.set(ta.id, { result: { score: gradeClass, feedback: '' }, originalAnswer: v, appealCount: 0, history: [] });
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

beforeEach(() => {
    // Clear DOM between tests.
    document.body.innerHTML = '';
});

describe('W2.0 -- empty-answer skip guard in recordReflectionToGradebook', () => {
    it('does not call record when answer is empty string', () => {
        const spy = vi.fn();
        recordReflectionToGradebook_withGuard('reflect1', '', 'E', spy);
        expect(spy).not.toHaveBeenCalled();
    });

    it('does not call record when answer is whitespace only', () => {
        const spy = vi.fn();
        recordReflectionToGradebook_withGuard('reflect1', '   ', 'E', spy);
        expect(spy).not.toHaveBeenCalled();
    });

    it('does not call record when answer is null', () => {
        const spy = vi.fn();
        recordReflectionToGradebook_withGuard('reflect1', null, 'E', spy);
        expect(spy).not.toHaveBeenCalled();
    });

    it('calls record with score when answer is non-empty', () => {
        const spy = vi.fn();
        recordReflectionToGradebook_withGuard('reflect1', 'some answer', 'E', spy);
        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0].score).toBe(1);
    });

    it('calls record with undefined score for null scoreLetter (draft)', () => {
        const spy = vi.fn();
        recordReflectionToGradebook_withGuard('reflect1', 'draft text', null, spy);
        expect(spy).toHaveBeenCalledOnce();
        expect(spy.mock.calls[0][0].score).toBeUndefined();
    });
});

describe('W2.1 -- draft-persist on edit', () => {
    it('calls recordReflectionToGradebook with null score after debounce', async () => {
        vi.useFakeTimers();
        const gradingState = new Map();
        const recordSpy = vi.fn();
        const handler = makeReflectionInputHandler(gradingState, recordSpy);

        const ta = makeTextarea('reflect1', 'my draft answer');
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));
        vi.advanceTimersByTime(401);

        expect(recordSpy).toHaveBeenCalledOnce();
        expect(recordSpy.mock.calls[0]).toEqual(['reflect1', 'my draft answer', null]);

        document.removeEventListener('input', handler);
        vi.useRealTimers();
    });

    it('skips record when text is empty', async () => {
        vi.useFakeTimers();
        const gradingState = new Map();
        const recordSpy = vi.fn();
        const handler = makeReflectionInputHandler(gradingState, recordSpy);

        const ta = makeTextarea('reflect1', '');
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));
        vi.advanceTimersByTime(401);

        expect(recordSpy).not.toHaveBeenCalled();

        document.removeEventListener('input', handler);
        vi.useRealTimers();
    });

    it('skips record when text equals the already-graded originalAnswer', async () => {
        vi.useFakeTimers();
        const gradingState = new Map();
        gradingState.set('reflect1', { result: { score: 'E' }, originalAnswer: 'graded text', appealCount: 0, history: [] });
        const recordSpy = vi.fn();
        const handler = makeReflectionInputHandler(gradingState, recordSpy);

        const ta = makeTextarea('reflect1', 'graded text', ['graded-E']);
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));
        vi.advanceTimersByTime(401);

        expect(recordSpy).not.toHaveBeenCalled();

        document.removeEventListener('input', handler);
        vi.useRealTimers();
    });

    it('debounces per textarea id (parallel edits do not cancel each other)', async () => {
        vi.useFakeTimers();
        const gradingState = new Map();
        const recordSpy = vi.fn();
        const handler = makeReflectionInputHandler(gradingState, recordSpy);

        const ta1 = makeTextarea('reflect1', 'answer one');
        const ta2 = makeTextarea('reflect2', 'answer two');
        document.addEventListener('input', handler);

        ta1.dispatchEvent(new Event('input', { bubbles: true }));
        ta2.dispatchEvent(new Event('input', { bubbles: true }));
        vi.advanceTimersByTime(401);

        expect(recordSpy).toHaveBeenCalledTimes(2);
        const ids = recordSpy.mock.calls.map((c) => c[0]);
        expect(ids).toContain('reflect1');
        expect(ids).toContain('reflect2');

        document.removeEventListener('input', handler);
        vi.useRealTimers();
    });

    it('ignores textareas inside .appeal-form', async () => {
        vi.useFakeTimers();
        const gradingState = new Map();
        const recordSpy = vi.fn();
        const handler = makeReflectionInputHandler(gradingState, recordSpy);

        const form = document.createElement('div');
        form.className = 'appeal-form';
        const ta = document.createElement('textarea');
        ta.id = 'appeal-text-reflect1';
        ta.value = 'appeal reasoning here';
        form.appendChild(ta);
        document.body.appendChild(form);
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));
        vi.advanceTimersByTime(401);

        expect(recordSpy).not.toHaveBeenCalled();

        document.removeEventListener('input', handler);
        vi.useRealTimers();
    });
});

describe('W2.2 -- stale-grade clear on edit', () => {
    it('removes graded-E class when text differs from originalAnswer', () => {
        const gradingState = new Map();
        gradingState.set('reflect1', { result: { score: 'E' }, originalAnswer: 'original graded answer', appealCount: 0, history: [] });
        const handler = makeReflectionInputHandler(gradingState, vi.fn());

        const ta = makeTextarea('reflect1', 'a different answer now', ['graded-E']);
        const fb = makeFeedbackDiv('reflect1');
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));

        expect(ta.classList.contains('graded-E')).toBe(false);
        expect(fb.innerHTML).toBe('');
        expect(gradingState.has('reflect1')).toBe(false);

        document.removeEventListener('input', handler);
    });

    it('removes graded-P class when text differs from originalAnswer', () => {
        const gradingState = new Map();
        gradingState.set('reflect2', { result: { score: 'P' }, originalAnswer: 'partial answer', appealCount: 0, history: [] });
        const handler = makeReflectionInputHandler(gradingState, vi.fn());

        const ta = makeTextarea('reflect2', 'revised answer content', ['graded-P']);
        const fb = makeFeedbackDiv('reflect2');
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));

        expect(ta.classList.contains('graded-P')).toBe(false);
        expect(fb.innerHTML).toBe('');
        expect(gradingState.has('reflect2')).toBe(false);

        document.removeEventListener('input', handler);
    });

    it('removes graded-I class when text differs from originalAnswer', () => {
        const gradingState = new Map();
        gradingState.set('exitTicket', { result: { score: 'I' }, originalAnswer: 'wrong answer', appealCount: 0, history: [] });
        const handler = makeReflectionInputHandler(gradingState, vi.fn());

        const ta = makeTextarea('exitTicket', 'new improved answer', ['graded-I']);
        const fb = makeFeedbackDiv('exitTicket');
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));

        expect(ta.classList.contains('graded-I')).toBe(false);
        expect(gradingState.has('exitTicket')).toBe(false);

        document.removeEventListener('input', handler);
    });

    it('does NOT clear grade when text matches originalAnswer (unchanged re-focus)', () => {
        const gradingState = new Map();
        gradingState.set('reflect1', { result: { score: 'E' }, originalAnswer: 'exact same text', appealCount: 0, history: [] });
        const handler = makeReflectionInputHandler(gradingState, vi.fn());

        const ta = makeTextarea('reflect1', 'exact same text', ['graded-E']);
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));

        expect(ta.classList.contains('graded-E')).toBe(true);
        expect(gradingState.has('reflect1')).toBe(true);

        document.removeEventListener('input', handler);
    });
});

describe('W2.3 -- appeals re-record in submitAppeal', () => {
    it('calls recordReflectionToGradebook with the new appeal score', () => {
        const recordSpy = vi.fn();
        const state = {
            result: { score: 'I', feedback: 'Not quite.' },
            originalAnswer: 'my original answer',
            appealCount: 1,
            history: []
        };
        const appealResult = { score: 'P', feedback: 'Partial credit granted.' };

        applyW23AppealRecord(state, 'reflect1', appealResult, recordSpy);

        expect(state.result).toBe(appealResult);
        expect(recordSpy).toHaveBeenCalledOnce();
        expect(recordSpy).toHaveBeenCalledWith('reflect1', 'my original answer', 'P');
    });

    it('passes E score to recordReflectionToGradebook when appeal fully granted', () => {
        const recordSpy = vi.fn();
        const state = {
            result: { score: 'P', feedback: 'Partial.' },
            originalAnswer: 'strong answer text',
            appealCount: 1,
            history: []
        };
        const appealResult = { score: 'E', feedback: 'Great explanation!' };

        applyW23AppealRecord(state, 'exitTicket', appealResult, recordSpy);

        expect(recordSpy).toHaveBeenCalledWith('exitTicket', 'strong answer text', 'E');
    });
});

describe('W2.4 -- hydration restores graded-{E|P|I} class', () => {
    it('applies graded-E class when ledger score is 1', () => {
        const ta = makeTextarea('reflect1', '');
        applyW24HydrationGradeClass(ta, { response: 'good answer', score: 1 });
        expect(ta.classList.contains('graded-E')).toBe(true);
        expect(ta.classList.contains('graded-P')).toBe(false);
        expect(ta.classList.contains('graded-I')).toBe(false);
    });

    it('applies graded-P class when ledger score is 0.5', () => {
        const ta = makeTextarea('reflect2', '');
        applyW24HydrationGradeClass(ta, { response: 'partial answer', score: 0.5 });
        expect(ta.classList.contains('graded-P')).toBe(true);
        expect(ta.classList.contains('graded-E')).toBe(false);
        expect(ta.classList.contains('graded-I')).toBe(false);
    });

    it('applies graded-I class when ledger score is 0', () => {
        const ta = makeTextarea('exitTicket', '');
        applyW24HydrationGradeClass(ta, { response: 'wrong answer', score: 0 });
        expect(ta.classList.contains('graded-I')).toBe(true);
        expect(ta.classList.contains('graded-E')).toBe(false);
        expect(ta.classList.contains('graded-P')).toBe(false);
    });

    it('does not apply any grade class when ledger score is null (unscored draft)', () => {
        const ta = makeTextarea('reflect1', '');
        applyW24HydrationGradeClass(ta, { response: 'some draft', score: null });
        expect(ta.classList.contains('graded-E')).toBe(false);
        expect(ta.classList.contains('graded-P')).toBe(false);
        expect(ta.classList.contains('graded-I')).toBe(false);
    });

    it('does not apply any grade class when ledger score is undefined', () => {
        const ta = makeTextarea('reflect1', '');
        applyW24HydrationGradeClass(ta, { response: 'some text' });
        expect(ta.classList.contains('graded-E')).toBe(false);
        expect(ta.classList.contains('graded-P')).toBe(false);
        expect(ta.classList.contains('graded-I')).toBe(false);
    });

    it('sets data-restored attribute', () => {
        const ta = makeTextarea('reflect1', '');
        applyW24HydrationGradeClass(ta, { response: 'text', score: 1 });
        expect(ta.dataset.restored).toBe('1');
    });

    it('replaces an existing stale class before applying the restored one', () => {
        const ta = makeTextarea('reflect1', '', ['graded-I']);
        applyW24HydrationGradeClass(ta, { response: 'revised', score: 1 });
        expect(ta.classList.contains('graded-E')).toBe(true);
        expect(ta.classList.contains('graded-I')).toBe(false);
    });
});

describe('W2 integration -- edit clears grade, then draft persists', () => {
    it('clearing grade and then draft-persisting produces null-scored record', async () => {
        vi.useFakeTimers();
        const gradingState = new Map();
        gradingState.set('reflect1', {
            result: { score: 'E' },
            originalAnswer: 'original graded answer',
            appealCount: 0,
            history: []
        });
        const recordSpy = vi.fn();
        const handler = makeReflectionInputHandler(gradingState, recordSpy);

        const ta = makeTextarea('reflect1', 'completely revised answer', ['graded-E']);
        makeFeedbackDiv('reflect1');
        document.addEventListener('input', handler);

        ta.dispatchEvent(new Event('input', { bubbles: true }));

        // W2.2: grade class should be cleared immediately.
        expect(ta.classList.contains('graded-E')).toBe(false);
        expect(gradingState.has('reflect1')).toBe(false);

        // W2.1: draft record fires after debounce.
        vi.advanceTimersByTime(401);
        expect(recordSpy).toHaveBeenCalledOnce();
        expect(recordSpy.mock.calls[0]).toEqual(['reflect1', 'completely revised answer', null]);

        document.removeEventListener('input', handler);
        vi.useRealTimers();
    });
});

describe('W2.5 -- hydration rebuilds gradingState (Codex BLOCKER regression)', () => {
    it('rebuilds a gradingState entry for a restored scored reflection', () => {
        const gradingState = new Map();
        const ta = makeTextarea('reflect1', 'the graded answer');
        applyW24HydrationGradeClass(ta, { response: 'the graded answer', score: 1 }, gradingState);
        expect(gradingState.has('reflect1')).toBe(true);
        const st = gradingState.get('reflect1');
        expect(st.originalAnswer).toBe('the graded answer');
        expect(st.result.score).toBe('E');
    });

    it('does NOT rebuild gradingState for an unscored draft (score null)', () => {
        const gradingState = new Map();
        const ta = makeTextarea('reflect1', 'a draft');
        applyW24HydrationGradeClass(ta, { response: 'a draft', score: null }, gradingState);
        expect(gradingState.has('reflect1')).toBe(false);
    });

    it('post-reload: editing a hydrated graded reflection clears the stale grade', () => {
        // The path the original W2 missed: gradingState starts EMPTY on a fresh
        // page load, so without W2.5 the W2.2 listener has nothing to compare
        // against and the stale graded-* class survives the edit.
        vi.useFakeTimers();
        const gradingState = new Map();   // fresh, as after a page reload
        const recordSpy = vi.fn();
        const handler = makeReflectionInputHandler(gradingState, recordSpy);

        const ta = makeTextarea('reflect1', 'the original graded answer');
        const fb = makeFeedbackDiv('reflect1');
        // Hydration restores the scored reflection (W2.4 + W2.5).
        applyW24HydrationGradeClass(ta, { response: 'the original graded answer', score: 1 }, gradingState);
        expect(ta.classList.contains('graded-E')).toBe(true);
        expect(gradingState.has('reflect1')).toBe(true);

        document.addEventListener('input', handler);

        // Student edits the restored reflection.
        ta.value = 'a substantially revised answer';
        ta.dispatchEvent(new Event('input', { bubbles: true }));

        // W2.2: the stale grade must be cleared.
        expect(ta.classList.contains('graded-E')).toBe(false);
        expect(fb.innerHTML).toBe('');
        expect(gradingState.has('reflect1')).toBe(false);

        // W2.1: the revised text persists as a null-scored draft.
        vi.advanceTimersByTime(401);
        expect(recordSpy).toHaveBeenCalledOnce();
        expect(recordSpy.mock.calls[0]).toEqual(['reflect1', 'a substantially revised answer', null]);

        document.removeEventListener('input', handler);
        vi.useRealTimers();
    });
});

describe('W2.3 (u3_lesson6-7 variant) -- hand-applied appeal re-record', () => {
    it('re-records the appeal score after the object-spread state.result update', () => {
        const recordSpy = vi.fn();
        const state = {
            result: { score: 'I', feedback: 'Not yet.' },
            originalAnswer: 'the u3 original answer',
            appealCount: 1,
            history: []
        };
        applyW23U3AppealRecord(state, 'reflect56', { score: 'P', feedback: 'Granted.' }, recordSpy);
        expect(state.result.score).toBe('P');
        expect(state.result._appealProcessed).toBe(true);
        expect(recordSpy).toHaveBeenCalledOnce();
        expect(recordSpy).toHaveBeenCalledWith('reflect56', 'the u3 original answer', 'P');
    });
});

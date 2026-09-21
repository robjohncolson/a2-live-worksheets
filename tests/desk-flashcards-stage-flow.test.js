// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(src);
  if (!match) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', match.index); i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(match.index, i + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

function makeAnswerHarness() {
  const state = {
    topic: '4.1',
    // 3 cards → passCount = ceil(0.8*3) = 3, so one correct answer is NON-passing
    // (a 1-card deck would early-stop into the pass branch and never auto-advance).
    deck: [
      { qnum: 1, q: 'Question', choices: ['Right', 'Wrong'], correctIdx: 0 },
      { qnum: 2, q: 'Question 2', choices: ['Right', 'Wrong'], correctIdx: 0 },
      { qnum: 3, q: 'Question 3', choices: ['Right', 'Wrong'], correctIdx: 0 }
    ],
    idx: 0,
    score: 0,
    answered: false,
    finishId: null,
    advanceId: null,
    roundId: 'desk-round',
    seq: 0,
    cardStart: 0,
    misses: [],
    perm: [0, 1]
  };
  const buttons = [0, 1].map(function (idx) {
    return {
      disabled: false,
      classList: { add() {} },
      getAttribute(name) { return name === 'data-i' ? String(idx) : null; }
    };
  });
  const nextButton = { style: { display: 'none' } };
  const elements = {
    'bf-choices': { querySelectorAll() { return buttons; } },
    'bf-feedback': { textContent: '' },
    'bf-next': nextButton
  };
  const next = vi.fn();
  const factory = new Function(
    '_bfState', '_bfSaveProgress', 'document', 'BLOOKET_PASS_THRESHOLD',
    'Date', 'setTimeout', '_bfFinish', '_bfNext',
    fnBody(DESK, '_bfAnswer') + '\nreturn _bfAnswer;'
  );
  const answer = factory(
    state,
    function () {},
    { getElementById(id) { return elements[id] || null; } },
    0.80,
    Date,
    setTimeout,
    function () {},
    next
  );
  return { answer, next, nextButton, state };
}

describe('Desk quick flashcards — two-action stage flow', () => {
  it('stores the correct-answer timer and clears it in Next and teardown', () => {
    const answer = fnBody(DESK, '_bfAnswer');
    expect(answer).toMatch(/_bfState\.advanceId\s*=\s*setTimeout/);
    expect(answer).toMatch(/_bfNext\s*\(\s*\)[\s\S]*?\},\s*700\s*\)/);

    for (const name of ['_bfNext', '_bfCloseUI']) {
      const body = fnBody(DESK, name);
      expect(body).toMatch(/clearTimeout\(\s*_bfState\.advanceId\s*\)/);
      expect(body).toMatch(/_bfState\.advanceId\s*=\s*null/);
    }
  });

  it('advances every correct answer without a pass timer', () => {
    const body = fnBody(DESK, '_bfAnswer');
    expect(body).not.toContain('_passCount');
    expect(body).not.toContain('_bfState.finishId = setTimeout');
    expect(body).toContain('_bfState.advanceId = setTimeout');
  });  it('has a header Close button without nesting it inside #bf-header', () => {
    const headerStart = DESK.indexOf('<div class="bf-modal-header"');
    const modePickerStart = DESK.indexOf('<div id="bf-modepick"', headerStart);
    const header = DESK.slice(headerStart, modePickerStart);
    expect(headerStart).toBeGreaterThan(-1);
    expect(modePickerStart).toBeGreaterThan(headerStart);
    expect(header).toMatch(/id="bf-header"/);
    expect(header).toMatch(/<button[^>]*aria-label="Close"[^>]*onclick="closeBlooketFlashcards\(\)"/);
    expect(header.indexOf('</div>')).toBeLessThan(header.indexOf('<button'));
    expect(header).toContain('✕');
  });

  it('Enter uses _bfNext when the hidden Next button has a pending timer', () => {
    const body = fnBody(DESK, '_bfKeydownHandler');
    expect(body).toMatch(/key\s*===\s*['"]enter['"]/);
    expect(body).toMatch(/nextBtn\.style\.display\s*===\s*['"]none['"][\s\S]*?_bfState\.advanceId\s*!==\s*null/);
    expect(body).toMatch(/_bfState\.advanceId\s*!==\s*null[\s\S]*?_bfNext\s*\(\s*\)/);
    expect(body).toMatch(/nextBtn\.click\s*\(\s*\)/);
  });

  it('a correct non-pass answer advances after 700 ms', () => {
    vi.useFakeTimers();
    try {
      const harness = makeAnswerHarness();
      harness.answer(0);

      expect(harness.state.advanceId).not.toBeNull();
      expect(harness.nextButton.style.display).toBe('none');
      vi.advanceTimersByTime(699);
      expect(harness.next).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(harness.next).toHaveBeenCalledTimes(1);
      expect(harness.state.advanceId).toBeNull();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('a wrong answer shows Next and schedules no advance', () => {
    vi.useFakeTimers();
    try {
      const harness = makeAnswerHarness();
      harness.answer(1);

      expect(harness.nextButton.style.display).toBe('inline-block');
      expect(harness.state.advanceId).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(harness.next).not.toHaveBeenCalled();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

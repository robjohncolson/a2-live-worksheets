// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const desk = readFileSync('desk.html', 'utf8');
const mobile = readFileSync('mobile-home.html', 'utf8');
const opened = [];
afterEach(() => opened.splice(0).forEach(dom => dom.window.close()));

function source(text, name) {
  const match = new RegExp('(?:async )?function ' + name + '\\(').exec(text);
  let depth = 0;
  for (let i = text.indexOf('{', match.index); i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(match.index, i + 1);
  }
  throw new Error('Unclosed function ' + name);
}

function boot(text, names, values) {
  const dom = new JSDOM(text, { runScripts: 'outside-only', url: 'https://desk.test/' });
  opened.push(dom);
  Object.assign(dom.window, values);
  dom.window.eval(names.map(name => source(text, name)).join('\n'));
  return dom.window;
}

describe('daily flashcards without pass/fail', () => {
  it.each([0, 7, 8, 10])('Desk records raw %s/10, keeps the result open and supports a fresh retry', async correct => {
    const recordFlashcardRun = vi.fn();
    const clear = vi.fn(), save = vi.fn(), render = vi.fn(), commit = vi.fn();
    const state = { topic: '1.1', score: correct, idx: 10, deck: Array.from({ length: 10 }, (_, qnum) => ({ qnum })),
      answered: false, finished: false, misses: correct === 10 ? [] : [{ q: 'Domain?', correctAnswer: 'All real numbers' }] };
    const win = boot(desk, ['_bfFinish'], {
      _bfState: state, gradebookClient: { recordFlashcardRun }, _bfClearProgress: clear,
      _bfSaveProgress: save, _bfRenderCard: render, _bfShuffle: cards => [...cards].reverse(),
      _blooketCommit: commit,
    });
    await win._bfFinish();
    await win._bfFinish();
    expect(recordFlashcardRun).toHaveBeenCalledOnce();
    expect(recordFlashcardRun).toHaveBeenCalledWith('1.1', 'quick', correct, 10);
    expect(clear).toHaveBeenCalledWith('1.1');
    expect(commit).not.toHaveBeenCalled();
    const result = win.document.getElementById('bf-result');
    expect(result.textContent).toContain(`You got ${correct} of 10`);
    expect(result.textContent).not.toMatch(/pass|80%/i);
    if (correct < 10) expect(result.textContent).toContain('All real numbers');
    [...result.querySelectorAll('button')].find(b => b.textContent === 'Try again (new shuffle)').click();
    expect(state).toMatchObject({ idx: 0, score: 0, finished: false, misses: [] });
    expect(state.deck[0].qnum).toBe(9);
    expect(save).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it.each([0, 7, 8, 10])('mobile records raw %s/10 without writing a completion row', correct => {
    const recordFlashcardRun = vi.fn(), commit = vi.fn(), clear = vi.fn();
    const state = { lesson: { id: '1.1' }, mode: 'quick', correct, idx: 10, answered: false,
      deck: Array.from({ length: 10 }, (_, qnum) => ({ qnum })), misses: [] };
    const win = boot(mobile, ['_fcFinish', '_fcRenderResult'], {
      _fc: state, gradebookClient: { recordFlashcardRun }, _fcCommit: commit,
      _fcTimerStop: vi.fn(), _fcClearQuickProgress: clear, _fcSetProg: vi.fn(),
      _fcBodyHtml: vi.fn(), fcoEl: () => ({ classList: { remove: vi.fn() } }),
    });
    win._fcBodyHtml = html => { win.document.getElementById('fc-body').innerHTML = html; };
    win._fcFinish();
    win._fcFinish();
    expect(recordFlashcardRun).toHaveBeenCalledOnce();
    expect(recordFlashcardRun).toHaveBeenCalledWith('1.1', 'quick', correct, 10);
    expect(commit).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith('1.1');
    expect(win.document.getElementById('fc-body').textContent).toContain(`You got ${correct} of 10`);
    expect(win.document.getElementById('fc-body').textContent).not.toMatch(/pass|80%/i);
  });

  it('has only the daily activity at student launch points', () => {
    expect(desk).not.toContain('id="bf-full-deck"');
    expect(mobile).not.toContain('id="fc-full-deck"');
    expect(source(desk, 'openBlooketFlashcards')).not.toContain('_ftStart');
    expect(source(mobile, 'openFlashcards')).not.toContain("'full'");
    expect(source(desk, '_bfStartQuick')).not.toMatch(/score >=|passCount/);
    expect(source(mobile, '_fcResolve')).not.toContain('_fc.correct >= _fc.need');
  });

  it('completes a worksheet even without flashcard credit', () => {
    const win = boot(desk, ['_isLessonComplete'], {
      getRegistryEntry: () => ({ urls: { worksheet: 'worksheet.html', blooket: 'deck.csv' } }),
      _getCwsForTopic: () => 60, _blooketScoreFor: () => null,
    });
    expect(win._isLessonComplete('1.1', {})).toBe(true);
    win._getCwsForTopic = () => 0;
    expect(win._isLessonComplete('1.1', {})).toBe(false);
  });

  it('uses scored Try-Its for A2 completion even when retired work is absent', () => {
    const status = { tryIts: { scored: 5, total: 5 }, lessonCheck: null, flashcardPassed: false };
    const win = boot(desk, ['_isLessonComplete'], {
      A2Desk: { getStatus: () => status },
      getRegistryEntry: () => ({ urls: { worksheet: 'check.html?lesson=1-1', blooket: 'deck.csv' } }),
    });
    expect(win._isLessonComplete('1.1', {})).toBe(true);
    status.tryIts.scored = 4;
    expect(win._isLessonComplete('1.1', {})).toBe(false);
  });

  it.each(['desk', 'mobile'])('%s resumes at question nine after eight correct answers', async surface => {
    const saved = { deck: Array.from({ length: 10 }, (_, qnum) => ({ qnum })), idx: 7,
      score: 8, answered: true, roundId: surface + '-resume', seq: 8 };
    const render = vi.fn(), finish = vi.fn();
    if (surface === 'desk') {
      const state = {};
      const win = boot(desk, ['_bfStartQuick'], {
        _bfState: state, _bfLoadProgress: () => saved, _bfSaveProgress: vi.fn(),
        _bfShowQuizUI: vi.fn(), _bfRenderCard: render, _bfFinish: finish,
        _bfKeydownHandler: vi.fn(), cedLabel: () => ({ text: '1-1 Functions' }),
      });
      await win._bfStartQuick(null, '1.1');
      expect(state).toMatchObject({ idx: 8, score: 8 });
    } else {
      const win = boot(mobile, ['_fcStart'], {
        _fcCsvPath: () => 'deck.csv', _fcBodyHtml: vi.fn(), _fcLoadQuickProgress: () => saved,
        FC: { quickPassCount: () => 8 }, _fcCsvBase: value => value, _fcRoundId: () => 'mobile-resume',
        _fcRender: render, _fcFinish: finish, cedLabel: () => ({ text: '1-1 Functions' }),
        fcoEl: () => ({ classList: { remove: vi.fn() } }),
      });
      win._fcStart({ id: '1.1' }, 'quick');
      expect(win._fc).toMatchObject({ idx: 8, correct: 8 });
    }
    expect(render).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
  });

  it('keeps retired wording out of orientation and handouts', () => {
    for (const file of ['start-here.html', 'open-house.html', 'syllabus-c.html', 'syllabus-d.html', 'syllabus-g.html']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/lesson checks?|flashcard passes?|passing a lesson deck/i);
    }
    expect(readFileSync('roster-client.js', 'utf8')).toContain('A2_STUDENT_GRADES_VISIBLE = false');
  });
});

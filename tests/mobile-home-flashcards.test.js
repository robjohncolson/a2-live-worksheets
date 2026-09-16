// mobile-home-flashcards.test.js — the launcher's NATIVE flashcards port.
// Part A: static wiring (engine + feeder loaded, deep-link gone, best-wins commit).
// Part B: boots mobile-home.html in jsdom and plays a real full-deck round through
// the controller to the gradebook feeder, asserting the exact BL-…-DESK_DONE grade
// row + the best-wins floor (a run that can't beat the recorded score is dropped).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const CED_SOURCE = ['js/ced2026-crosswalk.js', 'js/ced2026-labels.js']
  .map((file) => readFileSync(resolve(repo, file), 'utf8')).join('\n');
const FLASHCARDS_SRC = readFileSync(resolve(repo, 'flashcards.js'), 'utf8');
const FLASHCARD_FLAGS_SRC = readFileSync(resolve(repo, 'lib/flashcard-flags.js'), 'utf8');

describe('mobile-home — native flashcards wiring (static)', () => {
  it('loads the shared engine + the gradebook feeder (+ offline queue)', () => {
    for (const s of ['flashcards.js', 'gradebook-client.js', 'offline-queue.js']) {
      expect(HOME, `missing <script src="${s}">`).toContain(`src="${s}"`);
    }
    expect(HOME).toContain('src="lib/flashcard-flags.js" onerror=""');
  });

  it('replaced the Desk deep-link with a native openFlashcards handler', () => {
    expect(HOME, 'stale Desk deep-link still present').not.toContain('?flashcards=');
    expect(HOME).toContain('fc.onclick = function (event) { openFlashcards(l, event.currentTarget); }');
    expect(HOME).toContain('function openFlashcards(lesson, launcher)');
    expect(HOME).toContain('function closeFlashcards()');
    expect(HOME).toContain('id="fco"');
  });

  it('commits the same grade row the Desk does, with a best-wins floor', () => {
    // source 'worksheet' + FC.blooketItemId → the server's Blooket track; never downgrades.
    expect(HOME).toContain("source: 'worksheet'");
    expect(HOME).toContain('FC.blooketItemId(topic)');
    expect(HOME).toContain("response: { selfAttest: 'blooket' }");
    expect(HOME).toContain('if (!(score > floor)) return { skipped: true');
    // Quick records only on pass; the full deck always records its score.
    expect(HOME).toContain("var doCommit = (_fc.mode === 'quick') ? passed : true;");
  });
});

// ── Behavioral: boot the launcher + play a full-deck round ─────────────────────
const ONE_CARD_CSV = [
  '"Blooket","Import Template"',
  'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
  '1,"Q one","alpha","beta","gamma","delta",20,2',   // correctIdx = 1 (data-i="1")
].join('\n');

const THREE_CHOICE_CSV = [
  '"Blooket","Import Template"',
  'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
  '1,"Permuted question","wrong zero","wrong one","right two",,20,3',
].join('\n');

const PERMUTATION_FLAGS = {
  version: 1,
  flags: {
    choicePermutation: {
      enabled: true,
      allowUsernames: [],
      allowSections: [],
      urlParam: 'fcPerm',
      killSwitchKey: 'a2_fc_perm_off',
    },
  },
};

function bootLauncher({
  gradeBlooket,
  serviceMissing,
  deckCsv = ONE_CARD_CSV,
  legacyEmail,
  flagsData,
  flagsFetchFails,
  forcedPermutation,
  permutationOff,
}) {
  const recorded = [];
  const lesson = { id: '4.1-2', unit: 4, label: 'Sampling', worksheet: 'u4_lesson1-2_live.html', quiz: null, blooket: 'https://b', videos: [] };
  const gradePayload = { ok: true, quarters: [], lessons: [{ topic: '4.1-2', lessonGrade: 55, blooket: gradeBlooket }] };
  const fakeFetch = (url) => {
    const u = String(url);
    if (u.indexOf('flashcard-flags.json') >= 0) {
      if (flagsFetchFails) return Promise.reject(new Error('flags unavailable'));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(flagsData || null),
        text: () => Promise.resolve(''),
      });
    }
    if (serviceMissing && u === 'https://api.test/lessons') {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    const body = u === 'content/a2/lessons.json' ? [lesson]
      : u === 'https://api.test/lessons' ? { lessons: [lesson] }
      : u.indexOf('/grade') >= 0 ? gradePayload
      : u.indexOf('blooket-difficulty.json') >= 0 ? { tags: {} }
      : null;
    const text = u.indexOf('_blooket.csv') >= 0 ? deckCsv : '';
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(text) });
  };
  const dom = new JSDOM(HOME, {
    runScripts: 'dangerously',
    url: 'https://x.test/mobile-home.html',
    beforeParse(window) {
      window.eval(CED_SOURCE);
      if (permutationOff) {
        window.localStorage.setItem('a2_fc_perm_off', '1');
      }
      if (typeof legacyEmail === 'string') {
        window.localStorage.setItem('a2_desk_student_email', legacyEmail);
      }
      window.eval(FLASHCARDS_SRC);                       // window.Flashcards
      window.eval(FLASHCARD_FLAGS_SRC);                  // window.FlashcardFlags
      if (Array.isArray(forcedPermutation)) {
        window.Flashcards.permutationFor = (_seed, n) => forcedPermutation.slice(0, n);
      }
      window.fetch = fakeFetch;
      window.ROSTER_SERVICE_URL = 'https://api.test';
      window.rosterClient = { current: () => ({ username: 'kid' }), token: () => 'tok' };
      window.gradebookClient = { record: (a) => { recorded.push(a); return { ok: true, ledgerId: 'L1' }; } };
    },
  });
  return { dom, win: dom.window, recorded };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
async function flush(n = 6) { for (let i = 0; i < n; i++) await tick(); }

async function finishOneCardFullDeck(win) {
  win.document.querySelector('.btn.fc').click();
  await flush(2);
  await flush();
  win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
  await flush(1);
  win.document.getElementById('fc-next').click();
  await flush(4);
}

describe('mobile-home — native flashcards (behavioral boot)', () => {
  it('plays a full deck to 100% and records BL-U4-L1-2-DESK_DONE', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();                                                   // lessons render + /grade loads

    win.document.querySelector('.btn.fc').click();                  // 🃏 → openFlashcards
    await flush(2);
    await flush();

    const correct = win.document.querySelector('#fc-choices .fc-choice[data-i="1"]');
    expect(correct, 'card did not render').toBeTruthy();
    correct.click();                                                // answer correct
    await flush(1);
    win.document.getElementById('fc-next').click();                 // → finish → commit
    await flush(2);

    expect(recorded.length).toBe(1);
    expect(recorded[0]).toMatchObject({
      source: 'worksheet', itemId: 'BL-U4-L1-2-DESK_DONE', unit: 'U4',
      topic: '4.1-2', response: { selfAttest: 'blooket' }, score: 100, attempt: 1,
    });
    expect(win.document.querySelector('.fc-score').textContent).toContain('100');
    dom.window.close();
  });

  it('timed mode: a miss does NOT reveal the correct answer (T3.4 Desk parity) and says it will come back', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();

    const wrong = win.document.querySelector('#fc-choices .fc-choice[data-i="0"]');
    const correct = win.document.querySelector('#fc-choices .fc-choice[data-i="1"]');
    expect(wrong && correct, 'card did not render').toBeTruthy();
    wrong.click();
    await flush(1);

    expect(wrong.classList.contains('wrong')).toBe(true);
    expect(correct.classList.contains('right')).toBe(false);
    expect(win.document.getElementById('fc-feedback').textContent).toMatch(/come back/);
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('the 🃏 button opens the full timed deck directly — no mode picker, no quick check', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(4);

    expect(win.document.getElementById('fc-mode-quick')).toBeNull();
    expect(win.document.getElementById('fc-mode-full')).toBeNull();
    expect(win.document.querySelector('#fc-choices .fc-choice'), 'timed deck card did not render').toBeTruthy();
    expect(win.document.getElementById('fco').classList.contains('timed')).toBe(true);
    dom.window.close();
  });

  it('best-wins: a run that cannot beat the recorded score does not record', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 100 });   // already maxed
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
    await flush(1);
    win.document.getElementById('fc-next').click();
    await flush(2);

    expect(recorded.length).toBe(0);                                // 100 !> 100 → dropped
    expect(win.document.querySelector('.fc-result p').textContent).toMatch(/best score/i);
    dom.window.close();
  });

  it('keeps published lessons when the roster lessons endpoint is unavailable', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40, serviceMissing: true });
    await flush(8);                                                 // published lessons remain after the service fails

    const fcBtn = win.document.querySelector('.btn.fc');
    expect(fcBtn, 'tiles did not render from the published fallback').toBeTruthy();
    // Worksheet link is ORIGIN-RELATIVE (github.io base stripped) so a Vercel mirror is self-sufficient.
    const wsA = win.document.querySelector('.btn.ws');
    expect(wsA.getAttribute('href')).toBe('u4_lesson1-2_live.html');
    expect(wsA.getAttribute('href')).not.toMatch(/github\.io/);
    fcBtn.click();
    await flush(2);
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
    await flush(1);
    win.document.getElementById('fc-next').click();
    await flush(2);

    expect(recorded.length).toBe(1);
    expect(recorded[0].itemId).toBe('BL-U4-L1-2-DESK_DONE');        // flashcards work off the fallback too
    dom.window.close();
  });
});

describe('mobile-home — choice permutation flags and keyboard', () => {
  it('maps the first displayed slot to its real choice for scoring and highlighting', async () => {
    const { dom, win, recorded } = bootLauncher({
      gradeBlooket: 40,
      deckCsv: THREE_CHOICE_CSV,
      flagsData: PERMUTATION_FLAGS,
      forcedPermutation: [2, 0, 1],
    });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();

    const choices = Array.from(win.document.querySelectorAll('#fc-choices .fc-choice'));
    expect(choices.map((button) => Number(button.getAttribute('data-i')))).toEqual([2, 0, 1]);

    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: '1', bubbles: true }));

    const entries = JSON.parse(win.localStorage.getItem('a2_srs_log_kid@roster.local'));
    expect(entries[0].chosenIdx).toBe(2);
    expect(win.document.querySelector('.fc-choice[data-i="2"]').classList.contains('right')).toBe(true);

    win.document.getElementById('fc-next').click();
    await flush(3);

    expect(recorded).toHaveLength(1);
    expect(recorded[0].score).toBe(100);
    dom.window.close();
  });

  it('fails closed to identity order when the flags fetch fails', async () => {
    const { dom, win } = bootLauncher({
      gradeBlooket: 40,
      deckCsv: THREE_CHOICE_CSV,
      flagsFetchFails: true,
      forcedPermutation: [2, 0, 1],
    });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();

    const choices = Array.from(win.document.querySelectorAll('#fc-choices .fc-choice'));
    expect(choices.map((button) => Number(button.getAttribute('data-i')))).toEqual([0, 1, 2]);
    dom.window.close();
  });

  it('honors the choice permutation kill switch with identity order', async () => {
    const { dom, win } = bootLauncher({
      gradeBlooket: 40,
      deckCsv: THREE_CHOICE_CSV,
      flagsData: PERMUTATION_FLAGS,
      forcedPermutation: [2, 0, 1],
      permutationOff: true,
    });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();

    const choices = Array.from(win.document.querySelectorAll('#fc-choices .fc-choice'));
    expect(choices.map((button) => Number(button.getAttribute('data-i')))).toEqual([0, 1, 2]);
    dom.window.close();
  });
});

function inlineFunctionSource(name) {
  const start = HOME.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing inline function ${name}`);
  const open = HOME.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < HOME.length; i += 1) {
    if (HOME[i] === '{') depth += 1;
    if (HOME[i] === '}') depth -= 1;
    if (depth === 0) return HOME.slice(start, i + 1);
  }
  throw new Error(`unterminated inline function ${name}`);
}

describe('mobile-home — native flashcards commit note + accessibility', () => {
  it('resolves the commit before rendering while _fcCommit stays synchronous', () => {
    const finish = inlineFunctionSource('_fcFinish');
    const commit = inlineFunctionSource('_fcCommit');

    expect(finish).toContain('Promise.resolve(committed).then');
    expect(HOME).toContain('function _fcCommit(');
    expect(commit).not.toMatch(/\b(?:async|await)\b/);
  });

  it('renders the Saved offline note after an asynchronous queued commit', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    win.gradebookClient.record = (payload) => {
      recorded.push(payload);
      return Promise.resolve({ ok: true, queued: true });
    };

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
    await flush(1);
    win.document.getElementById('fc-next').click();
    await flush(2);

    expect(recorded).toHaveLength(1);
    expect(win.document.querySelector('.fc-result p').textContent).toContain('Saved offline');
    dom.window.close();
  });

  it('renders the Sign in note after an asynchronous no-identity result', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    win.gradebookClient.record = (payload) => {
      recorded.push(payload);
      return Promise.resolve({ ok: false, reason: 'no-identity' });
    };

    await finishOneCardFullDeck(win);

    expect(recorded).toHaveLength(1);
    expect(win.document.querySelector('.fc-result p').textContent).toContain('Sign in to save');
    dom.window.close();
  });

  it('renders the Couldn’t save note when an asynchronous record rejects', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    win.gradebookClient.record = (payload) => {
      recorded.push(payload);
      return Promise.reject(new Error('x'));
    };

    await expect(finishOneCardFullDeck(win)).resolves.toBeUndefined();

    expect(recorded).toHaveLength(1);
    expect(win.document.querySelector('.fc-result p').textContent).toContain('Couldn’t save');
    dom.window.close();
  });

  it('restores focus to the flashcards launcher when the sheet closes', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const launcher = win.document.querySelector('.btn.fc');
    launcher.focus();
    launcher.click();
    await flush(2);

    win.closeFlashcards();

    expect(win.document.activeElement).toBe(launcher);
    dom.window.close();
  });

  it('marks the sheet and feedback for assistive tech and keeps choices touch-sized', () => {
    expect(HOME).toMatch(/<div id="fco"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="fc-title"/);
    expect(HOME).toContain('id="fc-feedback" aria-live="polite"');
    expect(HOME).toMatch(/#fco \.fc-choice\s*\{[^}]*min-height:\s*44px/);
  });

  it('keeps the flashcard sheet within a 320 px viewport', () => {
    const fcoCss = Array.from(HOME.matchAll(/#fco[^}]*}/g), (match) => match[0]).join('\n');
    expect(fcoCss).toMatch(/#fco \.fc-body\s*\{[^}]*(?:max-width|width):\s*100%/);
    expect(fcoCss).toMatch(/#fco \.fc-choice\s*\{[^}]*overflow-wrap:\s*anywhere/);

    const widths = Array.from(
      fcoCss.matchAll(/(?:^|[;{])\s*(?:min-|max-)?width\s*:\s*([0-9.]+)(%|px)/g),
    );
    expect(widths.length).toBeGreaterThan(0);
    widths.forEach((match) => {
      const value = Number(match[1]);
      if (match[2] === '%') expect(value).toBeLessThanOrEqual(100);
      if (match[2] === 'px') expect(value).toBeLessThanOrEqual(320);
    });
  });

  it('uses the frozen Blooket-half vocabulary in flashcard student copy', () => {
    const start = HOME.indexOf('// ── Native flashcards');
    const end = HOME.indexOf('// Cached grade', start);
    const flashcardsBlock = HOME.slice(start, end);
    expect(flashcardsBlock).toContain('Blooket half of Done');
    expect(flashcardsBlock).not.toMatch(/lesson unlocked|to unlock|enough to unlock/i);
  });
});

describe('mobile-home — per-card logging, recap, and quick resume', () => {
  it('wires the mobile SRS key and roster-local email into quick answer logging', () => {
    expect(HOME).toContain('function _fcSrsAppend(');
    expect(HOME).toContain('function _fcEmail(');
    expect(HOME).toContain("'a2_srs_log_' + email");
    expect(HOME).toContain("username + '@roster.local'");

    const resolveAnswer = inlineFunctionSource('_fcResolve');
    expect(resolveAnswer).toContain('_fcSrsAppend([');
    expect(resolveAnswer).toContain("mode: 'quick'");
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('mirrors the Desk legacy email key for both SRS logging and quick resume', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40, legacyEmail: 'kid' });
    await flush();

    // _fcEmail lives inside the launcher IIFE — the storage keys below prove its result.
    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();

    expect(win.localStorage.getItem('a2_srs_log_kid')).not.toBeNull();
    expect(win.localStorage.getItem('a2_desk_bf_progress_kid')).not.toBeNull();
    expect(win.localStorage.getItem('a2_srs_log_kid@roster.local')).toBeNull();
    expect(win.localStorage.getItem('a2_desk_bf_progress_kid@roster.local')).toBeNull();
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('falls back to username@roster.local when the Desk legacy email key is absent', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();

    expect(win.localStorage.getItem('a2_desk_student_email')).toBeNull();
    // (derivation proven by the resume key below)
    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush();

    expect(win.localStorage.getItem('a2_desk_bf_progress_kid@roster.local')).not.toBeNull();
    dom.window.close();
  });

  it('guards mobile storage writers and lets isolated SRS append omit _fcEmail', () => {
    const guard = "if (typeof _viewAsContext === 'function' && _viewAsContext()) return;\n    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;";
    for (const name of ['_fcSrsAppend', '_fcSaveQuickProgress', '_fcClearQuickProgress']) {
      const source = inlineFunctionSource(name);
      expect(source).toContain(guard);
      expect(source).toContain("typeof _fcEmail === 'function' ? _fcEmail() : null");
    }

    const append = Function(`return (${inlineFunctionSource('_fcSrsAppend')});`)();
    expect(() => append([{ qnum: 1 }])).not.toThrow();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('writes every §3 field after a quick answer', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();

    const entries = JSON.parse(win.localStorage.getItem('a2_srs_log_kid@roster.local'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      topic: '4.1-2', qnum: 1, correct: true, wasTimeout: false, missIndex: 0,
      mode: 'quick', csv: 'u4_l1_l2_blooket.csv', surface: 'mobile', seq: 0,
      nChoices: 4, chosenIdx: 1,
    });
    expect(entries[0].latencyMs).toEqual(expect.any(Number));
    expect(entries[0].ts).toEqual(expect.any(Number));
    expect(entries[0].roundId).toMatch(/^mobile-\d+-[0-9a-z]{4}$/);
    expect(entries[0].stemHash).toMatch(/^[0-9a-f]{8}$/);
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('resumes after an answered quick card at the following index', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('a2_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': { deck, idx: 2, score: 2, answered: true, ts: 'now' },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();

    expect(win.document.getElementById('fc-title').textContent).toContain('(resuming)');
    expect(win.document.getElementById('fc-prog').textContent).toContain('4 / 10');
    expect(win.document.querySelector('.fc-q').textContent).toBe('Question 4');
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('finishes an answered saved round immediately when its score is already 80%', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('a2_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': { deck, idx: 7, score: 8, answered: true, ts: 'now' },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush(3);

    expect(win.document.querySelector('.fc-score').textContent).toContain('80');
    expect(recorded).toHaveLength(1);
    expect(recorded[0].score).toBe(80);
    const progress = JSON.parse(win.localStorage.getItem('a2_desk_bf_progress_kid@roster.local'));
    expect(progress['4.1-2']).toBeUndefined();
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('replaces a foreign Desk round id, resets seq, and persists the mobile round', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('a2_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': { deck, idx: 2, score: 2, answered: false, roundId: 'desk-1000-abcd', seq: 7, ts: 'now' },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();

    const progress = JSON.parse(win.localStorage.getItem('a2_desk_bf_progress_kid@roster.local'));
    expect(progress['4.1-2'].roundId).toMatch(/^mobile-\d+-[0-9a-z]{4}$/);
    expect(progress['4.1-2'].roundId).not.toBe('desk-1000-abcd');
    expect(progress['4.1-2'].seq).toBe(0);
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('keeps round id and seq when resuming a mobile round', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('a2_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': { deck, idx: 2, score: 2, answered: false, roundId: 'mobile-1000-abcd', seq: 7, ts: 'now' },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();

    const entries = JSON.parse(win.localStorage.getItem('a2_srs_log_kid@roster.local'));
    expect(entries[0].roundId).toBe('mobile-1000-abcd');
    expect(entries[0].seq).toBe(7);
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('normalizes legacy resumed miss stems into q for recap rendering', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('a2_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': {
        deck, idx: 7, score: 8, answered: true, roundId: 'mobile-1000-abcd', seq: 3, ts: 'now',
        misses: [{ qnum: 2, stem: 'Legacy missed stem', correctAnswer: 'yes' }],
      },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush(3);

    expect(win.document.querySelector('.fc-recap').textContent).toContain('Legacy missed stem');
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('renders both missed stems and correct answers in the result recap', async () => {
    const twoCardCsv = [
      '"Blooket","Import Template"',
      'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
      '1,"First missed stem","wrong one","right one",,,20,2',
      '2,"Second missed stem","wrong two","right two",,,20,2',
    ].join('\n');
    const { dom, win } = bootLauncher({ gradeBlooket: 40, deckCsv: twoCardCsv });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="0"]').click();
    win.document.getElementById('fc-next').click();
    win.document.querySelector('#fc-choices .fc-choice[data-i="0"]').click();
    win.document.getElementById('fc-next').click();
    await flush(3);

    const recap = win.document.querySelector('.fc-recap').textContent;
    expect(recap).toContain('Review your misses');
    expect(recap).toContain('First missed stem');
    expect(recap).toContain('Answer: right one');
    expect(recap).toContain('Second missed stem');
    expect(recap).toContain('Answer: right two');
    const saved = JSON.parse(win.localStorage.getItem('a2_desk_bf_progress_kid@roster.local'));
    // The quick deck is shuffled per attempt — locate the miss by qnum, not position.
    const firstMiss = saved['4.1-2'].misses.find(function (m) { return m.qnum === 1; });
    expect(firstMiss).toMatchObject({
      qnum: 1, q: 'First missed stem', correctAnswer: 'right one',
    });
    expect(firstMiss).not.toHaveProperty('stem');
    const links = Array.from(win.document.querySelectorAll('.fc-recap a'));
    expect(links).toHaveLength(2);
    const hrefs = links.map(function (a) { return a.getAttribute('href'); });
    expect(hrefs.some(function (h) { return h.indexOf('u4_lesson1-2_live.html#:~:text=First%20missed%20stem') !== -1; })).toBe(true);
    expect(hrefs.some(function (h) { return h.indexOf('u4_lesson1-2_live.html#:~:text=Second%20missed%20stem') !== -1; })).toBe(true);
    links.forEach(function (a) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener');
    });
    dom.window.close();
  });
});


const A2_PUBLISHED = JSON.parse(readFileSync(resolve(repo, 'content/a2/lessons.json'), 'utf8'));
function bootA2Lessons({ serviceLessons, serviceFails = false, publishedFails = false } = {}) {
  const requests = [];
  const dom = new JSDOM(HOME, {
    runScripts: 'dangerously', url: 'https://x.test/mobile-home.html',
    beforeParse(window) {
      window.eval(CED_SOURCE);
      window.eval(FLASHCARDS_SRC);
      window.ROSTER_SERVICE_URL = 'https://api.test/';
      window.fetch = async (url) => {
        requests.push(String(url));
        if (url === 'content/a2/lessons.json') {
          if (publishedFails) throw new Error('Published model unavailable');
          return { ok: true, json: async () => A2_PUBLISHED };
        }
        if (url === 'https://api.test/lessons') {
          if (serviceFails) throw new Error('Offline');
          return { ok: true, json: async () => ({ lessons: serviceLessons || A2_PUBLISHED }) };
        }
        if (A2_PUBLISHED.some(lesson => lesson.deck === url)) {
          return { ok: true, text: async () => ONE_CARD_CSV };
        }
        return { ok: true, json: async () => ({}) };
      };
    },
  });
  return { dom, win: dom.window, requests };
}

describe('mobile-home A2 lesson model', () => {
  it('renders all four published lessons with checks, IXL links and working native decks', async () => {
    const { dom, win, requests } = bootA2Lessons({ serviceFails: true });
    try {
      await flush(10);
      expect(A2_PUBLISHED).toHaveLength(4);
      const rows = [...win.document.querySelectorAll('#main .lesson')];
      expect(rows).toHaveLength(4);
      rows.forEach((row, index) => {
        const lesson = A2_PUBLISHED[index];
        expect(row.querySelector('.title').textContent).toBe(lesson.key + ' \u00b7 ' + lesson.title);
        expect(row.querySelector('.btn.ws').getAttribute('href')).toBe('check.html?lesson=' + lesson.key);
        expect([...row.querySelectorAll('.btn.ixl')].map(link => link.getAttribute('href')))
          .toEqual(lesson.supportingSkills.map(skill => skill.url));
        expect(row.querySelector('.btn.fc')).toBeTruthy();
      });
      rows[0].querySelector('.btn.fc').click();
      await flush(10);
      expect(requests).toContain(A2_PUBLISHED[0].deck);
      expect(win.document.querySelector('#fco.show .fc-q').textContent).toBe('Q one');
      expect(win.document.getElementById('fc-title').textContent).toContain(A2_PUBLISHED[0].title);
      expect(win.document.getElementById('sync-nearby')).toBeNull();
      expect(HOME).not.toMatch(/Sync Nearby|syncNearby\s*\(/);
      expect(requests).not.toContain('lessons-index.json');
    } finally { dom.window.close(); }
  });

  it('prefers a newer service model over the published model', async () => {
    const lessons = [{ ...A2_PUBLISHED[0], title: 'Updated lesson' }];
    const { dom, win, requests } = bootA2Lessons({ serviceLessons: lessons });
    try {
      await flush(10);
      expect(requests).toContain('content/a2/lessons.json');
      expect(requests).toContain('https://api.test/lessons');
      expect(win.document.querySelectorAll('#main .lesson')).toHaveLength(1);
      expect(win.document.querySelector('.lesson .title').textContent).toBe('1-1 \u00b7 Updated lesson');
    } finally { dom.window.close(); }
  });

  it('loads service lessons even when the published fetch fails', async () => {
    const { dom, win } = bootA2Lessons({ publishedFails: true });
    try {
      await flush(10);
      expect(win.document.querySelectorAll('#main .lesson')).toHaveLength(4);
    } finally { dom.window.close(); }
  });

  it('retains published lessons when the service returns an empty model', async () => {
    const { dom, win } = bootA2Lessons({ serviceLessons: [] });
    try {
      await flush(10);
      expect(win.document.querySelectorAll('#main .lesson')).toHaveLength(4);
    } finally { dom.window.close(); }
  });
});

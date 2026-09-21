// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'desk.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', m.index); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(m.index, i + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

function loadMayScore(win, viewAsContext) {
  const src = fnBody(DESK, '_mayScore');
  // eslint-disable-next-line no-new-func
  return new Function('window', '_viewAsContext', 'return (' + src + ');')(win, viewAsContext);
}

describe('Desk flashcards — scoring guards', () => {
  it('_mayScore exists and guards every flashcard commit step', () => {
    expect(DESK).toMatch(/function\s+_mayScore\s*\(/);
    for (const name of ['_bfFinish', '_ftFinish', '_blooketCommit']) {
      expect(fnBody(DESK, name), name + ' must consult _mayScore').toMatch(/_mayScore\s*\(\s*\)/);
    }
    expect(fnBody(DESK, '_blooketCommit')).toMatch(
      /\{\s*if\s*\(typeof\s+_mayScore\s*===\s*['"]function['"]\s*&&\s*!_mayScore\(\)\)\s*return;/
    );
  });

  it('_bfFinish records daily results without pass or ledger completion', () => {
    const body = fnBody(DESK, '_bfFinish');
    expect(body).not.toMatch(/if \(passed|_blooketCommit/);
    expect(body).toContain('recordFlashcardRun');
  });

  it('_bfFinish uses one scoring decision and labels a read-only pass honestly', () => {
    const body = fnBody(DESK, '_bfFinish');
    expect(body).toMatch(
      /var\s+canScore\s*=\s*\(typeof\s+_mayScore\s*!==\s*['"]function['"]\)\s*\|\|\s*_mayScore\(\)/
    );
    expect(body).not.toContain('Passed');
    expect(body).toContain('if (canScore &&');
  });

  it('localStorage writers guard view-as first and worksheet read-only second', () => {
    for (const name of ['_bfSaveProgress', '_ftLogToStore']) {
      const body = fnBody(DESK, name);
      const viewAsIdx = body.indexOf("typeof _viewAsContext === 'function'");
      const readOnlyIdx = body.indexOf("typeof window !== 'undefined'");
      const tryIdx = body.indexOf('try {');
      expect(viewAsIdx, name + ' view-as guard').toBeGreaterThan(-1);
      expect(readOnlyIdx, name + ' read-only guard').toBeGreaterThan(viewAsIdx);
      expect(tryIdx, name + ' guards must precede storage access').toBeGreaterThan(readOnlyIdx);
      expect(body).toMatch(/window\.__WS_READ_ONLY__/);
    }
  });

  it('_mayScore returns false under view-as', () => {
    const mayScore = loadMayScore({}, () => ({ studentId: 'student-1' }));
    expect(mayScore()).toBe(false);
  });

  it('_mayScore returns false under worksheet read-only mode', () => {
    const mayScore = loadMayScore({ __WS_READ_ONLY__: true }, null);
    expect(mayScore()).toBe(false);
  });

  it('_mayScore returns true otherwise', () => {
    const mayScore = loadMayScore({}, undefined);
    expect(mayScore()).toBe(true);
  });
});

describe('Desk flashcards — timed keyboard guards and honest picker', () => {
  it('_ftKeydownHandler guards editable focus, modifiers, and a hidden overlay', () => {
    const body = fnBody(DESK, '_ftKeydownHandler');
    expect(body).toMatch(/document\.activeElement/);
    expect(body).toMatch(/tag\s*===\s*['"]INPUT['"]/);
    expect(body).toMatch(/tag\s*===\s*['"]TEXTAREA['"]/);
    expect(body).toMatch(/tag\s*===\s*['"]SELECT['"]/);
    expect(body).toMatch(/isContentEditable/);
    expect(body).toMatch(/e\.ctrlKey[\s\S]*e\.metaKey[\s\S]*e\.altKey[\s\S]*e\.shiftKey/);
    expect(body).toMatch(/bf-overlay/);
    expect(body).toMatch(/ov\.style\.display\s*===\s*['"]none['"]/);
  });

  it('the deck note describes daily Engagement', () => {
    const body = fnBody(DESK, '_bfCreditNote');
    expect(body).toContain('daily 10 for Engagement redemption');
    expect(body).not.toMatch(/80%|pass/i);
  });
});

describe('Desk flashcards — modal accessibility', () => {
  it('the inner flashcard dialog carries its dialog semantics', () => {
    const start = DESK.indexOf('<div id="bf-overlay"');
    const end = DESK.indexOf('<!-- ═══ Resource Panel', start);
    const modal = DESK.slice(start, end);
    expect(modal).toMatch(/<div class="dialog-box"[^>]*role="dialog"/);
    expect(modal).toMatch(/aria-modal="true"/);
    expect(modal).toMatch(/aria-labelledby="bf-header"/);
  });

  it('feedback and result are polite live regions', () => {
    expect(DESK).toMatch(/id="bf-feedback"[^>]*aria-live="polite"/);
    expect(DESK).toMatch(/id="bf-result"[^>]*aria-live="polite"/);
  });

  it('flashcard choices have a 44px minimum target height', () => {
    expect(DESK).toMatch(/\.bf-choice\s*\{[^}]*min-height:\s*44px/);
  });

  it('card renders focus the first choice and close restores launcher focus', () => {
    expect(fnBody(DESK, '_bfRenderCard')).toMatch(/firstChoice[\s\S]*\.focus\(\)/);
    expect(fnBody(DESK, '_ftRenderCard')).toMatch(/firstChoice[\s\S]*\.focus\(\)/);
    expect(fnBody(DESK, '_bfCloseUI')).toMatch(/_bfState\.btn[\s\S]*\.focus\(\)/);
  });
});


describe('A2 flashcard percentage and district credit copy', () => {
  it('shows the percentage best separately from the one-point quarterly rule', () => {
    const note = new Function('_blooketScoreFor', 'return (' +
      fnBody(DESK, '_bfCreditNote') + ');')(() => 100);
    expect(note('1.1')).toContain('daily 10');
    expect(note('1.1')).not.toContain('100%');
    expect(DESK).toContain('Flashcards count through daily Engagement redemption.');
  });
});

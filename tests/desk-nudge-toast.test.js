/**
 * tests/desk-nudge-toast.test.js
 *
 * P3 -> T2 (P6) -- Teacher to Student Console: nudge toast structure pins.
 * Updated for the stacked-toast refactor (T2 of TEACHER_STUDENT_CONSOLE_P6_BUILD.md
 * section 3). The singleton #nudge-toast is replaced by #nudge-toast-stack +
 * #nudge-toast-template. All behavioral tests moved to nudge-toast-stack.test.js.
 * This file keeps the retained toast DOM and styling contracts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'desk.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// ============================================================================
// 1. DOM structure pins (T2 -- stack + template)
// ============================================================================

describe('nudge toast -- structure (T2 stacked)', () => {
  it('stack container #nudge-toast-stack is present in <body>', () => {
    expect(html).toMatch(/id="nudge-toast-stack"/);
  });

  it('template #nudge-toast-template is present in <body>', () => {
    expect(html).toMatch(/id="nudge-toast-template"/);
  });

  it('template contains .nt-from-name, .nt-text, .nt-close, .nt-send, textarea', () => {
    const tmplMatch = html.match(/<template id="nudge-toast-template">([\s\S]*?)<\/template>/);
    expect(tmplMatch).toBeTruthy();
    const inner = tmplMatch[1];
    expect(inner).toMatch(/class="[^"]*nt-from-name/);
    expect(inner).toMatch(/class="[^"]*nt-text/);
    expect(inner).toMatch(/class="[^"]*nt-close/);
    expect(inner).toMatch(/class="[^"]*nt-send/);
    expect(inner).toMatch(/<textarea/);
    expect(inner).toMatch(/maxlength="280"/);
  });

  it('OLD singleton #nudge-toast is gone', () => {
    expect(html).not.toMatch(/id="nudge-toast"\s+style="display:none"/);
    expect(html).not.toMatch(/id="nudge-toast-from"/);
    expect(html).not.toMatch(/id="nudge-toast-text"/);
    expect(html).not.toMatch(/id="nudge-toast-reply"/);
    expect(html).not.toMatch(/id="nudge-toast-send"/);
    expect(html).not.toMatch(/id="nudge-toast-close"/);
  });

  it('CSS uses .nudge-toast class (not #nudge-toast ID) for per-toast styling', () => {
    expect(html).toMatch(/\.nudge-toast\s*\{[\s\S]*?pointer-events/);
  });

  it('stack container CSS is position:fixed', () => {
    expect(html).toMatch(/#nudge-toast-stack\s*\{[\s\S]*?position:\s*fixed/);
  });

  it('nudge-slide-in keyframe animation is present', () => {
    expect(html).toMatch(/@keyframes\s+nudge-slide-in/);
  });

  

  it('_playNudgeChime, _showNudgeToast, _hideNudgeToast, _sendNudgeReply functions exist', () => {
    expect(fnBody(html, '_playNudgeChime')).toMatch(/AudioContext|webkitAudioContext/);
    expect(fnBody(html, '_showNudgeToast')).toMatch(/_activeNudges/);
    expect(fnBody(html, '_hideNudgeToast')).toMatch(/_hideNudgeToastById/);
    expect(fnBody(html, '_sendNudgeReply')).toMatch(/oldestId/);
  });

  it('_hideNudgeToastById and _sendNudgeReplyForId helpers exist', () => {
    expect(fnBody(html, '_hideNudgeToastById')).toMatch(/_activeNudges/);
    expect(fnBody(html, '_sendNudgeReplyForId')).toMatch(/nudge-reply/);
  });

  it('MAX_NUDGE_STACK is defined as 4', () => {
    expect(html).toMatch(/var\s+MAX_NUDGE_STACK\s*=\s*4/);
  });

  it('_activeNudges is a Map (not the old singleton _activeNudge)', () => {
    expect(html).toMatch(/var\s+_activeNudges\s*=\s*new\s+Map\s*\(\s*\)/);
    // Old singleton variable should be gone (outside of comments).
    const noComments = html.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/var\s+_activeNudge\s*=/);
  });

  it('DOMContentLoaded static hook for old toast buttons is removed', () => {
    // The old hook attached close/send event listeners by static ID.
    // Per T2, per-toast handlers attach inside _showNudgeToast instead.
    expect(html).not.toMatch(/nudge-toast-close[\s\S]{0,50}addEventListener/);
    expect(html).not.toMatch(/nudge-toast-send[\s\S]{0,50}addEventListener/);
  });
});

// ============================================================================
// 2. CSS shape
// ============================================================================

describe('nudge toast -- CSS (T2)', () => {
  it('stack container is pointer-events:none (layout shell)', () => {
    expect(html).toMatch(/#nudge-toast-stack\s*\{[\s\S]*?pointer-events:\s*none/);
  });

  it('individual toast has pointer-events:auto', () => {
    expect(html).toMatch(/\.nudge-toast\s*\{[\s\S]*?pointer-events:\s*auto/);
  });

  it('send button hover + disabled styles are present', () => {
    expect(html).toMatch(/\.nudge-toast\s+\.nt-send:hover/);
    expect(html).toMatch(/\.nudge-toast\s+\.nt-send:disabled/);
  });
});

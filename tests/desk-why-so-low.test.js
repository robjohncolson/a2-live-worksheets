// desk-why-so-low.test.js — the "Why so low?" grade coach in the Do Now card.
// Hybrid: an instant deterministic breakdown (from cached /grade + /donow) plus
// an optional grounded AI mini-chat. Static parse of the Desk HTML; no DOM exec.
//
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
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Why-so-low coach: markup + wiring', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: #donow-helper host lives in the Do Now card', () => {
    expect(DESK).toMatch(/<div\s+id="donow-helper"/);
  });

  it('02: helper styling is present', () => {
    expect(DESK).toMatch(/#donow-helper\s+\.wsl-btn/);
    expect(DESK).toMatch(/#donow-helper\s+\.wsl-panel/);
  });

  it('03: _gradeQuartersCache is declared and cached from /grade', () => {
    expect(DESK).toMatch(/var\s+_gradeQuartersCache\s*=\s*null/);
    expect(DESK).toMatch(/_gradeQuartersCache\s*=\s*quarters/);
  });

  it('04: renderDoNowGrades calls renderWhySoLow (typeof-guarded)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/typeof\s+renderWhySoLow\s*===\s*'function'/);
    expect(body).toMatch(/renderWhySoLow\(curQ,\s*q\)/);
    // The helper host is cleared on every entry (no stale breakdown).
    expect(body).toMatch(/getElementById\('donow-helper'\)/);
  });
});

describe('Why-so-low coach: renderWhySoLow', () => {
  const body = DESK ? fnBody(DESK, 'renderWhySoLow') : '';

  it('10: renders nothing when there is no grade to explain', () => {
    expect(body).toMatch(/quarterGrade/);
    expect(body).toMatch(/if\s*\(grade\s*==\s*null\)\s*return/);
  });

  it('11: renders a "Why so low?" button', () => {
    expect(body).toMatch(/Why so low\?/);
    expect(body).toMatch(/wsl-btn/);
  });

  it('12: panel renders lazily on first open (built flag)', () => {
    expect(body).toMatch(/_renderCoachPanel\(panel,\s*ctx\)/);
    expect(body).toMatch(/built/);
  });
});

describe('Why-so-low coach: _buildCoachContext shape', () => {
  const body = DESK ? fnBody(DESK, '_buildCoachContext') : '';

  it('20: carries the quarter grade + both tracks + ceiling', () => {
    expect(body).toMatch(/quarterGrade/);
    expect(body).toMatch(/pcAvg/);
    expect(body).toMatch(/workAvg/);
    expect(body).toMatch(/ceiling/);
  });

  it('21: pulls the next task from _donowData', () => {
    expect(body).toMatch(/_donowData/);
    expect(body).toMatch(/nextTask/);
  });

  it('22: weakLessons = cached lessons graded under 75, top 6', () => {
    expect(body).toMatch(/_gradeLessonsCache/);
    expect(body).toMatch(/lessonGrade\s*<\s*75/);
    expect(body).toMatch(/slice\(0,\s*6\)/);
  });
});

describe('Why-so-low coach: bottleneck diagnosis (40% gate)', () => {
  const body = DESK ? fnBody(DESK, '_coachBottleneckText') : '';

  it('30: flags a sub-40 track as the cap', () => {
    expect(body).toMatch(/<\s*40/);
    expect(body).toMatch(/40% gate/);
  });

  it('31: otherwise points to the stronger track + ceiling', () => {
    expect(body).toMatch(/stronger track/);
  });
});

describe('Why-so-low coach: _coachAsk (AI mini-chat)', () => {
  const body = DESK ? fnBody(DESK, '_coachAsk') : '';

  it('40: POSTs to the cr AI server /api/ai/coach', () => {
    expect(body).toMatch(/RAILWAY_SERVER_URL/);
    expect(body).toMatch(/\/api\/ai\/coach/);
    expect(body).toMatch(/method:\s*'POST'/);
  });

  it('41: sends the grounded context + message + history', () => {
    expect(body).toMatch(/context:\s*ctx/);
    expect(body).toMatch(/message:\s*message/);
    expect(body).toMatch(/history:\s*history/);
  });

  it('42: soft-fails to the still-visible instant facts', () => {
    expect(body).toMatch(/AI coach is unavailable right now/);
    // distinct copy for an unconfigured (503) service
    expect(body).toMatch(/503/);
    expect(body).toMatch(/not set up right now/);
  });

  it('43: shows a thinking state and re-enables the button in finally', () => {
    expect(body).toMatch(/thinking/i);
    expect(body).toMatch(/finally/);
    expect(body).toMatch(/askBtn\.disabled\s*=\s*false/);
  });
});

describe('Why-so-low coach: XSS-safe rendering', () => {
  it('50: panel builder uses textContent, never innerHTML with data', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/textContent/);
    // The only innerHTML use is the clear-to-empty reset.
    const innerHtmlAssigns = body.match(/\.innerHTML\s*=\s*([^;]+)/g) || [];
    for (const a of innerHtmlAssigns) {
      expect(a).toMatch(/=\s*''/);
    }
  });
});

describe('Why-so-low coach: review folds (open-panel preservation, races, a11y)', () => {
  it('60: _coachPanelOpen detects an expanded panel', () => {
    expect(DESK).toMatch(/function\s+_coachPanelOpen\s*\(/);
    const body = fnBody(DESK, '_coachPanelOpen');
    expect(body).toMatch(/\.wsl-panel/);
    expect(body).toMatch(/display\s*!==\s*'none'/);
  });

  it('61: renderWhySoLow bails when a panel is already open (preserve chat)', () => {
    const body = fnBody(DESK, 'renderWhySoLow');
    expect(body).toMatch(/if\s*\(_coachPanelOpen\(\)\)\s*return/);
  });

  it('62: renderDoNowGrades only clears the helper when no panel is open', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/!_coachPanelOpen\(\)/);
  });

  it('63: _coachAsk guards writes with isConnected (no orphaned-node write)', () => {
    const body = fnBody(DESK, '_coachAsk');
    expect(body).toMatch(/cEl\.isConnected/);
    expect(body).toMatch(/askBtn\.isConnected/);
  });

  it('64: the Enter path is gated by the in-flight (disabled) button', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/if\s*\(ask\.disabled\)\s*return/);
  });

  it('65: single-track bottleneck branches (PC/Work not started yet)', () => {
    const body = fnBody(DESK, '_coachBottleneckText');
    expect(body).toMatch(/has not started yet/);
    expect(body).toMatch(/wkNum\s*&&\s*!pcNum/);
    expect(body).toMatch(/pcNum\s*&&\s*!wkNum/);
  });

  it('66: transcript is an aria-live log region', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/setAttribute\('role',\s*'log'\)/);
    expect(body).toMatch(/setAttribute\('aria-live',\s*'polite'\)/);
  });

  it('67: button + prompt adapt to a healthy grade (not always "Why so low?")', () => {
    const wsl = fnBody(DESK, 'renderWhySoLow');
    expect(wsl).toMatch(/Grade breakdown/);
    expect(wsl).toMatch(/grade\s*<\s*80/);
    const panel = fnBody(DESK, '_renderCoachPanel');
    expect(panel).toMatch(/What should I focus on\?/);
  });

  it('68: privacy note is accurate (never your name)', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/never your name/);
  });

  it('70: _buildCoachContext carries quizTotal + strips the unit U-prefix', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/quizTotal/);
    expect(body).toMatch(/replace\(\/\^\[Uu\]\//);
  });

  it('71: _renderCoachPanel only shows a quiz line when quizTotal > 0 (no "quiz not done" for no-quiz topics)', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/w\.quizTotal\s*>\s*0/);
  });
});

describe('Why-so-low coach: prioritize by biggest deficit (worst component)', () => {
  it('80: _buildCoachContext computes each lesson lowest component + a biggestWin', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/w\.low/);
    expect(body).toMatch(/comps\.reduce/);
    expect(body).toMatch(/ctx\.biggestWin\s*=/);
  });

  it('81: weakLessons are ranked worst-component-first, not by overall grade', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    // sort key falls back to grade only when a lesson has no graded component
    expect(body).toMatch(/a\.low \? a\.low\.score : a\.grade/);
  });

  it('82: _renderCoachPanel leads with the biggest win + suppresses nextTask when present', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/ctx\.biggestWin/);
    expect(body).toMatch(/Biggest win/);
    expect(body).toMatch(/if \(!ctx\.biggestWin && ctx\.nextTask/);
  });
});

describe('Why-so-low coach: Blooket make-up awareness', () => {
  it('90: _buildCoachContext carries workTracks + a blooket summary (track/due/done/todo)', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/workTracks/);
    expect(body).toMatch(/q\.blooketDue/);
    expect(body).toMatch(/blooketTodo/);
    expect(body).toMatch(/ctx\.blooket\s*=/);
  });

  it('91: weakLessons carry per-lesson blooket + hasBlooket (vs "no Blooket exists")', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/blooket:\s*\(typeof l\.blooket/);
    expect(body).toMatch(/hasBlooket:\s*!!l\.hasBlooket/);
  });

  it('92: flashcards never produce a completion nudge', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).not.toMatch(/Make one up to 80%|pass each lesson|threshold: 80/);
  });

  it('93: a weak-lesson line mentions Blooket ONLY when the lesson has one', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).not.toMatch(/w\.hasBlooket/);
    expect(body).not.toMatch(/Flashcards not done/);
  });
});

describe('Why-so-low coach: PC-not-open + flashcard gate', () => {
  it('A1: _buildCoachContext threads pcDue (defaults false so a missing field never invents PC work)', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/pcDue:\s*!!\(q && q\.pcDue === true\)/);
  });

  it('A2: flashcards never produce a completion nudge', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).not.toMatch(/Make one up to 80%|pass each lesson|threshold: 80/);
  });

  it('A3: flashcards never produce a completion nudge', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).not.toMatch(/Make one up to 80%|pass each lesson|threshold: 80/);
  });
});

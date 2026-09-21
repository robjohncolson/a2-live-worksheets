// desk-timed-deck.test.js — the full timed-deck flashcard mode (a rigorous
// Blooket substitute): credit ladder (miss = −⅓, re-queue, 3 strikes = 0/removed),
// deck score = Σ credit / total, "review your misses" recap, per-card logging,
// colored score chip, best-wins commit. The credit/queue logic is pure (_ft*)
// and executed for real here; the rest is static-parsed.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { districtItemsFromLedger } from '../roster-server/district-ledger.js';
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
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

// Pull the pure round functions out of the source and run them for real.
function loadFt() {
  const names = ['_ftCreateRound', '_ftCurrentIdx', '_ftRecordOutcome', '_ftScore', '_ftMisses', '_ftDone'];
  const src = names.map((n) => fnBody(DESK, n)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(src + '\nreturn {' + names.map((n) => n + ':' + n).join(',') + '};')();
}
function deck3() {
  return [
    { qnum: 1, q: 'A?', choices: ['a', 'b'], correctIdx: 0 },
    { qnum: 2, q: 'B?', choices: ['a', 'b'], correctIdx: 0 },
    { qnum: 3, q: 'C?', choices: ['a', 'b'], correctIdx: 0 }
  ];
}

describe('Timed deck — pure credit/queue logic', () => {
  it('00: Desk file loads', () => { expect(DESK).toBeTypeOf('string'); });

  it('01: all correct on the first try → 100%, no misses', () => {
    const ft = loadFt();
    let r = ft._ftCreateRound(deck3());
    while (!ft._ftDone(r)) ft._ftRecordOutcome(r, 'correct', 1000);
    expect(ft._ftScore(r)).toBeCloseTo(100, 6);
    expect(ft._ftMisses(r)).toEqual([]);
  });

  it('02: a miss costs ⅓ and RE-QUEUES the card (does not drop it)', () => {
    const ft = loadFt();
    let r = ft._ftCreateRound(deck3());        // order [0,1,2]
    const front = ft._ftCurrentIdx(r);         // 0
    ft._ftRecordOutcome(r, 'wrong', 500);
    // card 0 left the front and went to the back; still 3 cards in play
    expect(r.order.length).toBe(3);
    expect(r.order[r.order.length - 1]).toBe(front);
    expect(r.order[0]).not.toBe(front);
    expect(r.status[front].misses).toBe(1);
    expect(r.status[front].resolved).toBe(false);
  });

  it('03: correct after 1 miss earns ⅔; after 2 misses earns ⅓', () => {
    const ft = loadFt();
    // One card, miss it twice then get it right → earns 1/3.
    const one = [{ qnum: 7, q: 'Q', choices: ['a', 'b'], correctIdx: 0 }];
    let r = ft._ftCreateRound(one);
    ft._ftRecordOutcome(r, 'wrong', 100);    // miss 1 → re-queue
    ft._ftRecordOutcome(r, 'timeout', 100);  // miss 2 (timeout counts) → re-queue
    ft._ftRecordOutcome(r, 'correct', 100);  // correct → earns 1 - 2/3 = 1/3
    expect(ft._ftScore(r)).toBeCloseTo(33.333, 2);
    expect(r.status[0].earned).toBeCloseTo(1 / 3, 6);
  });

  it('04: 3 misses → 0 credit AND removed from the round (not re-queued)', () => {
    const ft = loadFt();
    const one = [{ qnum: 9, q: 'Q', choices: ['a', 'b'], correctIdx: 0 }];
    let r = ft._ftCreateRound(one);
    ft._ftRecordOutcome(r, 'wrong', 100);
    ft._ftRecordOutcome(r, 'wrong', 100);
    ft._ftRecordOutcome(r, 'wrong', 100);    // 3rd miss → struck out
    expect(ft._ftDone(r)).toBe(true);         // removed, round over
    expect(r.status[0].earned).toBe(0);
    expect(ft._ftScore(r)).toBe(0);
    const misses = ft._ftMisses(r);
    expect(misses).toHaveLength(1);
    expect(misses[0].struck).toBe(true);
    expect(misses[0].correctAnswer).toBe('a');
  });

  it('05: deck score = Σ earned / total (mixed outcomes)', () => {
    const ft = loadFt();
    let r = ft._ftCreateRound(deck3());
    // card 1 (front) wrong once then later correct (⅔); cards 2,3 correct (1 each)
    ft._ftRecordOutcome(r, 'wrong', 100);     // card1 → re-queue; order [1,2,0]
    ft._ftRecordOutcome(r, 'correct', 100);   // card2 → 1
    ft._ftRecordOutcome(r, 'correct', 100);   // card3 → 1
    ft._ftRecordOutcome(r, 'correct', 100);   // card1 → ⅔
    expect(ft._ftDone(r)).toBe(true);
    // (2/3 + 1 + 1) / 3 * 100 = 88.888…
    expect(ft._ftScore(r)).toBeCloseTo(88.889, 2);
    const misses = ft._ftMisses(r);
    expect(misses).toHaveLength(1);
    expect(misses[0].struck).toBe(false);
    expect(misses[0].earned).toBeCloseTo(2 / 3, 6);
  });

  it('06: every answer is logged with the SRS shape {qnum,correct,latencyMs,wasTimeout,missIndex}', () => {
    const ft = loadFt();
    const one = [{ qnum: 5, q: 'Q', choices: ['a', 'b'], correctIdx: 0 }];
    let r = ft._ftCreateRound(one);
    ft._ftRecordOutcome(r, 'timeout', 40000);
    ft._ftRecordOutcome(r, 'correct', 1200);
    expect(r.log).toHaveLength(2);
    expect(r.log[0]).toMatchObject({ qnum: 5, correct: false, wasTimeout: true, latencyMs: 40000, missIndex: 0 });
    expect(r.log[1]).toMatchObject({ qnum: 5, correct: true, wasTimeout: false, latencyMs: 1200, missIndex: 1 });
  });

  it('07: empty deck → score 0, done immediately', () => {
    const ft = loadFt();
    const r = ft._ftCreateRound([]);
    expect(ft._ftDone(r)).toBe(true);
    expect(ft._ftScore(r)).toBe(0);
  });
});

describe('Timed deck — UI wiring (static parse)', () => {
  it('10: BLOOKET_FULLDECK_SECONDS is 40', () => {
    expect(DESK).toMatch(/const\s+BLOOKET_FULLDECK_SECONDS\s*=\s*40/);
  });

  it('11: the mode picker is gone — no function, no Quick check offer anywhere', () => {
    expect(DESK).not.toMatch(/function\s+_bfShowModePicker\s*\(/);
    expect(DESK).not.toMatch(/_bfShowModePicker\s*\(/);
    expect(DESK).not.toMatch(/modeBtn\s*\(/);
    expect(fnBody(DESK, '_ftStart')).toMatch(/bf-overlay['"]\)\.style\.display\s*=\s*['"]block['"]/);
  });

  it('12: openBlooketFlashcards defaults to daily quick check and offers the full timed credit action', () => {
    const body = fnBody(DESK, 'openBlooketFlashcards');
    expect(body).toMatch(/_ftStart\s*\(\s*btn\s*,\s*topicId\s*\)/);
    expect(body).toMatch(/await _bfStartQuick\(btn, topicId\)/);
    expect(body).toContain("getElementById('bf-full-deck')");
    expect(fnBody(DESK, '_ftStart')).toMatch(/_bfCreditNote\(topicId\)/);
    expect(fnBody(DESK, '_bfCreditNote')).toMatch(/Engagement credit[\s\S]*80%[\s\S]*100%[\s\S]*Your best so far/);
  });

  it('13: the timer ticks every second and times out the card at 0', () => {
    const start = fnBody(DESK, '_ftStartTimer');
    expect(start).toMatch(/BLOOKET_FULLDECK_SECONDS/);
    expect(start).toMatch(/setInterval/);
    expect(start).toMatch(/_ftState\.remaining\s*-=\s*1/);
    expect(start).toMatch(/_ftHandle\(\s*['"]timeout['"]\s*\)/);
    expect(fnBody(DESK, '_ftClearTimer')).toMatch(/clearInterval/);
  });

  it('14: a miss is NOT revealed (re-queue stays honest) + auto-advances', () => {
    const body = fnBody(DESK, '_ftHandle');
    // Feedback says "comes back" / "too slow" — never prints the correct choice text.
    expect(body).toMatch(/come back/);
    expect(body).toMatch(/Too slow/);
    expect(body).toMatch(/_ftRecordOutcome/);
    expect(body).toMatch(/setTimeout\([^,]*_ftRenderCard/);
    // It must not reveal card.choices[card.correctIdx] during the round.
    expect(body).not.toMatch(/choices\[[^\]]*correctIdx\]/);
  });

  it('15: the recap shows "review your misses" with the correct answers', () => {
    const body = fnBody(DESK, '_ftRenderRecap');
    expect(body).toMatch(/Review your misses/i);
    expect(body).toMatch(/correctAnswer/);
    expect(body).toMatch(/_ftMisses/);
  });

  it('16: per-card log persists to localStorage a2_srs_log_<email>', () => {
    const body = fnBody(DESK, '_ftLogToStore');
    expect(body).toMatch(/_srsAppendLog\s*\(/);
    expect(body).toMatch(/qnum/);
    expect(body).toMatch(/latencyMs/);
    expect(body).toMatch(/wasTimeout/);
    const appendBody = fnBody(DESK, '_srsAppendLog');
    expect(appendBody).toMatch(/a2_srs_log_/);
    expect(appendBody).toMatch(/getStudentEmail/);
  });

  // moved to journeys/j5-timed-deck.journey.test.js — J5 Full timed deck rejects a lower re-run and posts one higher best (supersedes desk-timed-deck it 17 “_ftFinish logs, recaps, and commits the score (best-wins)” and it 24 “_blooketCommit only saves a NEW best + refreshes /grade BEFORE the floor”)

  it('18: _ftStart uses the FULL deck (no top-10 trim) and attaches its own keydown', () => {
    const body = fnBody(DESK, '_ftStart');
    expect(body).not.toMatch(/_bfSelectTop10/);
    expect(body).toMatch(/addEventListener\s*\(\s*['"]keydown['"]\s*,\s*_ftKeydownHandler/);
  });

  it('19: _bfCloseUI tears down the timed-deck timer + state too (no leak)', () => {
    const body = fnBody(DESK, '_bfCloseUI');
    expect(body).toMatch(/_ftClearTimer\s*\(\s*\)/);
    expect(body).toMatch(/removeEventListener\s*\(\s*['"]keydown['"]\s*,\s*_ftKeydownHandler\s*\)/);
    expect(body).toMatch(/_ftState\.round\s*=\s*null/);
  });
});

describe('Score color thresholds (executed) + one chip per row', () => {
  function colorFn() {
    // eslint-disable-next-line no-new-func
    return new Function('return (' + fnBody(DESK, '_scoreColor') + ');')();
  }
  it('20: below gate → red; gate..99 → amber; 100 → green; null → null', () => {
    const col = colorFn();
    expect(col(50, 80)).toBe('#B03A2E');   // red — below the 80% gate
    expect(col(85, 80)).toBe('#b8860b');   // amber — passing, not perfect
    expect(col(100, 80)).toBe('#25663F');  // green — perfected
    expect(col(null, 80)).toBe(null);      // no score
    expect(col(40, 40)).toBe('#b8860b');   // exactly at the gate → amber, not red
  });
  it('21: _scoreChip (Blooket inline) renders the colored rounded percentage', () => {
    // eslint-disable-next-line no-new-func
    const fn = new Function(fnBody(DESK, '_scoreColor') + '\nreturn (' + fnBody(DESK, '_scoreChip') + ');')();
    expect(fn(86.7, 80)).toMatch(/>87%<\/span>/);
    expect(fn(50, 80)).toMatch(/#B03A2E/);
    expect(fn(null, 80)).toBe('');
  });
  it('22: both chip renderers color via the shared _scoreColor (single source)', () => {
    expect(fnBody(DESK, '_scoreChip')).toMatch(/_scoreColor/);
    const idx = DESK.indexOf('var _mkGradeChip');
    expect(DESK.slice(idx, idx + 700)).toMatch(/_scoreColor/);
  });
  it('23: NO duplicate chip — worksheet/quiz rows have no inline _scoreChip (only Blooket does)', () => {
    const body = fnBody(DESK, 'showResourcePanel');
    expect(body).toMatch(/_scoreChip\(\s*_blScore\s*,\s*80\s*\)/);     // blooket inline chip
    expect(body, 'worksheet must not also add an inline _scoreChip').not.toMatch(/_scoreChip\([^)]*_getCwsForTopic/);
    // the persistent _mkGradeChip block colors worksheet/quiz against their gates
    // 2026-09-11: the worksheet chip now DISPLAYS the Follow-Along grade (what Schoology shows)
    // and keeps Cws as the completion floor — still colored against the worksheet gate.
    expect(DESK).toMatch(/_mkGradeChip\(_faDetail \? _faDetail\.grade : _faCws, DESK_WORKSHEET_DONE_THRESHOLD, _faDetail\)/);
    expect(DESK).toMatch(/_faCws = _getCwsForTopic\(slot\.getAttribute\('data-topic'\)\)/);
    expect(DESK).toMatch(/scorePct : null, DESK_QUIZ_DONE_THRESHOLD/);
  });
});

// 'Best-wins commit (re-practice never lowers the grade)' its 17 and 24 moved to
// journeys/j5-timed-deck.journey.test.js — J5 Full timed deck rejects a lower re-run
// and posts one higher best.

describe('Review folds — null-round crash guard + cancellable advance', () => {
  it('25: _ftFinish bails on a null round (closed mid auto-advance)', () => {
    const body = fnBody(DESK, '_ftFinish');
    expect(body).toMatch(/if\s*\(\s*!round\s*\)\s*return/);
  });
  it('26: the 800ms auto-advance is cancellable (stored id, cleared on teardown)', () => {
    expect(fnBody(DESK, '_ftHandle')).toMatch(/_ftState\.advanceId\s*=\s*setTimeout/);
    expect(fnBody(DESK, '_ftClearTimer')).toMatch(/clearTimeout\(\s*_ftState\.advanceId\s*\)/);
    expect(DESK).toMatch(/advanceId:\s*null/);   // initialized on _ftState
  });
});


describe('Timed deck retirement from district formula', () => {
  it('retains receipts without awarding per-lesson Engagement', () => {
    const cfg = { today: '2026-10-10', quarters: { Q1: { start: '2026-09-01', end: '2026-11-01' } } };
    const item = { itemId: 'BL-U1-L1-DESK_DONE', source: 'flashcard' };
    const schedule = { '1.1': { periods: { C: '2026-10-01' }, items: [item] } };
    const rows = [{ item_id: item.itemId, source: 'flashcard', score: 100, recorded_at: '2026-10-02' }];
    expect(districtItemsFromLedger(rows, schedule, 'C', cfg)).toEqual([]);
    expect(rows[0].score).toBe(100);
  });
});

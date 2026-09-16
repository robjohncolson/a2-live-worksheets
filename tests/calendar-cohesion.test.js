/**
 * tests/calendar-cohesion.test.js
 *
 * CALENDAR_POLISH_PROPOSAL.md — the "ship-tonight" cohesion/polish/a11y slice for
 * the Desk calendar in desk.html. Purely additive: every
 * assertion here is for NEW behavior; the frozen calendar-polish.test.js contract
 * is untouched. Mirrors that file's fnBody + vm-runtime approach.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';
import { loadCedLabels } from './fixtures/ced2026-labels.js';

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

// --- Item 1: legend decodes every overlay STATE -----------------------------

describe('Item 1 -- legend decodes overlay states (not just unit colors)', () => {
  it('updateLegend emits a collapsed <details class="legend-states"> key', () => {
    const b = fnBody(html, 'updateLegend');
    expect(b).toMatch(/<details class="legend-states">/);
    expect(b).toMatch(/<summary>What the marks mean<\/summary>/);
  });
  
  
  it('the cal-current swatch shows the magenta identity WITHOUT the pulsing bloom', () => {
    expect(html).toMatch(/\.legend-states \.cal-current\s*\{[^}]*animation:\s*none/);
    expect(html).toMatch(/\.legend-states \.cal-current\s*\{[^}]*var\(--accent\)/);
    expect(html).toMatch(/\.legend-states \.dc-ahead\s*\{[^}]*animation:\s*none/);
  });
  it('the legend-states key is collapsed by default (no [open] attr in the markup)', () => {
    const b = fnBody(html, 'updateLegend');
    expect(b).not.toMatch(/<details class="legend-states" open>/);
  });
});

// --- Item 2: keyboard-accessible cells --------------------------------------

describe('Item 2 -- cells are keyboard-focusable + activatable', () => {
  it('rCal makes interactive cells role=button + tabbable', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/setAttribute\(\s*['"]role['"]\s*,\s*['"]button['"]\s*\)/);
    expect(b).toMatch(/\.tabIndex\s*=\s*0/);
  });
  it('rCal binds Enter/Space to re-use the existing onclick (honors lock + Do-Now guards)', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/addEventListener\(\s*['"]keydown['"]/);
    expect(b).toMatch(/ev\.key\s*===\s*['"]Enter['"]/);
    expect(b).toMatch(/c\.click\(\)/);
    // only wired when the cell actually has an onclick (interactive cells only)
    expect(b).toMatch(/if\s*\(\s*c\.onclick\s*\)/);
  });
  
});

// ═══ Round 2 (needs-your-nod items #8-#16, user-approved) ═══════════════════

describe('Item 8 -- additive hover (no full-black invert)', () => {
  it('.dc:hover layers an outline ring instead of inverting to solid black', () => {
    expect(html).toMatch(/\.dc:hover\s*\{[^}]*outline:\s*2px solid var\(--black\)/);
    // the old destructive invert is gone
    expect(html).not.toMatch(/\.dc:hover\s*\{[^}]*background-color:\s*var\(--black\)/);
  });

});

describe('Item 10 -- date-aware corner grammar', () => {
  it('the redundant ◀TODAY corner chip is dropped (the frame signals today)', () => {
    expect(html).not.toMatch(/\.cell-today::after/);
    expect(html).not.toMatch(/content:\s*'\\25C0 TODAY'/);   // the chip's glyph is gone
  });
  it('today is seated forward (z-index) and keeps its 2px frame', () => {
    expect(html).toMatch(/\.cell-today\s*\{[^}]*inset 0 0 0 2px var\(--black\)[^}]*z-index:\s*2/);
  });
  it('the 2x badge moves to bottom-center, clear of the corner dots', () => {
    expect(html).toMatch(/\.dbl\s*\{[^}]*left:\s*50%[^}]*translateX\(-50%\)/);
  });
});

describe('Item 11 -- colorblind state glyphs (shapes, not just hue)', () => {
  it('done/in-progress/next-up render shape glyphs reusing the tooltip symbols', () => {
    expect(html).toMatch(/\.dc-localdone::after,[^{]*\.dc-done::after[^{]*\{\s*content:\s*'\\2713'/); // ✓
    expect(html).toMatch(/\.dc-localpartial::after,\s*\.dc-partial::after\s*\{\s*content:\s*'\\25D0'/); // ◐
    expect(html).toMatch(/\.cal-current::after\s*\{\s*content:\s*'\\25B6'/); // ▶
  });
  it('glyph precedence is source-ordered so next-up wins over done over in-progress', () => {
    const iPartial = html.indexOf("'\\25D0'");  // ◐
    const iDone = html.indexOf("'\\2713'");     // ✓
    const iNext = html.indexOf("'\\25B6'");     // ▶
    expect(iPartial).toBeGreaterThan(-1);
    expect(iDone).toBeGreaterThan(iPartial);
    expect(iNext).toBeGreaterThan(iDone);
  });
});

describe('Item 16 -- one ring per cell (today keeps its 2px frame)', () => {
  it('a today cell drops the 3px state ring and re-asserts its 2px frame', () => {
    expect(html).toMatch(/\.dc-done\.cell-today,[\s\S]*?\.dc-localpartial\.cell-today\s*\{[^}]*inset 0 0 0 2px var\(--black\)/);
  });
});

describe('Item 9 -- up-next style switcher (default unchanged)', () => {
  it('alternative styles are layered on body[data-calcur] AFTER the frozen rule', () => {
    expect(html).toMatch(/body\[data-calcur="tone"\] \.cal-current/);
    expect(html).toMatch(/body\[data-calcur="gold"\] \.cal-current/);
    expect(html).toMatch(/body\[data-calcur="ants"\] \.cal-current/);
    expect(html).toMatch(/@keyframes antsMarch/);
  });
  it('the style is set on <body> so the legend swatch previews it live', () => {
    const b = fnBody(html, '_applyCalcurStyle');
    expect(b).toMatch(/document\.body\.setAttribute\(\s*['"]data-calcur['"]/);
  });
  it('the alternatives honor reduced-motion', () => {
    expect(html).toMatch(/prefers-reduced-motion[\s\S]*?body\[data-calcur="ants"\] \.cal-current::before\s*\{[^}]*animation:\s*none/);
  });
  it('setCalcurStyle persists + _applyCalcurStyle reflects the pick onto #cg', () => {
    expect(html).toMatch(/function setCalcurStyle\s*\(/);
    expect(html).toMatch(/function _applyCalcurStyle\s*\(/);
    const b = fnBody(html, '_applyCalcurStyle');
    expect(b).toMatch(/setAttribute\(\s*['"]data-calcur['"]/);
    expect(b).toMatch(/localStorage\.getItem\(\s*CALCUR_KEY/);
    expect(b).toMatch(/sel\.value\s*=\s*v/);   // re-sync the picker after updateLegend rebuilds it
    expect(b).toMatch(/CALCUR_DEFAULT/);       // falls back to the default when nothing is saved
  });
  it('marching ants is the default up-next style', () => {
    expect(html).toMatch(/CALCUR_DEFAULT\s*=\s*'ants'/);
    // the dropdown marks ants as the default option
    expect(fnBody(html, 'updateLegend')).toMatch(/value="ants">Marching ants \(default\)/);
    // updateLegend renders the picker + applies the saved pick
    const u = fnBody(html, 'updateLegend');
    expect(u).toMatch(/id="calcur-pick"/);
    expect(u).toMatch(/_applyCalcurStyle\(\)/);
  });
});

describe('Item 12 -- mobile clamps the subtitle (does not hide it)', () => {
  it('the ≤700px rule shows the subtitle clamped to one line + a taller cell', () => {
    expect(html).toMatch(/\.dc \.tt\s*\{\s*display:\s*block;[^}]*text-overflow:\s*ellipsis/);
    expect(html).toMatch(/\.dc\s*\{\s*padding:\s*3px;\s*min-height:\s*46px/);
  });
});

describe('Item 13 -- honest pace-aware progress', () => {
  it('rProg delegates to _computePace + draws a done-fill + a pace label', () => {
    const b = fnBody(html, 'rProg');
    expect(b).toMatch(/_computePace\(_orderedPeriodTopics\(\)/);
    expect(b).toMatch(/prog-fill/);
    expect(b).toMatch(/to catch up/);
    expect(b).toMatch(/ahead/);
    expect(b).toMatch(/lessons done/);
  });
  it('a .prog-fill CSS rule exists', () => {
    expect(html).toMatch(/\.prog-fill\s*\{[^}]*position:\s*absolute/);
  });
  it('renderDoNowGrades recomputes rProg once the grade cache warms', () => {
    const b = fnBody(html, 'renderDoNowGrades');
    expect(b).toMatch(/rProg\(\)/);
  });

  // EXECUTE _computePace — the denominator must be the DEDUPED DOT-LESSON count, NOT every
  // schedule cell (non-lesson entries excluded). Regression guard for the
  // round-2 review major #1 (the bug shipped green under string-only tests).
  function loadComputePace(doneSet) {
    const sandbox = {};
    createContext(sandbox);
    runInContext(
      'function localLessonState(t){ return (' + JSON.stringify(doneSet || {}) + ')[t] ? "done" : ""; }\n' +
      fnBody(html, '_computePace') + '\nthis.__p = _computePace;', sandbox);
    return sandbox.__p;
  }
  it('_computePace counts ONLY deduped dot-lessons (specials + dups excluded from total)', () => {
    const p = loadComputePace();
    const topics = ['Welcome', 'Review', '1.1', '1.2', 'No School', '1.3', '1.1']; // specials + a dup 1.1
    const res = p(topics, {}, [], 0, 'D');
    expect(res.total).toBe(3);   // only 1.1, 1.2, 1.3
    expect(res.done).toBe(0);
  });
  it('_computePace counts done + date-expected lessons over the same universe', () => {
    const p = loadComputePace({ '1.1': 1, '1.2': 1 });
    const topics = ['1.1', '1.2', '1.3'];
    const S = [
      [2026, 8, 1, null, { t: '1.1', u: 1 }],
      [2026, 8, 2, null, { t: '1.2', u: 1 }],
      [2026, 8, 2, null, { t: 'Review', u: 0 }],   // special — excluded from expected
      [2026, 11, 1, null, { t: '1.3', u: 1 }],                  // future
    ];
    const today = +new Date(2026, 8, 15);
    const res = p(topics, {}, S, today, 'D');
    expect(res.total).toBe(3);
    expect(res.done).toBe(2);       // 1.1, 1.2 done
    expect(res.expected).toBe(2);   // 1.1, 1.2 due by today; 1.3 future; review excluded
  });
});

describe('Item 14 -- tooltip is honest (no dead links)', () => {
  it('sTip drops the unclickable resource anchors and shows an open-hint instead', () => {
    const b = fnBody(html, 'sTip');
    expect(b).not.toMatch(/re\.urls\.worksheet/);
    expect(b).not.toMatch(/Schoology Folder/);
    expect(b).toMatch(/Click to open/);
    expect(b).toMatch(/tt-status/);   // the Schoology Posted/Scheduled status line remains
  });
  it('sTip no longer shows the deprecated readiness line or the broken double-click hint', () => {
    const b = fnBody(html, 'sTip');
    expect(b).not.toMatch(/Ready ✓/);             // the Ready/Partial/Pending readiness line is gone
    expect(b).not.toMatch(/double-click for grade/);
  });
});

describe('Teacher view -- only the "partial" browsing noise is suppressed for a teacher-as-self', () => {
  it('rCal drops only partial for a teacher, keeping real done', () => {
    const r = fnBody(html, 'rCal');
    expect(r).toMatch(/_suppressProgress\s*=\s*\(typeof _deskIsTeacher/);
    expect(r).toMatch(/_suppressProgress\s*&&\s*_localState\s*===\s*'partial'/);
    expect(r).toMatch(/localLessonState\(\s*inf\.t\s*,\s*_gateMarks\s*\)/);   // still computed (done survives)
  });
  it('paintLocalDoneCells does the same (so it does not come back after the cache warms)', () => {
    const p = fnBody(html, 'paintLocalDoneCells');
    expect(p).toMatch(/suppressProgress\s*=\s*\(typeof _deskIsTeacher/);
    expect(p).toMatch(/suppressProgress\s*&&\s*st\s*===\s*'partial'/);
  });
});

// --- Item 3: screen-reader layer -------------------------------------------

describe('Item 3 -- aria-label + screen-reader live region', () => {
  it('rCal sets aria-label on cells and aria-current on the next-up cell', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/setAttribute\(\s*['"]aria-label['"]/);
    expect(b).toMatch(/setAttribute\(\s*['"]aria-current['"]\s*,\s*['"]step['"]\s*\)/);
    expect(b).toMatch(/cellAria\(/);
  });
  it('#cg is a labelled group and #cal-sr is an aria-live region', () => {
    expect(html).toMatch(/id="cg"[^>]*role="group"[^>]*aria-label=/);
    expect(html).toMatch(/id="cal-sr"[^>]*aria-live="polite"/);
  });
  it('an .sr-only utility exists (clipped, screen-reader-only)', () => {
    expect(html).toMatch(/\.sr-only\s*\{[^}]*clip:\s*rect\(/);
  });
  it('rCal writes a window summary into #cal-sr (paging announces)', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/getElementById\(['"]cal-sr['"]\)/);
    expect(b).toMatch(/Calendar showing/);
  });
  it('rCal appends the human state suffixes to the aria-label', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/\(next up\)/);
    expect(b).toMatch(/\(completed\)/);
    expect(b).toMatch(/locked — finish/);
  });
  it('paintDonowCells mirrors the SERVER done/ahead state into the aria-label, idempotently', () => {
    const b = fnBody(html, 'paintDonowCells');
    expect(b).toMatch(/getAttribute\(\s*['"]aria-label['"]\s*\)/);
    expect(b).toMatch(/\(completed, ahead of schedule\)/);
    expect(b).toMatch(/indexOf\(\s*['"]\(completed/);   // dedup guard
  });

  // behavioral: cellAria produces flat, emoji-free text from the schedule entry
  function loadCellAria() {
    const labels = loadCedLabels({ lessons: {
      '1.1': { ced2026: { status: 'core', newTopic: '1.1', newUnit: 1, newLabel: 'Key Features of Functions' } },
      '1.2': { ced2026: { status: 'core', newTopic: '1.2', newUnit: 1, newLabel: 'Transformations of Functions' } },
    } });
    const sandbox = { cedLabel: labels.cedLabel, cedDisplayText: labels.cedDisplayText };
    createContext(sandbox);
    runInContext(
      "const R='review',OFF='off',EX='exam',PO='post',NC='noclass';\n" +
      fnBody(html, 'cellAria') + '\nthis.__a = cellAria;', sandbox);
    return sandbox.__a;
  }
  it('announces A2 lesson names and dates without changing the lesson key', () => {
    const aria = loadCellAria();
    const cell = { t: '1.1', n: 'stale title', u: 1 };
    expect(aria(cell, 'Sep 16')).toContain('Key Features of Functions');
    expect(aria(cell, 'Sep 16')).toContain('Sep 16');
    expect(cell.t).toBe('1.1');
    expect(aria({ t: '1.2', n: 'planned lesson', u: 1 }, 'Sep 28')).toContain('Transformations of Functions');
  });

  
  
});

// --- Item 4: stepped hover/press tactility ---------------------------------

describe('Item 4 -- crisp stepped hover/press feedback', () => {
  it('.dc uses a stepped (pixel-crisp) hover transition', () => {
    expect(html).toMatch(/\.dc\s*\{[^}]*transition:[^}]*steps\(2\)/);
  });
  it('the nav button sinks on press (inset + translate)', () => {
    expect(html).toMatch(/\.cal-nav-btn:active[\s\S]*?transform:\s*translate\(1px,\s*1px\)/);
  });
  it('reduced-motion disables the new transitions', () => {
    expect(html).toMatch(/prefers-reduced-motion[^{]*\{\s*\.dc,\s*\.cal-nav-btn\s*\{[^}]*transition:\s*none/);
  });
});

// --- Item 5: one indicator scale -------------------------------------------

describe('Item 5 -- status indicator scale', () => {
  it('status-dot remains a readable 7px indicator', () => {
    // the real (first position:absolute) status-dot rule -- 7px round
    expect(html).toMatch(/\.status-dot\s*\{[^}]*width:7px;\s*height:7px;\s*border-radius:50%/);
  });
  it('mobile drops the 2x text', () => {
    expect(html).toMatch(/\.dbl\s*\{\s*display:\s*none/);
  });
});

// --- Item 7: named magic numbers (code sharpening) -------------------------

describe('Item 7 -- dim levels are named :root vars', () => {
  it(':root defines the three cell-dim vars', () => {
    expect(html).toMatch(/--cell-past-dim:\s*0\.5/);
    expect(html).toMatch(/--cell-lock-dim:\s*0\.4/);
    expect(html).toMatch(/--cell-done-dim:\s*0\.6/);
  });
  it('the done-greyscale + locked + past rules consume the vars (A1 still matches: grayscale then opacity)', () => {
    expect(html).toMatch(/\.cell-past\s*\{\s*opacity:\s*var\(--cell-past-dim\)/);
    expect(html).toMatch(/\.cell-locked\s*\{[^}]*opacity:\s*var\(--cell-lock-dim\)/);
    expect(html).toMatch(/\.dc-done:not\(\.cell-today\):not\(\.cal-current\)\s*\{[^}]*grayscale[^}]*opacity:\s*var\(--cell-done-dim\)/);
  });
  it('htm names the double-topic badge const (no bare `let db`)', () => {
    const b = fnBody(html, 'htm');
    expect(b).toMatch(/const doubleBadge\s*=/);
    expect(b).not.toMatch(/let db\s*=/);
  });
});

// ═══ Round 3 — window redesign: dynamic sizing + Today button ═══

describe('Window redesign -- dynamic sizing', () => {
  it('CAL_FOCUS_WEEKS is a let starting at 2, with MIN/MAX bounds', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/let\s+CAL_FOCUS_WEEKS\s*=\s*2/);
    expect(b).toMatch(/CAL_MIN_WEEKS\s*=\s*1/);
    // 2026-08-19: the cap is viewport-aware (2 weeks on short screens, else 4).
    expect(b).toMatch(/CAL_MAX_WEEKS\s*=\s*(\d+|_calShort \? 2 : 4)/);
  });
  it('rCal sizes toward the next-up week and publishes the step width', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/_nextUpWk/);
    expect(b).toMatch(/CAL_FOCUS_WEEKS\s*=\s*Math\.min\(\s*CAL_MAX_WEEKS/);
    expect(b).toMatch(/_calStepWeeks\s*=\s*CAL_FOCUS_WEEKS/);
  });
});

describe('Window redesign -- Today button', () => {
  it('the nav has a Today button wired to calToday()', () => {
    expect(html).toMatch(/id=["']cal-today["'][^>]*onclick=["']calToday\(\)/);
  });
  it('calToday resets paging to today and re-renders', () => {
    expect(html).toMatch(/function\s+calToday\s*\(\s*\)/);
    const b = fnBody(html, 'calToday');
    expect(b).toMatch(/_calPageOffset\s*=\s*0/);
    expect(b).toMatch(/rCal\(\)/);
  });
  it('rCal dims the Today button when already on today (offset 0)', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/cal-today-off['"]\s*,\s*_calPageOffset\s*===\s*0/);
  });
  it('the off-state keeps its flex slot (opacity/pointer-events, never display:none)', () => {
    expect(html).toMatch(/\.cal-today-btn\.cal-today-off\s*\{[^}]*pointer-events:\s*none/);
    expect(html).not.toMatch(/\.cal-today-btn\.cal-today-off\s*\{[^}]*display:\s*none/);
  });
});

describe('Sticky core (layout P4, 2026-08-19)', () => {
  // The Do Now card, calendar nav and day header pin under the menu bar while the
  // rest of the window scrolls. DOM order is unchanged — only CSS + a measurer.
  const styleBlock = html.slice(0, html.indexOf('</style>'));
  it('the Mac window clips instead of hiding overflow (hidden would disable sticky)', () => {
    const macWindow = /\.mac-window\s*\{[^}]*\}/.exec(styleBlock)[0];
    expect(macWindow).toMatch(/overflow:\s*clip/);
    expect(macWindow).not.toMatch(/overflow:\s*hidden/);
  });
  it('Do Now card, cal-nav and hdr-row are sticky and stack via measured offsets', () => {
    expect(styleBlock).toMatch(/#donow-card\s*\{\s*position:\s*sticky;\s*top:\s*21px/);
    expect(styleBlock).toMatch(/\.cal-nav\s*\{\s*position:\s*sticky;\s*top:\s*calc\(21px \+ var\(--donow-h, 0px\)\)/);
    expect(styleBlock).toMatch(/\.hdr-row\s*\{\s*position:\s*sticky;\s*top:\s*calc\(21px \+ var\(--donow-h, 0px\) \+ var\(--calnav-h, 0px\)\)/);
  });
  it('an open coach panel is capped so it cannot eat the fold', () => {
    expect(styleBlock).toMatch(/#donow-helper \.wsl-panel\s*\{\s*max-height:\s*30vh;\s*overflow-y:\s*auto/);
  });
  it('the measurer publishes --donow-h (card + 8px margin, 0 when hidden) and --calnav-h', () => {
    expect(html).toMatch(/_stickyCard\.offsetHeight \? _stickyCard\.offsetHeight \+ 8 : 0/);
    expect(html).toMatch(/setProperty\('--donow-h'/);
    expect(html).toMatch(/setProperty\('--calnav-h'/);
    expect(html).toMatch(/new ResizeObserver\(_stickyMeasure\)/);
  });
  it('the Do Now card still precedes the calendar in DOM order', () => {
    expect(html.indexOf('id="donow-card"')).toBeLessThan(html.indexOf('class="cal-outer geneva"'));
  });
});

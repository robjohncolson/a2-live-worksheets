// desk-day-grade-modal.test.js — Phase 6 per-day grade click-through modal.
// Structure pins on the Desk HTML source + DOM behaviors.
// Static parse — no DOM execution needed for most pins.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'desk.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

it('day-grade display renders 105 and the earned exit-ticket bonus', () => {
  const dom = new JSDOM('<div id="day-grade-overlay"></div><div id="day-grade-header"></div><div id="day-grade-body"></div>');
  try {
    const rows = [{ lessonKey: '1.1', lessonGrade: 105, exitBonus: 5, due: { E: '2026-09-09' } }];
    const open = new Function('document', '_gradeLessonsCache', 'cedLabel', '_attachDayGradeKeyHandler',
      fnBody(DESK, 'openDayGrade') + ';return openDayGrade;')(dom.window.document, rows, key => ({ text: key }), () => {});
    open('Sep 9');
    const text = dom.window.document.getElementById('day-grade-body').textContent;
    expect(text).toContain('105.0');
    expect(text).toContain('+5 exit ticket');
  } finally { dom.window.close(); }
});

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

describe('DESK Day Grade Modal — Phase 6 structure pins', () => {

  it('pin 01: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('pin 02: #day-grade-overlay element exists and is default-hidden', () => {
    expect(DESK).toMatch(/id="day-grade-overlay"/);
    // Must be hidden by default (style or class).
    expect(DESK).toMatch(/id="day-grade-overlay"[^>]*style="[^"]*display:none/);
  });

  it('pin 03: closeDayGrade() function is defined', () => {
    expect(DESK).toMatch(/function\s+closeDayGrade\s*\(/);
  });

  it('pin 04: openDayGrade(dateStr) function is defined with dateStr param', () => {
    expect(DESK).toMatch(/function\s+openDayGrade\s*\(\s*dateStr\s*\)/);
  });

  it('pin 05: calendar cells have ondblclick handler that calls openDayGrade', () => {
    // The calendar cell setup code must attach ondblclick.
    expect(DESK).toMatch(/c\.ondblclick\s*=/);
    expect(DESK).toMatch(/openDayGrade\s*\(\s*ds\s*\)/);
  });

  it('pin 06: calendar cells have oncontextmenu handler that calls openDayGrade with preventDefault + stopPropagation (Codex MINOR fold 2026-05-20)', () => {
    expect(DESK).toMatch(/c\.oncontextmenu\s*=/);
    // Context menu handler must prevent default AND stop propagation so the
    // right-click doesn't bubble to outer handlers / show the native menu.
    const cellArea = DESK.slice(DESK.indexOf('c.oncontextmenu'), DESK.indexOf('c.oncontextmenu') + 200);
    expect(cellArea).toMatch(/preventDefault\s*\(\s*\)/);
    expect(cellArea).toMatch(/stopPropagation\s*\(\s*\)/);
  });

  it('pin 07: modal-scoped keydown handler is defined (_attachDayGradeKeyHandler)', () => {
    expect(DESK).toMatch(/function\s+_attachDayGradeKeyHandler\s*\(/);
  });

  it('pin 08: keydown handler body has Esc + closeDayGrade call', () => {
    const body = fnBody(DESK, '_attachDayGradeKeyHandler');
    expect(body).toMatch(/['"]Escape['"]/);
    expect(body).toMatch(/closeDayGrade\s*\(\s*\)/);
  });

  it('pin 09: keydown handler has active-element guard for INPUT|TEXTAREA|SELECT|isContentEditable', () => {
    const body = fnBody(DESK, '_attachDayGradeKeyHandler');
    expect(body).toMatch(/INPUT/);
    expect(body).toMatch(/TEXTAREA/);
    expect(body).toMatch(/SELECT/);
    expect(body).toMatch(/isContentEditable/);
  });

  it('pin 10: keydown handler has modifier-key guard (ctrlKey|metaKey|altKey)', () => {
    const body = fnBody(DESK, '_attachDayGradeKeyHandler');
    expect(body).toMatch(/ctrlKey/);
    expect(body).toMatch(/metaKey/);
    expect(body).toMatch(/altKey/);
  });

  it('pin 11: openDayGrade renders "No lessons due this day" empty-state', () => {
    const body = fnBody(DESK, 'openDayGrade');
    expect(body).toMatch(/No lessons due this day/);
  });

  it('pin 12: openDayGrade uses createElement + textContent for response data (no innerHTML XSS)', () => {
    const body = fnBody(DESK, 'openDayGrade');
    // Must use createElement for card construction.
    expect(body).toMatch(/createElement\s*\(\s*['"]div['"]/);
    expect(body).toMatch(/\.textContent\s*=/);
    // Must NOT write response data (lessonKey, dateStr, lesson grade value) via innerHTML.
    // The header is set via textContent, the body via createElement.
    expect(body, 'must not set innerHTML on /grade data in openDayGrade')
      .not.toMatch(/\.innerHTML\s*=\s*[^'"]*(?:lesson|dateStr|gradeText|frq)/);
  });

  it('pin 12b: openDayGrade renders a per-lesson "Blooket:" line when lesson.blooket is present', () => {
    const body = fnBody(DESK, 'openDayGrade');
    expect(body).toMatch(/lesson\.blooket\s*!=\s*null/);
    expect(body).toMatch(/Flashcards:\s/);
  });

  it('pin 12c: openDayGrade shows the quiz SCORE % from lesson.Q (what feeds the grade)', () => {
    const body = fnBody(DESK, 'openDayGrade');
    expect(body).toMatch(/lesson\.Q\s*!=\s*null/);
    expect(body).toMatch(/Quiz:\s/);
  });

  it('pin 13: _gradeLessonsCache is declared and populated in renderDoNowGrades', () => {
    // Module-level var for the lessons cache.
    expect(DESK).toMatch(/var\s+_gradeLessonsCache\s*=\s*null/);
    // renderDoNowGrades must write to it.
    const gradesBody = fnBody(DESK, 'renderDoNowGrades');
    expect(gradesBody).toMatch(/_gradeLessonsCache\s*=/);
  });

  it('pin 14: single-click on cells still opens resource panel (existing onclick preserved)', () => {
    // The onclick must still call maybeBumpThenOpen.
    expect(DESK).toMatch(/c\.onclick\s*=\s*\(\s*\)\s*=>\s*\{[^}]*maybeBumpThenOpen/);
  });

  it('pin 15: closeDayGrade calls _detachDayGradeKeyHandler', () => {
    const body = fnBody(DESK, 'closeDayGrade');
    expect(body).toMatch(/_detachDayGradeKeyHandler\s*\(\s*\)/);
  });
});

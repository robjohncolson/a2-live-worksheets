// desk-grade-chip.test.js — the persistent correctness-grade chip in the Desk
// resource panel (LEDGER_HEAL_BUILD.md Part B). Shows the OFFICIAL ledger
// correctness (Cws / quiz score) next to each resource, surviving the Done click.
// Static parse of the Desk HTML; no DOM execution.
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
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk grade chip — source', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: _getCwsForTopic reads ledger Cws from _gradeLessonsCache', () => {
    const body = fnBody(DESK, '_getCwsForTopic');
    expect(body).toMatch(/_gradeLessonsCache/);
    expect(body).toMatch(/lessonKey === topicId/);
    expect(body).toMatch(/\.Cws/);
    // returns the number or null (no score yet)
    expect(body).toMatch(/typeof c === 'number'/);
  });

  it('02: the worksheet Done button is wrapped in a worksheet-done-slot anchor', () => {
    expect(DESK).toMatch(/class="worksheet-done-slot" data-topic="/);
  });

  it('03: a grade chip is appended per worksheet + quiz slot (Blooket excluded)', () => {
    expect(DESK).toMatch(/querySelectorAll\('\.worksheet-done-slot\[data-topic\]'\)/);
    expect(DESK).toMatch(/querySelectorAll\('\.desk-quiz-done-slot\[data-artifact="quiz"\]\[data-topic\]'\)/);
    // Blooket must NOT get a ledger grade chip (excluded from the ledger).
    expect(DESK).not.toMatch(/data-artifact="blooket"\]\[data-topic\]/);
  });

  it('04: chip shows the correctness % or "—" when no score is recorded yet', () => {
    expect(DESK).toMatch(/'Grade: ' \+ \(pct == null \? '—'/);
  });

  it('05: chip is built XSS-safe (createElement + textContent, no innerHTML)', () => {
    // Isolate the chip block and confirm it never assigns innerHTML.
    const idx = DESK.indexOf('var _mkGradeChip');
    expect(idx).toBeGreaterThan(-1);
    const block = DESK.slice(idx, idx + 1400);
    expect(block).toMatch(/createElement\('span'\)/);
    expect(block).toMatch(/\.textContent =/);
    expect(block).not.toMatch(/\.innerHTML/);
  });

  it('06: the worksheet chip uses ledger Cws, NOT the local completion gate', () => {
    // _getCwsForTopic feeds the worksheet chip; _wsCompletionFor stays the gate.
    // (Window widened 2026-06: _mkGradeChip grew when it gained gate-coloring.)
    const idx = DESK.indexOf('var _mkGradeChip');
    const block = DESK.slice(idx, idx + 3600  /* widened 2026-09-11: Follow-Along tooltip breakdown */);
    expect(block).toMatch(/_getCwsForTopic\(slot\.getAttribute\('data-topic'\)\)/);
    expect(block).toMatch(/_quizPerfFor\(slot\.getAttribute\('data-topic'\)\)/);
  });
  it('07: the worksheet chip DISPLAYS the Follow-Along grade (lessonGradeNoQuiz), with Cws kept as the floor', () => {
    // 2026-09-11 root cause: the chip showed Cws (blanks only) labelled "Grade", while the
    // in-app gradebook + Schoology show lessonGradeNoQuiz (blanks + AI reflections).
    const body = fnBody(DESK, '_getFollowAlongForTopic');
    expect(body).toMatch(/lessonGradeNoQuiz/);
    expect(body).toContain('L.W');
    expect(body).toMatch(/exitBonus/);
    const idx = DESK.indexOf("_mkGradeChip(_faDetail ? _faDetail.grade : _faCws");
    expect(idx).toBeGreaterThan(-1);
    const block = DESK.slice(DESK.indexOf('var _mkGradeChip = function'), idx);
    expect(block).toMatch(/AI-graded reflections/);
    expect(block).toMatch(/same number your gradebook and Schoology show/);
  });
});

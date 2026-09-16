// grade-clarity.test.js — pins the student-facing district grade explanation
// and the Desk "how grades work" modal, plus guards against the stale band labels
// and the old "PC only raises / two pieces count" framing that v3 contradicts.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const START = readFileSync(resolve(repo, 'start-here.html'), 'utf8');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

describe('start-here.html — district grade explanation', () => {
  it('quarter band labels are the SY2627 date windows', () => {
    expect(START).toContain('November 6');
    expect(START).toContain('January 22');
    // The stale unit-list mappings must be gone.
    expect(START).not.toMatch(/Q1:\s*'U1, U2, U3'/);
    expect(START).not.toMatch(/Q1:\s*'U1, U2',/);
    expect(START).not.toMatch(/Q2:\s*'U3, U4, U5'/);
  });

  

  

  it('explains district weights, quarterly minima, and missing due work', () => {
    for (const category of ['Assessments 50%', 'Assignments 40%', 'Engagement 10%']) {
      expect(START).toContain(category);
    }
    expect(START).toContain('4 Assessments, 10 Assignments, and 10 Engagement items');
    expect(START).toContain('100-point topic assessment');
    expect(START).toContain('10-point lesson check');
    expect(START).toContain('Unattempted due work counts as zero after the lesson day');
    expect(DESK).toContain('Unattempted due work counts as zero after the lesson day');
  });

  it('exposes the how-your-grade anchor for the Desk deep-link', () => {
    expect(START).toMatch(/<section\s+id="how-your-grade"/);
  });

  it('omits retired Progress Check grade policies', () => {
    expect(START).not.toContain('only</em> raise your unit grade, never lower it');
    expect(START).not.toContain('Two pieces count toward your grade');
    expect(START).not.toContain('Progress Check is how you top each unit off');
    expect(START).not.toContain("Blooket · ungraded");
  });
});

describe('desk.html — Desk "how grades work" modal', () => {
  it('defines the grade-help overlay + open/close handlers', () => {
    expect(DESK).toMatch(/id="grade-help-overlay"/);
    expect(DESK).toMatch(/function openGradeHelp\s*\(/);
    expect(DESK).toMatch(/function closeGradeHelp\s*\(/);
  });

  it('renders a "how grades work" trigger on the quarter strip', () => {
    expect(DESK).toMatch(/how grades work/i);
    expect(DESK).toMatch(/openGradeHelp\s*\(\s*\)/);
  });

  it('the modal carries district weights and links to start-here', () => {
    expect(DESK).toContain('Assessments 50%');
    expect(DESK).toContain('Assignments 40%');
    expect(DESK).toContain('Engagement 10%');
    expect(DESK).toMatch(/start-here\.html#how-your-grade/);
  });
});

// grade-clarity.test.js — pins the student-facing grade explanation (v3 two-track)
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

describe('start-here.html — v3 two-track grade explanation', () => {
  it('quarter band labels are the SY2627 date windows (units straddle quarters in CED order)', () => {
    expect(START).toContain('November 6');
    expect(START).toContain('January 22');
    // The stale unit-list mappings must be gone.
    expect(START).not.toMatch(/Q1:\s*'U1, U2, U3'/);
    expect(START).not.toMatch(/Q1:\s*'U1, U2',/);
    expect(START).not.toMatch(/Q2:\s*'U3, U4, U5'/);
  });

  

  

  it('exposes the how-your-grade anchor for the Desk deep-link', () => {
    expect(START).toMatch(/<section\s+id="how-your-grade"/);
  });

  it('drops the old model framing that v3 contradicts', () => {
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

  it('the modal carries the two-track + Schoology framing and links to start-here', () => {
    expect(DESK).toContain('Assessments 50%');
    expect(DESK).toContain('Assignments 40%');
    expect(DESK).toContain('Engagement 10%');
    expect(DESK).toMatch(/start-here\.html#how-your-grade/);
  });
});

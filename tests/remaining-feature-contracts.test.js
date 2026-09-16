/**
 * Remaining feature-contract coverage for the canonical user-story tracker.
 *
 * These are intentionally narrow, high-level checks for public entry points and
 * Start Here helper behavior that were otherwise only manually documented.
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const START = readFileSync(resolve(repo, 'start-here.html'), 'utf8');
const INDEX = readFileSync(resolve(repo, 'index.html'), 'utf8');
const TOC = readFileSync(resolve(repo, 'TOC.html'), 'utf8');
// Pin the LIVE shipping surfaces (not the dead wsx.js extraction) for features
// that were only manually documented before the audit.
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');
const SG = readFileSync(resolve(repo, 'study_guide_diagnostic.html'), 'utf8');

describe('F002 Start Here orientation and expectations', () => {
  it('keeps the course orientation, expectations, grade model, toolkit, and Desk path present', () => {
    const markers = ['Algebra 2', 'An average day', 'What gets graded', 'How the number is computed', 'OneNote', 'Schoology', 'Assessments 50%', 'desk.html'];

    for (const marker of markers) {
      expect(START).toContain(marker);
    }
  });
});



describe('Algebra 2 public navigation and published lesson resources', () => {
  it('keeps the landing page and lesson directory connected to the Desk', () => {
    const index = new JSDOM(INDEX);
    const toc = new JSDOM(TOC);
    try {
      for (const href of ['start-here.html', 'desk.html', 'TOC.html']) {
        expect(index.window.document.querySelector(`a[href="${href}"]`)).toBeTruthy();
      }
      expect(toc.window.document.querySelector('a[href="desk.html"]')).toBeTruthy();
    } finally {
      index.window.close();
      toc.window.close();
    }
  });

  it('enumerates the current A2 registry instead of an AP worksheet corpus', () => {
    const lessons = JSON.parse(readFileSync(resolve(repo, 'content/a2/lessons.json'), 'utf8'));
    const published = lessons.filter(lesson => lesson.published !== false && lesson.deck);
    expect(published.length).toBeGreaterThan(0);
    for (const lesson of published) {
      expect(lesson.key).toMatch(/^\d+-\d+$/);
      expect(lesson.title).toBeTruthy();
      expect(lesson.lessonCheck.length).toBeGreaterThan(0);
      expect(lesson.deck).toMatch(/^content\/a2\//);
      expect(existsSync(resolve(repo, lesson.deck))).toBe(true);
    }
  });
});

describe('F070 sealed transcript export + printable progress summary', () => {
  it('exports a sealed /transcript JSON as a download and offers a printable summary, both gated on a signed-in token', () => {
    // The Desk ships both export paths.
    expect(DESK).toMatch(/async function exportSealedTranscript\s*\(/);
    expect(DESK).toMatch(/async function printSealedSummary\s*\(/);
    // Authenticated fetch of the sealed transcript.
    expect(DESK).toMatch(/fetch\(\s*base \+ '\/transcript'/);
    expect(DESK).toContain("'Authorization': 'Bearer ' + token");
    // Token gate: no token -> sign-in message, never a silent/empty file.
    expect(DESK).toContain('_sealedTranscriptSignInMessage');
    // The transcript is serialized to a Blob and downloaded via a generated anchor.
    expect(DESK).toContain('new Blob([JSON.stringify(transcript, null, 2)]');
    expect(DESK).toMatch(/a\.download = _sealedTranscriptFilename\(transcript\)/);
  });
});

describe('F072 diagnostic study guide peer scoreboard', () => {
  it('renders a Scoreboard modal ranking students by green mastery-node count and highlights the signed-in student', () => {
    // A Scoreboard button wires to the modal opener.
    expect(SG).toContain("make('button', 'sg-scoreboard-btn', 'Scoreboard')");
    expect(SG).toMatch(/scoreboardBtn\.addEventListener\('click', showScoreboardModal\)/);
    // The modal + its data fetch exist.
    expect(SG).toMatch(/async function showScoreboardModal\s*\(/);
    expect(SG).toMatch(/async function fetchScoreboardData\s*\(/);
    expect(SG).toContain('sg-scoreboard-modal');
    // Ranked by green-node count (descending), self row highlighted, Escape-closable.
    expect(SG).toContain('b.greenCount - a.greenCount');
    expect(SG).toContain('sg-scoreboard-row-me');
    expect(SG).toMatch(/if \(e\.key === 'Escape'\) closeModal\(\)/);
  });
});



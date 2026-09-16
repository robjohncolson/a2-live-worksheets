// smoke-student-host-matrix.test.js — static pins on the W0 host-matrix smoke script.
// Importing the probe lists does not launch browsers or make network requests.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTTP_CHECKS, BROWSER_PAGES, ORIGINS } from '../scripts/smoke-student-host-matrix.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(repo, 'scripts/smoke-student-host-matrix.mjs'), 'utf8');

describe('student host matrix — flashcard assets (static)', () => {
  it('declares the Vercel mirror origin', () => {
    expect(SRC).toMatch(/WS_MIRROR:\s*'https:\/\/a2-live-worksheets\.vercel\.app\/'/);
  });

  it('checks flashcards.js on GH Pages', () => {
    expect(SRC).toMatch(/host: 'GH_Pages_Desk', resource: 'flashcards_js', url: LESSON\.flashcardsJs/);
  });

  it('checks flashcards.js on the Vercel mirror', () => {
    expect(SRC).toMatch(/host: 'Vercel_Mirror', resource: 'flashcards_js', url: `\$\{WS_MIRROR\}\/flashcards\.js`/);
  });
});

describe('student host matrix - Algebra 2 surfaces', () => {
  it.each([
    ['GH_Pages_Desk', ORIGINS.WS_BASE],
    ['Vercel_Mirror', ORIGINS.WS_MIRROR],
  ])('probes published student surfaces on %s', (host, origin) => {
    const urls = HTTP_CHECKS.filter(check => check.host === host).map(check => check.url);
    for (const path of ['desk.html', 'start-here.html', 'check.html?lesson=1-1', 'content/a2/lessons.json']) {
      expect(urls).toContain(new URL(path, origin).href);
    }
    const browserUrls = BROWSER_PAGES.map(page => page.url);
    for (const path of ['desk.html', 'start-here.html', 'check.html?lesson=1-1']) {
      expect(browserUrls).toContain(new URL(path, origin).href);
    }
  });

  it('probes authored A2 lesson data and the published deck', () => {
    expect(SRC).toContain('content/a2/lessons.json');
    expect(SRC).toContain('content/a2/1-1/deck.csv');
    expect(SRC).toContain("resource: 'a2_lessons', url: LESSON.lessons");
    expect(SRC).toContain("resource: 'a2_deck', url: LESSON.deck");
  });

  it('does not probe stripped media, AP quiz hosts, or Android packages', () => {
    expect(SRC).not.toMatch(/lessons-index|runMediaSweep|video_media|recommendG1|curriculum_render|quiz_relative|quiz_absolute|runApkSnapshot|android-app/);
    expect(SRC).not.toContain('u1_lesson2_live.html');
    expect(SRC).not.toContain('6a08a5ec93e4e9542dfc82d6');
  });
});

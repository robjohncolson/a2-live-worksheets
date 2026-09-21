/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bootDesk,
  CURRICULUM_URL,
  ROSTER_URL,
  SUPABASE_URL,
} from './harness.js';

const ROADMAP = JSON.parse(readFileSync(resolve(import.meta.dirname, '../fixtures/a2/roadmap-data.json'), 'utf8'));

describe('Desk journey harness smoke', () => {
  it('boots the real Desk cleanly with Do Now and disk-backed roadmap tiles in under 3 seconds', async () => {
    const harness = await bootDesk({ now: '2026-09-22T12:00:00Z' });
    try {
      expect(harness.consoleErrors, 'Desk called console.error during boot').toEqual([]);
      expect(harness.jsdomErrors, 'JSDOM reported an exception during boot').toEqual([]);
      expect(harness.windowErrors, 'Desk dispatched a window error during boot').toEqual([]);
      expect(harness.unhandledRejections, 'Desk had an unhandled rejection during boot').toEqual([]);
      expect(harness.unhandled, 'Desk boot requested a URL the harness does not route').toEqual([]);

      const doNow = harness.document.getElementById('donow-card');
      expect(doNow).toBeTruthy();
      expect(doNow.style.display).toBe('flex');
      expect(doNow.textContent).toContain('Do Now');

      expect(harness.requests.some(({ method, url }) => (
        method === 'GET' && new URL(url).pathname.endsWith('/roadmap-data.json')
      )), 'roadmap-data.json was not fetched from the disk router').toBe(true);

      const tiles = [...harness.document.querySelectorAll('#cg .dc[data-topic]')];
      expect(tiles.length, 'the real Desk rendered no roadmap tiles').toBeGreaterThan(0);
      expect(tiles.some((tile) => (
        String(tile.dataset.topic).split('+').some((topic) => ROADMAP.lessons[topic])
      )), 'no rendered roadmap tile maps to roadmap-data.json').toBe(true);

      expect(harness.bootTimeMs).toBeLessThan(3_000);
    } finally {
      harness.teardown();
    }
  });

  it('404s and records unmatched method+path pairs for every known remote origin', async () => {
    const harness = await bootDesk();
    try {
      const urls = [
        `${ROSTER_URL}/donow-typo`,
        `${ROSTER_URL}/donow`,
        `${CURRICULUM_URL}/api/typo`,
        `${CURRICULUM_URL}/api/ai/coach`,
        `${SUPABASE_URL}/rest/v1/typo`,
        `${SUPABASE_URL}/rest/v1/lesson_urls`,
      ];
      const methods = ['GET', 'POST', 'GET', 'GET', 'GET', 'POST'];
      const responses = await Promise.all(urls.map((url, index) => (
        harness.window.fetch(url, { method: methods[index] })
      )));

      expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404]);
      expect(harness.unhandled).toEqual(urls.map((url, index) => `${methods[index]} ${url}`));
    } finally {
      harness.teardown();
    }
  });
});


describe('A2 journey asset and service routing', () => {
  it('serves A2 lesson assets and AI responses on the shared roster origin', async () => {
    const harness = await bootDesk({
      curriculum: { '/api/ai/coach': { ok: true, reply: 'Isolate the variable.' } },
    });
    try {
      const response = await harness.window.fetch('content/a2/lessons.json');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(JSON.parse(readFileSync(
        resolve(import.meta.dirname, '../../content/a2/lessons.json'), 'utf8',
      )));
      const coached = await harness.window.fetch(`${CURRICULUM_URL}/api/ai/coach`, {
        method: 'POST', body: JSON.stringify({ message: 'Help with an equation' }),
      });
      expect(coached.status).toBe(200);
      expect(await coached.json()).toEqual({ ok: true, reply: 'Isolate the variable.' });
      expect(harness.unhandled).toEqual([]);
    } finally {
      harness.teardown();
    }
  });
});

// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'desk.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(src);
  if (!match) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = src.indexOf('{', match.index); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(match.index, i + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Desk readiness badge — static contract', () => {
  it('loads BKT before the SRS library and defines the small badge style', () => {
    const bkt = DESK.indexOf('<script src="lib/bkt.js" onerror=""></script>');
    const srs = DESK.indexOf('<script src="lib/flashcard-srs.js" onerror=""></script>');

    expect(bkt).toBeGreaterThan(-1);
    expect(srs).toBeGreaterThan(bkt);
    expect(DESK).toMatch(/\.fc-ready-badge\s*\{/);
  });

  it('renders the badge after the score chip only inside the readinessBadge flag gate', () => {
    const panel = fnBody(DESK, 'showResourcePanel');
    const gate = panel.indexOf("_fcFlag('readinessBadge')");
    const lookup = panel.indexOf('_srsReadinessFor', gate);
    const badge = panel.indexOf('class="fc-ready-badge"', gate);
    const row = panel.indexOf('_scoreChip(_blScore, 80) + _blDueText');

    expect(gate).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(gate);
    expect(badge).toBeGreaterThan(lookup);
    expect(panel.slice(0, gate)).not.toContain('class="fc-ready-badge"');
    expect(panel).toContain('title="Flashcard readiness: a practice signal, not your grade"');
    expect(panel).toMatch(
      /class="fc-ready-badge" title="[^"]*practice signal, not your grade"[^>]*>'\s*\+\s*_blReadinessLabel\s*\+\s*'<\/span>/
    );
    expect(row).toBeGreaterThan(badge);
  });

  it('keeps lesson completion independent of readiness', () => {
    const completion = fnBody(DESK, '_isLessonComplete');

    expect(completion).not.toMatch(/readiness/i);
    expect(completion).not.toContain('_srsReadinessFor');
  });
});

describe('Desk readiness badge — executed flag guard', () => {
  it('_srsReadinessFor returns null when the flag is off without touching the cached fold', () => {
    const foldedState = vi.fn(() => {
      throw new Error('the fold must not be read while the flag is off');
    });
    const readinessFor = new Function(
      '_fcFlag', '_srsFoldedState',
      'return (' + fnBody(DESK, '_srsReadinessFor') + ');'
    )(() => false, foldedState);

    expect(readinessFor('deck.csv')).toBe(null);
    expect(foldedState).not.toHaveBeenCalled();
  });
});

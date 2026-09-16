// bundle-parity.test.js — the §4 "reuse AS-IS, not fork" + bundled-copy guard.
// Railway deploys roster-server with Root Dir = roster-server/, so repo-root
// data/ + lib/ are NOT shipped. Phase 2/3 bundle byte-identical copies; this
// test fails loudly the moment a copy drifts from its canonical source.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));        // roster-server/tests
const rs = resolve(here, '..');                              // roster-server
const repo = resolve(rs, '..');                              // repo root

function readBytes(p) {
  return readFileSync(p); // Buffer — exact byte comparison, EOL-sensitive
}

describe('bundle parity — byte-identical canonical copies', () => {
  it('roster-server/bkt.js === lib/bkt.js (BKT reused AS-IS, NOT forked)', () => {
    const bundled = readBytes(resolve(rs, 'bkt.js'));
    const canonical = readBytes(resolve(repo, 'lib', 'bkt.js'));
    expect(bundled.equals(canonical)).toBe(true);
  });

  // deployment.test.js also covers these deployment assets. This suite keeps
  // the baseline's byte-level guard alongside its BKT API contract.
  it.each([
    ['lib/a2-answers.js', 'roster-server/lib/a2-answers.js'],
    ['content/a2/lessons.json', 'roster-server/data/a2-lessons.json'],
  ])('%s matches its server copy', (canonical, bundled) => {
    expect(readBytes(resolve(repo, bundled)).equals(readBytes(resolve(repo, canonical)))).toBe(true);
  });

  it('the bundled bkt.js really exposes the study-guide BKT API', async () => {
    await import('../bkt.js');
    const BKT = globalThis.BKT;
    expect(BKT).toBeDefined();
    expect(typeof BKT.updateMastery).toBe('function');
    expect(BKT.DEFAULT_PARAMS).toEqual({ pInit: 0.3, pTransit: 0.0, pSlip: 0.1, pGuess: 0.25 });
    // sanity: correct raises, incorrect lowers (same as lib/bkt.test.js)
    expect(BKT.updateMastery(0.5, true)).toBeGreaterThan(0.5);
    expect(BKT.updateMastery(0.5, false)).toBeLessThan(0.5);
  });
});

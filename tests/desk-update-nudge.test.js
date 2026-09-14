/**
 * tests/desk-update-nudge.test.js
 *
 * A long-open Desk tab can run a CACHED old build (this caused the avatar-without-
 * presence stale-client bug). The Desk polls version.json (no-store) and nudges a
 * reload when the deployed build differs from the running APP_BUILD. The two stamps
 * are bumped together by scripts/bump-build.mjs and MUST match at commit time —
 * if version.json were ever ahead of the HTML, every fresh load would nudge-loop.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
let desk = '', version = null;
beforeAll(() => {
  desk = readFileSync(resolve(ROOT, 'desk.html'), 'utf8');
  version = JSON.parse(readFileSync(resolve(ROOT, 'version.json'), 'utf8'));
});

describe('Desk update nudge (stale-tab fix)', () => {
  it('version.json build MATCHES the Desk APP_BUILD (else stale clients nudge-loop)', () => {
    const m = /var APP_BUILD = '([^']*)'/.exec(desk);
    expect(m, 'APP_BUILD declared in the Desk').not.toBeNull();
    expect(m[1]).not.toBe('init');                      // the bump script ran
    expect(version.build, 'version.json.build === APP_BUILD').toBe(m[1]);
  });

  it('polls version.json (no-store) + compares to APP_BUILD + re-checks on refocus', () => {
    expect(desk).toMatch(/function _wireUpdateNudge\s*\(/);
    expect(desk).toMatch(/fetch\('version\.json\?_='/);
    expect(desk).toMatch(/cache:\s*'no-store'/);
    expect(desk).toMatch(/v\.build !== APP_BUILD/);
    expect(desk).toMatch(/visibilitychange/);
  });

  it('the nudge is dismissible (not forced) and offers a Reload', () => {
    expect(desk).toMatch(/'update-nudge'/);
    expect(desk).toMatch(/location\.reload\(\)/);
    expect(desk).toMatch(/aria-label','Dismiss'/);
  });
});

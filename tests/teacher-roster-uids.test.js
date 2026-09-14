/**
 * tests/teacher-roster-uids.test.js
 *
 * Parse-only unit for the P4b Schoology-uid backfill CSV parser in
 * scripts/teacher-roster.mjs. No network: just verifies header detection,
 * the username/schoologyUid column split, and the empty-cell (clear) case.
 */

import { describe, it, expect, beforeAll } from 'vitest';

let parseUidRoster;
let pickConfigUrl;

beforeAll(async () => {
  const mod = await import('../scripts/teacher-roster.mjs');
  parseUidRoster = mod.parseUidRoster;
  pickConfigUrl = mod.pickConfigUrl;
});

describe('parseUidRoster: header detection', () => {
  it('skips a header row when the first cell is a known username column name', () => {
    const rows = parseUidRoster('username,schoologyUid\ncoconut_shark,8405518810\n');
    expect(rows).toEqual([{ username: 'coconut_shark', schoologyUid: '8405518810' }]);
  });

  it('accepts login / user / login_username as header aliases', () => {
    for (const head of ['login', 'user', 'login_username']) {
      const rows = parseUidRoster(head + ',schoologyUid\nmaple_otter,42\n');
      expect(rows).toEqual([{ username: 'maple_otter', schoologyUid: '42' }]);
    }
  });

  it('keeps the first data row when there is no header', () => {
    const rows = parseUidRoster('coconut_shark,8405518810\n');
    expect(rows).toEqual([{ username: 'coconut_shark', schoologyUid: '8405518810' }]);
  });
});

describe('parseUidRoster: column handling', () => {
  it('treats an empty schoologyUid cell as a clear request', () => {
    const rows = parseUidRoster('username,schoologyUid\nmaple_otter,\n');
    expect(rows).toEqual([{ username: 'maple_otter', schoologyUid: '' }]);
  });

  it('ignores blank lines and trims whitespace', () => {
    const rows = parseUidRoster('username,schoologyUid\n\n  coconut_shark , 999 \n');
    expect(rows).toEqual([{ username: 'coconut_shark', schoologyUid: '999' }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseUidRoster('')).toEqual([]);
    expect(parseUidRoster('username,schoologyUid\n')).toEqual([]);
  });
});

// pickConfigUrl feeds the CLI's default server URL. roster_config.js contains
// decoy URLs (the 'http://...' comment example, the localhost dev fallback)
// that once made the CLI dial "http://..." — these pin the fix.
describe('pickConfigUrl: production URL from roster_config.js', () => {
  const PROD = 'https://a2-live-worksheets-production.up.railway.app';

  it('skips the http://... placeholder in comments (2026-08-29 regression)', () => {
    const cfg =
      "//   localStorage.setItem('roster_service_url_override', 'http://...')\n" +
      "window.ROSTER_SERVICE_URL = '" + PROD + "';\n";
    expect(pickConfigUrl(cfg)).toBe(PROD);
  });

  it('skips the localhost dev fallback', () => {
    const cfg =
      "var dev = 'http://localhost:8091';\n" +
      "var prod = '" + PROD + "';\n";
    expect(pickConfigUrl(cfg)).toBe(PROD);
  });

  it('takes the LAST https URL — the config file final || fallback', () => {
    const cfg = "var a = 'https://example.com';\nvar b = '" + PROD + "';\n";
    expect(pickConfigUrl(cfg)).toBe(PROD);
  });

  it('strips trailing slashes', () => {
    expect(pickConfigUrl("'https://example.com/'")).toBe('https://example.com');
  });

  it('returns null when no https URL is present', () => {
    expect(pickConfigUrl("var x = 'http://...';")).toBe(null);
    expect(pickConfigUrl('')).toBe(null);
    expect(pickConfigUrl(null)).toBe(null);
  });

  it('extracts the production URL from the REAL committed roster_config.js', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const cfg = readFileSync(resolve(here, '../roster_config.js'), 'utf8');
    expect(pickConfigUrl(cfg)).toBe(PROD);
  });
});
